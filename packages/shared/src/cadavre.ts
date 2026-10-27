// Cadavre exquis : une créature en trois morceaux, tête, corps et jambes, dessinés chacun par
// un joueur différent. On ne voit du morceau d'au-dessus qu'une mince bande de jonction ; la
// créature entière n'apparaît qu'au dévoilement, où l'on vote pour son nom.

import { DrawOp, type DrawPacket } from './draw';
import { CANVAS_H } from './protocol';

/** Les morceaux, de haut en bas. */
export const CAD_PARTS = ['tête', 'corps', 'jambes'] as const;
export type CadPart = 0 | 1 | 2;

/** Hauteur (px du tableau) de la bande du morceau d'au-dessus que voit le dessinateur suivant. */
export const CAD_JOIN = 48;
export const CAD_NAME_MAX = 40;

/** Un morceau dessiné, avec son auteur. */
export interface CadPiece {
  by: string;
  name: string;
  avatar: number;
  strokes: DrawPacket[];
}

export interface Creature {
  /** Joueur qui a commencé la créature (dessiné sa tête). */
  owner: string;
  pieces: CadPiece[];
}

/** Nom proposé pour la créature dévoilée, et les cœurs reçus. */
export interface CadName {
  by: string;
  text: string;
  hearts: string[];
}

export interface CadavreState {
  /** Morceau en cours (0 tête, 1 corps, 2 jambes). */
  step: number;
  /** Joueurs de la partie, dans l'ordre de passage. */
  players: string[];
  /** Joueurs qui ont rendu leur morceau. */
  done: string[];
  /** Dévoilement : créature affichée (= nombre de créatures pour le bestiaire final), null avant. */
  reveal: number | null;
  /** Noms proposés pour la créature affichée. */
  names: CadName[];
  /** Nom retenu de chaque créature déjà dévoilée (null tant qu'elle ne l'est pas). */
  titles: (string | null)[];
}

/** Créature sur laquelle travaille un joueur à une étape : elle passe au voisin à chaque morceau. */
export function cadCreatureFor(playerIndex: number, step: number, count: number): number {
  return (((playerIndex - step) % count) + count) % count;
}

/**
 * Ce que le dessinateur suivant voit du morceau d'au-dessus : les traits qui touchent la bande
 * du bas. Le pot de peinture n'y passe pas (il remplirait toute la bande d'un coup).
 */
export function cadJoinStrokes(strokes: DrawPacket[]): DrawPacket[] {
  const top = CANVAS_H - CAD_JOIN;
  return strokes.filter((s) => s.op !== DrawOp.Fill && s.points.some((v, i) => i % 2 === 1 && v + s.size / 2 >= top));
}

/** Le nom le plus aimé (le premier proposé en cas d'égalité), ou null si personne n'a rien proposé. */
export function cadWinner(names: CadName[]): CadName | null {
  return names.reduce<CadName | null>((best, n) => (!best || n.hearts.length > best.hearts.length ? n : best), null);
}

/** Idées pour qui sèche devant sa feuille blanche, par morceau. */
export const CAD_IDEAS: Record<CadPart, readonly string[]> = {
  0: ['une tête de chat', 'un casque de chevalier', 'une tête de brocoli', 'un robot à antennes', 'un hibou à lunettes', 'une pieuvre coiffée', 'une tête de licorne', 'un ananas qui sourit', 'un dragon timide', 'un extraterrestre à trois yeux'],
  1: ['un corps de sumo', 'une armure en carton', 'un ventre de tortue', 'un tutu de danseuse', 'un costume trois-pièces', 'des ailes de papillon', 'un corps de poisson', 'un pull de Noël', 'un cornet de glace', 'une cage thoracique de robot'],
  2: ['des pattes de poulet', 'des rollers', 'une queue de sirène', 'des jambes de footballeur', 'des chenilles de tank', 'des échasses', 'huit pattes d’araignée', 'des sabots de cheval', 'des palmes', 'un monocycle'],
};

/** Débuts et fins de nom pour baptiser une créature quand personne n'a d'idée. */
const NAME_HEADS = ['Gloub', 'Zigou', 'Patat', 'Croqu', 'Ronfl', 'Turlu', 'Bidul', 'Frip', 'Moumou', 'Schnouf', 'Tagad', 'Pilou'];
const NAME_TAILS = ['ouille', 'osaure', 'inette', 'ator', 'ichon', 'zilla', 'ouchka', 'aroo', 'ifix', 'iflette'];

export function cadRandomName(random: () => number = Math.random): string {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  return pick(NAME_HEADS) + pick(NAME_TAILS);
}
