// Agents secrets (façon Codenames). Une grille de 25 mots ; derrière certains se cachent des
// agents. Un espion les connaît et donne un indice : un seul mot et un nombre, pour faire
// démasquer plusieurs agents d'un coup. Deux modes :
// - équipes (4 joueurs et plus) : équipe Or contre équipe Cacao, un espion chacune ;
// - duo (2 ou 3 joueurs) : en coopération, chaque côté voit sa propre clé et donne des indices
//   à l'autre à tour de rôle. 15 agents à trouver en 9 tours, sans toucher un assassin.

export type AgentsTeam = 'or' | 'cacao';
/** Couleur d'une case dans une clé. En duo, un agent est toujours « or ». */
export type AgentsColor = AgentsTeam | 'neutre' | 'assassin';
export type AgentsMode = 'duo' | 'equipes';

export interface AgentsCard {
  word: string;
  /** Couleur dévoilée, null tant que la carte est cachée. */
  revealed: AgentsColor | null;
  /** Joueur qui l'a retournée. */
  by: string | null;
  /** Duo : côtés dont la clé a dit « passant » sur ce mot (il reste jouable pour l'autre clé). */
  neutral: AgentsTeam[];
}

export interface AgentsClue {
  team: AgentsTeam;
  by: string;
  word: string;
  count: number;
  /** Agents trouvés grâce à cet indice. */
  found: number;
}

export interface AgentsResult {
  /** Équipe gagnante ; en duo : 'duo' si la mission réussit, null si elle échoue. */
  winner: AgentsTeam | 'duo' | null;
  reason: 'agents' | 'assassin' | 'tours' | 'equipe';
  /** Joueur qui a touché l'assassin. */
  by: string | null;
}

export interface AgentsState {
  mode: AgentsMode;
  /** Grille en cours, à partir de 1. */
  grid: number;
  grids: number;
  cards: AgentsCard[];
  /** Ta clé : celle de ton équipe si tu es espion (équipes) ou ta clé de duo ; null sinon. */
  key: AgentsColor[] | null;
  /** Toutes les clés, dévoilées à la fin de la grille. */
  keys: Record<AgentsTeam, AgentsColor[]> | null;
  teams: Record<AgentsTeam, string[]>;
  /** Équipes : l'espion de chaque équipe. Duo : null. */
  spies: Record<AgentsTeam, string | null>;
  myTeam: AgentsTeam | null;
  /** Équipes : l'équipe qui joue. Duo : le côté qui donne l'indice. */
  turn: AgentsTeam;
  clue: AgentsClue | null;
  /** Essais restants sur l'indice (équipes) ; null = autant qu'on veut (duo). */
  guessesLeft: number | null;
  /** Doigt posé par chaque joueur sur une carte, avant de la retourner. */
  pointers: Record<string, number>;
  /** Agents encore cachés : par équipe, ou par clé en duo. */
  left: Record<AgentsTeam, number>;
  /** Duo : tours restants. */
  tokens: number | null;
  result: AgentsResult | null;
  /** Indices donnés pendant la grille. */
  history: AgentsClue[];
  /** Grilles jouées : vainqueur de chacune. */
  record: (AgentsTeam | 'duo' | null)[];
}

export const AGENTS_SIZE = 25;
/** Mode duo en dessous de ce nombre de joueurs, équipes au-delà. */
export const AGENTS_TEAMS_MIN = 4;
/** Duo : tours pour trouver les 15 agents. */
export const AGENTS_DUO_TOKENS = 9;
export const AGENTS_DUO_TOTAL = 15;
export const AGENTS_CLUE_MAX = 24;
export const AGENTS_COUNT_MAX = 9;
/** Temps de la révélation de fin de grille (s). */
export const AGENTS_REVEAL_TIME = 10;
/** Points : par agent trouvé (à toute l'équipe), et par grille gagnée. */
export const AGENTS_POINTS = { agent: 10, win: 100 } as const;

export const AGENTS_TEAM_NAME: Record<AgentsTeam, string> = { or: 'Or', cacao: 'Cacao' };

export const otherTeam = (t: AgentsTeam): AgentsTeam => (t === 'or' ? 'cacao' : 'or');

export function agentsMode(players: number): AgentsMode {
  return players >= AGENTS_TEAMS_MIN ? 'equipes' : 'duo';
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Indice nettoyé : espaces resserrés, longueur bornée. */
export function cleanClue(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AGENTS_CLUE_MAX);
}

