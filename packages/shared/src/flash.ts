// Flash : une image s'affiche trois secondes, puis chacun la redessine de mémoire en quinze
// secondes, avec ses trois couleurs seulement. Les croquis entourent l'original, et on note
// la ressemblance.

import type { DrawPacket } from './draw';
import { PALETTE } from './protocol';

/** Un croquis de la manche, envoyé à tous au moment du vote. */
export interface FlashSketch {
  by: string;
  name: string;
  avatar: number;
  strokes: DrawPacket[];
}

export interface FlashState {
  /** Manche en cours, à partir de 1. */
  round: number;
  rounds: number;
  /** Joueurs de la partie. */
  players: string[];
  /** Dessin : qui a rendu son croquis. Vote : qui a fini de noter. */
  done: string[];
  /** Image de la manche (index dans FLASH_IMAGES) : montrée à la mémorisation, cachée pendant le dessin, dévoilée au vote. */
  image: number | null;
  /** Les trois couleurs de la manche (index de PALETTE). */
  colors: number[];
  /** Mémorisation : l'image apparaît à cette heure serveur (ms) et disparaît à `endsAt`. */
  showAt: number | null;
  /** Révélation : étoiles reçues par croquis (somme) et nombre de notes. Vide avant. */
  stars: Record<string, { total: number; votes: number }>;
}

/** « Prêt ? 3, 2, 1 » avant l'image (s). */
export const FLASH_READY_TIME = 3;
/** Temps d'affichage de l'image (s). */
export const FLASH_SHOW_TIME = 3;
/** Temps pour la redessiner de mémoire (s). */
export const FLASH_DRAW_TIME = 15;
export const FLASH_VOTE_TIME = 30;
export const FLASH_REVEAL_TIME = 9;
/** Note de ressemblance de 1 à 5 étoiles ; chaque étoile reçue rapporte ces points. */
export const FLASH_MAX_STARS = 5;
export const FLASH_STAR_POINTS = 20;

export interface FlashImage {
  name: string;
  /** Les trois seules couleurs permises pour la redessiner (index de PALETTE), la gomme en plus. */
  colors: readonly [number, number, number];
  /** Contenu SVG pour un viewBox 0 0 800 600 ; {0}, {1}, {2} sont remplacés par les couleurs. */
  body: string;
}

/** Étoile à cinq branches, en liste de points pour un polygone. */
function star(cx: number, cy: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.42 : r;
    return `${Math.round(cx + d * Math.cos(a))},${Math.round(cy + d * Math.sin(a))}`;
  }).join(' ');
}

const S = 'stroke-width="16" stroke-linecap="round" stroke-linejoin="round"';

/**
 * Dessins maison, sans droits : formes franches, faciles à retenir en trois secondes et à
 * refaire en quinze. Chacun n'utilise que ses trois couleurs, sur fond blanc.
 */
