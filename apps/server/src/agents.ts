import {
  AGENTS_DUO_PATTERN,
  AGENTS_DUO_TOKENS,
  AGENTS_POINTS,
  AGENTS_REVEAL_TIME,
  AGENTS_SIZE,
  AGENTS_TEAM_NAME,
  AGENTS_WORDS,
  AGENTS_COUNT_MAX,
  agentsClueError,
  agentsMode,
  cleanClue,
  otherTeam,
  type AgentsCard,
  type AgentsClue,
  type AgentsColor,
  type AgentsMode,
  type AgentsResult,
  type AgentsState,
  type AgentsTeam,
  type ClientMsg,
  type Phase,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface AgentsHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** Nombre de grilles de la partie. */
  rounds(): number;
  /** Temps pour donner l'indice, puis pour retourner les cartes (s). */
  turnTime(): number;
  random(): number;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  endGame(): void;
}

type AgentsMsg = Extract<ClientMsg, { t: 'agents' }>;
const TEAMS: AgentsTeam[] = ['or', 'cacao'];

/**
 * Une partie d'Agents secrets. En équipes, chaque équipe a un espion qui voit la clé ;
 * il donne un indice (un mot, un nombre), son équipe retourne les cartes une à une, jusqu'à
 * se tromper ou épuiser ses essais. En duo, chaque côté voit sa propre clé et fait deviner
 * l'autre, à tour de rôle, avec un nombre de tours limité.
 */
export class Agents {
  readonly mode: AgentsMode;
  phase: 'clue' | 'guess' | 'reveal' = 'clue';
  grid = 0;
  readonly grids: number;
  readonly teams: Record<AgentsTeam, string[]> = { or: [], cacao: [] };
  spies: Record<AgentsTeam, string | null> = { or: null, cacao: null };
  cards: AgentsCard[] = [];
  keys: Record<AgentsTeam, AgentsColor[]> = { or: [], cacao: [] };
  turn: AgentsTeam = 'or';
  clue: AgentsClue | null = null;
  guessesLeft: number | null = null;
  tokens: number | null = null;
  result: AgentsResult | null = null;
  history: AgentsClue[] = [];
  readonly record: (AgentsTeam | 'duo' | null)[] = [];
  readonly pointers = new Map<string, number>();

  /** Cartes ratées sur l'indice en cours. */
  private missed = 0;
  private deck: string[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: AgentsHost) {
    const ids = host.playerIds();
    this.mode = agentsMode(ids.length);
    ids.forEach((id, i) => this.teams[TEAMS[i % 2]!].push(id));
    this.grids = Math.max(1, host.rounds());
  }

  start(): void {
    this.host.system(
      this.mode === 'duo'
        ? `Agents secrets en duo : ${AGENTS_DUO_TOKENS} tours pour démasquer les 15 agents, ensemble.`
        : `Agents secrets : équipe Or contre équipe Cacao, ${this.grids} grille${this.grids > 1 ? 's' : ''}.`,
    );
    this.nextGrid();
  }

  handle(id: string, msg: AgentsMsg): void {
    if (this.phase === 'reveal') return;
    if ('clue' in msg) return this.giveClue(id, msg.clue, msg.count);
    if (this.phase !== 'guess' || !this.canGuess(id)) return;
    if ('point' in msg) {
      const i = Number(msg.point);
      if (i === -1 || this.pointers.get(id) === i) this.pointers.delete(id);
      else if (this.guessable(i)) this.pointers.set(id, i);
      else return;
      this.host.broadcastState();
    } else if ('guess' in msg) this.guess(id, Number(msg.guess));
    else if ('pass' in msg) {
      // Il faut retourner au moins une carte avant de passer.
      if (this.clue && this.clue.found + this.missed > 0) this.endTurn();
    }
  }

  /** Un joueur arrive en cours de partie : il rejoint l'équipe la moins nombreuse. */
  onJoin(id: string): void {
    const team = this.teams.or.length <= this.teams.cacao.length ? 'or' : 'cacao';
    this.teams[team].push(id);
    this.host.system(`${this.host.player(id)?.name ?? '?'} rejoint l'équipe ${AGENTS_TEAM_NAME[team]}.`);
  }

