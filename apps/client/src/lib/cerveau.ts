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

/** Ce qu'il faut pour imprimer l'album : les pages, les prénoms et la complicité finale. */
export interface AlbumPrint {
  pages: CerveauPage[];
  name: (id: string) => string;
  avg: number;
  icon: (kind: CerveauKind) => string;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Texte coupé à la largeur donnée, avec des points de suspension. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * L'album en une seule image : fond chocolat, titre en script, puis chaque dessin à deux en
 * tirage blanc légèrement penché, le modèle en filigrane doré par-dessus, le score et le binôme.
 * Deux colonnes, pour qu'elle se lise bien dans la pellicule d'un téléphone.
 */
export async function albumCanvas({ pages, name, avg, icon }: AlbumPrint): Promise<HTMLCanvasElement> {
  const images = await Promise.all(pages.map((p) => loadImage(p.image)));
  await Promise.all(
    ['400 96px "Imperial Script"', '700 40px Inter', '600 26px Inter'].map((f) => document.fonts?.load(f).catch(() => {})),
  );
  const cols = pages.length > 1 ? 2 : 1;
  const rows = Math.ceil(pages.length / cols);
  const pad = 20;
  const iw = 500;
  const ih = (iw * CANVAS_H) / CANVAS_W;
  const cw = iw + pad * 2;
  const ch = ih + pad + 112;
  const gap = 56;
  const top = 290;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cw + (cols + 1) * gap;
  canvas.height = top + rows * ch + rows * gap + 70;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;

  const bg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, canvas.height);
  bg.addColorStop(0, '#5a3828');
  bg.addColorStop(1, '#24160f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#d9a441';
  ctx.font = '400 96px "Imperial Script", cursive';
  ctx.fillText('complicité', W / 2, 112);
  ctx.fillStyle = '#f2e6b3';
  ctx.font = '700 88px Inter, system-ui, sans-serif';
  ctx.fillText(`${avg} %`, W / 2, 196);
  ctx.fillStyle = 'rgb(242 230 179 / .7)';
  ctx.font = '600 26px Inter, system-ui, sans-serif';
  ctx.fillText(`L’album du Cerveau coupé · ${pages.length} dessin${pages.length > 1 ? 's' : ''} à deux`, W / 2, 244);

  const best = pages.reduce<CerveauPage | null>((b, p) => (!b || p.score > b.score ? p : b), null);
  pages.forEach((p, i) => {
    const x = gap + (i % cols) * (cw + gap) + cw / 2;
    const y = top + gap / 2 + Math.floor(i / cols) * (ch + gap) + ch / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((((i * 37) % 7) - 3) * 0.6 * Math.PI) / 180);
    ctx.translate(-cw / 2, -ch / 2);
    ctx.shadowColor = 'rgb(0 0 0 / .45)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(0, 0, cw, ch);
    ctx.shadowColor = 'transparent';
    ctx.drawImage(images[i]!, pad, pad, iw, ih);
    ctx.strokeStyle = 'rgb(0 0 0 / .08)';
    ctx.strokeRect(pad + 0.5, pad + 0.5, iw - 1, ih - 1);

    // Le modèle en filigrane doré, comme au survol dans le jeu.
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, iw, ih);
    ctx.clip();
    ctx.translate(pad, pad);
    ctx.scale(iw / CANVAS_W, ih / CANVAS_H);
    ctx.strokeStyle = 'rgb(217 164 65 / .45)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of p.model.paths) {
      ctx.beginPath();
      for (let k = 0; k + 1 < path.length; k += 2) (k ? ctx.lineTo : ctx.moveTo).call(ctx, path[k]!, path[k + 1]!);
      ctx.stroke();
    }
    ctx.restore();

    if (best?.turn === p.turn && p.score > 0) {
      ctx.fillStyle = '#d9a441';
      ctx.beginPath();
      ctx.roundRect(pad + 12, pad + 12, 168, 42, 21);
      ctx.fill();
      ctx.fillStyle = '#2a1a12';
      ctx.font = '700 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ Meilleur', pad + 12 + 84, pad + 41);
    }

    const base = pad + ih;
    ctx.fillStyle = '#2a1a12';
    ctx.textAlign = 'right';
    ctx.font = '700 40px Inter, system-ui, sans-serif';
    ctx.fillText(`${p.score} %`, cw - pad, base + 54);
    const scoreW = ctx.measureText(`${p.score} %`).width;
    ctx.textAlign = 'left';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.fillText(fit(ctx, `${icon(p.kind)} ${p.model.name}`, iw - scoreW - 24), pad, base + 52);
    ctx.fillStyle = '#86705f';
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillText(fit(ctx, `${name(p.duo[0])} & ${name(p.duo[1])}`, iw), pad, base + 90);
    ctx.restore();
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#d9a441';
  ctx.font = '600 24px Inter, system-ui, sans-serif';
  ctx.fillText('julaïka', W / 2, canvas.height - 34);
  return canvas;
}

/**
 * Le fichier PNG de l'album, fabriqué une fois dès l'ouverture de l'album : sur iPhone, la
 * feuille de partage doit s'ouvrir tout de suite après le toucher, sans attendre le rendu.
 */
let albumCache: { key: string; file: Promise<File> } | null = null;
export function albumFile(print: AlbumPrint): Promise<File> {
  const key = `${print.avg}|${print.pages.map((p) => `${p.turn}:${p.score}:${print.name(p.duo[0])}:${print.name(p.duo[1])}`).join(',')}`;
  if (albumCache?.key !== key) {
    const file = albumCanvas(print)
      .then((c) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('PNG'))), 'image/png')))
      .then((blob) => new File([blob], 'album-cerveau-coupe-julaika.png', { type: 'image/png' }));
    file.catch(() => albumCache?.key === key && (albumCache = null));
    albumCache = { key, file };
  }
  return albumCache.file;
}
