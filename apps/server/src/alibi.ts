import {
  ALIBI_ACCUSATIONS,
  ALIBI_EXHIBIT,
  ALIBI_EXHIBITS,
  ALIBI_EXHIBITS_LIST,
  ALIBI_NOTE_MAX,
  ALIBI_NOTES_MAX,
  ALIBI_PENALTY,
  ALIBI_PLOT,
  ALIBI_POINTS,
  ALIBI_STATEMENT_MAX,
  ALIBI_VERDICT,
  ALIBI_VOTE,
  alibiVerdict,
  isAlibiObjection,
  type AlibiExhibit,
  type AlibiNote,
  type AlibiResult,
  type AlibiState,
  type ClientMsg,
  type Phase,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface AlibiHost {
  playerIds(): string[];
  name(id: string): string;
  /** Tours : chacun est juge `rounds` fois. */
  rounds(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  endGame(): void;
}

type AlibiMsg = Extract<ClientMsg, { t: 'alibi' }>;

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);

/**
 * Une partie de L'Alibi. Les affaires s'enchaînent dans un ordre figé au départ : le juge de
 * l'affaire k est order[k], les complices ses deux voisins. Les autres forment le jury.
 */
export class Alibi {
  phase: 'plot' | 'trial' | 'vote' | 'verdict' | 'done' = 'plot';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  judgeId = '';
  suspects: [string, string] = ['', ''];
  jury: string[] = [];
  accusation = '';
  notes: AlibiNote[] = [];
  exhibits: AlibiExhibit[] = [];
  credibility = 100;
  votes = new Map<string, boolean>();
  result: AlibiResult | null = null;

  /** Pièces et complices désignés de l'affaire, révélés un à un. */
  private docket: AlibiExhibit[] = [];
  private usedAccusations = new Set<number>();
  private usedItems = new Set<number>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: AlibiHost) {
    this.order = host.playerIds();
    this.turns = Math.max(1, this.order.length * host.rounds());
  }

  start(): void {
    this.host.system(`L'Alibi : ${this.turns} affaires, la cour est ouverte.`);
    this.nextCase(0);
  }

  handle(id: string, msg: AlibiMsg): void {
    const suspect = this.suspects.includes(id);
    if ('note' in msg) {
      if (!suspect || (this.phase !== 'plot' && this.phase !== 'trial') || this.notes.length >= ALIBI_NOTES_MAX) return;
      const text = clean(msg.note, ALIBI_NOTE_MAX);
      if (!text) return;
      this.notes.push({ by: id, text });
      this.host.broadcastState();
    } else if ('statement' in msg) {
      const cur = this.current();
      if (this.phase !== 'trial' || !cur || cur.suspectId !== id) return;
      const text = clean(msg.statement, ALIBI_STATEMENT_MAX);
      cur.statement = text || null;
      this.host.broadcastState();
    } else if ('object' in msg) {
      const cur = this.current();
      if (this.phase !== 'trial' || id !== this.judgeId || !cur || cur.objection || !isAlibiObjection(msg.object)) return;
      cur.objection = msg.object;
      this.credibility = Math.max(0, this.credibility - ALIBI_PENALTY[msg.object]);
      this.host.broadcastState();
    } else if ('vote' in msg) {
      if (this.phase !== 'vote' || !this.jury.includes(id) || this.votes.has(id) || typeof msg.vote !== 'boolean') return;
      this.votes.set(id, msg.vote);
      if (this.jury.every((j) => this.votes.has(j) || !this.present(j))) this.finish();
      else this.host.broadcastState();
    }
  }

  /** Le juge ou un complice part : l'affaire est classée sans suite. Un juré : on ne l'attend plus. */
  onLeave(id: string): void {
    if (this.phase === 'done' || this.phase === 'verdict') return;
    if (id === this.judgeId || this.suspects.includes(id)) {
      this.host.system("Un protagoniste a filé : affaire classée, au suivant.");
      this.nextCase(this.turn + 1);
    } else if (this.phase === 'vote' && this.jury.every((j) => this.votes.has(j) || !this.present(j))) {
      this.finish();
    }
  }

  stateFor(id: string): AlibiState {
    const insider = this.suspects.includes(id) || this.phase === 'verdict';
    return {
      case: this.turn,
      cases: this.turns,
      judgeId: this.judgeId,
      suspects: this.suspects,
      jury: this.jury,
      accusation: this.accusation,
      notes: insider ? this.notes : null,
      exhibits: this.exhibits,
      total: this.docket.length,
      credibility: this.credibility,
      voted: [...this.votes.keys()],
      myVote: this.votes.get(id) ?? null,
      result: this.result,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private current(): AlibiExhibit | undefined {
    return this.exhibits.at(-1);
  }

  private present(id: string): boolean {
    return this.host.playerIds().includes(id);
  }

  /** Première affaire jouable à partir de k : il faut le juge et ses deux voisins. */
  private nextCase(k: number): void {
    this.clearTimers();
    const n = this.order.length;
    const at = (k: number, d: number) => this.order[(k + d) % n]!;
    while (k < this.turns && ![0, 1, 2].every((d) => this.present(at(k, d)))) k++;
    if (k >= this.turns) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.turn = k;
    this.judgeId = at(k, 0);
    this.suspects = [at(k, 1), at(k, 2)];
    this.jury = this.host.playerIds().filter((id) => id !== this.judgeId && !this.suspects.includes(id));
    this.accusation = ALIBI_ACCUSATIONS[this.draw(ALIBI_ACCUSATIONS.length, this.usedAccusations)]!;
    this.notes = [];
    this.exhibits = [];
    this.credibility = 100;
    this.votes.clear();
    this.result = null;
    // Chaque complice explique autant de pièces que l'autre, dans un ordre tiré au sort.
    const who = Array.from({ length: ALIBI_EXHIBITS }, (_, i) => this.suspects[i % 2]!);
    for (let i = who.length - 1; i > 0; i--) {
      const j = Math.floor(this.host.random() * (i + 1));
      [who[i], who[j]] = [who[j]!, who[i]!];
    }
    this.docket = who.map((suspectId) => ({
      item: ALIBI_EXHIBITS_LIST[this.draw(ALIBI_EXHIBITS_LIST.length, this.usedItems)]!,
      suspectId,
      statement: null,
      objection: null,
    }));
    this.phase = 'plot';
    this.setPhase('plot', ALIBI_PLOT);
    this.after(ALIBI_PLOT, () => this.nextExhibit());
    this.host.broadcastState();
  }

  private nextExhibit(): void {
    this.clearTimers();
    if (this.exhibits.length >= this.docket.length) return this.toVote();
    this.exhibits.push(this.docket[this.exhibits.length]!);
    this.phase = 'trial';
    this.setPhase('trial', ALIBI_EXHIBIT);
    this.after(ALIBI_EXHIBIT, () => this.nextExhibit());
    this.host.broadcastState();
  }

  private toVote(): void {
    if (!this.jury.some((j) => this.present(j))) return this.finish();
    this.phase = 'vote';
    this.setPhase('vote', ALIBI_VOTE);
    this.after(ALIBI_VOTE, () => this.finish());
    this.host.broadcastState();
  }

  private finish(): void {
    if (this.phase !== 'trial' && this.phase !== 'vote') return;
    this.clearTimers();
    let votes: AlibiResult['votes'] = null;
    if (this.jury.length) {
      const all = [...this.votes.values()];
      votes = { acquit: all.filter(Boolean).length, guilty: all.filter((v) => !v).length };
    }
    const acquitted = alibiVerdict(this.credibility, votes);
    const gains: Record<string, number> = {};
    for (const s of this.suspects) gains[s] = this.credibility + (acquitted ? ALIBI_POINTS.acquitted : 0);
    gains[this.judgeId] = acquitted ? 0 : ALIBI_POINTS.convicted;
    for (const [j, v] of this.votes) gains[j] = v === acquitted ? ALIBI_POINTS.juror : 0;
    for (const [id, pts] of Object.entries(gains)) this.host.addScore(id, pts);
    this.result = { acquitted, credibility: this.credibility, votes, gains };
    const pair = `${this.host.name(this.suspects[0])} et ${this.host.name(this.suspects[1])}`;
    this.host.system(acquitted ? `${pair} sont acquittés (crédibilité ${this.credibility} %).` : `${pair} sont reconnus coupables !`);
    this.phase = 'verdict';
    this.setPhase('verdict', ALIBI_VERDICT);
    this.after(ALIBI_VERDICT, () => this.nextCase(this.turn + 1));
    this.host.broadcastState();
  }

  /** Tire un indice pas encore sorti dans la partie (on recommence quand tout est sorti). */
  private draw(n: number, used: Set<number>): number {
    if (used.size >= n) used.clear();
    let i = Math.floor(this.host.random() * (n - used.size));
    for (let k = 0; k < n; k++) {
      if (used.has(k)) continue;
      if (i-- === 0) {
        used.add(k);
        return k;
      }
    }
    return 0;
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
