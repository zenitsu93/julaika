// Téléphone dessiné : chacun écrit une phrase, le voisin la dessine, le suivant devine le
// dessin, et ainsi de suite. Tout le monde joue en même temps ; les chaînes ne sont révélées
// qu'à la fin, en album.

import type { DrawPacket } from './draw';

/** Ce que fait chaque joueur à une étape : écrire la phrase de départ, dessiner, ou décrire. */
export type TelKind = 'write' | 'draw' | 'describe';

/** Une étape d'une chaîne : une phrase, ou un dessin (gardé trait par trait pour le rejouer). */
export type TelEntry =
  | { kind: 'text'; by: string; name: string; avatar: number; text: string }
  | { kind: 'drawing'; by: string; name: string; avatar: number; strokes: DrawPacket[] };

export interface TelChain {
  owner: string;
  name: string;
  avatar: number;
  entries: TelEntry[];
}

export interface TelState {
  /** Étape en cours, à partir de 0, sur le nombre total d'étapes. */
  step: number;
  steps: number;
  kind: TelKind;
  /** Joueurs de la partie, dans l'ordre de la chaîne. */
  players: string[];
  /** Joueurs qui ont rendu leur étape. */
  done: string[];
  /** Album : chaîne et dernière étape dévoilées (null avant la révélation). */
  album: { chain: number; entry: number } | null;
}

export const TEL_TEXT_MAX = 80;
/** Temps pour écrire ou décrire (s) ; le dessin prend le « temps de dessin » du salon. */
export const TEL_WRITE_TIME = 45;

/** Étape s : écrire au départ, puis dessiner et décrire en alternance. */
export function telKind(step: number): TelKind {
  return step === 0 ? 'write' : step % 2 ? 'draw' : 'describe';
}

/** Chaîne que traite un joueur à une étape : chaque étape la passe au voisin suivant. */
export function telChainFor(playerIndex: number, step: number, count: number): number {
  return (((playerIndex - step) % count) + count) % count;
}

/** Phrases de départ pour qui manque d'idée (ou laisse filer le temps). */
export const TEL_PROMPTS = [
  'Un chat qui fait du ski nautique',
  'Une pizza amoureuse d’un ananas',
  'Le père Noël en vacances à la plage',
  'Un dinosaure qui a peur d’une souris',
  'Une girafe coincée dans un ascenseur',
  'Un fantôme qui fait sa lessive',
  'Une vache astronaute sur la Lune',
  'Un escargot qui gagne une course de F1',
  'Mamie fait du skate',
  'Un robot qui pleure devant un film',
  'Une baleine dans une baignoire',
  'Un pingouin serveur dans un café',
  'Le soleil met des lunettes de soleil',
  'Un poisson rouge qui promène son chien',
  'Une licorne au supermarché',
  'Un cactus qui veut un câlin',
  'Un vampire chez le dentiste',
  'Une banane qui fait du yoga',
  'Un pirate qui a le mal de mer',
  'Une tortue qui prend l’avion',
  'Un ours qui mange une glace sous la pluie',
  'Un sourire si grand qu’il ne rentre pas dans le dessin',
  'Une sorcière en trottinette',
  'Un hamster qui soulève des haltères',
] as const;
