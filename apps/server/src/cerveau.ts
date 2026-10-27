import {
  CERVEAU_BRIEF,
  CERVEAU_MODELS,
  CERVEAU_REVEAL,
  CERVEAU_SPLIT,
  DrawOp,
  cerveauKind,
  cerveauScore,
  decodeDraw,
  encodeDraw,
  type CerveauKind,
  type CerveauMode,
  type CerveauModel,
  type CerveauState,
  type ClientMsg,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon. */
export interface CerveauHost {
  playerIds(): string[];
  isHost(id: string): boolean;
  /** Manches : chacun mène le binôme une fois par manche. */
  rounds(): number;
  drawTime(): number;
  mode(): CerveauMode;
  random(): number;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  /** Paquet de dessin binaire, tel quel : à tout le salon sauf `except`, ou au seul `to`. */
  relay(data: Uint8Array, except: string): void;
  sendRaw(to: string, data: Uint8Array): void;
  system(text: string): void;
  toLobby(): void;
}

/** Octets de dessin gardés par calque et par manche. */
const MAX_LAYER_BYTES = 600_000;

type CerveauMsg = Extract<ClientMsg, { t: 'cerveau' }>;

/**
 * Une partie de Cerveau coupé. À chaque manche, un binôme dessine un modèle sur un tableau
 * commun, chacun sur son calque : le serveur marque chaque paquet de son calque (octet 3 de
 * l'en-tête) avant de le relayer, pour que deux traits simultanés ne se mélangent pas.
 */
export class Cerveau {
  phase: 'draw' | 'reveal' | 'album' = 'draw';
  turn = 0;
  readonly turns: number;
  kind: CerveauKind = 'guide';
  duo: [string, string] = ['', ''];
  model: CerveauModel = CERVEAU_MODELS[0]!;
  goAt = 0;
  score: number | null = null;
  readonly scores: number[] = [];
  readonly done = new Set<string>();

  private readonly seats: string[];
  private readonly used = new Set<string>();
  /** Traits de chaque calque : un trait = son paquet de début puis ses suites. */
  private layers: Uint8Array[][][] = [[], []];
  private layerBytes = [0, 0];
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: CerveauHost) {
    this.seats = host.playerIds();
    this.turns = Math.max(1, host.rounds()) * this.seats.length;
  }

  start(): void {
    this.host.system(`Cerveau coupé : ${this.turns} dessins à deux. Allumez vos micros !`);
    this.startTurn(0);
  }

  handle(id: string, msg: CerveauMsg): void {
    if ('next' in msg) {
      if (!this.host.isHost(id)) return;
      if (this.phase === 'reveal') this.next();
      else if (this.phase === 'album') this.host.toLobby();
      return;
    }
    if (this.phase !== 'draw' || !this.duo.includes(id)) return;
    if (msg.done ? this.done.has(id) : !this.done.has(id)) return;
    if (msg.done) this.done.add(id);
    else this.done.delete(id);
    this.host.broadcastState();
    if (this.duo.every((p) => this.done.has(p))) this.reveal();
  }

  /** Paquet de dessin : contrôlé selon le rôle, marqué de son calque, gardé et relayé. */
  draw(id: string, data: Uint8Array): void {
    const layer = this.layerOf(id);
    if (layer < 0) return;
    const packet = decodeDraw(data);
    if (!packet || packet.op === DrawOp.Fill) return;
    const strokes = this.layers[layer]!;
    const last = strokes.at(-1);
    if (packet.op === DrawOp.Extend && !last) return;
    if (this.kind === 'lignes' && layer === 0) {
      // Droites seulement : un point de départ, puis une seule suite d'un seul point.
      if (packet.points.length !== 2) return;
      if (packet.op === DrawOp.Extend && last!.length !== 1) return;
    }
    if (this.kind === 'moitie') {
      // Chacun sa moitié : les points qui débordent sont ramenés sur la frontière.
      for (let i = 0; i < packet.points.length; i += 2) {
        const x = packet.points[i]!;
        packet.points[i] = layer === 0 ? Math.min(x, CERVEAU_SPLIT) : Math.max(x, CERVEAU_SPLIT);
      }
    }
    const copy = new Uint8Array(encodeDraw(packet));
    copy[3] = layer + 1;
    if (this.layerBytes[layer]! + copy.byteLength > MAX_LAYER_BYTES) return;
    if (packet.op === DrawOp.Extend) last!.push(copy);
    else strokes.push([copy]);
    this.layerBytes[layer]! += copy.byteLength;
    this.host.relay(copy, id);
  }

  undo(id: string): void {
    const layer = this.layerOf(id);
    const removed = layer >= 0 ? this.layers[layer]!.pop() : undefined;
    if (!removed) return;
    this.layerBytes[layer]! -= removed.reduce((n, p) => n + p.byteLength, 0);
    this.host.broadcast({ t: 'cerveauInk', layer, op: 'undo' }, id);
  }

  clear(id: string): void {
    const layer = this.layerOf(id);
    if (layer < 0) return;
    this.layers[layer] = [];
    this.layerBytes[layer] = 0;
    this.host.broadcast({ t: 'cerveauInk', layer, op: 'clear' }, id);
  }

  /** Un joueur arrive en cours de manche : il reçoit le dessin déjà fait. */
  onJoin(id: string): void {
    for (const strokes of this.layers) for (const stroke of strokes) for (const p of stroke) this.host.sendRaw(id, p);
  }

  /** Un membre du binôme part : on révèle ce qui a été dessiné, la suite reprend sans lui. */
  onLeave(id: string): void {
    if (this.phase === 'draw' && this.duo.includes(id)) this.reveal();
  }

  stateFor(id: string): CerveauState {
    const hidden = this.phase === 'draw' && this.kind === 'guide' && id === this.duo[1];
    return {
      turn: this.turn,
      turns: this.turns,
      kind: this.kind,
      duo: this.duo,
      goAt: this.goAt,
      model: hidden ? null : this.model,
      done: [...this.done],
      score: this.score,
      scores: this.scores,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private startTurn(turn: number): void {
    this.clearTimers();
    this.turn = turn;
    this.kind = cerveauKind(this.host.mode(), turn);
    // Le binôme tourne : chacun mène une fois par manche, avec son voisin.
    const present = new Set(this.host.playerIds());
    const seats = this.seats.filter((id) => present.has(id));
    const pool = seats.length >= 2 ? seats : this.host.playerIds();
    this.duo = [pool[turn % pool.length]!, pool[(turn + 1) % pool.length]!];
    this.model = this.pickModel();
    this.done.clear();
    this.score = null;
    this.layers = [[], []];
    this.layerBytes = [0, 0];
    this.phase = 'draw';
    const now = Date.now();
    this.goAt = now + CERVEAU_BRIEF * 1000;
    const seconds = CERVEAU_BRIEF + this.host.drawTime();
    this.host.setPhase('draw', now + seconds * 1000, turn + 1);
    this.host.broadcast({ t: 'clear' });
    // Une seconde de grâce pour les derniers traits en route.
    this.timers.push(setTimeout(() => this.reveal(), (seconds + 1) * 1000));
    this.host.broadcastState();
  }

  private reveal(): void {
    if (this.phase !== 'draw') return;
    this.clearTimers();
    const drawing = this.layers.flatMap((strokes) => strokes.map((stroke) => stroke.flatMap((p) => decodeDraw(p)?.points ?? [])));
    this.score = cerveauScore(this.model.paths, drawing);
    this.scores.push(this.score);
    for (const id of new Set(this.duo)) this.host.addScore(id, this.score);
    this.phase = 'reveal';
    const last = this.turn + 1 >= this.turns;
    this.host.setPhase('reveal', Date.now() + CERVEAU_REVEAL * 1000, this.turn + 1);
    this.timers.push(setTimeout(() => this.next(), CERVEAU_REVEAL * 1000));
    this.host.system(`${this.model.name} : ${this.score} % de ressemblance${last ? '. Dernier dessin !' : '.'}`);
    this.host.broadcastState();
  }

  private next(): void {
    this.clearTimers();
    if (this.turn + 1 < this.turns) return this.startTurn(this.turn + 1);
    this.phase = 'album';
    this.host.setPhase('album', null, this.turns);
    const avg = Math.round(this.scores.reduce((a, b) => a + b, 0) / this.scores.length);
    this.host.system(`Partie finie : ${avg} % de complicité en moyenne.`);
    this.host.broadcastState();
  }

  private layerOf(id: string): number {
    if (this.phase !== 'draw' || Date.now() < this.goAt - 300) return -1;
    if (this.kind === 'guide') return id === this.duo[1] ? 1 : -1;
    return this.duo.indexOf(id);
  }

  private pickModel(): CerveauModel {
    let pool = CERVEAU_MODELS.filter((m) => !this.used.has(m.id));
    if (!pool.length) {
      this.used.clear();
      pool = CERVEAU_MODELS.filter((m) => m.id !== this.model.id);
    }
    const model = pool[Math.floor(this.host.random() * pool.length)] ?? CERVEAU_MODELS[0]!;
    this.used.add(model.id);
    return model;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
