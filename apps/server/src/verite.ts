import {
  AOV_HEAT_BONUS,
  AOV_JOKERS,
  AOV_PICK_TIME,
  AOV_POINTS,
  AOV_SPIN_MS,
  AOV_SPIN_WAIT,
  AOV_VERDICT_TIME,
  aovHeat,
  type AovCard,
  type AovHeat,
  type AovKind,
  type AovLevel,
  type AovRound,
  type AovState,
  type ClientMsg,
  type Phase,
} from '@julaika/shared';
import { AOV_CARDS } from './aovCards';

/** Ce dont le jeu a besoin du salon. */
export interface AovHost {
  playerIds(): string[];
  player(id: string): { name: string; avatar: number } | undefined;
  hostId(): string | null;
  /** Tours par joueur. */
  rounds(): number;
  level(): AovLevel;
  /** Temps pour relever le défi (s). */
  dareTime(): number;
  random(): number;
  /** Une carte inventée par l'IA pour ce niveau, s'il en reste en stock. */
  aiCard(heat: AovHeat, kind: AovKind): string | null;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  system(text: string): void;
  endGame(): void;
}

type AovMsg = Extract<ClientMsg, { t: 'aov' }>;

/**
 * Une partie d'Action ou vérité. La bouteille désigne à chaque tour celui qui a le moins
 * joué ; il choisit, relève la carte en visio, et les autres le valident ou le traitent de
 * dégonflé. Celui qui vient de jouer fait tourner la bouteille pour le suivant.
 */
export class ActionVerite {
  phase: 'spin' | 'pick' | 'dare' | 'verdict' = 'spin';
  turn = 0;
  readonly turns: number;
  spinnerId: string | null = null;
  playerId: string | null = null;
  spinAt: number | null = null;
  heat: AovHeat = 'lite';
  choice: AovKind | null = null;
  card: AovCard | null = null;
  verdict: 'done' | 'chicken' | null = null;
  readonly jokers = new Map<string, number>();
  readonly votes = new Map<string, boolean>();
  readonly history: AovRound[] = [];

