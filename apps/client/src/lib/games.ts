// Catalogue des jeux de julaïka : l'accueil affiche une carte par entrée.
// Ajouter un jeu = l'ajouter ici (et retirer sa carte de SOON).

export type GameId = 'dessin' | 'mime' | 'wavelength' | 'motdujour' | 'telephone' | 'intrus' | 'petitbac' | 'connait' | 'bombe' | 'photomaton' | 'sourire' | 'brasdefer' | 'flash' | 'cadavre' | 'interdits' | 'motamot' | 'agents' | 'fredonne' | 'alibi' | 'pitch';

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
    id: 'brasdefer',
    name: 'Bras de fer',
    pitch: 'Tapote, crie, pousse la jauge chez l’autre.',
    players: 'À deux ou plus · micro',
    badge: 'À deux',
    keywords: ['bras de fer', 'guerre des pouces', 'pouce', 'duel', 'jauge', 'tapoter', 'rapidite', 'micro', 'crier', 'voix', 'duo', 'deux'],
  },
  {
    id: 'flash',
    name: 'Flash',
    pitch: 'Trois secondes pour voir, quinze pour la redessiner.',
    players: 'À deux ou plus',
    badge: 'Nouveau',
    keywords: ['flash', 'memoire', 'dessin', 'dessiner', 'image', 'rapidite', 'couleurs', 'vote', 'duo', 'deux', 'flash draw'],
  },
  {
    id: 'cadavre',
    name: 'Cadavre exquis',
    pitch: 'Tête, corps, jambes : chacun son morceau, sans voir le reste.',
    players: 'À deux ou plus',
    badge: 'À deux',
    keywords: ['cadavre exquis', 'creature', 'monstre', 'dessin', 'dessiner', 'tete', 'corps', 'jambes', 'plier', 'duo', 'deux', 'couple', 'franken'],
  },
  {
    id: 'interdits',
    name: 'Mots interdits',
    pitch: 'Fais deviner à voix haute, sans les mots défendus. Bzzz !',
    players: 'En visio · à deux ou plus',
    badge: 'Nouveau',
    keywords: ['interdit', 'interdits', 'tabou', 'taboo', 'mots', 'deviner', 'oral', 'parler', 'visio', 'buzz', 'buzzer', 'duo', 'deux', 'bruitages'],
  },
  {
    id: 'motamot',
    name: 'Mot à mot',
    pitch: 'Une histoire à plusieurs, un mot chacun, 4 secondes.',
    players: 'À deux ou plus',
    badge: 'Nouveau',
    keywords: ['mot', 'mots', 'histoire', 'speed story', 'conte', 'ecrire', 'contrainte', 'voix', 'duo', 'deux', 'rapidite'],
  },
  {
    id: 'agents',
    name: 'Agents secrets',
    pitch: 'Un seul mot pour démasquer tous tes agents.',
    players: 'Duo coop · ou 2 équipes',
    badge: 'Nouveau',
    keywords: ['agents', 'secret', 'espion', 'equipes', 'grille', 'codenames', 'indice', 'mots', 'duo', 'deux', 'coop'],
  },
  {
    id: 'fredonne',
    name: 'Fredonne\u00a0!',
    pitch: 'Fredonne une chanson au micro, les autres trouvent le titre.',
    players: 'À deux ou plus · micro',
    badge: 'Nouveau',
    keywords: ['fredonne', 'fredonner', 'chanson', 'chanter', 'musique', 'micro', 'blind test', 'titre', 'visio', 'duo', 'deux'],
  },
  {
    id: 'alibi',
    name: "L'Alibi",
    pitch: 'Deux complices, 30 s pour accorder leur mensonge. Le juge veille.',
    players: '3 joueurs ou plus · visio',
    badge: 'Nouveau',
    keywords: ['alibi', 'juge', 'proces', 'tribunal', 'complices', 'mensonge', 'impro', 'histoire', 'visio', 'contradiction'],
  },
  {
    id: 'pitch',
    name: 'Pitch saboté',
    pitch: 'Vends un produit absurde en 60 s, malgré les diapos piégées.',
    players: 'À deux ou plus · visio',
    badge: 'À deux',
    keywords: ['pitch', 'sabote', 'startup', 'vendre', 'produit', 'diapo', 'diapos', 'impro', 'investisseur', 'visio', 'duo', 'deux', 'sons', 'bruitages'],
  },
];

/** Aucun jeu en préparation pour l'instant : la section « Bientôt » de l'accueil reste cachée. */
export type SoonId = never;

/** Jeux en préparation, affichés en « Bientôt » après les jeux disponibles (ordre de la liste des jeux à faire). */
export const SOON: { id: SoonId; name: string; pitch: string; keywords: string[] }[] = [];

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
