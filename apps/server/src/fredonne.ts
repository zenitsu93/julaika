import {
  FRED_CHOICES,
  FRED_HINTS,
  FRED_PICK,
  FRED_REVEAL,
  FRED_SONGS,
  FRED_STYLES,
  checkSong,
  fredGain,
  fredSingerGain,
  initials,
  maskTitle,
  songKey,
  type ClientMsg,
  type Difficulty,
  type FredResult,
  type FredSong,
  type FredState,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface FredHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** Tours par joueur : chacun chante `rounds` fois. */
  rounds(): number;
  /** Temps pour fredonner (s). */
  humTime(): number;
  difficulty(): Difficulty;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  /** Coche « a trouvé » sur la pastille du joueur (et décoche tout le monde avec null). */
  setGuessed(id: string | null): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  sendTo(id: string, msg: ServerMsg): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  endGame(): void;
}

type FredMsg = Extract<ClientMsg, { t: 'fred' }>;

/** Chance qu'un tour impose une consigne de style. */
export const FRED_STYLE_CHANCE = 0.5;

/**
 * Une partie de Fredonne !. Les chanteurs passent dans l'ordre d'arrivée, `rounds` fois chacun.
 * Les réponses tapées arrivent par le salon, qui nous les confie avant tout le reste.
 */
export class Fredonne {
  phase: 'pick' | 'hum' | 'reveal' | 'done' = 'pick';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  singerId = '';
  choices: FredSong[] = [];
  song: FredSong | null = null;
  style: string | null = null;
  rerolled = false;
  found: string[] = [];
  result: FredResult | null = null;

