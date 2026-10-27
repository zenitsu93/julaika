import {
  QUIZ_ANSWER_TIME,
  QUIZ_PREP_MIN_MS,
  QUIZ_READ_MS,
  QUIZ_REVEAL_TIME,
  normalize,
  quizPoints,
  type ClientMsg,
  type Phase,
  type QuizQuestion,
  type QuizReveal,
  type QuizRound,
  type QuizState,
} from '@julaika/shared';
import { QUIZ_BANK } from './quizBank';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion, la phase commune et les questions. */
export interface QuizHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  themes(): string[];
  count(): number;
  random(): number;
  /** Questions écrites par l'IA, ou `null` si elle ne répond pas (la réserve prend alors le relais). */
  generate(): Promise<QuizQuestion[] | null>;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  endGame(): void;
}

type QuizMsg = Extract<ClientMsg, { t: 'quiz' }>;

/**
 * Une partie du quiz de culture générale. La machine à questions tourne d'abord (l'IA écrit
 * les questions sur les thèmes de l'hôte), puis chaque question se lit quelques secondes avant
 * que les quatre réponses s'ouvrent. Une réponse verrouillée ne se change plus ; quand tout le
 * monde a répondu (ou que le temps est écoulé), la bonne réponse et les points tombent.
 */
export class Quiz {
  phase: 'prep' | 'answer' | 'reveal' = 'prep';
  index = 0;
  source: QuizState['source'] = null;
  openAt: number | null = null;
  reveal: QuizReveal | null = null;
  readonly history: QuizRound[] = [];
  readonly picks = new Map<string, { pick: number; at: number }>();
  readonly streaks = new Map<string, number>();
  readonly themes: string[];

  private questions: QuizQuestion[] = [];
  private disposed = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: QuizHost) {
    this.themes = host.themes();
  }

  get total(): number {
    return this.questions.length || this.host.count();
  }

  get question(): QuizQuestion | null {
    return this.phase === 'prep' ? null : (this.questions[this.index - 1] ?? null);
  }

  async start(): Promise<void> {
    this.host.setPhase('prep', null, 0);
    this.host.broadcastState();
    const started = Date.now();
    const generated = await this.host.generate().catch(() => null);
    if (this.disposed) return;
    const count = this.host.count();
    if (generated && generated.length >= Math.min(count, 3)) {
      this.questions = generated.slice(0, count);
      this.source = 'ia';
    } else {
      this.questions = this.fromBank(count);
      this.source = 'reserve';
      this.host.system("L'IA n'a pas répondu : questions de la réserve intégrée.");
    }
    const wait = Math.max(0, QUIZ_PREP_MIN_MS - (Date.now() - started));
    this.timers.push(setTimeout(() => this.next(), wait));
    this.host.broadcastState();
  }

  handle(id: string, msg: QuizMsg): void {
    if (this.phase !== 'answer' || !this.host.player(id) || this.picks.has(id)) return;
    const now = Date.now();
    // Un peu de marge sur l'ouverture : l'horloge du client n'est jamais tout à fait celle du serveur.
    if (this.openAt === null || now < this.openAt - 250) return;
    const pick = Number(msg.pick);
    if (!Number.isInteger(pick) || pick < 0 || pick >= (this.question?.options.length ?? 0)) return;
    this.picks.set(id, { pick, at: Math.max(now, this.openAt) });
    this.host.broadcastState();
    this.checkAllAnswered();
  }

  onLeave(id: string): void {
    this.picks.delete(id);
    this.streaks.delete(id);
    if (this.phase === 'answer') this.checkAllAnswered();
  }

  stateFor(id: string): QuizState {
    const q = this.question;
    return {
      themes: this.themes,
      source: this.source,
      index: this.phase === 'prep' ? 0 : this.index,
      total: this.total,
      question: q ? { theme: q.theme, text: q.text, options: q.options } : null,
      openAt: this.phase === 'answer' ? this.openAt : null,
      answered: [...this.picks.keys()],
      mine: this.picks.get(id)?.pick ?? null,
      streaks: Object.fromEntries(this.streaks),
      reveal: this.reveal,
      history: this.history,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private next(): void {
    this.clearTimers();
    if (this.index >= this.questions.length) return this.host.endGame();
    this.index++;
    this.phase = 'answer';
    this.reveal = null;
    this.picks.clear();
    this.openAt = Date.now() + QUIZ_READ_MS;
    const endsAt = this.openAt + QUIZ_ANSWER_TIME * 1000;
    this.host.setPhase('answer', endsAt, this.index);
    this.timers.push(setTimeout(() => this.revealAll(), endsAt - Date.now()));
    this.host.broadcastState();
  }

  private checkAllAnswered(): void {
    const present = this.host.playerIds();
    if (present.length && present.every((id) => this.picks.has(id))) this.revealAll();
  }

  private revealAll(): void {
    if (this.phase !== 'answer') return;
    this.clearTimers();
    const q = this.question!;
    const present = this.host.playerIds();
    const gains: Record<string, number> = {};
    let right = 0;
    let fastest: { id: string; at: number } | null = null;
    for (const id of present) {
      const p = this.picks.get(id);
      if (!p || p.pick !== q.answer) {
        this.streaks.set(id, 0);
        continue;
      }
      right++;
      const streak = (this.streaks.get(id) ?? 0) + 1;
      this.streaks.set(id, streak);
      gains[id] = quizPoints(p.at - this.openAt!, streak);
      if (!fastest || p.at < fastest.at) fastest = { id, at: p.at };
    }
    for (const [id, points] of Object.entries(gains)) this.host.addScore(id, points);

    this.history.push({ theme: q.theme, text: q.text, answer: q.options[q.answer]!, right, total: present.length });
    this.phase = 'reveal';
    this.reveal = {
      answer: q.answer,
      explain: q.explain,
      picks: Object.fromEntries([...this.picks].map(([id, p]) => [id, p.pick])),
      gains,
      streaks: Object.fromEntries(this.streaks),
      fastest: fastest?.id ?? null,
    };
    this.host.setPhase('reveal', Date.now() + QUIZ_REVEAL_TIME * 1000, this.index);
    this.timers.push(setTimeout(() => this.next(), QUIZ_REVEAL_TIME * 1000));
    this.host.broadcastState();
  }

  /** Tirage dans la réserve : d'abord les questions des thèmes demandés, complétées au hasard, réponses mélangées. */
  private fromBank(count: number): QuizQuestion[] {
    const wanted = this.themes.map(normalize);
    const matches = (q: QuizQuestion) => {
      const theme = normalize(q.theme);
      const text = normalize(q.text);
      return wanted.some((t) => theme.includes(t) || t.includes(theme) || text.includes(t));
    };
    const shuffle = <T>(list: T[]) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(this.host.random() * (i + 1));
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
      return list;
    };
    const first = shuffle(QUIZ_BANK.filter(matches));
    const rest = shuffle(QUIZ_BANK.filter((q) => !matches(q)));
    return [...first, ...rest].slice(0, count).map((q) => {
      const order = shuffle([0, 1, 2, 3]);
      return { ...q, options: order.map((i) => q.options[i]!), answer: order.indexOf(q.answer) };
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
