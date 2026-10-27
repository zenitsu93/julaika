// Socle des jeux d'action, sans dépendance : les physiques l'importent, arcade.ts le réexporte.

/** Monde commun aux trois jeux, en pixels logiques (16:9). */
export const ARCADE_W = 800;
export const ARCADE_H = 450;

/** Pas de la physique et cadence d'envoi des images. */
export const ARCADE_HZ = 60;
export const ARCADE_DT = 1 / ARCADE_HZ;
export const ARCADE_SEND_EVERY = 2;
/** Retard d'affichage côté client : au moins deux images d'avance pour interpoler. */
export const ARCADE_DELAY_MS = 100;

/** Touches, en bits : un seul nombre circule. */
export const Key = {
  Left: 1,
  Right: 2,
  Up: 4,
  Action: 8,
  Super: 16,
} as const;
export const KEY_MASK = 31;

/**
 * Ce qui se passe dans le monde et mérite un effet chez le client (son, plumes, cœurs).
 * side : le joueur à l'origine (0 gauche, 1 droite) ; x, y : où ; v : une intensité.
 */
export type ArcadeEventKind = 'goal' | 'kick' | 'super' | 'post' | 'hit' | 'fall' | 'hug' | 'catch' | 'storm' | 'kiss' | 'combo';
export interface ArcadeEvent {
  e: ArcadeEventKind;
  side?: 0 | 1;
  x?: number;
  y?: number;
  v?: number;
}

/** Une partie en cours, quelle que soit sa physique. */
export interface ArcadeSim {
  /** Avance d'un pas de 1/60 s avec les touches des deux joueurs. */
  step(keys: readonly [number, number], random: () => number): ArcadeEvent[];
  /** Image du monde envoyée aux clients. */
  frame(): number[];
  /** Duel : points de chaque camp. Coopératif : score commun, recopié dans les deux cases. */
  readonly score: [number, number];
  /** Fin avant la sonnerie : 5 buts, 3 chutes, plus de vies. */
  readonly over: boolean;
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
