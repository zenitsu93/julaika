// Cerveau coupé : un seul dessin à deux, en coopération. Selon la manche, l'un voit le modèle
// et guide l'autre à la voix, chacun dessine sa moitié, ou l'un n'a que des droites et l'autre
// que des courbes. À la fin, le modèle se pose sur le dessin et on mesure la ressemblance.

import { CANVAS_W } from './protocol';

/** Les trois façons de jouer, et « mixte » qui les enchaîne. */
export const CERVEAU_KINDS = ['guide', 'moitie', 'lignes'] as const;
export type CerveauKind = (typeof CERVEAU_KINDS)[number];
export const CERVEAU_MODES = [...CERVEAU_KINDS, 'mixte'] as const;
export type CerveauMode = (typeof CERVEAU_MODES)[number];

export function isCerveauMode(v: unknown): v is CerveauMode {
  return (CERVEAU_MODES as readonly unknown[]).includes(v);
}

/** Manche `turn` : le mode réglé, ou les trois à tour de rôle en mixte. */
export function cerveauKind(mode: CerveauMode, turn: number): CerveauKind {
  return mode === 'mixte' ? CERVEAU_KINDS[turn % CERVEAU_KINDS.length]! : mode;
}

/**
 * Le binôme d'une manche, et ce que fait chacun (même ordre que `duo`) :
 * guide → [guide, artiste] ; moitie → [gauche, droite] ; lignes → [droites, courbes].
 */
export interface CerveauState {
  turn: number;
  turns: number;
  kind: CerveauKind;
  duo: [string, string];
  /** Fin du briefing (ms serveur) : on ne dessine qu'après le « 3, 2, 1 ». */
  goAt: number;
  /** Modèle vu par ce joueur (null pour l'artiste guidé, tant que le dessin n'est pas révélé). */
  model: CerveauModel | null;
  /** Membres du binôme qui ont dit « on a fini ». */
  done: string[];
  /** Ressemblance de la manche, en %, une fois révélée. */
  score: number | null;
  /** Ressemblance de chaque manche jouée, pour la jauge de complicité. */
  scores: number[];
}

export interface CerveauModel {
  id: string;
  /** Ce que c'est, à ne pas dire en mode guide. */
  name: string;
  /** Tracés en coordonnées du tableau (800 × 600) : [x0, y0, x1, y1, …]. */
  paths: number[][];
}

/** Briefing avant chaque dessin (s) et révélation (s). */
export const CERVEAU_BRIEF = 4;
export const CERVEAU_REVEAL = 12;
/** Milieu du tableau, frontière du mode « moitié chacun ». */
export const CERVEAU_SPLIT = CANVAS_W / 2;

// ---- Modèles ------------------------------------------------------------------

const round = (n: number) => Math.round(n);

/** Arc d'ellipse de a0 à a1 (degrés, 0 = droite, 90 = bas), avec une rotation éventuelle. */
function arc(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0): number[] {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) / 360) * 40));
  const r = (rot * Math.PI) / 180;
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    out.push(round(cx + x * Math.cos(r) - y * Math.sin(r)), round(cy + x * Math.sin(r) + y * Math.cos(r)));
  }
  return out;
}
const circle = (cx: number, cy: number, r: number) => arc(cx, cy, r, r);
const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];

function star(cx: number, cy: number, R: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const k = i % 2 ? r : R;
    out.push(round(cx + k * Math.cos(a)), round(cy + k * Math.sin(a)));
  }
  return out;
}

function heart(cx: number, cy: number, s: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push(round(cx + x * s), round(cy - y * s));
  }
  return out;
}

function spiral(cx: number, cy: number, r: number, turns: number): number[] {
  const out: number[] = [];
  const n = turns * 36;
  for (let i = 0; i <= n; i++) {
    const a = (i / 36) * Math.PI * 2;
    const k = r * (1 - i / n) + 6;
    out.push(round(cx + k * Math.cos(a)), round(cy + k * Math.sin(a)));
  }
  return out;
}

