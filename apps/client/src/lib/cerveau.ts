import { CANVAS_H, CANVAS_W, type CerveauKind, type CerveauModel } from '@julaika/shared';
import { BoardCanvas } from './board';

/**
 * Cerveau coupé : un calque par membre du binôme, empilés (le premier porte le fond blanc).
 * Le serveur marque chaque paquet de son calque, `net` les range ici.
 */
export const inkLayers = [new BoardCanvas(), new BoardCanvas(true)] as const;

export function resetInk() {
  for (const layer of inkLayers) layer.reset();
}

/** Un dessin révélé, gardé pour l'album de fin (seulement ceux vus depuis l'arrivée dans le salon). */
export interface CerveauPage {
  turn: number;
  kind: CerveauKind;
  duo: [string, string];
  model: CerveauModel;
  score: number;
  image: string;
}

let pages: CerveauPage[] = [];
export const cerveauPages = {
  all: () => pages,
  add(page: CerveauPage) {
    pages = [...pages.filter((p) => p.turn !== page.turn), page].sort((a, b) => a.turn - b.turn);
  },
  reset() {
    pages = [];
  },
};

/** Les deux calques aplatis en une image réduite, pour l'album. */
export function flatten(): string {
  const full = document.createElement('canvas');
  full.width = CANVAS_W;
  full.height = CANVAS_H;
  const sheet = new BoardCanvas();
  sheet.attach(full);
  for (const layer of inkLayers) for (const p of layer.packets()) sheet.apply(p);
  const out = document.createElement('canvas');
  out.width = CANVAS_W / 2;
  out.height = CANVAS_H / 2;
  out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
