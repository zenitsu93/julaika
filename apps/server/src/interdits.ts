import {
  INTERDITS_CARDS,
  INTERDITS_GRACE_MS,
  INTERDITS_INTRO,
  INTERDITS_POINTS,
  INTERDITS_SKIPS,
  INTERDITS_VERDICT,
  banCount,
  checkGuess,
  type ClientMsg,
  type InterditsCard,
  type InterditsOutcome,
  type InterditsPlay,
  type InterditsState,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface InterditsHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** Tours par joueur : chacun fait deviner `rounds` fois. */
  rounds(): number;
  /** Durée d'un tour (s). */
  turnTime(): number;
  difficulty(): string;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  sendTo(id: string, msg: ServerMsg): void;
  system(text: string): void;
  /** Ajoute (ou retire) des points au score d'un joueur, sans descendre sous zéro. */
  addScore(id: string, points: number): void;
  endGame(): void;
}

type InterditsMsg = Extract<ClientMsg, { t: 'interdits' }>;

/**
 * Une partie de Mots interdits. Les tours s'enchaînent dans un ordre figé au départ : au tour k,
 * order[k] fait deviner et, à trois et plus, le joueur du tour précédent garde la carte.
 * Les cartes viennent d'une pioche mélangée une fois, sans doublon tant qu'il en reste.
 */
export class Interdits {
  phase: 'faceoff' | 'explain' | 'verdict' | 'done' = 'faceoff';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  explainerId = '';
  guardId: string | null = null;
  card: InterditsCard | null = null;
  cardNo = 0;
  played: InterditsPlay[] = [];
  skips = INTERDITS_SKIPS;
  gains: Record<string, number> = {};