  /** Un joueur part : on le retire, on remplace l'espion, et on rééquilibre si un côté se vide. */
  onLeave(id: string): void {
    this.pointers.delete(id);
    for (const t of TEAMS) this.teams[t] = this.teams[t].filter((p) => p !== id);
    for (const t of TEAMS) {
      if (this.teams[t].length) continue;
      const from = this.teams[otherTeam(t)];
      if (from.length < 2) continue;
      const moved = from.find((p) => p !== this.spies[otherTeam(t)]) ?? from[0]!;
      this.teams[otherTeam(t)] = from.filter((p) => p !== moved);
      this.teams[t] = [moved];
      this.host.system(`${this.host.player(moved)?.name ?? '?'} passe dans l'équipe ${AGENTS_TEAM_NAME[t]}.`);
    }
    if (this.phase === 'reveal') return;
    if (this.mode === 'equipes') {
      // Une équipe sans devineur ne peut plus jouer : la grille s'arrête.
      const short = TEAMS.find((t) => this.teams[t].length < 2);
      if (short) return this.finish({ winner: otherTeam(short), reason: 'equipe', by: null });
      for (const t of TEAMS) if (this.spies[t] === id) this.spies[t] = this.teams[t][0]!;
    }
    if (this.phase === 'guess' && !this.guessers().length) this.endTurn();
  }

