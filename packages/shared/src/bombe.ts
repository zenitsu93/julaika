// Bombe à mots : la bombe passe de main en main. Celui qui la tient doit taper un mot qui
// contient la syllabe affichée avant qu'elle n'explose. Personne ne sait quand elle saute.

export interface BombState {
  /** Syllabe à placer, en minuscules et sans accents ("ra", "tion"…). */
  syllable: string;
  /** Joueur qui tient la bombe (null entre deux bombes). */
  holder: string | null;
  /** Joueurs de la partie, dans l'ordre où la bombe tourne. */
  order: string[];
  /** Vies restantes par joueur : 0 = éliminé. */
  lives: Record<string, number>;
  maxLives: number;
  /** Lettres bonus déjà placées par chaque joueur (toutes placées = une vie de plus). */
  letters: Record<string, string>;
  /** Mots trouvés par joueur. */
  words: Record<string, number>;
  /** Compteur de passes : change à chaque mot validé ou explosion (sert de clé aux animations). */
  turn: number;
  /** Timestamp serveur où la mèche a été allumée (la bombe bat de plus en plus vite). */
  litAt: number | null;
  /** Timestamp serveur du premier allumage : avant, le compte à rebours de départ. */
  startsAt: number;
  /** Dernier mot validé, pour l'afficher sous la bombe. */
  last: { by: string; word: string } | null;
}

/** Ce qui vient d'arriver autour de la bombe : sert aux animations et aux sons. */
export type BombEvent =
  | { kind: 'ok'; by: string; word: string; syllable: string; bonus: string }
  | { kind: 'bad'; by: string; word: string; reason: BombReject }
  /** `example` : un mot qui aurait sauvé le joueur. */
  | { kind: 'boom'; by: string; lives: number; example: string | null }
  | { kind: 'life'; by: string; lives: number };

export type BombReject = 'syllabe' | 'inconnu' | 'deja';

export const BOMB_REJECT_TEXT: Record<BombReject, string> = {
  syllabe: 'Il manque la syllabe',
  inconnu: 'Pas dans le dictionnaire',
  deja: 'Déjà dit !',
};

/** Lettres à placer pour gagner une vie (sans les lettres rares, comme dans BombParty). */
export const BOMB_LETTERS = 'abcdefghijlmnopqrstuv';
export const BOMB_WORD_MAX = 30;
/** Vies de départ possibles (réglage « Manches » du salon, borné ici). */
export const BOMB_MAX_LIVES = 5;
/** Mèche cachée : tirée au hasard entre ces bornes (s) à chaque nouvelle bombe. */
export const BOMB_FUSE: readonly [number, number] = [12, 28];
/** Temps minimum laissé à celui qui reçoit la bombe (s). */
export const BOMB_MIN_TURN = 3;
/** Compte à rebours avant la première bombe, et pause après une explosion (ms). */
export const BOMB_COUNTDOWN = 3000;
export const BOMB_BOOM_PAUSE = 1800;

/** Mot ramené à ses lettres : minuscules, sans accents, ligatures dépliées ("Cœur" -> "coeur"). */
export function foldWord(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Lettres bonus d'un mot pas encore placées par le joueur. */
export function newBonusLetters(word: string, have: string): string {
  const out = new Set<string>();
  for (const c of foldWord(word)) if (BOMB_LETTERS.includes(c) && !have.includes(c)) out.add(c);
  return [...out].sort().join('');
}
