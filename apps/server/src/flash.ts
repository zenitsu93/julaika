import {
  DrawOp,
  FLASH_DRAW_TIME,
  FLASH_IMAGES,
  FLASH_MAX_STARS,
  FLASH_READY_TIME,
  FLASH_REVEAL_TIME,
  FLASH_SHOW_TIME,
  FLASH_STAR_POINTS,
  FLASH_VOTE_TIME,
  decodeDraw,
  type ClientMsg,
  type DrawPacket,
  type FlashSketch,
  type FlashState,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface FlashHost {
  playerIds(): string[];
  player(id: string): { name: string; avatar: number } | undefined;
  /** Manches de la partie. */
  rounds(): number;
  random(): number;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  sendTo(id: string, msg: ServerMsg): void;
  system(text: string): void;
  endGame(): void;
}

/** Octets de dessin gardés par joueur et par manche : 15 s de griffonnage tiennent large. */
const MAX_DRAWING_BYTES = 300_000;

type FlashMsg = Extract<ClientMsg, { t: 'flash' }>;
interface Seat {
  id: string;
  name: string;
  avatar: number;
}

/**
 * Une partie de Flash. À chaque manche, une image tirée au sort s'affiche quelques secondes ;
 * chacun la redessine de mémoire avec ses trois couleurs, sans voir les autres. Puis les
 * croquis entourent l'original, tout le monde note la ressemblance, et les étoiles font les points.
 */
export class Flash {
  phase: 'memorize' | 'draw' | 'vote' | 'reveal' | 'done' = 'memorize';
  round = 0;
  readonly rounds: number;
  readonly seats: Seat[];
  readonly done = new Set<string>();
  image = 0;
  showAt: number | null = null;
  stars: FlashState['stars'] = {};

  private drawings = new Map<string, Uint8Array[][]>();
  private drawingBytes = new Map<string, number>();
  private sketches: FlashSketch[] = [];
  /** Notes de la manche : votant → (croquis noté → étoiles). */
  private votes = new Map<string, Map<string, number>>();
  private deck: number[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: FlashHost) {
    this.seats = host.playerIds().map((id) => ({ id, name: host.player(id)?.name ?? '?', avatar: host.player(id)?.avatar ?? 0 }));
    this.rounds = host.rounds();
  }

  start(): void {
    this.host.system(`Flash : ${this.rounds} manche${this.rounds > 1 ? 's' : ''}. Ouvrez grand les yeux !`);
    this.startRound(1);
  }

  handle(id: string, msg: FlashMsg): void {
    if (!this.seats.some((s) => s.id === id)) return;
    if ('done' in msg) {
      if (this.phase === 'draw') this.markDone(id);
    } else if ('edit' in msg) {
      if (this.phase === 'draw' && this.done.delete(id)) this.host.broadcastState();
    } else if ('vote' in msg) {
      if (this.phase !== 'vote') return;
      const target = String(msg.vote);
      if (target === id || !this.rateable(target)) return;
      const stars = typeof msg.stars === 'number' && Number.isFinite(msg.stars) ? Math.round(msg.stars) : NaN;
      if (!(stars >= 1)) return;
      const mine = this.votes.get(id) ?? new Map<string, number>();
      mine.set(target, Math.min(FLASH_MAX_STARS, stars));
      this.votes.set(id, mine);
      if (this.hasRatedAll(id)) this.markDone(id);
    }
  }

  /** Paquet de dessin d'un joueur : gardé pour le vote, jamais relayé (chacun dessine en secret). */
  draw(id: string, data: Uint8Array): void {
    if (!this.canDraw(id)) return;
    const packet = decodeDraw(data);
    if (!packet) return;
    const bytes = this.drawingBytes.get(id) ?? 0;
    if (bytes + data.byteLength > MAX_DRAWING_BYTES) return;
    const strokes = this.drawings.get(id) ?? [];
    const copy = new Uint8Array(data);
    // Trois couleurs, plus la gomme : le reste prend la première couleur de la manche.
    const colors = FLASH_IMAGES[this.image]!.colors;
    if (packet.op !== DrawOp.Extend && packet.color !== 0 && !colors.includes(packet.color)) copy[1] = colors[0];
    if (packet.op === DrawOp.Extend) {
      const last = strokes.at(-1);
      if (!last) return;
      last.push(copy);
    } else strokes.push([copy]);
    this.drawings.set(id, strokes);
    this.drawingBytes.set(id, bytes + copy.byteLength);
  }

  undo(id: string): void {
    if (!this.canDraw(id)) return;
    const removed = this.drawings.get(id)?.pop();
    if (removed) this.drawingBytes.set(id, (this.drawingBytes.get(id) ?? 0) - removed.reduce((n, p) => n + p.byteLength, 0));
  }

  clear(id: string): void {
    if (!this.canDraw(id)) return;
    this.drawings.delete(id);
    this.drawingBytes.delete(id);
  }

  /** Un joueur arrive en cours de partie : il regarde, et voit les croquis s'ils sont sortis. */
  onJoin(id: string): void {
    if (this.phase === 'vote' || this.phase === 'reveal') this.host.sendTo(id, this.sketchesMsg());
  }

  /** Un joueur part : les autres n'attendent plus que les présents. */
  onLeave(_id: string): void {
    this.checkAllDone();
  }

  state(): FlashState {
    const image = FLASH_IMAGES[this.image]!;
    return {
      round: this.round,
      rounds: this.rounds,
      players: this.seats.map((s) => s.id),
      done: [...this.done],
      // Pendant le dessin, l'image reste secrète : pas de triche en relisant l'état.
      image: this.phase === 'draw' ? null : this.image,
      colors: [...image.colors],
      showAt: this.phase === 'memorize' ? this.showAt : null,
      stars: this.stars,
    };
  }

  dispose(): void {
    this.clearTimers();
    this.drawings.clear();
    this.votes.clear();
    this.sketches = [];
  }

  // ---- Boucle -------------------------------------------------------------------

  private startRound(round: number): void {
    this.clearTimers();
    this.round = round;
    this.phase = 'memorize';
    this.done.clear();
    this.drawings.clear();
    this.drawingBytes.clear();
    this.votes.clear();
    this.sketches = [];
    this.stars = {};
    // Tirage sans remise : pas deux fois la même image dans une partie.
    if (!this.deck.length) this.deck = FLASH_IMAGES.map((_, i) => i);
    this.image = this.deck.splice(Math.floor(this.host.random() * this.deck.length), 1)[0]!;
    const now = Date.now();
    this.showAt = now + FLASH_READY_TIME * 1000;
    this.host.setPhase('memorize', this.showAt + FLASH_SHOW_TIME * 1000, round);
    this.after(FLASH_READY_TIME + FLASH_SHOW_TIME, () => this.startDraw());
    this.host.broadcastState();
  }

  private startDraw(): void {
    this.clearTimers();
    this.phase = 'draw';
    this.showAt = null;
    this.host.setPhase('draw', Date.now() + FLASH_DRAW_TIME * 1000, this.round);
    // Une seconde de grâce : le dernier trait envoyé au gong arrive à temps.
    this.after(FLASH_DRAW_TIME + 1, () => this.startVote());
    this.host.broadcastState();
  }

  private startVote(): void {
    this.clearTimers();
    this.phase = 'vote';
    this.done.clear();
    this.sketches = this.seats.map((s) => ({ by: s.id, name: s.name, avatar: s.avatar, strokes: this.strokesOf(s.id) }));
    this.drawings.clear();
    this.drawingBytes.clear();
    // Rien à noter (aucun autre croquis) : on a fini d'office.
    for (const s of this.seats) if (this.hasRatedAll(s.id)) this.done.add(s.id);
    this.host.setPhase('vote', Date.now() + FLASH_VOTE_TIME * 1000, this.round);
    this.host.broadcast(this.sketchesMsg());
    this.after(FLASH_VOTE_TIME, () => this.reveal());
    this.host.broadcastState();
    this.checkAllDone();
  }

  private reveal(): void {
    this.clearTimers();
    this.phase = 'reveal';
    this.done.clear();
    const stars: FlashState['stars'] = {};
    for (const s of this.sketches) if (s.strokes.length) stars[s.by] = { total: 0, votes: 0 };
    for (const mine of this.votes.values()) {
      for (const [target, n] of mine) {
        const s = stars[target];
        if (!s) continue;
        s.total += n;
        s.votes++;
      }
    }
    this.stars = stars;
    for (const [by, s] of Object.entries(stars)) if (s.total) this.host.addScore(by, s.total * FLASH_STAR_POINTS);
    this.host.setPhase('reveal', Date.now() + FLASH_REVEAL_TIME * 1000, this.round);
    this.after(FLASH_REVEAL_TIME, () => this.nextRound());
    this.host.broadcastState();
  }

  private nextRound(): void {
    if (this.round < this.rounds) return this.startRound(this.round + 1);
    this.clearTimers();
    this.phase = 'done';
    this.sketches = [];
    this.votes.clear();
    this.host.endGame();
  }

  private markDone(id: string): void {
    this.done.add(id);
    this.host.broadcastState();
    this.checkAllDone();
  }

  private checkAllDone(): void {
    if (this.phase !== 'draw' && this.phase !== 'vote') return;
    const present = new Set(this.host.playerIds());
    const waiting = this.seats.filter((s) => present.has(s.id) && !this.done.has(s.id));
    if (waiting.length) return;
    if (this.phase === 'draw') this.startVote();
    else this.reveal();
  }

  /** Un croquis qu'on peut noter : quelqu'un de la partie, qui a tracé au moins un trait. */
  private rateable(id: string): boolean {
    return this.sketches.some((s) => s.by === id && s.strokes.length > 0);
  }

  /** Le votant a noté tous les croquis des autres. */
  private hasRatedAll(id: string): boolean {
    const mine = this.votes.get(id);
    return this.sketches.every((s) => s.by === id || !s.strokes.length || mine?.has(s.by));
  }

  private canDraw(id: string): boolean {
    return this.phase === 'draw' && this.seats.some((s) => s.id === id) && !this.done.has(id);
  }

  /** Les paquets d'un trait (début + suites) fusionnés en un seul. */
  private strokesOf(id: string): DrawPacket[] {
    return (this.drawings.get(id) ?? []).flatMap((packets) => {
      const [first, ...rest] = packets.map((p) => decodeDraw(p)!);
      if (!first) return [];
      return [{ ...first, points: [...first.points, ...rest.flatMap((p) => p.points)] }];
    });
  }

  private sketchesMsg(): ServerMsg {
    return { t: 'sketches', round: this.round, sketches: this.sketches };
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, seconds * 1000));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
