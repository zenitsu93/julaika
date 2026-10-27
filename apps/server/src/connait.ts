import {
  CONNAIT_ANSWER_TIME,
  CONNAIT_GUESS_POINTS,
  CONNAIT_QUESTIONS,
  CONNAIT_REVEAL_TIME,
  CONNAIT_STAR_POINTS,
  type ClientMsg,
  type ConnaitQuestion,
  type ConnaitReveal,
  type ConnaitRound,
  type ConnaitState,
  type Phase,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface ConnaitHost {
  playerIds(): string[];
  player(id: string): { name: string; avatar: number } | undefined;
  /** Tours par joueur : chacun est la vedette `rounds` fois. */
  rounds(): number;
  random(): number;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  endGame(): void;
}

type ConnaitMsg = Extract<ClientMsg, { t: 'connait' }>;

/**
 * Une partie de Qui me connaît le mieux. La vedette du tour répond en secret à une question
 * sur elle ; les autres parient en même temps sur sa réponse. Quand tout le monde a choisi
 * (ou que le temps est écoulé), tout se dévoile : chaque pari juste rapporte des points au
 * parieur, et à la vedette, récompensée d'être si bien connue.
 */
export class Connait {
  phase: 'answer' | 'reveal' = 'answer';
  turn = 0;
  readonly turns: number;
  starId: string | null = null;
  question: ConnaitQuestion | null = null;
  rerolled = false;
  reveal: ConnaitReveal | null = null;
  readonly history: ConnaitRound[] = [];
  readonly picks = new Map<string, number>();

  private readonly order: string[];
  private deck: ConnaitQuestion[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: ConnaitHost) {
    this.order = host.playerIds();
    this.turns = Math.max(1, host.rounds() * this.order.length);
  }

  start(): void {
    this.host.system(`Qui me connaît le mieux : ${this.turns} questions, chacun passe sur la sellette.`);
    this.nextTurn();
  }

  handle(id: string, msg: ConnaitMsg): void {
    if (this.phase !== 'answer' || !this.host.player(id)) return;
    if ('reroll' in msg) {
      if (id === this.starId && !this.rerolled && !this.picks.has(id)) {
        this.rerolled = true;
        // Les paris portaient sur les anciennes réponses : on repart de zéro, avec le temps entier.
        this.picks.clear();
        this.question = this.draw();
        this.startTimer();
        this.host.broadcastState();
      }
      return;
    }
    const pick = Number(msg.pick);
    if (!Number.isInteger(pick) || pick < 0 || pick >= (this.question?.options.length ?? 0)) return;
    this.picks.set(id, pick);
    this.host.broadcastState();
    this.checkAllAnswered();
  }

  /** Un joueur part : si c'est la vedette, sa question tombe ; sinon on n'attend plus que les présents. */
  onLeave(id: string): void {
    if (this.phase !== 'answer') return;
    this.picks.delete(id);
    if (id === this.starId) {
      this.host.system('La vedette est partie : question suivante.');
      this.nextTurn();
    } else this.checkAllAnswered();
  }

  stateFor(id: string): ConnaitState {
    return {
      turn: this.turn,
      turns: this.turns,
      starId: this.starId,
      question: this.question,
      answered: [...this.picks.keys()],
      mine: this.picks.get(id) ?? null,
      canReroll: this.phase === 'answer' && id === this.starId && !this.rerolled && !this.picks.has(id),
      reveal: this.reveal,
      history: this.history,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextTurn(): void {
    this.clearTimers();
    const present = new Set(this.host.playerIds());
    // La vedette suivante : l'ordre du départ, en sautant ceux qui sont partis.
    let star: string | undefined;
    while (this.turn < this.turns && !star) {
      const candidate = this.order[this.turn % this.order.length]!;
      this.turn++;
      if (present.has(candidate)) star = candidate;
    }
    if (!star) return this.host.endGame();

    this.phase = 'answer';
    this.starId = star;
    this.question = this.draw();
    this.rerolled = false;
    this.reveal = null;
    this.picks.clear();
    this.startTimer();
    this.host.broadcastState();
  }

  private startTimer(): void {
    this.clearTimers();
    this.host.setPhase('answer', Date.now() + CONNAIT_ANSWER_TIME * 1000, this.turn);
    this.timers.push(setTimeout(() => this.revealAll(), CONNAIT_ANSWER_TIME * 1000));
  }

  private checkAllAnswered(): void {
    const present = this.host.playerIds();
    if (present.every((id) => this.picks.has(id))) this.revealAll();
  }

  private revealAll(): void {
    if (this.phase !== 'answer') return;
    this.clearTimers();
    const star = this.starId!;
    const answer = this.picks.get(star) ?? null;
    const gains: Record<string, number> = {};
    const guessers = this.host.playerIds().filter((id) => id !== star);
    let right = 0;
    for (const id of guessers) {
      if (answer === null || this.picks.get(id) !== answer) continue;
      right++;
      gains[id] = CONNAIT_GUESS_POINTS;
    }
    if (right) gains[star] = right * CONNAIT_STAR_POINTS;
    for (const [id, points] of Object.entries(gains)) this.host.addScore(id, points);

    const who = this.host.player(star);
    this.history.push({
      starId: star,
      name: who?.name ?? '?',
      avatar: who?.avatar ?? 0,
      topic: this.question!.topic,
      answer: answer === null ? null : this.question!.options[answer]!,
      right,
      total: guessers.length,
    });
    this.phase = 'reveal';
    this.reveal = { answer, picks: Object.fromEntries(this.picks), gains };
    if (answer === null) this.host.system(`${who?.name ?? 'La vedette'} n'a pas répondu à temps.`);
    this.host.setPhase('reveal', Date.now() + CONNAIT_REVEAL_TIME * 1000, this.turn);
    this.timers.push(setTimeout(() => this.nextTurn(), CONNAIT_REVEAL_TIME * 1000));
    this.host.broadcastState();
  }

  /** Question suivante du paquet, mélangé une fois : pas de doublon avant d'avoir tout vu. */
  private draw(): ConnaitQuestion {
    if (!this.deck.length) {
      this.deck = [...CONNAIT_QUESTIONS];
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.host.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j]!, this.deck[i]!];
      }
    }
    return this.deck.pop()!;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