  private readonly played = new Map<string, number>();
  private passes = 0;
  private decks = new Map<string, string[]>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: AovHost) {
    this.turns = Math.max(1, host.rounds() * host.playerIds().length);
  }

  start(): void {
    this.host.system(`Action ou vérité : ${this.turns} tours, ${AOV_JOKERS} jokers « je passe » chacun.`);
    this.spinnerId = this.host.hostId();
    this.nextTurn();
  }

  handle(id: string, msg: AovMsg): void {
    if (!this.host.player(id)) return;
    if ('spin' in msg) {
      const spinnerHere = this.spinnerId && this.host.player(this.spinnerId);
      if (this.phase === 'spin' && (id === this.spinnerId || !spinnerHere)) this.spin();
    } else if ('choose' in msg) {
      if (this.phase === 'pick' && id === this.playerId && (msg.choose === 'action' || msg.choose === 'verite')) this.choose(msg.choose);
    } else if ('pass' in msg) {
      if (this.phase === 'dare' && id === this.playerId && this.jokersOf(id) > 0) this.pass(id);
    } else if ('vote' in msg) {
      if (this.phase !== 'dare' || id === this.playerId) return;
      this.votes.set(id, Boolean(msg.vote));
      this.host.broadcastState();
      this.checkVotes();
    }
  }

  /** Le joueur désigné part : on fait tourner la bouteille à nouveau. Un juge part : on ne l'attend plus. */
  onLeave(id: string): void {
    this.votes.delete(id);
    if (id === this.playerId && this.phase !== 'verdict' && (this.phase !== 'spin' || this.spinAt)) {
      this.host.system('Le joueur désigné est parti : on refait tourner la bouteille.');
      this.playerId = null;
      this.turn--;
      return this.nextTurn();
    }
    if (this.phase === 'dare') this.checkVotes();
  }

  state(): AovState {
    const jokers: Record<string, number> = {};
    for (const id of this.host.playerIds()) jokers[id] = this.jokersOf(id);
    return {
      turn: this.turn,
      turns: this.turns,
      spinnerId: this.spinnerId,
      playerId: this.spinAt || this.phase !== 'spin' ? this.playerId : null,
      spinAt: this.spinAt,
      heat: this.heat,
      choice: this.choice,
      card: this.card,
      jokers,
      votes: Object.fromEntries(this.votes),
      verdict: this.verdict,
      history: this.history,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextTurn(): void {
    this.clearTimers();
    if (this.turn >= this.turns || this.host.playerIds().length < 2) return this.host.endGame();
    this.turn++;
    this.phase = 'spin';
    // Celui qui vient de jouer lance la bouteille ; s'il est parti, l'hôte prend la main.
    if (this.playerId && this.host.player(this.playerId)) this.spinnerId = this.playerId;
    else if (!this.spinnerId || !this.host.player(this.spinnerId)) this.spinnerId = this.host.hostId();
    this.playerId = null;
    this.spinAt = null;
    this.heat = aovHeat(this.host.level(), this.turn, this.turns);
    this.choice = null;
    this.card = null;
    this.verdict = null;
    this.passes = 0;
    this.votes.clear();
    this.host.setPhase('spin', Date.now() + AOV_SPIN_WAIT * 1000, this.turn);
    this.timers.push(setTimeout(() => this.spin(), AOV_SPIN_WAIT * 1000));
    this.host.broadcastState();
  }

  /** La bouteille s'arrête sur l'un de ceux qui ont le moins joué, si possible pas le lanceur. */
  private spin(): void {
    if (this.phase !== 'spin' || this.spinAt) return;
    this.clearTimers();
    const present = this.host.playerIds();
    const least = Math.min(...present.map((id) => this.played.get(id) ?? 0));
    let pool = present.filter((id) => (this.played.get(id) ?? 0) === least);
    if (pool.length > 1) pool = pool.filter((id) => id !== this.spinnerId);
    this.playerId = pool[Math.floor(this.host.random() * pool.length)] ?? present[0]!;
    this.played.set(this.playerId, (this.played.get(this.playerId) ?? 0) + 1);
    this.spinAt = Date.now();
    this.host.setPhase('spin', this.spinAt + AOV_SPIN_MS, this.turn);
    this.timers.push(setTimeout(() => this.startPick(), AOV_SPIN_MS));
    this.host.broadcastState();
  }

  private startPick(): void {
    this.clearTimers();
    this.phase = 'pick';
    this.host.setPhase('pick', Date.now() + AOV_PICK_TIME * 1000, this.turn);
    // Trop d'hésitation : la bouteille choisit à sa place.
    this.timers.push(
      setTimeout(() => {
        const kind: AovKind = this.host.random() < 0.5 ? 'action' : 'verite';
        this.host.system(`${this.host.player(this.playerId!)?.name ?? 'Le joueur'} hésite trop : ce sera ${kind === 'action' ? 'Action' : 'Vérité'} !`);
        this.choose(kind);
      }, AOV_PICK_TIME * 1000),
    );
    this.host.broadcastState();
  }

  private choose(kind: AovKind): void {
    this.choice = kind;
    this.card = this.draw(kind);
    this.phase = 'dare';
    this.startDareTimer();
    this.host.broadcastState();
  }

  private pass(id: string): void {
    this.jokers.set(id, this.jokersOf(id) - 1);
    this.passes++;
    this.votes.clear();
    this.card = this.draw(this.choice!);
    this.host.system(`${this.host.player(id)?.name ?? 'Le joueur'} joue un joker : nouvelle carte !`);
    this.startDareTimer();
    this.host.broadcastState();
  }

  private startDareTimer(): void {
    this.clearTimers();
    const time = this.host.dareTime();
    this.host.setPhase('dare', Date.now() + time * 1000, this.turn);
    this.timers.push(setTimeout(() => this.judge(), time * 1000));
  }

  private checkVotes(): void {
    const judges = this.host.playerIds().filter((id) => id !== this.playerId);
    if (judges.length && judges.every((id) => this.votes.has(id))) this.judge();
  }

  /** Majorité des avis donnés ; sans avis contraire, le bénéfice du doute va au joueur. */
  private judge(): void {
    if (this.phase !== 'dare') return;
    this.clearTimers();
    let yes = 0;
    let no = 0;
    for (const v of this.votes.values()) v ? yes++ : no++;
    this.verdict = no > yes ? 'chicken' : 'done';
    const id = this.playerId!;
    const who = this.host.player(id);
    if (this.verdict === 'done') this.host.addScore(id, AOV_POINTS[this.choice!] + AOV_HEAT_BONUS[this.heat]);
    this.history.push({
      playerId: id,
      name: who?.name ?? '?',
      avatar: who?.avatar ?? 0,
      kind: this.choice,
      heat: this.heat,
      text: this.card?.text ?? null,
      outcome: this.verdict,
      passes: this.passes,
    });
    this.phase = 'verdict';
    this.host.setPhase('verdict', Date.now() + AOV_VERDICT_TIME * 1000, this.turn);
    this.timers.push(setTimeout(() => this.nextTurn(), AOV_VERDICT_TIME * 1000));
    this.host.broadcastState();
  }

  // ---- Cartes -------------------------------------------------------------------

  /** Carte de l'IA s'il y en a (une fois sur deux, pour garder les cartes écrites à la main), sinon le paquet. */
  private draw(kind: AovKind): AovCard {
    const ai = this.host.random() < 0.5 ? this.host.aiCard(this.heat, kind) : null;
    const raw = ai ?? this.fromDeck(kind);
    return { kind, heat: this.heat, text: this.fill(raw), ai: Boolean(ai) };
  }

  /** Paquet mélangé une fois par niveau et par type : pas de doublon avant d'avoir tout vu. */
  private fromDeck(kind: AovKind): string {
    const key = `${this.heat}:${kind}`;
    let deck = this.decks.get(key);
    if (!deck?.length) {
      deck = [...AOV_CARDS[this.heat][kind]];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.host.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      // Ne jamais retomber sur la carte qu'on vient de passer.
      if (deck.length > 1 && this.card && deck.at(-1) === this.card.text) deck.unshift(deck.pop()!);
      this.decks.set(key, deck);
    }
    return deck.pop()!;
  }

  /** « {nom} » devient un autre joueur, tiré au hasard. */
  private fill(text: string): string {
    const others = this.host.playerIds().filter((id) => id !== this.playerId);
    const other = others[Math.floor(this.host.random() * others.length)];
    const name = (other && this.host.player(other)?.name) || 'ton voisin';
    return text.replaceAll('{nom}', name);
  }

  private jokersOf(id: string): number {
    return this.jokers.get(id) ?? AOV_JOKERS;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
