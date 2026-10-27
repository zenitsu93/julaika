// Polaroids du mime : la caméra du mimeur tire un cliché à chaque trouvaille, et les tirages
// de la partie s'assemblent en une planche qu'on peut enregistrer.

import type { MimeShot } from '@julaika/shared';
import { polaroidCanvas, snapshot } from './polaroid';

/** Vidéo de sa propre caméra pendant qu'on mime (posée par la scène du mime). */
let stage: HTMLVideoElement | null = null;

export function setMimeVideo(video: HTMLVideoElement | null) {
  stage = video;
}

/** Cliché de sa caméra à l'instant d'une trouvaille, ou null sans caméra. */
export const mimeSnapshot = () => snapshot(stage);

/** Un tour de mime sur la planche : le premier polaroid, et tous ceux qui ont trouvé. */
export interface MimeTurn {
  shot: MimeShot;
  finders: string[];
}

/** Regroupe les polaroids par tour (un mimeur par manche) : un seul tirage par mime sur la planche. */
export function turnsOf(shots: MimeShot[]): MimeTurn[] {
  const turns = new Map<string, MimeTurn>();
  for (const s of shots) {
    const key = `${s.round}:${s.mimerId}`;
    const turn = turns.get(key);
    if (!turn) turns.set(key, { shot: s, finders: [s.finderName] });
    else {
      turn.finders.push(s.finderName);
      // Un tirage sans caméra cède la place au premier qui en a une.
      if (!turn.shot.image && s.image) turn.shot = s;
    }
  }
  return [...turns.values()];
}

export const turnBy = (t: MimeTurn) => `${t.shot.mimerName} mime · trouvé par ${t.finders.join(', ')}`;

/** Inclinaison stable d'un tirage, variée d'un tirage à l'autre. */
export const shotTilt = (s: MimeShot) => (((s.id * 37) % 9) - 4) * 1.3;

/**
 * Planche contact de la partie : les polaroids posés en quinconce sur un fond chocolat,
 * légèrement penchés, avec le titre en haut. Enregistrée en PNG.
 */
export async function downloadPlanche(turns: MimeTurn[]) {
  const withImage = turns.filter((t) => t.shot.image).map((t) => ({ ...t, ...t.shot }));
  if (!withImage.length) return;
  const cards = await Promise.all(withImage.map((t) => polaroidCanvas(t.image!, t.word, turnBy(t))));
  const cols = Math.min(4, cards.length);
  const rows = Math.ceil(cards.length / cols);
  const w = 360;
  const h = Math.round((w * cards[0]!.height) / cards[0]!.width);
  const gap = 44;
  const top = 150;
  const canvas = document.createElement('canvas');
  canvas.width = cols * w + (cols + 1) * gap;
  canvas.height = top + rows * h + (rows + 1) * gap;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createRadialGradient(canvas.width / 2, 0, 0, canvas.width / 2, 0, canvas.height);
  bg.addColorStop(0, '#5a3828');
  bg.addColorStop(1, '#24160f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e6b3';
  ctx.font = '700 64px Caveat, "Segoe Print", cursive';
  ctx.fillText('Les mimes de la partie', canvas.width / 2, 92);
  ctx.fillStyle = '#d9a441';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillText('julaïka', canvas.width / 2, 128);

  cards.forEach((card, i) => {
    const x = gap + (i % cols) * (w + gap) + w / 2;
    const y = top + gap + Math.floor(i / cols) * (h + gap) + h / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((shotTilt(withImage[i]!) * Math.PI) / 180);
    ctx.shadowColor = 'rgb(0 0 0 / .45)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
    ctx.drawImage(card, -w / 2, -h / 2, w, h);
    ctx.restore();
  });

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'planche-mime-julaika.png';
  a.click();
}
