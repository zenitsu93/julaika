import type { WarpId } from '@julaika/shared';

/**
 * Déformation de sa propre caméra, appliquée avant l'envoi : la piste source est lue par une
 * <video> cachée, redessinée dans un canvas et ressort par `captureStream`.
 *
 * Les effets « loupe » (bulle, pince, étire, tourbillon) passent par une table de remappage
 * précalculée (pixel de destination → pixel source) appliquée sur getImageData : à 320×240,
 * c'est une simple boucle de 77 000 lectures. Le tourbillon anime son angle en piochant parmi
 * quelques tables précalculées ; miroir et vague se contentent de drawImage.
 */

export interface Warp {
  track: MediaStreamTrack;
  set(effect: WarpId): void;
  stop(): void;
}

const FPS = 15;
/** Nombre de tables précalculées pour le tourbillon (de -1 à +1 en intensité). */
const SWIRL_STEPS = 17;
/** Hauteur (px) des bandes de la vague. */
const BAND = 2;

type MapFn = (dx: number, dy: number, w: number, h: number) => [number, number];

/** Rayon d'action des effets centrés : un peu plus de la moitié du petit côté. */
const radius = (w: number, h: number) => 0.6 * Math.min(w, h);

const MAPS: Record<'bulle' | 'pince' | 'etire', MapFn> = {
  // Loupe : au centre, on lit plus près du centre → tout grossit (gros nez).
  bulle(dx, dy, w, h) {
    const R = radius(w, h);
    const r = Math.hypot(dx, dy);
    if (r >= R || r === 0) return [dx, dy];
    const k = Math.pow(r / R, 0.75);
    return [dx * k, dy * k];
  },
  // Pincement : on lit plus loin du centre → la tête rétrécit.
  pince(dx, dy, w, h) {
    const R = radius(w, h);
    const r = Math.hypot(dx, dy);
    if (r >= R || r === 0) return [dx, dy];
    const k = Math.pow(r / R, -0.3);
    return [dx * k, dy * k];
  },
  // Étirement vertical du centre et léger resserrement des côtés : visage allongé.
  etire(dx, dy, w, h) {
    const H = h / 2;
    const v = Math.min(1, Math.abs(dy) / H);
    const sy = Math.sign(dy) * H * (0.35 * v + 0.65 * v * v);
    const sx = dx * (1 + 0.3 * (1 - v));
    return [sx, sy];
  },
};

/** Tourbillon d'intensité `s` (-1..1) : l'angle décroît du centre vers le bord. */
function swirl(s: number): MapFn {
  return (dx, dy, w, h) => {
    const R = radius(w, h);
    const r = Math.hypot(dx, dy);
    if (r >= R) return [dx, dy];
    const a = s * 2.6 * (1 - r / R) ** 2;
    const c = Math.cos(a);
    const n = Math.sin(a);
    return [dx * c - dy * n, dx * n + dy * c];
  };
}

/** Table dest → source (indices de pixels), coordonnées bornées à l'image. */
function buildMap(fn: MapFn, w: number, h: number): Int32Array {
  const map = new Int32Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = fn(x + 0.5 - cx, y + 0.5 - cy, w, h);
      const px = Math.min(w - 1, Math.max(0, Math.round(sx + cx - 0.5)));
      const py = Math.min(h - 1, Math.max(0, Math.round(sy + cy - 0.5)));
      map[y * w + x] = py * w + px;
    }
  }
  return map;
}

export function createWarp(source: MediaStreamTrack, effect: WarpId): Warp {
  const canvas = document.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') throw new Error('captureStream indisponible');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([source]);
  void video.play().catch(() => {});

  canvas.width = 320;
  canvas.height = 240;
  const track = canvas.captureStream(FPS).getVideoTracks()[0]!;

  // Tables recalculées si la taille change ; celles du tourbillon, à la demande.
  let w = 0;
  let h = 0;
  let maps: Partial<Record<string, Int32Array>> = {};
  let out: ImageData | null = null;
  const mapFor = (key: string, fn: () => MapFn) => (maps[key] ??= buildMap(fn(), w, h));

  let stopped = false;
  let last = 0;

  const draw = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return;
    if (vw !== w || vh !== h) {
      w = canvas.width = vw;
      h = canvas.height = vh;
      maps = {};
      out = ctx.createImageData(w, h);
    }
    const t = performance.now() / 1000;
    last = performance.now();

    if (effect === 'miroir') {
      // Moitié gauche recopiée, retournée, sur la moitié droite.
      const half = Math.floor(w / 2);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w - half, h, 0, 0, w - half, h);
      ctx.restore();
      return;
    }
    if (effect === 'vague') {
      // Bandes horizontales décalées selon un sinus qui défile vers le bas.
      const amp = w * 0.045;
      ctx.drawImage(video, 0, 0, w, h);
      for (let y = 0; y < h; y += BAND) {
        const dx = amp * Math.sin(y * 0.06 - t * 5);
        ctx.drawImage(video, 0, y, w, BAND, dx, y, w, BAND);
      }
      return;
    }

    let map: Int32Array;
    if (effect === 'tourbillon') {
      const step = Math.round(((Math.sin(t * 1.6) + 1) / 2) * (SWIRL_STEPS - 1));
      map = mapFor(`tourbillon${step}`, () => swirl((step / (SWIRL_STEPS - 1)) * 2 - 1));
    } else {
      map = mapFor(effect, () => MAPS[effect as keyof typeof MAPS]);
    }
    ctx.drawImage(video, 0, 0, w, h);
    const src = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer);
    const dst = new Uint32Array(out!.data.buffer);
    for (let i = 0; i < dst.length; i++) dst[i] = src[map[i]!]!;
    ctx.putImageData(out!, 0, 0);
  };

  // Rythme : une image par image vidéo (plafonnée à 15 i/s) via requestVideoFrameCallback ;
  // un minuteur de secours prend le relais s'il se tait (onglet caché, navigateur sans rVFC).
  const rvfc = 'requestVideoFrameCallback' in video;
  const onFrame = () => {
    if (stopped) return;
    if (performance.now() - last >= 1000 / FPS - 5) draw();
    video.requestVideoFrameCallback(onFrame);
  };
  if (rvfc) video.requestVideoFrameCallback(onFrame);
  const timer = setInterval(() => {
    if (!rvfc || performance.now() - last > 250) draw();
  }, 1000 / FPS);

  return {
    track,
    set(next) {
      effect = next;
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      track.stop();
      video.pause();
      video.srcObject = null;
      maps = {};
    },
  };
}
