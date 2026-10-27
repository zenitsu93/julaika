// Petit Bac : une lettre tirée au sort, un mot par catégorie qui commence par cette lettre.
// Tout le monde remplit sa grille en même temps ; le premier qui a tout rempli peut crier
// « Stop ! ». Ensuite on vote contre les réponses douteuses, puis on compte les points.

import { normalize } from './text';

export interface BacState {
  letter: string;
  categories: string[];
  /** Joueurs de la manche (ceux qui étaient là au tirage). */
  players: string[];
  /** Remplissage : nombre de cases remplies par joueur (les réponses restent secrètes). */
  filled: Record<string, number>;
  /** Qui a crié « Stop ! » (null tant que personne). */
  stoppedBy: string | null;
  /** Vote : joueurs qui ont validé leurs votes. */
  done: string[];
  /** Réponses de tous, dévoilées au vote (null pendant le remplissage). */
  answers: Record<string, string[]> | null;
  /** Votes contre : clé `${joueur}:${catégorie}`, valeur = ceux qui refusent la réponse. */
  vetoes: Record<string, string[]>;
  /** Points de la manche par joueur et par catégorie, au décompte (null avant). */
  points: Record<string, number[]> | null;
}

export const BAC_ANSWER_MAX = 30;
export const BAC_CATEGORY_COUNT = 6;
/** Après « Stop ! », les autres ont encore quelques secondes pour finir leur mot. */
export const BAC_STOP_GRACE = 5;
export const BAC_VOTE_TIME = 60;
export const BAC_REVEAL_TIME = 10;
/** Le temps que la lettre finisse de tourner chez les joueurs avant de compter. */
export const BAC_ROLL_TIME = 2;

/** Lettres tirées : sans K, Q, W, X, Y, Z, trop dures pour la plupart des catégories. */
export const BAC_LETTERS = 'ABCDEFGHIJLMNOPRSTUV';

export const BAC_POINTS = { unique: 10, shared: 5 } as const;

export const BAC_CATEGORIES = [
  'Prénom',
  'Pays',
  'Ville',
  'Animal',
  'Fruit ou légume',
  'Métier',
  'Objet',
  'Marque',
  'Sport',
  'Plat ou dessert',
  'Film ou série',
  'Célébrité',
  'Vêtement',
  'Couleur',
  'Partie du corps',
  'Instrument',
  'Chanteur ou groupe',
  'Personnage de fiction',
  'Dans la cuisine',
  'Ça fait sourire',
] as const;

export const vetoKey = (player: string, category: number) => `${player}:${category}`;

/** Réponse ramenée à sa forme comparable : sans accents, articles ni ponctuation. */
export function bacNormalize(answer: string): string {
  return normalize(answer)
    .replace(/^(?:(?:le|la|les|un|une|des)\s+|l['’]\s*)/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Une réponse compte si elle fait au moins 2 lettres et commence par la lettre, avec ou sans
 * son article (« L'Ours » passe au O comme au L, « La Rochelle » au L comme au R).
 */
export function bacFits(answer: string, letter: string): boolean {
  const l = letter.toLowerCase();
  const n = bacNormalize(answer);
  const raw = normalize(answer).replace(/[^a-z0-9]/g, '');
  return n.length >= 2 && (n[0] === l || raw[0] === l);
}

/**
 * Points d'une manche : 10 pour une réponse valide que personne d'autre n'a, 5 si elle est
 * partagée, 0 si elle est vide, hors lettre ou refusée par la majorité des autres joueurs.
 */
export function bacScore(
  answers: Record<string, string[]>,
  letter: string,
  categories: number,
  vetoes: Record<string, string[]>,
  voters: string[],
): Record<string, number[]> {
  const ids = Object.keys(answers);
  const valid = (id: string, c: number) => {
    const a = answers[id]?.[c] ?? '';
    if (!bacFits(a, letter)) return false;
    const others = voters.filter((v) => v !== id).length;
    const against = (vetoes[vetoKey(id, c)] ?? []).filter((v) => v !== id && voters.includes(v)).length;
    return against * 2 <= others;
  };
  const out: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (let c = 0; c < categories; c++) {
    const counts = new Map<string, number>();
    for (const id of ids) if (valid(id, c)) counts.set(bacNormalize(answers[id]![c]!), (counts.get(bacNormalize(answers[id]![c]!)) ?? 0) + 1);
    for (const id of ids) {
      out[id]![c] = valid(id, c) ? (counts.get(bacNormalize(answers[id]![c]!))! > 1 ? BAC_POINTS.shared : BAC_POINTS.unique) : 0;
    }
  }
  return out;
}
