// Mot du jour : un mot de 5 lettres par jour, 6 essais, un classement par jour.
// Les lettres se jouent sans accents (É = E), comme sur les claviers de téléphone.

export const MOT_LENGTH = 5;
export const MOT_TRIES = 6;

/** Bien placée, présente ailleurs, absente. */
export type LetterMark = 'ok' | 'near' | 'no';

export interface MotGuess {
  word: string;
  marks: LetterMark[];
}

export interface MotBoardEntry {
  name: string;
  avatar: number;
  won: boolean;
  tries: number;
  /** Durée entre l'ouverture du mot et la fin de la partie. */
  ms: number;
  /** Couleurs des essais, sans les lettres : le classement ne gâche pas le mot. */
  marks: LetterMark[][];
  you?: boolean;
}

export interface MotState {
  /** Jour au format AAAA-MM-JJ, dans le fuseau du serveur. */
  date: string;
  /** Numéro du mot (n° 1 le jour du lancement). */
  number: number;
  today: string;
  firstDate: string;
  guesses: MotGuess[];
  done: boolean;
  won: boolean;
  /** Le mot, avec ses accents : donné une fois ta partie finie, ou pour un jour passé. */
  answer?: string;
  /** Instant du prochain mot (ms depuis l'époque Unix). */
  nextAt: number;
  board: MotBoardEntry[];
  /** Joueurs qui ont ouvert le mot sans avoir fini. */
  playing: number;
}

export type MotError = 'longueur' | 'inconnu' | 'fini' | 'pseudo' | 'jour' | 'complet';

/** Majuscules A-Z seulement : "élève" -> "ELEVE". */
export function foldMot(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/** Couleurs d'un essai. Une lettre en double n'est « présente » qu'autant de fois qu'elle est dans le mot. */
export function scoreMot(guess: string, answer: string): LetterMark[] {
  const g = [...foldMot(guess)];
  const a = [...foldMot(answer)];
  const marks: LetterMark[] = g.map(() => 'no');
  const left = new Map<string, number>();
  g.forEach((c, i) => {
    if (a[i] === c) marks[i] = 'ok';
    else left.set(a[i]!, (left.get(a[i]!) ?? 0) + 1);
  });
  g.forEach((c, i) => {
    if (marks[i] === 'ok') return;
    const n = left.get(c) ?? 0;
    if (n > 0) {
      marks[i] = 'near';
      left.set(c, n - 1);
    }
  });
  return marks;
}

/** Classement : les gagnants d'abord, au moins d'essais puis au plus rapide ; ensuite ceux qui ont séché. */
export function compareMot(a: Pick<MotBoardEntry, 'won' | 'tries' | 'ms'>, b: Pick<MotBoardEntry, 'won' | 'tries' | 'ms'>) {
  if (a.won !== b.won) return a.won ? -1 : 1;
  if (a.won && a.tries !== b.tries) return a.tries - b.tries;
  return a.ms - b.ms;
}

/** Résultat à partager, sans les lettres. */
export function shareMot(number: number, guesses: MotGuess[], won: boolean): string {
  const square: Record<LetterMark, string> = { ok: '🟩', near: '🟨', no: '⬛' };
  const rows = guesses.map((g) => g.marks.map((m) => square[m]).join(''));
  return [`julaïka · Mot du jour n° ${number} · ${won ? guesses.length : 'X'}/${MOT_TRIES}`, ...rows].join('\n');
}
