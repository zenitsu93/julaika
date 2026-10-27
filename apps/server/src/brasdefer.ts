import {
  BRAS_DUEL,
  BRAS_FACEOFF,
  BRAS_GOLD_CHANCE,
  BRAS_LIMIT,
  BRAS_MIN_GAP,
  BRAS_TARGETS,
  BRAS_VERDICT,
  BRAS_VOICE_TTL,
  brasGains,
  brasPower,
  type BrasResult,
  type BrasState,
  type BrasTarget,
  type ClientMsg,
  type Phase,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface BrasHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** Manches : à deux, un duel par manche ; à plus, chacun affronte son voisin à chaque manche. */
  rounds(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  endGame(): void;
}

/** Diffusions groupées pendant le duel : au plus une toutes les 50 ms, même si ça tapote fort. */
const FLUSH_MS = 50;

type BrasMsg = Extract<ClientMsg, { t: 'bras' }>;

/**
 * Une partie de Bras de fer. Chaque duelliste a ses propres cibles : un coup n'est compté que
 * si le serveur reconnaît la cible, et la jauge ne bouge que chez lui. Les cibles ne périment
 * pas et trois sont visibles à la fois, ce qui gomme l'essentiel du décalage réseau : on n'attend
 * jamais l'aller-retour pour taper la suivante.
 */
export class BrasDeFer {
  phase: 'faceoff' | 'duel' | 'verdict' | 'done' = 'faceoff';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  leftId = '';
  rightId = '';
  pos = 0;
  result: BrasResult | null = null;

  private targets = new Map<string, BrasTarget[]>();
  private hits: Record<string, number> = {};
  private lastHit: Record<string, number> = {};
  private voiceUntil: Record<string, number> = {};
  private push: BrasState['push'] = null;
  private nextId = 1;
  private flush: ReturnType<typeof setTimeout> | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: BrasHost) {
    this.order = host.playerIds();
    const n = this.order.length;
    this.turns = Math.max(1, host.rounds() * (n === 2 ? 1 : n));
  }

  start(): void {
    this.host.system(`Bras de fer : ${this.turns} duel${this.turns > 1 ? 's' : ''}. Tapote, crie, pousse !`);
    this.nextDuel(0);
  }

  handle(id: string, msg: BrasMsg): void {
    if (id !== this.leftId && id !== this.rightId) return;
    if ('hit' in msg) {
      if (this.phase !== 'duel' || typeof msg.hit !== 'number') return;
      const now = Date.now();
      if (now - (this.lastHit[id] ?? 0) < BRAS_MIN_GAP) return;
      const mine = this.targets.get(id) ?? [];
      const i = mine.findIndex((t) => t.id === msg.hit);
      if (i < 0) return;
      const [target] = mine.splice(i, 1);
      mine.push(this.spawn(mine));
      this.lastHit[id] = now;
      this.hits[id] = (this.hits[id] ?? 0) + 1;
      const power = brasPower(target!.gold, this.shouting(id, now));
      this.pos = Math.max(-BRAS_LIMIT, Math.min(BRAS_LIMIT, this.pos + (id === this.leftId ? power : -power)));
      this.push = { by: id, power, seq: (this.push?.seq ?? 0) + 1 };
      if (Math.abs(this.pos) >= BRAS_LIMIT) this.finish(true);
      else this.queueBroadcast();
    } else if ('voice' in msg) {
      if (this.phase === 'done') return;
      const was = this.shouting(id, Date.now());
      this.voiceUntil[id] = msg.voice === true ? Date.now() + BRAS_VOICE_TTL : 0;
      if (was !== (msg.voice === true)) this.queueBroadcast();
    }
  }

  /** Un duelliste part : son duel est clos sans points, on passe au suivant. */
  onLeave(id: string): void {
    if (this.phase !== 'faceoff' && this.phase !== 'duel') return;
    if (id !== this.leftId && id !== this.rightId) return;
    this.host.system('Un duelliste est parti : duel suivant.');
    this.nextDuel(this.turn + 1);
  }

  stateFor(id: string): BrasState {
    const now = Date.now();
    return {
      leftId: this.leftId,
      rightId: this.rightId,
      turn: this.turn,
      turns: this.turns,
      pos: this.pos,
      targets: this.phase === 'duel' ? (this.targets.get(id) ?? []) : [],
      voice: { [this.leftId]: this.shouting(this.leftId, now), [this.rightId]: this.shouting(this.rightId, now) },
      hits: { ...this.hits },
      push: this.push,
      result: this.result,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  /** Premier duel jouable à partir de k : les duels d'un joueur parti sont sautés. */
  private nextDuel(k: number): void {
    this.clearTimers();
    const present = new Set(this.host.playerIds());
    const n = this.order.length;
    // À deux, on change de côté à chaque duel ; à plus, chacun affronte son voisin.
    const pair = (j: number): [string, string] =>
      n === 2 ? (j % 2 ? [this.order[1]!, this.order[0]!] : [this.order[0]!, this.order[1]!]) : [this.order[j % n]!, this.order[(j + 1) % n]!];
    while (k < this.turns && !pair(k).every((p) => present.has(p))) k++;
    if (k >= this.turns) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.turn = k;
    [this.leftId, this.rightId] = pair(k);
    this.pos = 0;
    this.result = null;
    this.push = null;
    this.hits = { [this.leftId]: 0, [this.rightId]: 0 };
    this.lastHit = {};
    this.targets.clear();
    this.phase = 'faceoff';
    this.setPhase('faceoff', BRAS_FACEOFF);
    this.after(BRAS_FACEOFF, () => this.startDuel());
    this.host.broadcastState();
  }

  private startDuel(): void {
    this.clearTimers();
    for (const id of [this.leftId, this.rightId]) {
      const mine: BrasTarget[] = [];
      while (mine.length < BRAS_TARGETS) mine.push(this.spawn(mine));
      this.targets.set(id, mine);
    }
    this.phase = 'duel';
    this.setPhase('duel', BRAS_DUEL);
    this.after(BRAS_DUEL, () => this.finish(false));
    this.host.broadcastState();
  }

  private finish(ko: boolean): void {
    if (this.phase !== 'duel') return;
    this.clearTimers();
    const pts = brasGains(this.pos, ko);
    const winner = this.pos > 0 ? this.leftId : this.pos < 0 ? this.rightId : null;
    const loser = winner === this.leftId ? this.rightId : this.leftId;
    const gains: Record<string, number> = winner
      ? { [winner]: pts.winner, [loser]: pts.loser }
      : { [this.leftId]: pts.tie, [this.rightId]: pts.tie };
    for (const [id, g] of Object.entries(gains)) this.host.addScore(id, g);
    this.result = { winner, ko, gains };
    this.host.system(
      winner
        ? ko
          ? `K.O. ! ${this.name(winner)} plaque le bras de ${this.name(loser)}.`
          : `${this.name(winner)} l'emporte aux points face à ${this.name(loser)}.`
        : 'Égalité parfaite, personne ne cède !',
    );
    this.phase = 'verdict';
    this.setPhase('verdict', BRAS_VERDICT);
    this.after(BRAS_VERDICT, () => this.nextDuel(this.turn + 1));
    this.host.broadcastState();
  }

  /** Nouvelle cible, assez loin de celles déjà affichées pour ne pas les chevaucher. */
  private spawn(others: BrasTarget[]): BrasTarget {
    let x = 0.5;
    let y = 0.5;
    for (let tries = 0; tries < 12; tries++) {
      x = 0.1 + this.host.random() * 0.8;
      y = 0.15 + this.host.random() * 0.7;
      if (others.every((o) => Math.hypot(o.x - x, o.y - y) > 0.24)) break;
    }
    return { id: this.nextId++, x: round2(x), y: round2(y), gold: this.host.random() < BRAS_GOLD_CHANCE };
  }

  private shouting(id: string, now: number): boolean {
    return (this.voiceUntil[id] ?? 0) > now;
  }

  private queueBroadcast(): void {
    if (this.flush) return;
    this.flush = setTimeout(() => {
      this.flush = null;
      this.host.broadcastState();
    }, FLUSH_MS);
  }

  private name(id: string): string {
    return this.host.player(id)?.name ?? '?';
  }

  private setPhase(phase: Phase, seconds: number): void {
    this.host.setPhase(phase, Date.now() + seconds * 1000, this.turn + 1);
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, seconds * 1000));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.flush) clearTimeout(this.flush);
    this.flush = null;
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
