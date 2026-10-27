// Fredonne ! : à chaque tour, un chanteur choisit une chanson et la fredonne au micro (seul son
// micro reste ouvert). Les autres tapent le titre : plus on trouve vite, plus on marque. Puis le
// micro passe au suivant.

import { levenshtein, normalize } from './text';
import type { Difficulty } from './protocol';

export interface FredSong {
  title: string;
  artist: string;
  /** Autres titres acceptés (titre anglais d'un dessin animé, refrain plus connu que le titre…). */
  aka?: string[];
}

export interface FredResult {
  song: FredSong;
  /** Points du tour, joueur par joueur (le chanteur compris). */
  gains: Record<string, number>;
}

export interface FredState {
  singerId: string;
  /** Tour en cours, à partir de 0, sur le nombre total de tours. */
  turn: number;
  turns: number;
  /** Les chansons proposées : au chanteur seulement, pendant le choix. */
  choices: FredSong[] | null;
  /** Le chanteur a déjà redemandé d'autres chansons ce tour-ci. */
  rerolled: boolean;
  /** La chanson : connue du chanteur et de ceux qui ont trouvé, de tous à la révélation. */
  song: FredSong | null;
  /** Titre masqué pour ceux qui cherchent (« _ _ _   _ _ »), avec les initiales au second indice. */
  mask: string | null;
  /** Premier indice : l'interprète, dévoilé en cours de tour. */
  artist: string | null;
  /** Consigne de style du tour (« bouche fermée »…), null = fredonne comme tu veux. */
  style: string | null;
  /** Qui a trouvé, dans l'ordre. */
  found: string[];
  result: FredResult | null;
}

/** Durées (s) : choix de la chanson, révélation. Le temps pour fredonner suit le réglage du salon. */
export const FRED_PICK = 15;
export const FRED_REVEAL = 7;
export const FRED_CHOICES = 3;
/** Moments des indices, en fraction du temps de fredonnement : l'interprète, puis les initiales. */
export const FRED_HINTS = [0.4, 0.7] as const;

/** Points : comme au Dessin, la rapidité plus un bonus pour les premiers ; le chanteur selon la part qui trouve. */
export function fredGain(remaining: number, rank: number): number {
  const r = Math.max(0, Math.min(1, remaining));
  return Math.round(50 + 400 * r + Math.max(0, 50 - rank * 10));
}

export function fredSingerGain(found: number, guessers: number): number {
  return guessers > 0 ? Math.round((300 * found) / guessers) : 0;
}

