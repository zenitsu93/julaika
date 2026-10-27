import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MOT_LENGTH,
  MOT_TRIES,
  compareMot,
  foldMot,
  scoreMot,
  type MotBoardEntry,
  type MotError,
  type MotState,
} from '@julaika/shared';
import { ANSWERS, DICTIONARY } from './mots5';

/** Jour du mot n° 1. */
export const FIRST_DAY = '2026-10-27';
const DAY = 86_400_000;
/** Joueurs classés par jour au plus : de quoi recevoir du monde, pas de quoi remplir le disque. */
export const MAX_PLAYERS_PER_DAY = 5000;
/** Chronos lancés sans essai gardés en mémoire (les plus anciens partent d'abord). */
const MAX_PENDING_STARTS = 20_000;

interface Entry {
  name: string;
  avatar: number;
  guesses: string[];
  startedAt: number;
  finishedAt?: number;
  won?: boolean;
}

type Day = Record<string, Entry>;

const ACCEPTED = new Set([...DICTIONARY, ...ANSWERS.map(foldMot)]);

/** Même ordre de mots à chaque démarrage : mélange avec une graine fixe (mulberry32). */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const ORDER = shuffled(ANSWERS, 0x4a554c41);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const isToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

/**
 * Le mot du jour et ses classements. Un fichier JSON par jour dans `dir`, réécrit (via un fichier
 * temporaire puis un renommage) une seconde après le dernier changement.
 */
export class MotDuJour {
  private days = new Map<string, Day>();
  private dirty = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  // Départ du chrono des joueurs qui ont ouvert le mot sans encore jouer : rien n'est écrit tant
  // qu'il n'y a pas d'essai, sinon chaque visite (ou un script) remplirait le fichier du jour.
  private starts = new Map<string, number>();
  private startsDate = '';

  constructor(
    private dir: string | null,
    private now: () => number = Date.now,
    private timeZone = 'Europe/Paris',
    private maxPlayers = MAX_PLAYERS_PER_DAY,
  ) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  /** Jour en cours (AAAA-MM-JJ) dans le fuseau du jeu. */
  today(at = this.now()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  }

  /** Prochain changement de jour : on avance par pas d'une minute après une estimation à l'heure près. */
  private nextAt(): number {
    const now = this.now();
    const today = this.today(now);
    let t = now - (now % 60_000) + 60_000;
    while (this.today(t + 3_600_000) === today) t += 3_600_000;
    while (this.today(t) === today) t += 60_000;
    return t;
  }

  number(date: string) {
    return daysBetween(FIRST_DAY, date) + 1;
  }

  answer(date: string): string {
    const n = this.number(date) - 1;
    return ORDER[((n % ORDER.length) + ORDER.length) % ORDER.length]!;
  }

  private valid(date: string) {
    return isDate(date) && date >= FIRST_DAY && date <= this.today();
  }

  /** État d'un jour pour un joueur. Ouvrir le mot du jour lance son chrono. */
  state(token: string | null, date = this.today()): MotState | MotError {
    if (!this.valid(date)) return 'jour';
    const today = this.today();
    const day = this.day(date);
    const entry = token ? day[token] : undefined;
    if (token && !entry && date === today) this.startClock(token, today);
    const answer = this.answer(date);
    const done = Boolean(entry?.finishedAt);
    const board: MotBoardEntry[] = Object.entries(day)
      .filter(([, e]) => e.finishedAt && e.name)
      .map(([t, e]) => ({
        name: e.name,
        avatar: e.avatar,
        won: Boolean(e.won),
        tries: e.guesses.length,
        ms: e.finishedAt! - e.startedAt,
        marks: e.guesses.map((g) => scoreMot(g, answer)),
        ...(t === token ? { you: true } : {}),
      }))
      .sort(compareMot);
    return {
      date,
      number: this.number(date),
      today,
      firstDate: FIRST_DAY,
      guesses: (entry?.guesses ?? []).map((word) => ({ word, marks: scoreMot(word, answer) })),
      done,
      won: Boolean(entry?.won),
      ...(done || date < today ? { answer } : {}),
      nextAt: this.nextAt(),
      board,
      playing: Object.values(day).filter((e) => !e.finishedAt && e.guesses.length > 0).length,
    };
  }

  /** Un essai sur le mot du jour. */
  guess(token: string, name: string, avatar: number, word: string): MotState | MotError {
    const date = this.today();
    const guess = foldMot(word);
    const clean = cleanName(name);
    if (!clean) return 'pseudo';
    if (guess.length !== MOT_LENGTH) return 'longueur';
    if (!ACCEPTED.has(guess)) return 'inconnu';
    const day = this.day(date);
    let entry = day[token];
    if (!entry) {
      if (Object.keys(day).length >= this.maxPlayers) return 'complet';
      entry = day[token] = { name: clean, avatar: 0, guesses: [], startedAt: this.startedAt(token, date) };
    }
    if (entry.finishedAt) return 'fini';
    entry.name = clean;
    entry.avatar = Number.isInteger(avatar) && avatar >= 0 && avatar < 64 ? avatar : 0;
    entry.guesses.push(guess);
    const won = guess === foldMot(this.answer(date));
    if (won || entry.guesses.length >= MOT_TRIES) {
      entry.finishedAt = this.now();
      entry.won = won;
    }
    this.touch(date);
    return this.state(token, date);
  }

  /** Lance le chrono d'un joueur qui ouvre le mot du jour, sans rien écrire. */
  private startClock(token: string, today: string) {
    if (this.startsDate !== today) {
      this.starts.clear();
      this.startsDate = today;
    }
    if (this.starts.has(token)) return;
    if (this.starts.size >= MAX_PENDING_STARTS) this.starts.delete(this.starts.keys().next().value!);
    this.starts.set(token, this.now());
  }

  private startedAt(token: string, date: string): number {
    const at = this.startsDate === date ? this.starts.get(token) : undefined;
    this.starts.delete(token);
    return at ?? this.now();
  }

  private day(date: string): Day {
    let day = this.days.get(date);
    if (day) return day;
    day = {};
    if (this.dir) {
      try {
        day = JSON.parse(readFileSync(this.file(date), 'utf8')) as Day;
      } catch {}
    }
    this.days.set(date, day);
    // Seuls les derniers jours restent en mémoire ; les autres se relisent sur le disque.
    if (this.days.size > 8 && this.dir) {
      for (const d of this.days.keys()) if (d !== date && !this.dirty.has(d) && this.days.size > 8) this.days.delete(d);
    }
    return day;
  }

  private file(date: string) {
    return join(this.dir!, `${date}.json`);
  }

  private touch(date: string) {
    if (!this.dir) return;
    this.dirty.add(date);
    this.timer ??= setTimeout(() => this.flush(), 1000);
    this.timer.unref?.();
  }

  /** Écrit les jours modifiés. Appelé tout seul, et à l'arrêt du serveur. */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const date of this.dirty) {
      const tmp = `${this.file(date)}.tmp`;
      try {
        writeFileSync(tmp, JSON.stringify(this.days.get(date) ?? {}));
        renameSync(tmp, this.file(date));
      } catch (err) {
        console.error('[mot du jour] écriture impossible', err);
      }
    }
    this.dirty.clear();
  }
}

function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/[\p{C}]/gu, '').trim().slice(0, 20) : '';
}
