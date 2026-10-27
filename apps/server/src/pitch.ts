import {
  PITCH_BRIEF,
  PITCH_MIN_TALK,
  PITCH_RATE,
  PITCH_SLIDES,
  PITCH_SLIDE_COOLDOWN,
  PITCH_TIME,
  PITCH_VERDICT,
  PITCH_FUNDED,
  PITCH_OFFERS,
  makeProduct,
  pitchGains,
  type ClientMsg,
  type Phase,
  type PitchProduct,
  type PitchResult,
  type PitchState,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface PitchHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** Pitchs par joueur : chacun vend `rounds` fois. */
  rounds(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  endGame(): void;
}

type PitchMsg = Extract<ClientMsg, { t: 'pitch' }>;

/**
 * Une partie de Pitch saboté. Les vendeurs passent dans l'ordre figé au départ ; tous les autres
 * sont investisseurs : ils sabotent le pitch à coups de diapos, puis font leur offre de 1 à 5.
 */
export class Pitch {
  phase: 'brief' | 'pitch' | 'vote' | 'verdict' | 'done' = 'brief';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  pitcherId = '';
  product: PitchProduct;
  rerolled = false;
  slide: PitchState['slide'] = null;
  sent: Record<string, number> = {};
  ratings: Record<string, number> = {};
  result: PitchResult | null = null;

  private pitchStart = 0;
  private lastSlide = new Map<string, number>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: PitchHost) {
    this.order = host.playerIds();
    this.turns = Math.max(1, this.order.length * host.rounds());
    this.product = makeProduct(host.random);
  }

  start(): void {
    this.host.system(`Pitch saboté : ${this.turns} pitchs, 60 secondes pour convaincre.`);
    this.nextTurn(0);
  }

  handle(id: string, msg: PitchMsg): void {
    if (!this.host.player(id)) return;
    if ('slide' in msg) {
      if (this.phase !== 'pitch' || id === this.pitcherId) return;
      const index = msg.slide;
      if (!Number.isInteger(index) || index < 0 || index >= PITCH_SLIDES.length) return;
      const now = Date.now();
      if (now - (this.lastSlide.get(id) ?? -Infinity) < PITCH_SLIDE_COOLDOWN) return;
      this.lastSlide.set(id, now);
      this.slide = { index, by: id, n: (this.slide?.n ?? 0) + 1 };
      this.sent[id] = (this.sent[id] ?? 0) + 1;
      this.host.broadcastState();
    } else if ('rate' in msg) {
      if (this.phase !== 'vote' || id === this.pitcherId) return;
      const stars = msg.rate;
      if (!Number.isInteger(stars) || stars < 1 || stars > PITCH_OFFERS.length) return;
      this.ratings[id] = stars;
      if (this.investors().every((p) => p in this.ratings)) this.finish();
      else this.host.broadcastState();
    } else if ('done' in msg) {
      if (this.phase !== 'pitch' || id !== this.pitcherId) return;
      if (Date.now() - this.pitchStart < PITCH_MIN_TALK * 1000) return;
      this.toVote();
    } else if ('reroll' in msg) {
      if (this.phase !== 'brief' || id !== this.pitcherId || this.rerolled) return;
      this.rerolled = true;
      this.product = makeProduct(this.host.random);
      this.host.broadcastState();
    }
  }

  /** Le vendeur part : pitch suivant. Un investisseur part pendant les offres : on vérifie s'il manquait. */
  onLeave(id: string): void {
    if (this.phase === 'done' || this.phase === 'verdict') return;
    if (id === this.pitcherId) {
      this.host.system('Le vendeur a quitté la salle : pitch suivant.');
      this.nextTurn(this.turn + 1);
      return;
    }
    delete this.ratings[id];
    if (this.phase === 'vote' && this.investors().every((p) => p in this.ratings)) this.finish();
  }

  stateFor(): PitchState {
    return {
      pitcherId: this.pitcherId,
      turn: this.turn,
      turns: this.turns,
      product: this.product,
      rerolled: this.rerolled,
      slide: this.slide,
      sent: this.sent,
      rated: Object.keys(this.ratings),
      result: this.result,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private investors(): string[] {
    return this.host.playerIds().filter((id) => id !== this.pitcherId);
  }

  /** Premier tour jouable à partir de k : les tours d'un joueur parti sont sautés. */
  private nextTurn(k: number): void {
    this.clearTimers();
    const present = new Set(this.host.playerIds());
    const n = this.order.length;
    while (k < this.turns && !present.has(this.order[k % n]!)) k++;
    if (k >= this.turns || present.size < 2) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.turn = k;
    this.pitcherId = this.order[k % n]!;
    this.product = makeProduct(this.host.random);
    this.rerolled = false;
    this.slide = null;
    this.sent = {};
    this.ratings = {};
    this.result = null;
    this.lastSlide.clear();
    this.phase = 'brief';
    this.setPhase('brief', PITCH_BRIEF);
    this.after(PITCH_BRIEF, () => this.startPitch());
    this.host.broadcastState();
  }

  private startPitch(): void {
    this.clearTimers();
    this.phase = 'pitch';
    this.pitchStart = Date.now();
    this.setPhase('pitch', PITCH_TIME);
    this.after(PITCH_TIME, () => this.toVote());
    this.host.broadcastState();
  }

  private toVote(): void {
    if (this.phase !== 'pitch') return;
    this.clearTimers();
    this.phase = 'vote';
    this.setPhase('vote', PITCH_RATE);
    this.after(PITCH_RATE, () => this.finish());
    this.host.broadcastState();
  }

  private finish(): void {
    if (this.phase !== 'vote') return;
    this.clearTimers();
    const stars = Object.values(this.ratings);
    const gains = pitchGains(stars, this.sent, this.pitcherId);
    for (const [id, pts] of Object.entries(gains)) this.host.addScore(id, pts);
    const avg = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0;
    const raised = stars.reduce((sum, s) => sum + PITCH_OFFERS[s - 1]!.amount, 0);
    this.result = { avg, raised, ratings: { ...this.ratings }, gains };
    const name = this.host.player(this.pitcherId)?.name ?? '?';
    this.host.system(avg >= PITCH_FUNDED ? `${this.product.brand} est financé ! Bravo ${name}.` : `${this.product.brand} n'a pas convaincu les investisseurs.`);
    this.phase = 'verdict';
    this.setPhase('verdict', PITCH_VERDICT);
    this.after(PITCH_VERDICT, () => this.nextTurn(this.turn + 1));
    this.host.broadcastState();
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
  }
}