/** Titre comparable : sans accents, ponctuation ni article de tête (« Les Champs-Élysées » = « champs elysees »). */
export function songKey(s: string): string {
  return normalize(s)
    .replace(/['’`]/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/^(le|la|les|l|un|une|the|a) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SongGuess = 'correct' | 'close' | 'wrong';

/** Bon titre (ou un de ses alias), presque (une faute de frappe, deux sur un long titre), ou raté. */
export function checkSong(guess: string, song: FredSong): SongGuess {
  const g = songKey(guess);
  if (!g) return 'wrong';
  let close = false;
  for (const t of [song.title, ...(song.aka ?? [])]) {
    const k = songKey(t);
    if (g === k) return 'correct';
    const slack = k.length >= 10 ? 2 : k.length >= 4 ? 1 : 0;
    if (slack && levenshtein(g, k, slack) <= slack) close = true;
  }
  return close ? 'close' : 'wrong';
}

/** Titre masqué : la ponctuation et les espaces restent, les lettres de `shown` aussi. */
export function maskTitle(title: string, shown: ReadonlySet<number> = new Set()): string {
  return [...title].map((c, i) => (!/[\p{L}\p{N}]/u.test(c) || shown.has(i) ? c : '_')).join(' ');
}

/** Positions des initiales de chaque mot, pour le second indice. */
export function initials(title: string): Set<number> {
  const out = new Set<number>();
  [...title].forEach((c, i, all) => {
    if (/[\p{L}\p{N}]/u.test(c) && (i === 0 || !/[\p{L}\p{N}]/u.test(all[i - 1]!))) out.add(i);
  });
  return out;
}

/** Consignes de style, tirées une fois sur deux : le chanteur fredonne « à la manière de ». */
export const FRED_STYLES = [
  'Bouche fermée, que des « hmm hmm »',
  'Que des « la la la »',
  'En sifflant (ou en essayant)',
  'Avec une voix de robot',
  'Façon grand opéra',
  'En chuchotant',
  'Que des « pouet pouet »',
  'Tout doux, comme une berceuse',
  'En beatbox',
  'Deux fois plus lentement',
  'Avec des « na na na »',
  'Avec une voix de souris',
] as const;

/** Chansons à fredonner, par difficulté : facile = tout le monde les connaît, difficile = les classiques des parents. */
export const FRED_SONGS: Record<Difficulty, FredSong[]> = {
  facile: [
    { title: 'Joyeux anniversaire', artist: 'Traditionnel', aka: ['Happy Birthday', 'Bon anniversaire'] },
    { title: 'Frère Jacques', artist: 'Comptine' },
    { title: 'Au clair de la lune', artist: 'Comptine' },
    { title: 'La Marseillaise', artist: 'Hymne national' },
    { title: 'Vive le vent', artist: 'Chant de Noël', aka: ['Jingle Bells'] },
    { title: 'Petit Papa Noël', artist: 'Tino Rossi' },
    { title: 'Une souris verte', artist: 'Comptine' },
    { title: 'Il était un petit navire', artist: 'Comptine' },
    { title: 'Sur le pont d’Avignon', artist: 'Comptine' },
    { title: 'Alouette', artist: 'Comptine', aka: ['Alouette, gentille alouette'] },
    { title: 'Libérée, délivrée', artist: 'La Reine des neiges', aka: ['Let It Go', 'Liberee delivree'] },
    { title: 'Hakuna Matata', artist: 'Le Roi lion' },
    { title: 'Le lion est mort ce soir', artist: 'Henri Salvador', aka: ['The Lion Sleeps Tonight'] },
    { title: 'Happy', artist: 'Pharrell Williams' },
    { title: 'Macarena', artist: 'Los del Río' },
    { title: 'La Bamba', artist: 'Ritchie Valens' },
    { title: 'Despacito', artist: 'Luis Fonsi' },
    { title: 'We Will Rock You', artist: 'Queen' },
    { title: 'La Danse des canards', artist: 'J.J. Lionel' },
    { title: 'Les Champs-Élysées', artist: 'Joe Dassin', aka: ['Aux Champs-Élysées'] },
    { title: 'Alors on danse', artist: 'Stromae' },
    { title: 'Papaoutai', artist: 'Stromae', aka: ['Papa où t’es'] },
    { title: 'Dernière danse', artist: 'Indila' },
    { title: 'Seven Nation Army', artist: 'The White Stripes' },
    { title: 'Bella ciao', artist: 'Chant populaire' },
    { title: 'Dancing Queen', artist: 'ABBA' },
    { title: 'La Vie en rose', artist: 'Édith Piaf' },
    { title: 'Billie Jean', artist: 'Michael Jackson' },
    { title: 'Shape of You', artist: 'Ed Sheeran' },
    { title: 'Premier Gaou', artist: 'Magic System' },
    { title: 'Jerusalema', artist: 'Master KG' },
    { title: 'Ah ! Les crocodiles', artist: 'Comptine', aka: ['Les crocodiles'] },
  ],
  moyen: [
    { title: 'Formidable', artist: 'Stromae' },
    { title: 'Tous les mêmes', artist: 'Stromae' },
    { title: 'Je veux', artist: 'Zaz' },
    { title: 'Bella', artist: 'Maître Gims' },
    { title: 'Sapés comme jamais', artist: 'Maître Gims' },
    { title: 'Djadja', artist: 'Aya Nakamura' },
    { title: 'Pookie', artist: 'Aya Nakamura' },
    { title: 'Andalouse', artist: 'Kendji Girac' },
    { title: 'Balance ton quoi', artist: 'Angèle' },
    { title: 'Tout oublier', artist: 'Angèle' },
    { title: 'Ces soirées-là', artist: 'Yannick' },
    { title: 'Ella, elle l’a', artist: 'France Gall' },
    { title: 'Résiste', artist: 'France Gall' },
    { title: 'L’Aventurier', artist: 'Indochine' },
    { title: 'Je te promets', artist: 'Johnny Hallyday' },
    { title: 'Allumer le feu', artist: 'Johnny Hallyday' },
    { title: 'Il est où le bonheur', artist: 'Christophe Maé' },
    { title: 'Magic in the Air', artist: 'Magic System' },
    { title: 'Calm Down', artist: 'Rema' },
    { title: 'Waka Waka', artist: 'Shakira' },
    { title: 'Wannabe', artist: 'Spice Girls' },
    { title: 'Thriller', artist: 'Michael Jackson' },
    { title: 'Bohemian Rhapsody', artist: 'Queen' },
    { title: 'Africa', artist: 'Toto' },
    { title: 'Rolling in the Deep', artist: 'Adele' },
    { title: 'Hello', artist: 'Adele' },
    { title: 'Blinding Lights', artist: 'The Weeknd' },
    { title: 'Uptown Funk', artist: 'Mark Ronson et Bruno Mars' },
    { title: 'Gangnam Style', artist: 'PSY' },
    { title: 'Toxic', artist: 'Britney Spears' },
    { title: 'Single Ladies', artist: 'Beyoncé', aka: ['Single Ladies (Put a Ring on It)'] },
    { title: 'Don’t Stop Me Now', artist: 'Queen' },
    { title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  ],
  difficile: [
    { title: 'Les Lacs du Connemara', artist: 'Michel Sardou' },
    { title: 'La Javanaise', artist: 'Serge Gainsbourg' },
    { title: 'Le Sud', artist: 'Nino Ferrer' },
    { title: 'L’Été indien', artist: 'Joe Dassin' },
    { title: 'Mistral gagnant', artist: 'Renaud' },
    { title: 'Ne me quitte pas', artist: 'Jacques Brel' },
    { title: 'La Bohème', artist: 'Charles Aznavour' },
    { title: 'Comme d’habitude', artist: 'Claude François', aka: ['My Way'] },
    { title: 'Alexandrie Alexandra', artist: 'Claude François' },
    { title: 'Born to Be Alive', artist: 'Patrick Hernandez' },
    { title: 'Take On Me', artist: 'a-ha' },
    { title: 'Sweet Dreams', artist: 'Eurythmics' },
    { title: 'Every Breath You Take', artist: 'The Police' },
    { title: 'Hotel California', artist: 'Eagles' },
    { title: 'Stayin’ Alive', artist: 'Bee Gees' },
    { title: 'Imagine', artist: 'John Lennon' },
    { title: 'Hey Jude', artist: 'The Beatles' },
    { title: 'Yesterday', artist: 'The Beatles' },
    { title: 'Gimme! Gimme! Gimme!', artist: 'ABBA' },
    { title: 'Le Temps des cerises', artist: 'Chanson populaire' },
    { title: 'Les Démons de minuit', artist: 'Images' },
    { title: 'Nuit de folie', artist: 'Début de Soirée' },
    { title: 'Mon mec à moi', artist: 'Patricia Kaas' },
    { title: 'Foule sentimentale', artist: 'Alain Souchon' },
    { title: 'Le Chanteur', artist: 'Daniel Balavoine' },
    { title: 'Quand la musique est bonne', artist: 'Jean-Jacques Goldman' },
    { title: 'Envole-moi', artist: 'Jean-Jacques Goldman' },
    { title: 'Ça plane pour moi', artist: 'Plastic Bertrand' },
    { title: 'Voyage, voyage', artist: 'Desireless' },
    { title: 'Ève lève-toi', artist: 'Julie Pietri' },
    { title: 'Tata Yoyo', artist: 'Annie Cordy' },
  ],
};