  private deck: InterditsCard[] = [];
  private cardAt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: InterditsHost) {
    this.order = host.playerIds();
    this.turns = Math.max(1, this.order.length * host.rounds());
  }

  start(): void {
    this.host.system(`Mots interdits : ${this.turns} tours, faites deviner sans les mots défendus.`);
    this.nextTurn(0);
  }

  handle(id: string, msg: InterditsMsg): void {
    if (this.phase !== 'explain' || !this.card) return;
    const n = 'found' in msg ? msg.found : 'buzz' in msg ? msg.buzz : 'skip' in msg ? msg.skip : NaN;
    // Un clic sur une carte déjà tranchée, ou arrivé juste après la nouvelle, ne compte pas.
    if (n !== this.cardNo || Date.now() - this.cardAt < INTERDITS_GRACE_MS) return;
    if ('found' in msg) {
      if (id === this.explainerId) this.resolve('found', null);
    } else if ('buzz' in msg) {
      if (id !== this.explainerId && id !== this.guardId) return;
      const heard = typeof msg.heard === 'string' ? msg.heard.slice(0, 40) : null;
      this.resolve('buzz', id === this.explainerId ? null : id, heard);
    } else if ('skip' in msg) {
      if (id !== this.explainerId || this.skips <= 0) return;
      this.skips--;
      this.resolve('skip', null);
    }
  }

  /**
   * Message du chat pendant la partie. Rend true s'il est traité ici : celui qui fait deviner
   * et le gardien se taisent (ils connaissent la carte) ; une bonne réponse tapée fait gagner la carte.
   */
  chat(id: string, text: string): boolean {
    if (this.phase !== 'faceoff' && this.phase !== 'explain') return false;
    if (id === this.explainerId || id === this.guardId) {
      const why = id === this.explainerId ? 'Fais deviner à l’oral : le chat est fermé pendant ton tour.' : 'Tu gardes la carte : pas un mot dans le chat !';
      this.host.sendTo(id, { t: 'chat', line: { from: null, name: null, text: why, kind: 'system' } });
      return true;
    }
    if (this.phase !== 'explain' || !this.card) return false;
    const result = checkGuess(text, this.card.word);
    if (result === 'correct') {
      this.resolve('found', id);
      return true;
    }
    if (result === 'close') {
      this.host.sendTo(id, { t: 'chat', line: { from: null, name: null, text: `« ${text} » : tu chauffes !`, kind: 'close' } });
    }
    return false;
  }

  /** Celui qui fait deviner part : tour suivant. Le gardien part : le tour continue sans lui. */
  onLeave(id: string): void {
    if (this.phase === 'done' || this.phase === 'verdict') return;
    if (id === this.guardId) this.guardId = null;
    if (id !== this.explainerId) return;
    this.host.system('Celui qui faisait deviner est parti : tour suivant.');
    this.nextTurn(this.turn + 1);
  }

  stateFor(id: string): InterditsState {
    const sees = id === this.explainerId || id === this.guardId;
    return {
      explainerId: this.explainerId,
      guardId: this.guardId,
      turn: this.turn,
      turns: this.turns,
      card: sees && this.phase === 'explain' ? this.card : null,
      cardNo: this.cardNo,
      played: this.played,
      skips: this.skips,
      gains: this.phase === 'verdict' ? this.gains : null,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

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
    this.explainerId = this.order[k % n]!;
    // Le gardien : le joueur précédent encore là, s'il reste au moins un devineur à côté de lui.
    this.guardId = null;
    if (present.size >= 3) {
      for (let back = 1; back < n; back++) {
        const id = this.order[(k - back + n * 2) % n]!;
        if (id !== this.explainerId && present.has(id)) {
          this.guardId = id;
          break;
        }
      }
    }
    this.card = null;
    this.cardNo = 0;
    this.played = [];
    this.skips = INTERDITS_SKIPS;
    this.gains = {};
    this.phase = 'faceoff';
    this.setPhase('faceoff', INTERDITS_INTRO);
    this.after(INTERDITS_INTRO, () => this.startExplain());
    this.host.broadcastState();
  }

  private startExplain(): void {
    this.clearTimers();
    this.phase = 'explain';
    this.drawCard();
    this.setPhase('explain', this.host.turnTime());
    this.after(this.host.turnTime(), () => this.endTurn());
    this.host.broadcastState();
  }

  /** Tranche la carte en cours, compte les points et en tire une autre. */
  private resolve(outcome: InterditsOutcome, by: string | null, heard: string | null = null): void {
    const card = this.card!;
    this.played = [...this.played, { word: card.word, ban: card.ban, outcome, by, heard }];
    const P = INTERDITS_POINTS;
    if (outcome === 'found') {
      this.score(this.explainerId, P.explain);
      if (by) this.score(by, P.typed);
      else for (const id of this.host.playerIds()) if (id !== this.explainerId && id !== this.guardId) this.score(id, P.aloud);
      if (by) this.host.system(`${this.name(by)} a trouvé « ${card.word} » !`);
    } else if (outcome === 'buzz') {
      this.score(this.explainerId, -P.buzz);
      if (by) this.score(by, P.buzz);
      this.host.system(heard ? `Bzzz ! « ${heard} » était interdit (le mot : ${card.word}).` : `Bzzz ! Mot interdit (le mot : ${card.word}).`);
    }
    this.drawCard();
    this.host.broadcastState();
  }

  private endTurn(): void {
    if (this.phase !== 'explain') return;
    this.clearTimers();
    const found = this.played.filter((p) => p.outcome === 'found').length;
    this.host.system(`${this.name(this.explainerId)} a fait deviner ${found} mot${found > 1 ? 's' : ''}.`);
    this.card = null;
    this.phase = 'verdict';
    this.setPhase('verdict', INTERDITS_VERDICT);
    this.after(INTERDITS_VERDICT, () => this.nextTurn(this.turn + 1));
    this.host.broadcastState();
  }

  /** Carte suivante de la pioche, avec autant de mots interdits que le veut la difficulté. */
  private drawCard(): void {
    if (!this.deck.length) this.deck = shuffle(INTERDITS_CARDS, this.host.random);
    const next = this.deck.pop()!;
    this.card = { word: next.word, ban: next.ban.slice(0, banCount(this.host.difficulty())) };
    this.cardNo++;
    this.cardAt = Date.now();
  }

  private score(id: string, points: number): void {
    this.gains[id] = (this.gains[id] ?? 0) + points;
    this.host.addScore(id, points);
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
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const bag = [...items];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return bag;
}
