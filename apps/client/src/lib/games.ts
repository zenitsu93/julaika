// Catalogue des jeux de julaïka : l'accueil affiche une carte par entrée.
// Ajouter un jeu = l'ajouter ici (et retirer une place « Bientôt »).

export type GameId = 'dessin' | 'mime';

export interface GameInfo {
  id: GameId;
  name: string;
  pitch: string;
  players: string;
  badge?: string;
  /** Mots qui font remonter le jeu dans la recherche (sans accents, en minuscules). */
  keywords: string[];
}

export const GAMES: GameInfo[] = [
  {
    id: 'dessin',
    name: 'Dessin',
    pitch: 'Dessine, les autres devinent.',
    players: '2 à 16 joueurs',
    keywords: ['dessin', 'dessiner', 'crayon', 'deviner', 'draw'],
  },
  {
    id: 'mime',
    name: 'Mime',
    pitch: 'Mime devant la caméra, sans un son.',
    players: 'En visio',
    badge: 'Nouveau',
    keywords: ['mime', 'mimer', 'visio', 'camera', 'deviner'],
  },
];

/** Places « Bientôt » affichées après les jeux disponibles. */
export const SOON_SLOTS = 2;

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function matchesGame(game: GameInfo, query: string) {
  const q = fold(query);
  return !q || fold(game.name).includes(q) || game.keywords.some((k) => k.includes(q));
}

export function matchesSoon(query: string) {
  const q = fold(query);
  return !q || ['bientot', 'nouveau', 'prochain'].some((k) => k.includes(q));
}

/** Jeu choisi sur l'accueil, gardé pour le régler par défaut dans le salon. */
export function saveChosenGame(id: GameId) {
  try {
    localStorage.setItem('julaika:game', JSON.stringify(id));
  } catch {}
}

export function chosenGame(): GameId {
  try {
    const v = JSON.parse(localStorage.getItem('julaika:game') ?? 'null');
    return GAMES.some((g) => g.id === v) ? v : 'dessin';
  } catch {
    return 'dessin';
  }
}
