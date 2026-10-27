// Brique polaroid : fige l'image d'une caméra dans un carré, puis l'habille d'un cadre de
// polaroid sur un canvas. Tout se fait dans le navigateur ; rien ne part tant qu'on ne l'envoie pas.

import { PHOTO_MAX_CHARS, PHOTO_SIZE } from '@julaika/shared';

export interface SnapOptions {
  /** Côté du carré (px). */
  size?: number;
  /** Effet miroir, comme l'aperçu de sa propre caméra. */
  mirror?: boolean;
  /** Taille maximale de la data URL : la qualité JPEG baisse jusqu'à rentrer dedans. */
  maxChars?: number;
}

/**
 * Capture l'image en cours d'une vidéo, recadrée au centre en carré, avec un léger grain
 * chaud de pellicule. Renvoie une data URL JPEG, ou null si la vidéo n'a pas encore d'image.
 */
export function snapshot(video: HTMLVideoElement | null, { size = PHOTO_SIZE, mirror = true, maxChars = PHOTO_MAX_CHARS }: SnapOptions = {}): string | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const side = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - side) / 2;
  const sy = (video.videoHeight - side) / 2;
  if (mirror) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  // Couleurs de tirage instantané : un peu plus de contraste, des blancs crème.
  ctx.filter = 'contrast(1.08) saturate(1.12) sepia(.12) brightness(1.03)';
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  vignette(ctx, size);

  for (let q = 0.82; q >= 0.3; q -= 0.12) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= maxChars) return url;
  }
  return null;
}

/** Bords légèrement assombris, comme un vrai tirage. */
function vignette(ctx: CanvasRenderingContext2D, size: number) {
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, 'rgb(0 0 0 / 0)');
  g.addColorStop(1, 'rgb(40 20 10 / .28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * Un polaroid complet sur canvas : photo carrée, bord blanc épais en bas avec la légende
 * manuscrite et le nom. Sert à l'enregistrer en image.
 */
export async function polaroidCanvas(image: string, caption: string, by = ''): Promise<HTMLCanvasElement> {
  const photo = await loadImage(image);
  const side = 600;
  const pad = 36;
  const bottom = 170;
  const canvas = document.createElement('canvas');
  canvas.width = side + pad * 2;
  canvas.height = side + pad + bottom;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, pad, pad, side, side);
  ctx.strokeStyle = 'rgb(0 0 0 / .08)';
  ctx.strokeRect(pad + 0.5, pad + 0.5, side - 1, side - 1);

  ctx.fillStyle = '#2a1a12';
  ctx.textAlign = 'center';
  await document.fonts?.load(`700 48px ${HAND}`).catch(() => {});
  ctx.font = `700 48px ${HAND}`;
  wrap(ctx, caption, canvas.width / 2, pad + side + 66, side, 46);
  if (by) {
    ctx.fillStyle = '#86705f';
    ctx.font = '600 20px Inter, "Instrument Sans", system-ui, sans-serif';
    ctx.fillText(by, canvas.width / 2, canvas.height - 22);
  }
  return canvas;
}

/** Police de légende : Caveat (chargée par photo.css), sinon une écriture manuscrite du système. */
const HAND = 'Caveat, "Segoe Print", "Bradley Hand", cursive';

/** Légende sur deux lignes au plus, coupée aux mots. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, line: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = `${shown[1]}…`;
  shown.forEach((l, i) => ctx.fillText(l, x, y + i * line));
}

/** Enregistre le polaroid en PNG. */
export async function downloadPolaroid(image: string, caption: string, by = '', filename = 'polaroid-julaika.png') {
  const canvas = await polaroidCanvas(image, caption, by);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
