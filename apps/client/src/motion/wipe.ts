import { reducedMotion } from './animate';

/**
 * « Tout effacer » : juste avant la remise à zéro, on copie le dessin sur un calque posé
 * au-dessus du tableau, puis ce calque se gomme de gauche à droite. Le tableau lui-même
 * n'est jamais ralenti.
 */
let layer: HTMLCanvasElement | null = null;
let source: HTMLCanvasElement | null = null;

export function attachWipe(board: HTMLCanvasElement | null, overlay: HTMLCanvasElement | null) {
  source = board;
  layer = overlay;
}

export function wipeBoard() {
  if (!layer || !source || reducedMotion()) return;
  layer.width = source.width;
  layer.height = source.height;
  layer.getContext('2d')!.drawImage(source, 0, 0);
  const anim = layer.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 0 100%)' }], {
    duration: 260,
    easing: 'cubic-bezier(.4,0,.2,1)',
    fill: 'forwards',
  });
  const target = layer;
  anim.onfinish = () => {
    target.getContext('2d')!.clearRect(0, 0, target.width, target.height);
    anim.cancel();
  };
}
