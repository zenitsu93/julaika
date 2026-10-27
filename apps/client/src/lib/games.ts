// Catalogue des jeux de julaïka : l'accueil affiche une carte par entrée.
// Ajouter un jeu = l'ajouter ici (et retirer sa carte de SOON).

export type GameId = 'dessin' | 'mime' | 'wavelength' | 'motdujour' | 'telephone' | 'intrus' | 'petitbac' | 'connait' | 'bombe' | 'photomaton' | 'sourire' | 'interdits';

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
  {
    id: 'wavelength',
    name: 'Wavelength',
    pitch: 'Un indice, une aiguille : lisez-vous dans les pensées ?',
    players: 'À deux ou plus',
    badge: 'À deux',
    keywords: ['wavelength', 'onde', 'cadran', 'aiguille', 'cooperatif', 'duo', 'deux', 'couple', 'telepathe', 'visio'],
  },
  {
    id: 'motdujour',
    name: 'Mot du jour',
    pitch: 'Un mot, six essais, un classement chaque jour.',
    players: 'Solo · classement',
    badge: 'Quotidien',
    keywords: ['mot', 'jour', 'quotidien', 'wordle', 'lettres', 'solo', 'classement', 'deviner'],
  },
  {
    id: 'telephone',
    name: 'Téléphone dessiné',
    pitch: 'Une phrase devient un dessin, qui redevient une phrase…',
    players: '3 joueurs ou plus',
    badge: 'Nouveau',
    keywords: ['telephone', 'dessin', 'dessiner', 'chaine', 'phrase', 'album', 'gartic', 'deviner'],
  },
  {
    id: 'intrus',
    name: "L'Intrus",
    pitch: 'Tout le monde a le même mot, sauf un. Démasquez-le.',
    players: '3 joueurs ou plus',
    badge: 'Nouveau',
    keywords: ['intrus', 'imposteur', 'undercover', 'vote', 'mot', 'indice', 'bluff', 'deduction'],
  },
  {
    id: 'petitbac',
    name: 'Petit Bac',
    pitch: 'Une lettre, six catégories : le premier qui crie « Stop ! ».',
    players: '2 joueurs ou plus',
    badge: 'Nouveau',
    keywords: ['petit bac', 'bac', 'lettre', 'categories', 'mots', 'stop', 'vote', 'rapidite'],
  },
  {
    id: 'connait',
    name: 'Qui me connaît le mieux ?',
    pitch: 'Une question sur toi, les autres parient sur ta réponse.',
    players: 'À deux ou plus',
    badge: 'Nouveau',
    keywords: ['connait', 'connaitre', 'question', 'pari', 'amis', 'couple', 'duo', 'deux', 'quiz', 'soiree'],
  },
  {
    id: 'bombe',
    name: 'Bombe à mots',
    pitch: 'Un mot avec la syllabe, vite, avant que ça saute !',
    players: '2 à 16 joueurs',
    badge: 'Nouveau',
    keywords: ['bombe', 'bombparty', 'syllabe', 'mot', 'mots', 'rapidite', 'vies', 'clavier', 'explosion'],
  },
  {
    id: 'photomaton',
    name: 'Photomaton',
    pitch: 'Une grimace sur commande, un flash, un polaroid.',
    players: 'En visio · à deux ou plus',
    badge: 'Nouveau',
    keywords: ['photomaton', 'photo', 'polaroid', 'camera', 'visio', 'grimace', 'expression', 'selfie', 'vote', 'duo', 'deux'],
  },
  {
    id: 'sourire',
    name: 'Pas un sourire\u00a0!',
    pitch: 'Garde ton sérieux pendant que l’autre fait le pitre.',
    players: 'À deux ou plus · visio',
    badge: 'À deux',
    keywords: ['sourire', 'rire', 'tu ris tu perds', 'serieux', 'grimace', 'visio', 'camera', 'duo', 'deux', 'sons', 'bruitages'],
  },
  {
    id: 'interdits',
    name: 'Mots interdits',
    pitch: 'Fais deviner à voix haute, sans les mots défendus. Bzzz !',
    players: 'En visio · à deux ou plus',
    badge: 'Nouveau',
    keywords: ['interdit', 'interdits', 'tabou', 'taboo', 'mots', 'deviner', 'oral', 'parler', 'visio', 'buzz', 'buzzer', 'duo', 'deux', 'bruitages'],
  },
];

export type SoonId = 'fredonne' | 'agents';

/** Jeux en préparation, affichés en « Bientôt » après les jeux disponibles (ordre de la liste des jeux à faire). */
export const SOON: { id: SoonId; name: string; pitch: string; keywords: string[] }[] = [
  { id: 'fredonne', name: 'Fredonne !', pitch: 'Fredonne une chanson, les autres trouvent le titre.', keywords: ['fredonne', 'chanson', 'musique', 'micro', 'blind test'] },
  { id: 'agents', name: 'Agents secrets', pitch: 'Un indice pour relier plusieurs mots de ton équipe.', keywords: ['agents', 'secret', 'equipes', 'grille', 'codenames'] },
];

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export function matchesGame(game: GameInfo, query: string) {
  const q = fold(query);
  return !q || fold(game.name).includes(q) || game.keywords.some((k) => k.includes(q));
}

export function matchesSoon(game: (typeof SOON)[number], query: string) {
  const q = fold(query);
  return !q || fold(game.name).includes(q) || [...game.keywords, 'bientot', 'nouveau', 'prochain'].some((k) => k.includes(q));
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