/** Des dessins faits de formes simples : faciles à décrire, durs à réussir sans les voir. */
export const CERVEAU_MODELS: CerveauModel[] = [
  {
    id: 'maison',
    name: 'Une maison',
    paths: [rect(250, 280, 550, 500), [230, 280, 400, 140, 570, 280], rect(370, 400, 430, 500), rect(280, 320, 340, 370), rect(460, 320, 520, 370), [480, 200, 480, 150, 520, 150, 520, 233]],
  },
  {
    id: 'soleil',
    name: 'Un soleil',
    paths: [
      circle(400, 300, 90),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return [round(400 + 125 * Math.cos(a)), round(300 + 125 * Math.sin(a)), round(400 + 190 * Math.cos(a)), round(300 + 190 * Math.sin(a))];
      }),
    ],
  },
  {
    id: 'sourire',
    name: 'Un visage qui sourit',
    paths: [circle(400, 300, 190), circle(330, 240, 20), circle(470, 240, 20), arc(400, 300, 115, 95, 25, 155)],
  },
  {
    id: 'poisson',
    name: 'Un poisson',
    paths: [arc(370, 300, 170, 95), [530, 300, 650, 210, 650, 390, 530, 300], circle(280, 275, 14), arc(380, 215, 60, 40, 200, 340)],
  },
  {
    id: 'arbre',
    name: 'Un arbre',
    paths: [[370, 500, 370, 360], [430, 360, 430, 500], circle(400, 240, 135), [220, 500, 580, 500]],
  },
  {
    id: 'fleur',
    name: 'Une fleur',
    paths: [
      circle(400, 200, 36),
      ...Array.from({ length: 6 }, (_, i) => {
        const a = i * 60;
        const r = (a * Math.PI) / 180;
        return arc(round(400 + 85 * Math.cos(r)), round(200 + 85 * Math.sin(r)), 50, 30, 0, 360, a);
      }),
      [400, 290, 400, 540],
      arc(450, 440, 50, 20, 0, 360, -30),
    ],
  },
  {
    id: 'fusee',
    name: 'Une fusée',
    paths: [[360, 450, 360, 220, 400, 110, 440, 220, 440, 450, 360, 450], circle(400, 260, 22), [360, 370, 300, 470, 360, 450], [440, 370, 500, 470, 440, 450], [375, 450, 388, 520, 400, 475, 412, 520, 425, 450]],
  },
  {
    id: 'bateau',
    name: 'Un voilier',
    paths: [[200, 390, 600, 390, 530, 470, 270, 470, 200, 390], [400, 390, 400, 110], [400, 130, 400, 350, 560, 350, 400, 130], [150, 530, 220, 505, 290, 530, 360, 505, 430, 530, 500, 505, 570, 530, 640, 505]],
  },
  { id: 'coeur', name: 'Un cœur', paths: [heart(400, 300, 13)] },
  { id: 'etoile', name: 'Une étoile', paths: [star(400, 315, 230, 92)] },
  {
    id: 'bonhomme',
    name: 'Un bonhomme de neige',
    paths: [circle(400, 440, 110), circle(400, 255, 78), circle(400, 130, 52), [400, 140, 460, 150, 400, 155]],
  },
  {
    id: 'lunettes',
    name: 'Des lunettes',
    paths: [circle(290, 300, 85), circle(510, 300, 85), arc(400, 300, 26, 22, 200, 340), [205, 290, 130, 250], [595, 290, 670, 250]],
  },
  {
    id: 'tasse',
    name: 'Une tasse fumante',
    paths: [[290, 240, 315, 470, 485, 470, 510, 240, 290, 240], arc(505, 340, 60, 65, -80, 80), [350, 210, 335, 175, 355, 140, 340, 100], [420, 210, 405, 175, 425, 140, 410, 100]],
  },
  {
    id: 'parapluie',
    name: 'Un parapluie',
    paths: [arc(400, 300, 230, 170, 180, 360), arc(228, 300, 57, 30, 180, 360), arc(343, 300, 58, 30, 180, 360), arc(457, 300, 57, 30, 180, 360), arc(572, 300, 58, 30, 180, 360), [400, 300, 400, 480], arc(370, 480, 30, 30, 0, 180)],
  },
  {
    id: 'escargot',
    name: 'Un escargot',
    paths: [spiral(430, 320, 120, 3), [200, 450, 610, 450], [210, 450, 190, 370, 230, 360], [200, 375, 170, 300], [220, 365, 230, 290]],
  },
  {
    id: 'glace',
    name: 'Un cornet de glace',
    paths: [[320, 300, 480, 300, 400, 540, 320, 300], arc(400, 250, 95, 85, 165, 375), circle(400, 148, 18), [355, 360, 455, 360]],
  },
  {
    id: 'champignon',
    name: 'Un champignon',
    paths: [arc(400, 300, 210, 160, 180, 360), [190, 300, 610, 300], [345, 300, 330, 490, 470, 490, 455, 300], circle(320, 220, 25), circle(450, 190, 30), circle(520, 260, 18)],
  },
  {
    id: 'chat',
    name: 'Une tête de chat',
    paths: [
      circle(400, 330, 160),
      [285, 220, 290, 110, 370, 175],
      [430, 175, 510, 110, 515, 220],
      circle(340, 300, 18),
      circle(460, 300, 18),
      [385, 360, 415, 360, 400, 380, 385, 360],
      [330, 390, 220, 370],
      [330, 410, 220, 420],
      [470, 390, 580, 370],
      [470, 410, 580, 420],
    ],
  },
  {
    id: 'voiture',
    name: 'Une voiture',
    paths: [[150, 420, 150, 340, 260, 330, 320, 250, 500, 250, 570, 330, 650, 345, 650, 420, 150, 420], [340, 330, 370, 275, 450, 275, 470, 330, 340, 330], circle(260, 430, 48), circle(540, 430, 48)],
  },
  {
    id: 'lune',
    name: 'Une lune et une étoile',
    paths: [arc(360, 300, 180, 180, 60, 300), arc(450, 300, 150, 150, 117, 243), star(560, 210, 60, 24)],
  },
];

