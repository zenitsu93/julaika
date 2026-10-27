// L'Intrus : tout le monde reçoit le même mot, sauf un joueur qui en a un proche (« plage »
// contre « piscine »). Personne ne sait s'il est l'intrus. Chacun donne un indice à son tour,
// puis on vote ; démasqué, l'intrus a encore une chance s'il devine le mot des autres.

/** Une paire de mots proches : celui des civils, celui de l'intrus. */
export interface IntrusPair {
  civil: string;
  intrus: string;
}

export interface IntrusClue {
  by: string;
  text: string;
  /** Tour d'indices (à partir de 0). */
  round: number;
}

/** Bilan d'une manche, dévoilé à tous à la fin. */
export interface IntrusResult {
  intrusId: string;
  /** Joueur le plus désigné, null en cas d'égalité (l'intrus s'en sort). */
  accusedId: string | null;
  caught: boolean;
  civil: string;
  intrus: string;
  /** Mot proposé par l'intrus démasqué, et s'il a vu juste. */
  steal: string | null;
  stolen: boolean;
  /** Vote de chacun : votant → joueur désigné. */
  votes: Record<string, string>;
  gains: Record<string, number>;
}

export interface IntrusState {
  /** Ton mot, secret (null pour un spectateur arrivé en cours de manche). */
  word: string | null;
  /** Manche en cours (à partir de 1) sur le nombre de manches. */
  manche: number;
  manches: number;
  /** Joueurs de la manche, dans l'ordre de parole. */
  order: string[];
  /** Tour d'indices en cours (à partir de 0) et nombre de tours. */
  clueRound: number;
  clueRounds: number;
  /** Joueur qui doit donner son indice (phase clue). */
  speakerId: string | null;
  clues: IntrusClue[];
  /** Joueurs qui ont voté (sans dire pour qui avant la fin). */
  voted: string[];
  /** Ton vote, pour l'afficher chez toi. */
  myVote: string | null;
  /** Joueur démasqué qui tente de voler la manche (phase steal). */
  accusedId: string | null;
  result: IntrusResult | null;
  history: IntrusResult[];
}

export const INTRUS_MIN_PLAYERS = 3;
export const INTRUS_CLUE_MAX = 30;
/** Deux tours d'indices à trois ou quatre, un seul au-delà : la manche ne traîne pas. */
export function intrusClueRounds(players: number): number {
  return players <= 4 ? 2 : 1;
}

/** Points : civil qui a désigné l'intrus, intrus qui passe entre les mailles, ou qui vole le mot. */
export const INTRUS_POINTS = { spotted: 150, escaped: 300, stolen: 200 } as const;
