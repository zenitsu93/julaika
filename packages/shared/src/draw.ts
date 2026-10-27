// Protocole binaire du dessin.
// En-tête 4 octets : [op, couleur, taille, 0] puis des paires (x, y) en Uint16 little-endian.
// Un trait de 60 points pèse ~244 octets, contre ~1,5 Ko en JSON.

import { CANVAS_H, CANVAS_W } from './protocol';

export const DrawOp = {
  /** Début d'un trait (porte couleur + taille). */
  Begin: 1,
  /** Points supplémentaires du trait en cours. */
  Extend: 2,
  /** Remplissage (pot de peinture) au point donné. */
  Fill: 3,
} as const;
export type DrawOp = (typeof DrawOp)[keyof typeof DrawOp];

export interface DrawPacket {
  op: DrawOp;
  color: number;
  size: number;
  points: number[]; // [x0, y0, x1, y1, ...]
}

const HEADER = 4;
export const MAX_POINTS_PER_PACKET = 512;

export function encodeDraw(p: DrawPacket): ArrayBuffer {
  const n = Math.min(p.points.length >> 1, MAX_POINTS_PER_PACKET);
  const buf = new ArrayBuffer(HEADER + n * 4);
  const v = new DataView(buf);
  v.setUint8(0, p.op);
  v.setUint8(1, p.color);
  v.setUint8(2, p.size);
  for (let i = 0; i < n; i++) {
    v.setUint16(HEADER + i * 4, clamp(p.points[i * 2]!, CANVAS_W), true);
    v.setUint16(HEADER + i * 4 + 2, clamp(p.points[i * 2 + 1]!, CANVAS_H), true);
  }
  return buf;
}

export function decodeDraw(data: ArrayBuffer | Uint8Array): DrawPacket | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength < HEADER || (bytes.byteLength - HEADER) % 4 !== 0) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const op = v.getUint8(0);
  if (op < DrawOp.Begin || op > DrawOp.Fill) return null;
  const n = (bytes.byteLength - HEADER) / 4;
  if (n > MAX_POINTS_PER_PACKET || (op !== DrawOp.Extend && n === 0)) return null;
  const points = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) {
    points[i * 2] = v.getUint16(HEADER + i * 4, true);
    points[i * 2 + 1] = v.getUint16(HEADER + i * 4 + 2, true);
  }
  return { op: op as DrawOp, color: v.getUint8(1), size: v.getUint8(2), points };
}

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

/**
 * Remplissage par lignes de balayage sur un buffer RGBA.
 * Tolérance faible pour absorber l'anticrénelage des traits.
 */
export function floodFill(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgb: [number, number, number],
  tolerance = 48,
): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const start = (y * width + x) * 4;
  const sr = pixels[start]!, sg = pixels[start + 1]!, sb = pixels[start + 2]!;
  const [fr, fg, fb] = rgb;
  if (Math.abs(sr - fr) + Math.abs(sg - fg) + Math.abs(sb - fb) === 0) return;

  const seen = new Uint8Array(width * height);
  const match = (i: number) => {
    const o = i * 4;
    return (
      !seen[i] &&
      Math.abs(pixels[o]! - sr) + Math.abs(pixels[o + 1]! - sg) + Math.abs(pixels[o + 2]! - sb) <= tolerance
    );
  };
  const paint = (i: number) => {
    const o = i * 4;
    pixels[o] = fr;
    pixels[o + 1] = fg;
    pixels[o + 2] = fb;
    pixels[o + 3] = 255;
    seen[i] = 1;
  };

  const stack = [x, y];
  while (stack.length) {
    const cy = stack.pop()!;
    let cx = stack.pop()!;
    let i = cy * width + cx;
    while (cx > 0 && match(i - 1)) { cx--; i--; }
    let up = false, down = false;
    for (; cx < width && match(i); cx++, i++) {
      paint(i);
      if (cy > 0) {
        const m = match(i - width);
        if (m && !up) stack.push(cx, cy - 1);
        up = m;
      }
      if (cy < height - 1) {
        const m = match(i + width);
        if (m && !down) stack.push(cx, cy + 1);
        down = m;
      }
    }
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