// ---- Ressemblance ---------------------------------------------------------------

const GRID = 48;
/** La grille déborde du modèle d'une demi-largeur de chaque côté, pour les traits à côté. */
const SIZE = GRID * 2;
/** Tolérance (en cases de la grille) entre un trait du modèle et un trait du dessin. */
const SLACK = 2;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Repère de la grille : case = o + point × k. */
interface Frame {
  k: number;
  ox: number;
  oy: number;
}

/**
 * Ressemblance entre le dessin et le modèle, de 0 à 100. Le modèle est tracé sur une grille de
 * 48 cases de large, le dessin aussi, puis on compare : quelle part du modèle le dessin recouvre,
 * et quelle part du dessin tombe sur le modèle (à deux cases près). On garde la meilleure de deux
 * lectures : le dessin à sa place sur le tableau, ou recadré sur la taille du modèle (un dessin
 * juste mais décalé ou plus petit compte aussi). Le score part de la moyenne harmonique des deux.
 */
export function cerveauScore(model: number[][], drawing: number[][]): number {
  const mb = bounds(model);
  const db = bounds(drawing);
  if (!mb || !db) return 0;
  const frame = frameOf(mb);
  const m = rasterize(model, frame);
  return Math.max(compare(m, rasterize(drawing, frame)), compare(m, rasterize(drawing, frameOf(db))));
}

function compare(m: Uint8Array, d: Uint8Array): number {
  const recall = cover(m, dilate(d));
  const precision = cover(d, dilate(m));
  if (!recall || !precision) return 0;
  const f1 = (2 * recall * precision) / (recall + precision);
  // Deux dessins sans rapport se recouvrent déjà à 30-40 % : on part de là.
  return Math.round(100 * Math.max(0, Math.min(1, (f1 - 0.4) / 0.55)));
}

function bounds(paths: number[][]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths)
    for (let i = 0; i + 1 < p.length; i += 2) {
      x0 = Math.min(x0, p[i]!);
      x1 = Math.max(x1, p[i]!);
      y0 = Math.min(y0, p[i + 1]!);
      y1 = Math.max(y1, p[i + 1]!);
    }
  // Un point ou un gribouillis minuscule ne se compare à rien.
  return Math.max(x1 - x0, y1 - y0) >= 24 ? { x0, y0, x1, y1 } : null;
}

/** La boîte occupe les 48 cases du milieu de la grille, centrée. */
function frameOf(b: Box): Frame {
  const k = (GRID - 1) / Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return { k, ox: (SIZE - (b.x1 - b.x0) * k) / 2 - b.x0 * k, oy: (SIZE - (b.y1 - b.y0) * k) / 2 - b.y0 * k };
}

function rasterize(paths: number[][], { k, ox, oy }: Frame): Uint8Array {
  const grid = new Uint8Array(SIZE * SIZE);
  const clampCell = (v: number) => Math.max(0, Math.min(SIZE - 1, Math.round(v)));
  const plot = (x: number, y: number) => {
    grid[clampCell(oy + y * k) * SIZE + clampCell(ox + x * k)] = 1;
  };
  for (const p of paths) {
    if (p.length >= 2) plot(p[0]!, p[1]!);
    for (let i = 2; i + 1 < p.length; i += 2) {
      const ax = p[i - 2]!, ay = p[i - 1]!, bx = p[i]!, by = p[i + 1]!;
      const steps = Math.max(1, Math.ceil((Math.hypot(bx - ax, by - ay) * k) / 0.5));
      for (let s = 1; s <= steps; s++) plot(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
    }
  }
  return grid;
}

function dilate(grid: Uint8Array): Uint8Array {
  const out = new Uint8Array(grid.length);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (!grid[y * SIZE + x]) continue;
      for (let dy = -SLACK; dy <= SLACK; dy++)
        for (let dx = -SLACK; dx <= SLACK; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && dx * dx + dy * dy <= SLACK * SLACK + 1) out[ny * SIZE + nx] = 1;
        }
    }
  return out;
}

/** Part des cases de `a` recouvertes par `b`. */
function cover(a: Uint8Array, b: Uint8Array): number {
  let n = 0, hit = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    n++;
    if (b[i]) hit++;
  }
  return n ? hit / n : 0;
}
