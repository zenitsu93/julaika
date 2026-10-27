// Jeux d'action à deux (Tête-à-tête, Bataille d'oreillers, Drap tendu) : la brique commune.
// Le serveur fait tourner la physique à 60 Hz et il est le seul juge ; les clients envoient
// seulement les touches enfoncées, à chaque changement. L'image du monde repart en binaire
// 30 fois par seconde ; le client la dessine avec 100 ms de retard pour interpoler en douceur.

import { type ArcadeSim } from './arcadeBase';
import { createDrap } from './drap';
import { createFoot } from './foot';
import { createOreillers } from './oreillers';

export * from './arcadeBase';

export const ARCADE_KINDS = ['foot', 'oreillers', 'drap'] as const;
export type ArcadeKind = (typeof ARCADE_KINDS)[number];

export function isArcadeKind(v: unknown): v is ArcadeKind {
  return (ARCADE_KINDS as readonly unknown[]).includes(v);
}

/** Premier octet des images binaires : les traits de dessin utilisent 1 à 3. */
export const ARCADE_OP = 0xa5;
const HEADER = 4;

export function encodeFrame(kind: ArcadeKind, seq: number, values: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER + values.length * 4);
  const v = new DataView(buf);
  v.setUint8(0, ARCADE_OP);
  v.setUint8(1, ARCADE_KINDS.indexOf(kind));
  v.setUint16(2, seq & 0xffff, true);
  const f = new Float32Array(buf, HEADER);
  for (let i = 0; i < values.length; i++) f[i] = values[i]!;
  return buf;
}

export function isArcadeFrame(data: ArrayBuffer): boolean {
  return data.byteLength >= HEADER && new Uint8Array(data)[0] === ARCADE_OP;
}

export function decodeFrame(data: ArrayBuffer): { kind: ArcadeKind; seq: number; values: Float32Array } | null {
  if (!isArcadeFrame(data) || (data.byteLength - HEADER) % 4 !== 0) return null;
  const v = new DataView(data);
  const kind = ARCADE_KINDS[v.getUint8(1)];
  if (!kind) return null;
  return { kind, seq: v.getUint16(2, true), values: new Float32Array(data, HEADER) };
}

export function createSim(kind: ArcadeKind, random: () => number): ArcadeSim {
  if (kind === 'foot') return createFoot(random);
  if (kind === 'oreillers') return createOreillers(random);
  return createDrap(random);
}

/** Durées (s) : face-à-face, partie selon le jeu, verdict. */
export const ARCADE_FACEOFF = 4;
export const ARCADE_VERDICT = 6;
export const ARCADE_DURATION: Record<ArcadeKind, number> = { foot: 90, oreillers: 75, drap: 60 };
export const ARCADE_COOP: Record<ArcadeKind, boolean> = { foot: false, oreillers: false, drap: true };

export interface ArcadeResult {
  /** Duel : le vainqueur, null en cas d'égalité. Toujours null en coopératif. */
  winner: string | null;
  /** Victoire avant la sonnerie (5 buts, 3 chutes). */
  ko: boolean;
  gains: Record<string, number>;
  /** Coopératif : score commun de la paire, et s'il bat le record du salon. */
  team?: number;
  record?: boolean;
}

export interface ArcadeState {
  kind: ArcadeKind;
  /** Le joueur de gauche (camp 0) et celui de droite (camp 1). */
  leftId: string;
  rightId: string;
  turn: number;
  turns: number;
  score: [number, number];
  /** Coopératif : meilleur score commun du salon. */
  best: number;
  result: ArcadeResult | null;
}

/**
 * Points : en duel, 100 au vainqueur plus 20 par point d'écart (50 de plus avant la sonnerie),
 * 10 par point marqué au perdant ; égalité, 50 chacun. En coopératif, 5 par point du score commun.
 */
export function arcadeGains(kind: ArcadeKind, score: readonly [number, number], ko: boolean): { left: number; right: number } {
  if (ARCADE_COOP[kind]) return { left: score[0] * 5, right: score[0] * 5 };
  const [a, b] = score;
  if (a === b) return { left: 50, right: 50 };
  const win = 100 + 20 * Math.abs(a - b) + (ko ? 50 : 0);
  return a > b ? { left: win, right: b * 10 } : { left: a * 10, right: win };
}

