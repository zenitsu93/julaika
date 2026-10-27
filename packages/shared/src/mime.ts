// Mode mime du Dessin : le mimeur joue le mot devant sa caméra, sans parler. Toutes les 20 s,
// une consigne surprise change sa façon de mimer ; chaque fois que quelqu'un trouve, sa caméra
// tire un polaroid, et les tirages de la partie forment une planche à la fin.

/** Un polaroid pris au moment où quelqu'un trouve. Les noms y sont figés : la planche survit aux départs. */
export interface MimeShot {
  id: number;
  round: number;
  word: string;
  mimerId: string;
  mimerName: string;
  finderId: string;
  finderName: string;
  /** Data URL JPEG carrée (voir PHOTO_SIZE), ou null si le mimeur n'avait pas de caméra. */
  image: string | null;
  /** Avatar du mimeur, pour le tirage sans caméra. */
  avatar: number;
}

/** Consigne surprise en cours ; `n` grandit à chaque tirage pour rejouer l'animation. */
export interface MimeTwist {
  n: number;
  emoji: string;
  text: string;
}

/** Une consigne surprise toutes les 20 secondes de mime. */
export const MIME_TWIST_EVERY = 20;
/** Pas de nouvelle consigne dans les dernières secondes du tour. */
export const MIME_TWIST_MARGIN = 6;
/** Polaroids gardés par partie, pour ne pas gonfler la mémoire du serveur. */
export const MIME_MAX_SHOTS = 30;

export const MIME_TWISTS: readonly { emoji: string; text: string }[] = [
  { emoji: '🐢', text: 'Au ralenti' },
  { emoji: '🤖', text: 'Comme un robot' },
  { emoji: '⏩', text: 'En accéléré' },
  { emoji: '✋', text: "D'une seule main" },
  { emoji: '🥶', text: 'Comme si tu grelottais' },
  { emoji: '🎭', text: 'Comme au théâtre, en exagérant tout' },
  { emoji: '🐈', text: 'Comme un chat' },
  { emoji: '🫧', text: "Comme sous l'eau" },
  { emoji: '🙈', text: 'Les yeux fermés' },
  { emoji: '💃', text: 'En dansant' },
  { emoji: '😴', text: 'En train de bâiller' },
  { emoji: '👵', text: 'Comme une mamie de 90 ans' },
  { emoji: '🦩', text: 'Sur un pied' },
  { emoji: '🤫', text: 'En tout petit, discrètement' },
  { emoji: '😠', text: 'Très en colère' },
  { emoji: '😍', text: 'Follement amoureux' },
  { emoji: '🎬', text: 'Comme un film muet en noir et blanc' },
  { emoji: '🌀', text: 'En tournant sur toi-même' },
];
