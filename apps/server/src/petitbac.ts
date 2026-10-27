import {
  BAC_ANSWER_MAX,
  BAC_CATEGORIES,
  BAC_CATEGORY_COUNT,
  BAC_LETTERS,
  BAC_REVEAL_TIME,
  BAC_ROLL_TIME,
  BAC_STOP_GRACE,
  BAC_VOTE_TIME,
  bacFits,
  bacScore,
  vetoKey,
  type BacState,
  type ClientMsg,
  type Phase,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les réglages, les scores et la diffusion. */
export interface BacHost {
  playerIds(): string[];
  name(id: string): string;
  isHost(id: string): boolean;
  /** Temps pour remplir la grille (s). */
  fillTime(): number;
  rounds(): number;
  random(): number;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  endGame(): void;
}

type BacMsg = Extract<ClientMsg, { t: 'bac' }>;

/**
 * Une partie de Petit Bac. À chaque manche, une lettre et la même grille de catégories pour
 * tous ; les réponses restent secrètes jusqu'au vote, où chacun peut refuser celles des autres.
 */
export class PetitBac {
  phase: 'fill' | 'vote' | 'reveal' = 'fill';
  round = 0;
  letter = '';
  readonly categories: string[];
  players: string[] = [];
  answers = new Map<string, string[]>();
  vetoes: Record<string, string[]> = {};
  stoppedBy: string | null = null;
  points: Record<string, number[]> | null = null;
  readonly done = new Set<string>();

  private letters: string[];
  private endsAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: BacHost) {
    this.categories = this.shuffle([...BAC_CATEGORIES]).slice(0, BAC_CATEGORY_COUNT);
    this.letters = this.shuffle([...BAC_LETTERS]);
  }

  start(): void {
    this.host.system(`Petit Bac : ${this.host.rounds()} manche${this.host.rounds() > 1 ? 's' : ''}, ${this.categories.join(', ')}.`);
    this.nextRound();
  }

  handle(id: string, msg: BacMsg): void {
    if ('next' in msg) {
      if (this.phase === 'reveal' && this.host.isHost(id)) this.nextRound();
      return;
    }
    if (!this.players.includes(id)) return;
    if ('answers' in msg) {
      if (this.phase !== 'fill' || !Array.isArray(msg.answers)) return;
      const before = this.filledOf(id);
      this.answers.set(
        id,
        this.categories.map((_, i) => String(msg.answers[i] ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trimStart().slice(0, BAC_ANSWER_MAX)),
      );
      if (this.filledOf(id) !== before) this.host.broadcastState();
    } else if ('stop' in msg) {
      // Seul celui qui a rempli toute sa grille peut arrêter la manche.
      if (this.phase !== 'fill' || this.stoppedBy || this.filledOf(id) < this.categories.length) return;
      this.stoppedBy = id;
      this.host.system(`${this.host.name(id)} crie « Stop ! » : plus que ${BAC_STOP_GRACE} secondes.`);
      const endsAt = Math.min(this.endsAt, Date.now() + BAC_STOP_GRACE * 1000);
      this.host.setPhase('fill', endsAt, this.round);
      this.schedule(endsAt, () => this.startVote());
      this.host.broadcastState();
    } else if ('veto' in msg) {
      const v = msg.veto;
      if (this.phase !== 'vote' || !v || typeof v !== 'object') return;
      const category = Number(v.category);
      const target = String(v.player);
      if (target === id || !this.answers.has(target) || !Number.isInteger(category) || category < 0 || category >= this.categories.length) return;
      if (!bacFits(this.answers.get(target)![category] ?? '', this.letter)) return;
      const key = vetoKey(target, category);
      const against = new Set(this.vetoes[key]);
      if (v.against) against.add(id);
      else against.delete(id);
      if (against.size) this.vetoes[key] = [...against];
      else delete this.vetoes[key];
      this.host.broadcastState();
    } else if ('done' in msg) {
      if (this.phase !== 'vote') return;
      if (msg.done) this.done.add(id);
      else this.done.delete(id);
      this.host.broadcastState();
      this.checkAllVoted();
    }
  }

  /** Un joueur part : on n'attend plus son vote. */
  onLeave(_id: string): void {
    if (this.phase === 'vote') this.checkAllVoted();
  }

  state(): BacState {
    const hidden = this.phase === 'fill';
    return {
      letter: this.letter,
      categories: this.categories,
      players: this.players,
      filled: Object.fromEntries(this.players.map((id) => [id, this.filledOf(id)])),
      stoppedBy: this.stoppedBy,
      done: [...this.done],
      answers: hidden ? null : Object.fromEntries(this.answers),
      vetoes: this.vetoes,
      points: this.points,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextRound(): void {
    this.clearTimers();
    if (this.round >= this.host.rounds()) return this.host.endGame();
    this.round++;
    // Plus de lettres que de manches possibles, mais on reprend le sac s'il se vide.
    if (!this.letters.length) this.letters = this.shuffle([...BAC_LETTERS]);
    this.letter = this.letters.pop()!;
    this.players = this.host.playerIds();
    this.answers = new Map(this.players.map((id) => [id, this.categories.map(() => '')]));
    this.vetoes = {};
    this.stoppedBy = null;
    this.points = null;
    this.done.clear();
    this.phase = 'fill';
    const endsAt = Date.now() + (BAC_ROLL_TIME + this.host.fillTime()) * 1000;
    this.host.setPhase('fill', endsAt, this.round);
    // Une seconde de grâce : la dernière frappe envoyée au buzzer arrive à temps.
    this.schedule(endsAt, () => this.startVote());
    this.host.broadcastState();
  }

  private startVote(): void {
    this.clearTimers();
    this.phase = 'vote';
    this.done.clear();
    const votable = [...this.answers.values()].some((list) => list.some((a) => bacFits(a, this.letter)));
    if (!votable) return this.reveal();
    const endsAt = Date.now() + BAC_VOTE_TIME * 1000;
    this.host.setPhase('vote', endsAt, this.round);
    this.schedule(endsAt, () => this.reveal());
    this.host.broadcastState();
  }

  private reveal(): void {
    this.clearTimers();
    const present = new Set(this.host.playerIds());
    const voters = this.players.filter((id) => present.has(id));
    const answers = Object.fromEntries([...this.answers].map(([id, list]) => [id, list.map((a) => a.trim())]));
    this.points = bacScore(answers, this.letter, this.categories.length, this.vetoes, voters);
    for (const [id, pts] of Object.entries(this.points)) if (present.has(id)) this.host.addScore(id, pts.reduce((a, b) => a + b, 0));
    this.phase = 'reveal';
    this.done.clear();
    const endsAt = Date.now() + BAC_REVEAL_TIME * 1000;
    this.host.setPhase('reveal', endsAt, this.round);
    this.schedule(endsAt, () => this.nextRound());
    this.host.broadcastState();
  }

  private checkAllVoted(): void {
    const present = new Set(this.host.playerIds());
    if (this.players.filter((id) => present.has(id)).every((id) => this.done.has(id))) this.reveal();
  }

  private filledOf(id: string): number {
    return (this.answers.get(id) ?? []).filter((a) => a.trim()).length;
  }

  private schedule(at: number, fn: () => void): void {
    this.clearTimers();
    this.endsAt = at;
    this.timers.push(setTimeout(fn, at - Date.now() + (this.phase === 'fill' ? 1000 : 0)));
  }

  private shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.host.random() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    return list;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