/** Pourquoi un indice est refusé, ou null s'il est valable. Un seul mot, et pas un mot de la grille (ni un morceau). */
export function agentsClueError(clue: string, cards: AgentsCard[]): string | null {
  const c = cleanClue(clue);
  if (!c) return 'Écris un indice.';
  if (/\s/.test(c)) return 'Un seul mot !';
  const f = fold(c);
  if (!f) return 'Un vrai mot, s’il te plaît.';
  for (const card of cards) {
    if (card.revealed) continue;
    const w = fold(card.word);
    if (w === f || (f.length >= 3 && w.includes(f)) || (w.length >= 3 && f.includes(w))) return `Trop proche de « ${card.word} ».`;
  }
  return null;
}

/** Les 25 cases d'une partie en duo : [clé du côté or, clé du côté cacao]. */
export const AGENTS_DUO_PATTERN: [AgentsColor, AgentsColor][] = [
  ...Array.from({ length: 3 }, (): [AgentsColor, AgentsColor] => ['or', 'or']),
  ...Array.from({ length: 5 }, (): [AgentsColor, AgentsColor] => ['or', 'neutre']),
  ['or', 'assassin'],
  ...Array.from({ length: 5 }, (): [AgentsColor, AgentsColor] => ['neutre', 'or']),
  ['assassin', 'or'],
  ['assassin', 'assassin'],
  ['assassin', 'neutre'],
  ['neutre', 'assassin'],
  ...Array.from({ length: 7 }, (): [AgentsColor, AgentsColor] => ['neutre', 'neutre']),
];

/** Mots à double sens, pour que les indices puissent en relier plusieurs. */
export const AGENTS_WORDS = `
  abeille, aiguille, aile, alpes, ambulance, ampoule, ange, anneau, araignée, arc, armée, astre,
  avocat, baguette, baleine, balle, ballon, banane, banc, bande, banque, barbe, bateau, bâton,
  berger, bête, beurre, bière, billet, blanc, bois, boîte, bombe, botte, bouche, bouchon, bougie,
  bouton, branche, bras, brique, bulle, bureau, but, cabine, cactus, cadre, café, caisse,
  calendrier, camp, canard, canne, capitale, carte, casino, ceinture, centre, cercle, chaîne,
  chaise, champ, champion, chance, chapeau, char, charge, château, chat, chef, chemise, cheval,
  chien, chocolat, ciel, cinéma, citron, clé, cloche, clou, club, cochon, code, cœur, coin,
  col, colle, comète, coq, corde, corne, côte, coton, couche, coupe, cour, courant, couronne,
  course, couteau, crabe, crayon, crème, critique, croix, cuisine, cygne, danse, dé, dent,
  diamant, dinosaure, docteur, doigt, dragon, drapeau, eau, échelle, éclair, école, écran,
  espion, étoile, fantôme, farine, fer, feu, feuille, fil, filet, flèche, fleur, foie, fond,
  forêt, fort, fou, four, fourchette, fraise, fusée, galerie, gant, gâteau, géant, glace,
  gorge, goutte, grain, grue, guerre, guide, herbe, héros, hiver, hôpital, huile, île, jet,
  jeu, jour, journal, jumelles, lait, lampe, langue, lapin, laser, lettre, lien, ligne, lion,
  lit, livre, loup, lumière, lune, lunettes, machine, main, maître, manche, marche, marque,
  masque, mémoire, mer, miel, mine, miroir, mode, moule, mouche, mouton, mur, musique, neige,
  nez, nid, note, nuit, œil, œuf, ombre, opéra, or, orange, ordre, oreille, os, ours, page,
  paille, palais, palme, papier, parachute, passe, pêche, peinture, pendule, phare, piano,
  pièce, pied, pierre, pile, pilote, pingouin, pirate, place, plage, plan, plante, plat,
  plume, poche, poêle, poids, point, poisson, police, pomme, pompe, pont, port, porte, poste,
  poulet, poupée, princesse, prison, pyramide, queue, radio, rame, rayon, reine, requin,
  restaurant, robe, robot, roi, rose, roue, rouge, ruban, sable, sac, sapin, satellite,
  sel, sirène, ski, soleil, sorcière, souris, sous-marin, stade, star, table, tableau, tache,
  talon, tambour, temps, tennis, terre, tête, théâtre, tigre, timbre, tir, titre, toile,
  tomate, tonnerre, tour, train, trésor, triangle, trompe, trou, tube, tuile, vague, vampire,
  vapeur, verre, vert, vin, violon, vol, voile, volant, zéro
`
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean);
