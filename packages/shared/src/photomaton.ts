// Photomaton : une consigne d'expression absurde, un compte à rebours, un flash. Chacun fige
// sa caméra dans un polaroid ; les photos s'affichent côte à côte, puis tout le monde note.

/** Une photo de la manche, prise chez le joueur et envoyée en JPEG (data URL). */
export interface PhotoShot {
  by: string;
  name: string;
  avatar: number;
  /** null : pas de caméra au moment du flash. */
  image: string | null;
}

export interface PhotoState {
  /** Manche en cours, à partir de 1. */
  round: number;
  rounds: number;
  /** Consigne de la manche : elle sert aussi de légende aux polaroids. */
  prompt: string;
  /** Joueurs de la partie. */
  players: string[];
  /** Pose : qui a déjà envoyé sa photo. Vote : qui a fini de noter. */
  done: string[];
  /** Révélation : étoiles reçues par photo (somme) et nombre de notes. Vide avant. */
  stars: Record<string, { total: number; votes: number }>;
}

/** Lecture de la consigne, puis 3, 2, 1 : le flash tombe à `endsAt` (s). */
export const PHOTO_POSE_TIME = 8;
/** Secondes laissées pour que les photos arrivent après le flash. */
export const PHOTO_UPLOAD_GRACE = 6;
/** Toutes les photos reçues : la table attend encore ce délai après le flash (ms), le temps que le tirage sorte et se révèle. */
export const PHOTO_DEVELOP_MS = 3200;
export const PHOTO_VOTE_TIME = 30;
export const PHOTO_REVEAL_TIME = 9;
/** Côté de la photo carrée (px) et taille maximale de sa data URL (le WebSocket coupe à 64 Ko). */
export const PHOTO_SIZE = 360;
export const PHOTO_MAX_CHARS = 56_000;
/** Une note de 1 à 5 étoiles ; chaque étoile reçue rapporte ces points. */
export const PHOTO_MAX_STARS = 5;
export const PHOTO_STAR_POINTS = 20;

export function isPhotoDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.length <= PHOTO_MAX_CHARS && /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v);
}

/** Consignes d'expression : plus c'est absurde, mieux c'est. */
export const PHOTO_PROMPTS = [
  'Tu viens de voir un fantôme… qui te fait coucou',
  'Ton sourire quand le serveur apporte le dessert',
  'Tu as marché sur un Lego',
  'Tu essaies de retenir un éternuement',
  'Un pigeon vient de te voler ton sandwich',
  'Tu fais semblant d’avoir compris la blague',
  'Ta tête quand le Wi-Fi coupe en pleine partie',
  'Tu goûtes un citron pour la première fois',
  'Star de cinéma sur le tapis rouge',
  'Tu as gagné au loto mais tu restes discret',
  'Tu viens de te réveiller d’une sieste de 4 heures',
  'Un super-héros qui a oublié son pouvoir',
  'Ton regard quand quelqu’un mange ta dernière frite',
  'Tu entends ta chanson préférée au supermarché',
  'Mannequin pour une pub de dentifrice',
  'Tu essaies d’avoir l’air intelligent',
  'Tu viens de comprendre la fin du film',
  'Un chat qui voit un concombre',
  'Tu poses pour la photo de classe en 1995',
  'Méchant de dessin animé qui prépare un plan',
  'Tu reçois un cadeau que tu n’aimes pas',
  'Le sourire le plus grand du monde',
  'Tu es un poisson très surpris',
  'Influenceur qui découvre un smoothie',
] as const;