  stateFor(id: string): AgentsState {
    const myTeam = TEAMS.find((t) => this.teams[t].includes(id)) ?? null;
    const sees = myTeam && (this.mode === 'duo' || this.spies[myTeam] === id);
    return {
      mode: this.mode,
      grid: this.grid,
      grids: this.grids,
      cards: this.cards,
      key: sees ? this.keys[myTeam] : null,
      keys: this.phase === 'reveal' ? this.keys : null,
      teams: this.teams,
      spies: this.spies,
      myTeam,
      turn: this.turn,
      clue: this.clue,
      guessesLeft: this.guessesLeft,
      pointers: Object.fromEntries(this.pointers),
      left: { or: this.left('or'), cacao: this.left('cacao') },
      tokens: this.tokens,
      result: this.result,
      history: this.history,
      record: this.record,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextGrid(): void {
    this.clearTimers();
    if (this.grid >= this.grids) return this.host.endGame();
    this.grid++;
    this.result = null;
    this.history = [];
    this.clue = null;
    this.pointers.clear();
    const words = this.draw(AGENTS_SIZE);
    const order = this.shuffle(Array.from({ length: AGENTS_SIZE }, (_, i) => i));
    this.cards = words.map((word) => ({ word, revealed: null, by: null, neutral: [] }));
    // Celui qui commence change à chaque grille.
    this.turn = this.grid % 2 === 1 ? 'or' : 'cacao';
    if (this.mode === 'duo') {
      this.keys = { or: [], cacao: [] };
      order.forEach((cell, i) => {
        const [a, b] = AGENTS_DUO_PATTERN[i]!;
        this.keys.or[cell] = a;
        this.keys.cacao[cell] = b;
      });
      this.spies = { or: null, cacao: null };
      this.tokens = AGENTS_DUO_TOKENS;
    } else {
      const first = this.turn;
      const colors: AgentsColor[] = [
        ...Array<AgentsColor>(9).fill(first),
        ...Array<AgentsColor>(8).fill(otherTeam(first)),
        ...Array<AgentsColor>(7).fill('neutre'),
        'assassin',
      ];
      const key: AgentsColor[] = [];
      order.forEach((cell, i) => (key[cell] = colors[i]!));
      this.keys = { or: key, cacao: key };
      // L'espion tourne d'une grille à l'autre.
      for (const t of TEAMS) this.spies[t] = this.teams[t][(this.grid - 1) % this.teams[t].length] ?? null;
      this.tokens = null;
    }
    this.startClue();
  }

  private startClue(): void {
    this.clearTimers();
    this.phase = 'clue';
    this.clue = null;
    this.guessesLeft = null;
    this.missed = 0;
    this.pointers.clear();
    const time = this.host.turnTime();
    this.host.setPhase('clue', Date.now() + time * 1000, this.grid);
    // Pas d'indice à temps : le tour est perdu.
    this.timers.push(setTimeout(() => this.endTurn(), (time + 1) * 1000));
    this.host.broadcastState();
  }

  private giveClue(id: string, raw: string, rawCount: number): void {
    if (this.phase !== 'clue' || !this.canClue(id)) return;
    const word = cleanClue(raw);
    const count = Math.floor(Number(rawCount));
    if (agentsClueError(word, this.cards) || !(count >= 1 && count <= AGENTS_COUNT_MAX)) return;
    this.clearTimers();
    this.clue = { team: this.turn, by: id, word, count, found: 0 };
    this.history.push(this.clue);
    this.guessesLeft = this.mode === 'equipes' ? count + 1 : null;
    if (this.tokens !== null) this.tokens--;
    this.phase = 'guess';
    const time = this.host.turnTime();
    this.host.setPhase('guess', Date.now() + time * 1000, this.grid);
    this.timers.push(setTimeout(() => this.endTurn(), (time + 1) * 1000));
    this.host.broadcastState();
  }

  private guess(id: string, i: number): void {
    if (!this.guessable(i)) return;
    const color = this.keys[this.turn][i]!;
    const card = this.cards[i]!;
    this.pointers.clear();

    if (this.mode === 'duo') {
      if (color === 'neutre') {
        card.neutral.push(this.turn);
        card.by = id;
        this.missed++;
        return this.endTurn();
      }
      card.revealed = color;
      card.by = id;
      if (color === 'assassin') return this.finish({ winner: null, reason: 'assassin', by: id });
      this.clue!.found++;
      for (const p of this.host.playerIds()) this.host.addScore(p, AGENTS_POINTS.agent);
      if (!this.left('or') && !this.left('cacao')) return this.finish({ winner: 'duo', reason: 'agents', by: null });
      // La clé de ce côté est vidée : inutile de continuer sur son indice.
      if (!this.left(this.turn)) return this.endTurn();
      return this.host.broadcastState();
    }

    card.revealed = color;
    card.by = id;
    if (color === 'assassin') return this.finish({ winner: otherTeam(this.turn), reason: 'assassin', by: id });
    if (color === 'or' || color === 'cacao') {
      for (const p of this.teams[color]) this.host.addScore(p, AGENTS_POINTS.agent);
      if (!this.left(color)) return this.finish({ winner: color, reason: 'agents', by: null });
    }
    if (color !== this.turn) {
      this.missed++;
      return this.endTurn();
    }
    this.clue!.found++;
    this.guessesLeft = (this.guessesLeft ?? 1) - 1;
    if (this.guessesLeft <= 0) return this.endTurn();
    this.host.broadcastState();
  }

  private endTurn(): void {
    if (this.phase === 'reveal') return;
    if (this.mode === 'duo') {
      // Indice manqué : le tour compte quand même.
      if (this.phase === 'clue' && this.tokens !== null) this.tokens--;
      if (!this.tokens) return this.finish({ winner: null, reason: 'tours', by: null });
      // On passe la main, sauf si l'autre côté n'a plus d'agents à faire trouver.
      const next = otherTeam(this.turn);
      this.turn = this.left(next) ? next : this.turn;
    } else this.turn = otherTeam(this.turn);
    this.startClue();
  }

  private finish(result: AgentsResult): void {
    this.clearTimers();
    this.phase = 'reveal';
    this.result = result;
    this.pointers.clear();
    this.record.push(result.winner);
    if (result.winner === 'duo') for (const p of this.host.playerIds()) this.host.addScore(p, AGENTS_POINTS.win);
    else if (result.winner) for (const p of this.teams[result.winner]) this.host.addScore(p, AGENTS_POINTS.win);
    const by = result.by ? this.host.player(result.by)?.name : null;
    this.host.system(
      result.winner === 'duo'
        ? 'Mission accomplie : les 15 agents sont démasqués !'
        : result.reason === 'assassin'
          ? `${by ?? 'Quelqu’un'} a réveillé l’assassin…`
          : result.reason === 'tours'
            ? 'Plus de tours : la mission échoue.'
            : result.winner
              ? `L'équipe ${AGENTS_TEAM_NAME[result.winner]} remporte la grille !`
              : 'Grille terminée.',
    );
    this.host.setPhase('reveal', Date.now() + AGENTS_REVEAL_TIME * 1000, this.grid);
    this.timers.push(setTimeout(() => this.nextGrid(), AGENTS_REVEAL_TIME * 1000));
    this.host.broadcastState();
  }

  // ---- Règles ---------------------------------------------------------------------

  /** Agents encore cachés : ceux d'une équipe, ou ceux d'une clé en duo. */
  private left(team: AgentsTeam): number {
    const target: AgentsColor = this.mode === 'duo' ? 'or' : team;
    return this.keys[team].reduce((n, c, i) => n + Number(c === target && !this.cards[i]?.revealed), 0);
  }

  /** Qui donne l'indice : l'espion de l'équipe (équipes), ou n'importe qui du côté qui a la main (duo). */
  private canClue(id: string): boolean {
    return this.mode === 'duo' ? this.teams[this.turn].includes(id) : this.spies[this.turn] === id;
  }

  private guessers(): string[] {
    return this.mode === 'duo' ? this.teams[otherTeam(this.turn)] : this.teams[this.turn].filter((p) => p !== this.spies[this.turn]);
  }

  private canGuess(id: string): boolean {
    return this.guessers().includes(id);
  }

  private guessable(i: number): boolean {
    const card = this.cards[i];
    if (!Number.isInteger(i) || !card || card.revealed) return false;
    // En duo, un « passant » de cette clé est déjà connu.
    return !(this.mode === 'duo' && card.neutral.includes(this.turn));
  }

  /** Mots suivants du paquet, mélangé une fois : pas de doublon d'une grille à l'autre. */
  private draw(n: number): string[] {
    if (this.deck.length < n) this.deck = this.shuffle([...AGENTS_WORDS]);
    return this.deck.splice(0, n);
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.host.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