  private hints = 0;
  private humStart = 0;
  private humEnd = 0;
  private gains: Record<string, number> = {};
  private used = new Set<string>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: FredHost) {
    this.order = host.playerIds();
    this.turns = Math.max(1, this.order.length * host.rounds());
  }

  start(): void {
    this.host.system(`Fredonne ! : ${this.turns} chansons à deviner, à vos micros.`);
    this.nextTurn(0);
  }

  handle(id: string, msg: FredMsg): void {
    if (id !== this.singerId || this.phase !== 'pick') return;
    if ('pick' in msg) {
      const i = Math.floor(Number(msg.pick));
      if (i >= 0 && i < this.choices.length) this.startHum(i);
    } else if ('reroll' in msg && !this.rerolled) {
      this.rerolled = true;
      this.choices = this.draw(FRED_CHOICES);
      this.host.broadcastState();
    }
  }

  /**
   * Réponse tapée pendant un tour. Renvoie vrai si le jeu l'a prise en charge : bonne réponse
   * (jamais diffusée) ; ceux qui savent déjà n'ont plus rien à taper.
   */
  chat(id: string, text: string): boolean {
    if (this.phase !== 'hum' || !this.song) return false;
    const name = this.name(id);
    if (id === this.singerId || this.found.includes(id)) return true;
    const verdict = checkSong(text, this.song);
    if (verdict === 'correct') {
      this.correct(id);
      return true;
    }
    if (verdict === 'close') {
      this.host.broadcast({ t: 'chat', line: { from: id, name, text, kind: 'msg' } });
      this.host.sendTo(id, { t: 'chat', line: { from: null, name: null, text: `« ${text} » : tu chauffes !`, kind: 'close' } });
      return true;
    }
    return false;
  }

  /** Le chanteur part : tour suivant. Un devineur part : peut-être que tous les autres ont trouvé. */
  onLeave(id: string): void {
    if (this.phase !== 'pick' && this.phase !== 'hum') return;
    if (id === this.singerId) {
      this.host.system('Le chanteur est parti : chanson suivante.');
      if (this.phase === 'hum') this.finish();
      else this.nextTurn(this.turn + 1);
      return;
    }
    this.found = this.found.filter((f) => f !== id);
    if (this.phase === 'hum') this.checkAllFound();
  }

  stateFor(id: string): FredState {
    const knows = id === this.singerId || this.found.includes(id) || this.phase === 'reveal' || this.phase === 'done';
    const song = this.song && knows ? this.song : null;
    return {
      singerId: this.singerId,
      turn: this.turn,
      turns: this.turns,
      choices: id === this.singerId && this.phase === 'pick' ? this.choices : null,
      rerolled: this.rerolled,
      song,
      mask: this.song && this.phase === 'hum' ? maskTitle(this.song.title, this.hints >= 2 ? initials(this.song.title) : undefined) : null,
      artist: this.song && (this.hints >= 1 || song) ? this.song.artist : null,
      style: this.style,
      found: this.found,
      result: this.result,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  /** Premier tour jouable à partir de k : les tours d'un chanteur parti sont sautés. */
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
    this.singerId = this.order[k % n]!;
    this.song = null;
    this.result = null;
    this.found = [];
    this.gains = {};
    this.hints = 0;
    this.rerolled = false;
    this.host.setGuessed(null);
    this.choices = this.draw(FRED_CHOICES);
    this.style = this.host.random() < FRED_STYLE_CHANCE ? FRED_STYLES[Math.floor(this.host.random() * FRED_STYLES.length)]! : null;
    this.phase = 'pick';
    this.setPhase('pick', FRED_PICK);
    this.after(FRED_PICK, () => this.startHum(Math.floor(this.host.random() * this.choices.length)));
    this.host.broadcastState();
  }

  private startHum(index: number): void {
    if (this.phase !== 'pick') return;
    const song = this.choices[index] ?? this.choices[0];
    if (!song) return;
    this.clearTimers();
    this.song = song;
    this.used.add(songKey(song.title));
    this.phase = 'hum';
    const ms = this.host.humTime() * 1000;
    this.humStart = Date.now();
    this.humEnd = this.humStart + ms;
    this.host.setPhase('hum', this.humEnd, this.turn + 1);
    FRED_HINTS.forEach((at, i) =>
      this.afterMs(ms * at, () => {
        this.hints = i + 1;
        this.host.broadcastState();
      }),
    );
    this.afterMs(ms, () => this.finish());
    this.host.system(`${this.name(this.singerId)} fredonne !`);
    this.host.broadcastState();
  }

  private correct(id: string): void {
    const gain = fredGain((this.humEnd - Date.now()) / (this.humEnd - this.humStart), this.found.length);
    this.found.push(id);
    this.gains[id] = gain;
    this.host.addScore(id, gain);
    this.host.setGuessed(id);
    const name = this.name(id);
    this.host.broadcast({ t: 'chat', line: { from: id, name, text: `${name} a trouvé la chanson !`, kind: 'correct' } });
    if (!this.checkAllFound()) this.host.broadcastState();
  }

  private checkAllFound(): boolean {
    const guessers = this.host.playerIds().filter((p) => p !== this.singerId);
    if (guessers.length && guessers.every((p) => this.found.includes(p))) {
      this.finish();
      return true;
    }
    return false;
  }

  private finish(): void {
    if (this.phase !== 'hum' || !this.song) return;
    this.clearTimers();
    const guessers = this.host.playerIds().filter((p) => p !== this.singerId).length;
    const singer = fredSingerGain(this.found.length, guessers);
    if (this.host.player(this.singerId)) {
      this.gains[this.singerId] = singer;
      this.host.addScore(this.singerId, singer);
    }
    this.result = { song: this.song, gains: this.gains };
    this.host.system(`C'était « ${this.song.title} » (${this.song.artist}).`);
    this.phase = 'reveal';
    this.setPhase('reveal', FRED_REVEAL);
    this.after(FRED_REVEAL, () => this.nextTurn(this.turn + 1));
    this.host.broadcastState();
  }

  /** n chansons pas encore chantées dans la partie (on recycle quand la liste est épuisée). */
  private draw(n: number): FredSong[] {
    const all = FRED_SONGS[this.host.difficulty()];
    const offered = new Set(this.choices.map((s) => s.title));
    let pool = all.filter((s) => !this.used.has(songKey(s.title)) && !offered.has(s.title));
    if (pool.length < n) pool = all.filter((s) => !offered.has(s.title));
    const bag = [...pool];
    const count = Math.min(n, bag.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.host.random() * (bag.length - i));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag.slice(0, count);
  }

  private name(id: string): string {
    return this.host.player(id)?.name ?? '?';
  }

  private setPhase(phase: Phase, seconds: number): void {
    this.host.setPhase(phase, Date.now() + seconds * 1000, this.turn + 1);
  }

  private after(seconds: number, fn: () => void): void {
    this.afterMs(seconds * 1000, fn);
  }

  private afterMs(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
