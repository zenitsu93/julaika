import {
  BOMB_BOOM_PAUSE,
  BOMB_COUNTDOWN,
  BOMB_FUSE,
  BOMB_LETTERS,
  BOMB_MAX_LIVES,
  BOMB_MIN_TURN,
  BOMB_WORD_MAX,
  foldWord,
  newBonusLetters,
  type BombEvent,
  type BombReject,
  type BombState,
  type ClientMsg,
  type Difficulty,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';
import { isFrenchWord, syllablesFor, wordsWith } from './dico';

/** Ce dont le jeu a besoin du salon. */
export interface BombHost {
  playerIds(): string[];
  name(id: string): string;
  lives(): number;
  difficulty(): Difficulty;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  endGame(): void;
}

type BombMsg = Extract<ClientMsg, { t: 'bomb' }>;

/** Points : un mot trouvé, et chaque joueur éliminé pendant qu'on tient encore. */
const WORD_POINTS = 10;
const SURVIVE_POINTS = 25;
/** Une syllabe qui a déjà fait sauter deux bombes est remplacée. */
const MAX_BOOMS_PER_SYLLABLE = 2;

/**
 * Une partie de Bombe à mots. La mèche est cachée et ne se rallume pas quand la bombe change de
 * main : on la passe vite, en espérant qu'elle saute chez le voisin.
 */
export class Bombe {
  readonly order: string[];
  readonly maxLives: number;
  private lives = new Map<string, number>();
  private letters = new Map<string, string>();
  private words = new Map<string, number>();
  private used = new Set<string>();
  private syllable = '';
  private holder: string | null = null;
  private turn = 0;
  private litAt: number | null = null;
  private startsAt = 0;
  private fuseEnd = 0;
  private boomsHere = 0;
  private last: BombState['last'] = null;
  private fuse: ReturnType<typeof setTimeout> | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: BombHost) {
    this.order = host.playerIds();
    this.maxLives = Math.max(1, Math.min(BOMB_MAX_LIVES, host.lives()));
    for (const id of this.order) {
      this.lives.set(id, this.maxLives);
      this.letters.set(id, '');
      this.words.set(id, 0);
    }
  }

  start(): void {
    this.syllable = this.pickSyllable();
    this.holder = this.order[Math.floor(this.host.random() * this.order.length)]!;
    this.startsAt = Date.now() + BOMB_COUNTDOWN;
    this.host.setPhase('bomb', null, 1);
    this.host.system(`Bombe à mots : ${this.maxLives} vie${this.maxLives > 1 ? 's' : ''} chacun. Ne gardez pas la bombe !`);
    this.host.broadcastState();
    this.later(BOMB_COUNTDOWN, () => this.light());
  }

  handle(id: string, msg: BombMsg): void {
    if (id !== this.holder || this.litAt === null) return;
    if ('typing' in msg) {
      const text = String(msg.typing ?? '').slice(0, BOMB_WORD_MAX);
      this.host.broadcast({ t: 'bombTyping', by: id, text }, id);
    } else if ('word' in msg) {
      this.submit(id, String(msg.word ?? ''));
    }
  }

  /** Un joueur part : il est hors jeu, et s'il tenait la bombe elle passe au suivant. */
  onLeave(id: string): void {
    if (!this.lives.get(id)) return;
    this.lives.set(id, 0);
    if (this.alive().length <= 1) return this.finish();
    if (this.holder === id) {
      this.holder = this.nextAlive(id);
      this.turn++;
      if (this.litAt !== null) this.keepMinimumTurn();
    }
  }

  state(): BombState {
    return {
      syllable: this.syllable,
      holder: this.holder,
      order: this.order,
      lives: Object.fromEntries(this.lives),
      maxLives: this.maxLives,
      letters: Object.fromEntries(this.letters),
      words: Object.fromEntries(this.words),
      turn: this.turn,
      litAt: this.litAt,
      startsAt: this.startsAt,
      last: this.last,
    };
  }

  dispose(): void {
    if (this.fuse) clearTimeout(this.fuse);
    this.fuse = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  // ---- Boucle -------------------------------------------------------------------

  private light(): void {
    const [min, max] = BOMB_FUSE;
    this.litAt = Date.now();
    this.armFuse(this.litAt + (min + this.host.random() * (max - min)) * 1000);
    this.host.broadcastState();
  }

  private submit(id: string, raw: string): void {
    const word = foldWord(raw.replace(/[\u0000-\u001f]/g, '')).replace(/\s+/g, ' ').slice(0, BOMB_WORD_MAX);
    if (!word) return;
    const reason: BombReject | null = !word.includes(this.syllable)
      ? 'syllabe'
      : this.used.has(word)
        ? 'deja'
        : !isFrenchWord(word)
          ? 'inconnu'
          : null;
    if (reason) return this.emit({ kind: 'bad', by: id, word, reason });

    this.used.add(word);
    this.words.set(id, (this.words.get(id) ?? 0) + 1);
    this.host.addScore(id, WORD_POINTS);
    const bonus = newBonusLetters(word, this.letters.get(id) ?? '');
    const letters = (this.letters.get(id) ?? '') + bonus;
    this.last = { by: id, word };
    this.emit({ kind: 'ok', by: id, word, syllable: this.syllable, bonus });

    // Toutes les lettres placées : une vie de plus (dans la limite du départ), et on recommence.
    if (letters.length >= BOMB_LETTERS.length) {
      this.letters.set(id, '');
      const lives = this.lives.get(id) ?? 0;
      if (lives < this.maxLives) {
        this.lives.set(id, lives + 1);
        this.emit({ kind: 'life', by: id, lives: lives + 1 });
      }
    } else this.letters.set(id, letters);

    this.syllable = this.pickSyllable();
    this.boomsHere = 0;
    this.holder = this.nextAlive(id);
    this.turn++;
    this.keepMinimumTurn();
    this.host.broadcastState();
  }

  private explode(): void {
    this.fuse = null;
    const id = this.holder;
    if (!id) return;
    const lives = Math.max(0, (this.lives.get(id) ?? 1) - 1);
    this.lives.set(id, lives);
    this.litAt = null;
    this.turn++;
    const examples = wordsWith(this.syllable).filter((w) => !this.used.has(w));
    const example = examples[Math.floor(this.host.random() * examples.length)] ?? null;
    this.emit({ kind: 'boom', by: id, lives, example });
    if (lives === 0) {
      this.host.system(`💥 ${this.host.name(id)} est éliminé !`);
      for (const other of this.alive()) this.host.addScore(other, SURVIVE_POINTS);
    }
    if (++this.boomsHere >= MAX_BOOMS_PER_SYLLABLE) {
      this.syllable = this.pickSyllable();
      this.boomsHere = 0;
    }
    if (this.alive().length <= 1) {
      this.holder = null;
      this.host.broadcastState();
      this.later(BOMB_BOOM_PAUSE, () => this.finish());
      return;
    }
    // La bombe repart de chez le voisin, après le temps de voir l'explosion.
    this.holder = this.nextAlive(id);
    this.host.broadcastState();
    this.later(BOMB_BOOM_PAUSE, () => this.light());
  }

  private finish(): void {
    this.dispose();
    const [winner] = this.alive();
    this.holder = null;
    this.litAt = null;
    if (winner) this.host.system(`🏆 ${this.host.name(winner)} est le dernier debout !`);
    this.host.endGame();
  }

  // ---- Outils -------------------------------------------------------------------

  private alive(): string[] {
    const present = new Set(this.host.playerIds());
    return this.order.filter((id) => present.has(id) && (this.lives.get(id) ?? 0) > 0);
  }

  /** Joueur en vie suivant dans l'ordre de la table. */
  private nextAlive(from: string): string | null {
    const alive = new Set(this.alive());
    const start = this.order.indexOf(from);
    for (let k = 1; k <= this.order.length; k++) {
      const id = this.order[(start + k) % this.order.length]!;
      if (alive.has(id)) return id;
    }
    return null;
  }

  /** Celui qui reçoit la bombe a toujours quelques secondes, même si la mèche est presque finie. */
  private keepMinimumTurn(): void {
    const floor = Date.now() + BOMB_MIN_TURN * 1000;
    if (this.fuseEnd < floor) this.armFuse(floor);
  }

  private armFuse(at: number): void {
    if (this.fuse) clearTimeout(this.fuse);
    this.fuseEnd = at;
    this.fuse = setTimeout(() => this.explode(), Math.max(0, at - Date.now()));
  }

  private pickSyllable(): string {
    const pool = syllablesFor(this.host.difficulty()).filter((s) => s !== this.syllable);
    return pool[Math.floor(this.host.random() * pool.length)] ?? 'ou';
  }

  private emit(event: BombEvent): void {
    this.host.broadcast({ t: 'bombEvent', event });
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }
}