export const FLASH_IMAGES: readonly FlashImage[] = [
  {
    name: 'La maison au soleil',
    colors: [2, 10, 4],
    body: `<circle cx="660" cy="120" r="60" fill="{2}"/>
<rect x="250" y="300" width="300" height="220" fill="none" stroke="{1}" ${S}/>
<polygon points="200,310 400,140 600,310" fill="{0}"/>
<rect x="370" y="410" width="60" height="110" fill="{1}"/>
<rect x="285" y="345" width="60" height="50" fill="none" stroke="{1}" stroke-width="12"/>`,
  },
  {
    name: 'Le voilier',
    colors: [7, 2, 6],
    body: `<line x1="400" y1="110" x2="400" y2="390" stroke="{0}" ${S}/>
<polygon points="415,125 415,370 590,370" fill="{1}"/>
<polygon points="385,170 385,370 250,370" fill="{1}" opacity=".85"/>
<path d="M170 390 H630 L550 470 H250 Z" fill="{0}"/>
<path d="M60 530 q50 -40 100 0 t100 0 t100 0 t100 0 t100 0 t100 0 t100 0" fill="none" stroke="{2}" ${S}/>`,
  },
  {
    name: 'Le sapin étoilé',
    colors: [5, 10, 4],
    body: `<polygon points="400,120 520,280 280,280" fill="{0}"/>
<polygon points="400,200 570,400 230,400" fill="{0}"/>
<rect x="365" y="400" width="70" height="110" fill="{1}"/>
<polygon points="${star(400, 85, 50)}" fill="{2}"/>`,
  },
  {
    name: 'Le bonhomme de neige',
    colors: [12, 3, 2],
    body: `<circle cx="400" cy="410" r="120" fill="none" stroke="{0}" ${S}/>
<circle cx="400" cy="215" r="80" fill="none" stroke="{0}" ${S}/>
<circle cx="372" cy="195" r="11" fill="{0}"/><circle cx="428" cy="195" r="11" fill="{0}"/>
<polygon points="400,215 400,240 480,228" fill="{1}"/>
<rect x="320" y="280" width="160" height="30" rx="12" fill="{2}"/>
<rect x="440" y="290" width="30" height="80" rx="10" fill="{2}"/>
<circle cx="400" cy="380" r="12" fill="{0}"/><circle cx="400" cy="440" r="12" fill="{0}"/>`,
  },
  {
    name: 'La tête de chat',
    colors: [3, 12, 9],
    body: `<polygon points="255,250 280,90 380,190" fill="{0}"/>
<polygon points="545,250 520,90 420,190" fill="{0}"/>
<polygon points="285,200 295,135 345,185" fill="{2}"/>
<polygon points="515,200 505,135 455,185" fill="{2}"/>
<circle cx="400" cy="330" r="170" fill="{0}"/>
<ellipse cx="335" cy="300" rx="18" ry="30" fill="{1}"/><ellipse cx="465" cy="300" rx="18" ry="30" fill="{1}"/>
<polygon points="380,360 420,360 400,385" fill="{2}"/>
<path d="M400 385 v20 M400 405 q-25 25 -50 5 M400 405 q25 25 50 5" fill="none" stroke="{1}" stroke-width="10" stroke-linecap="round"/>
<path d="M300 380 h-120 M300 400 l-110 30 M500 380 h120 M500 400 l110 30" stroke="{1}" stroke-width="8" stroke-linecap="round"/>`,
  },
  {
    name: 'La glace chocolat-fraise',
    colors: [16, 9, 11],
    body: `<polygon points="300,300 500,300 400,550" fill="{0}"/>
<path d="M330 360 L460 340 M350 420 L440 405" stroke="#ffffff" stroke-width="8" opacity=".5"/>
<circle cx="400" cy="270" r="95" fill="{1}"/>
<circle cx="400" cy="145" r="85" fill="{2}"/>
<circle cx="410" cy="62" r="18" fill="{1}"/>`,
  },
  {
    name: 'La fusée',
    colors: [7, 2, 3],
    body: `<path d="M330 440 V230 Q400 60 470 230 V440 Z" fill="none" stroke="{0}" ${S}/>
<path d="M343 200 Q400 75 457 200 Z" fill="{1}"/>
<circle cx="400" cy="290" r="40" fill="none" stroke="{0}" stroke-width="14"/>
<polygon points="330,360 250,470 330,440" fill="{1}"/>
<polygon points="470,360 550,470 470,440" fill="{1}"/>
<polygon points="350,450 450,450 400,560" fill="{2}"/>`,
  },
  {
    name: 'La fleur',
    colors: [9, 4, 5],
    body: `<path d="M400 300 V560" stroke="{2}" ${S}/>
<path d="M400 470 q80 -70 150 -40 q-60 70 -150 40 Z" fill="{2}"/>
${[0, 72, 144, 216, 288].map((a) => `<circle cx="${Math.round(400 + 85 * Math.cos(((a - 90) * Math.PI) / 180))}" cy="${Math.round(220 + 85 * Math.sin(((a - 90) * Math.PI) / 180))}" r="62" fill="{0}"/>`).join('')}
<circle cx="400" cy="220" r="50" fill="{1}"/>`,
  },
  {
    name: 'Le poisson',
    colors: [3, 12, 6],
    body: `<polygon points="560,300 700,200 700,400" fill="{0}"/>
<ellipse cx="400" cy="300" rx="190" ry="120" fill="{0}"/>
<circle cx="300" cy="270" r="18" fill="{1}"/>
<path d="M260 340 q30 20 60 0" fill="none" stroke="{1}" stroke-width="10" stroke-linecap="round"/>
<circle cx="170" cy="190" r="22" fill="none" stroke="{2}" stroke-width="10"/>
<circle cx="130" cy="120" r="32" fill="none" stroke="{2}" stroke-width="10"/>`,
  },
  {
    name: 'Le champignon',
    colors: [2, 23, 5],
    body: `<path d="M120 540 H680" stroke="{2}" ${S}/>
<rect x="340" y="320" width="120" height="220" rx="40" fill="{1}"/>
<path d="M170 330 Q400 20 630 330 Z" fill="{0}"/>
<circle cx="300" cy="250" r="30" fill="#ffffff"/><circle cx="420" cy="170" r="36" fill="#ffffff"/><circle cx="530" cy="275" r="26" fill="#ffffff"/>`,
  },
  {
    name: 'La petite voiture',
    colors: [6, 12, 4],
    body: `<path d="M140 400 V320 H250 L320 220 H500 L580 320 H660 V400 Z" fill="{0}"/>
<path d="M345 245 H475 L530 320 H300 Z" fill="#ffffff"/>
<line x1="410" y1="245" x2="410" y2="320" stroke="{0}" stroke-width="14"/>
<circle cx="260" cy="410" r="55" fill="{1}"/><circle cx="540" cy="410" r="55" fill="{1}"/>
<circle cx="640" cy="345" r="18" fill="{2}"/>`,
  },
  {
    name: 'Un grand sourire',
    colors: [4, 11, 9],
    body: `<circle cx="400" cy="300" r="230" fill="{0}"/>
<ellipse cx="320" cy="230" rx="24" ry="40" fill="{1}"/><ellipse cx="480" cy="230" rx="24" ry="40" fill="{1}"/>
<path d="M260 340 Q400 500 540 340" fill="none" stroke="{1}" ${S}/>
<circle cx="255" cy="330" r="34" fill="{2}" opacity=".8"/><circle cx="545" cy="330" r="34" fill="{2}" opacity=".8"/>`,
  },
  {
    name: 'La tasse de cacao',
    colors: [11, 10, 16],
    body: `<path d="M220 260 H520 V420 Q520 520 420 520 H320 Q220 520 220 420 Z" fill="none" stroke="{0}" ${S}/>
<path d="M520 300 Q620 300 620 370 Q620 440 520 440" fill="none" stroke="{0}" ${S}/>
<path d="M236 290 H504" stroke="{1}" stroke-width="40"/>
<path d="M300 220 q-30 -40 0 -80 t0 -80 M380 220 q-30 -40 0 -80 t0 -80 M460 220 q-30 -40 0 -80 t0 -80" fill="none" stroke="{2}" stroke-width="12" stroke-linecap="round"/>
<path d="M170 540 H570" stroke="{0}" ${S}/>`,
  },
  {
    name: 'L’arc-en-ciel',
    colors: [2, 4, 6],
    body: `<path d="M120 480 A280 280 0 0 1 680 480" fill="none" stroke="{0}" stroke-width="44"/>
<path d="M170 480 A230 230 0 0 1 630 480" fill="none" stroke="{1}" stroke-width="44"/>
<path d="M220 480 A180 180 0 0 1 580 480" fill="none" stroke="{2}" stroke-width="44"/>
<path d="M80 500 q0 -60 60 -50 q20 -50 80 -20 q50 0 40 70 Z" fill="none" stroke="{2}" stroke-width="12" stroke-linejoin="round"/>`,
  },
  {
    name: 'L’escargot',
    colors: [10, 16, 5],
    body: `<path d="M80 520 H720" stroke="{2}" ${S}/>
<path d="M150 500 H600 Q660 500 660 440 L640 330" fill="none" stroke="{1}" stroke-width="40" stroke-linecap="round"/>
<path d="M630 330 l-20 -70 M650 330 l30 -60" stroke="{1}" stroke-width="10" stroke-linecap="round"/>
<circle cx="610" cy="255" r="12" fill="{1}"/><circle cx="682" cy="265" r="12" fill="{1}"/>
<path d="M400 340 m0 0 a20 20 0 1 1 40 0 a50 50 0 1 1 -100 0 a90 90 0 1 1 180 0 a130 130 0 1 1 -260 0" fill="none" stroke="{0}" stroke-width="20" stroke-linecap="round" transform="translate(-20 60)"/>`,
  },
  {
    name: 'La tranche de pastèque',
    colors: [5, 2, 12],
    body: `<path d="M130 200 A270 270 0 0 0 670 200 Z" fill="{0}"/>
<path d="M170 200 A230 230 0 0 0 630 200 Z" fill="{1}"/>
<ellipse cx="300" cy="270" rx="10" ry="18" fill="{2}"/><ellipse cx="400" cy="320" rx="10" ry="18" fill="{2}"/>
<ellipse cx="500" cy="270" rx="10" ry="18" fill="{2}"/><ellipse cx="350" cy="380" rx="10" ry="18" fill="{2}"/><ellipse cx="450" cy="380" rx="10" ry="18" fill="{2}"/>`,
  },
  {
    name: 'La montgolfière',
    colors: [2, 4, 10],
    body: `<path d="M400 60 C560 60 590 260 460 380 H340 C210 260 240 60 400 60 Z" fill="{0}"/>
<path d="M400 60 C460 100 470 280 430 380 H370 C330 280 340 100 400 60 Z" fill="{1}"/>
<path d="M345 385 L365 470 M455 385 L435 470" stroke="{2}" stroke-width="8"/>
<rect x="350" y="470" width="100" height="70" rx="8" fill="{2}"/>`,
  },
  {
    name: 'Le phare',
    colors: [2, 4, 7],
    body: `<polygon points="330,520 470,520 440,180 360,180" fill="none" stroke="{0}" ${S}/>
<polygon points="347,380 453,380 447,300 353,300" fill="{0}"/>
<rect x="345" y="110" width="110" height="70" fill="{1}"/>
<polygon points="335,110 465,110 400,60" fill="{0}"/>
<path d="M470 130 L700 70 M470 160 L700 220 M330 130 L100 70 M330 160 L100 220" stroke="{1}" stroke-width="12" stroke-linecap="round"/>
<path d="M60 550 q60 -40 120 0 t120 0 t120 0 t120 0 t120 0 t120 0" fill="none" stroke="{2}" ${S}/>`,
  },
];

/** Le dessin d'une image, couleurs remplies, prêt à poser dans un <svg viewBox="0 0 800 600">. */
export function flashSvg(image: FlashImage): string {
  return image.body.replace(/\{([012])\}/g, (_, i: string) => PALETTE[image.colors[Number(i)]!]!);
}
