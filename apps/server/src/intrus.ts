import {
  INTRUS_CLUE_MAX,
  INTRUS_MIN_PLAYERS,
  INTRUS_POINTS,
  checkGuess,
  intrusClueRounds,
  type ClientMsg,
  type IntrusClue,
  type IntrusPair,
  type IntrusResult,
  type IntrusState,
  type Phase,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les mots, les scores et la phase commune. */
export interface IntrusHost {
  playerIds(): string[];
  name(id: string): string;
  /** Nombre de manches : un nouvel intrus et une nouvelle paire à chaque fois. */
  rounds(): number;
  random(): number;
  nextPair(): IntrusPair;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  error(id: string, message: string): void;
  system(text: string): void;
  endGame(): void;
  toLobby(): void;
}

export const CLUE_TIME = 30;
export const VOTE_TIME = 45;
export const STEAL_TIME = 25;
export const REVEAL_TIME = 9;

type IntrusMsg = Extract<ClientMsg, { t: 'intrus' }>;

const clean = (s: unknown, max: number) =>
  String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Une partie de L'Intrus. Le serveur garde les mots : chacun ne reçoit que le sien, et les
 * votes restent cachés jusqu'au dépouillement.
 */
export class Intrus {
  phase: 'clue' | 'vote' | 'steal' | 'reveal' | 'done' = 'clue';
  manche = 0;
  readonly manches: number;
  order: string[] = [];
  intrusId: string | null = null;
  pair: IntrusPair | null = null;
  clueRound = 0;
  clueRounds = 2;
  speaker = 0;
  clues: IntrusClue[] = [];
  readonly votes = new Map<string, string>();
  accusedId: string | null = null;
  result: IntrusResult | null = null;
  readonly history: IntrusResult[] = [];

  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: IntrusHost) {
    this.manches = Math.max(1, host.rounds());
  }

  start(): void {
    this.host.system(`L'Intrus : ${this.manches} manche${this.manches > 1 ? 's' : ''}. Un seul d'entre vous n'a pas le même mot…`);
    this.nextManche();
  }

  handle(id: string, msg: IntrusMsg): void {
    if ('clue' in msg) this.giveClue(id, msg.clue);
    else if ('vote' in msg) this.vote(id, String(msg.vote));
    else if ('steal' in msg) this.steal(id, msg.steal);
  }

  onLeave(id: string): void {
    if (this.phase === 'done' || !this.order.includes(id)) return;
    if (this.present().length < INTRUS_MIN_PLAYERS) {
      this.host.system(`Il faut au moins ${INTRUS_MIN_PLAYERS} joueurs : retour au salon.`);
      this.host.toLobby();
      return;
    }
    if (this.phase === 'reveal') return;
    if (id === this.intrusId) {
      this.host.system("L'intrus est parti : manche suivante.");
      return this.nextManche();
    }
    if (this.phase === 'clue' && this.order[this.speaker] === id) return this.nextSpeaker();
    if (this.phase === 'vote') {
      this.votes.delete(id);
      this.checkVotes();
    }
  }

  stateFor(id: string): IntrusState {
    const speakerId = this.phase === 'clue' ? (this.order[this.speaker] ?? null) : null;
    return {
      word: this.wordOf(id),
      manche: this.manche,
      manches: this.manches,
      order: this.order,
      clueRound: this.clueRound,
      clueRounds: this.clueRounds,
      speakerId,
      clues: this.clues,
      voted: [...this.votes.keys()],
      myVote: this.votes.get(id) ?? null,
      accusedId: this.phase === 'steal' ? this.accusedId : null,
      result: this.phase === 'reveal' || this.phase === 'done' ? this.result : null,
      history: this.history,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextManche(): void {
    this.clearTimers();
    const ids = this.host.playerIds();
    if (this.manche >= this.manches || ids.length < INTRUS_MIN_PLAYERS) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.manche++;
    this.order = this.shuffle(ids);
    this.intrusId = this.order[Math.floor(this.host.random() * this.order.length)]!;
    this.pair = this.host.nextPair();
    this.clueRound = 0;
    this.clueRounds = intrusClueRounds(this.order.length);
    this.speaker = 0;
    this.clues = [];
    this.votes.clear();
    this.accusedId = null;
    this.result = null;
    this.startClue();
  }

  private startClue(): void {
    this.clearTimers();
    this.phase = 'clue';
    this.setPhase('clue', CLUE_TIME);
    this.after(CLUE_TIME, () => {
      this.host.system(`${this.host.name(this.order[this.speaker]!)} n'a rien dit… c'est suspect !`);
      this.nextSpeaker();
    });
    this.host.broadcastState();
  }

  private giveClue(id: string, raw: unknown): void {
    if (this.phase !== 'clue' || this.order[this.speaker] !== id) return;
    const text = clean(raw, INTRUS_CLUE_MAX);
    if (!text) return;
    if (checkGuess(text, this.wordOf(id) ?? '') !== 'wrong') {
      this.host.error(id, 'Pas ton mot, voyons ! Trouve un indice.');
      return;
    }
    this.clues.push({ by: id, text, round: this.clueRound });
    this.nextSpeaker();
  }

  /** Au suivant, en sautant ceux qui sont partis ; après le dernier tour d'indices, on vote. */
  private nextSpeaker(): void {
    const present = new Set(this.host.playerIds());
    do {
      this.speaker++;
      if (this.speaker >= this.order.length) {
        this.speaker = 0;
        this.clueRound++;
        if (this.clueRound >= this.clueRounds) return this.startVote();
      }
    } while (!present.has(this.order[this.speaker]!));
    this.startClue();
  }

  private startVote(): void {
    this.clearTimers();
    this.phase = 'vote';
    this.setPhase('vote', VOTE_TIME);
    this.after(VOTE_TIME, () => this.tally());
    this.host.broadcastState();
  }

  private vote(id: string, target: string): void {
    if (this.phase !== 'vote' || id === target || !this.order.includes(id) || !this.order.includes(target)) return;
    if (!this.host.playerIds().includes(target)) return;
    this.votes.set(id, target);
    this.host.broadcastState();
    this.checkVotes();
  }

  private checkVotes(): void {
    if (this.present().every((id) => this.votes.has(id))) this.tally();
  }

  /** Le plus désigné est démasqué ; en cas d'égalité, personne ne l'est et l'intrus s'en tire. */
  private tally(): void {
    if (this.phase !== 'vote') return;
    this.clearTimers();
    const counts = new Map<string, number>();
    for (const target of this.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    const top = [...counts].filter(([, n]) => n === best).map(([id]) => id);
    this.accusedId = best > 0 && top.length === 1 ? top[0]! : null;
    if (this.accusedId && this.accusedId === this.intrusId) {
      this.phase = 'steal';
      this.setPhase('steal', STEAL_TIME);
      this.after(STEAL_TIME, () => this.finish(null));
      this.host.system(`${this.host.name(this.accusedId)} était bien l'intrus… mais peut encore deviner le mot des autres !`);
      this.host.broadcastState();
      return;
    }
    this.finish(null);
  }

  private steal(id: string, raw: unknown): void {
    if (this.phase !== 'steal' || id !== this.intrusId) return;
    const text = clean(raw, INTRUS_CLUE_MAX);
    if (text) this.finish(text);
  }

  private finish(steal: string | null): void {
    this.clearTimers();
    const intrusId = this.intrusId!;
    const pair = this.pair!;
    const caught = this.accusedId === intrusId;
    const stolen = caught && steal !== null && checkGuess(steal, pair.civil) !== 'wrong';
    const gains: Record<string, number> = {};
    for (const id of this.order) gains[id] = 0;
    if (caught) {
      for (const [voter, target] of this.votes) if (target === intrusId) gains[voter] = INTRUS_POINTS.spotted;
      if (stolen) gains[intrusId] = INTRUS_POINTS.stolen;
    } else gains[intrusId] = INTRUS_POINTS.escaped;
    for (const [id, n] of Object.entries(gains)) if (n) this.host.addScore(id, n);

    this.result = {
      intrusId,
      accusedId: this.accusedId,
      caught,
      civil: pair.civil,
      intrus: pair.intrus,
      steal,
      stolen,
      votes: Object.fromEntries(this.votes),
      gains,
    };
    this.history.push(this.result);
    this.phase = 'reveal';
    this.setPhase('reveal', REVEAL_TIME);
    this.after(REVEAL_TIME, () => this.nextManche());
    this.host.broadcastState();
  }

  // ---- Outils -------------------------------------------------------------------

  private wordOf(id: string): string | null {
    if (!this.pair || !this.order.includes(id)) return null;
    return id === this.intrusId ? this.pair.intrus : this.pair.civil;
  }

  private present(): string[] {
    const ids = new Set(this.host.playerIds());
    return this.order.filter((id) => ids.has(id));
  }

  private shuffle(ids: string[]): string[] {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.host.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  private setPhase(phase: Phase, seconds: number): void {
    this.host.setPhase(phase, Date.now() + seconds * 1000, this.manche);
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, seconds * 1000));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
