import { reducedMotion } from './animate';

/**
 * Réaction du joueur, dans l'univers du crayon-J : le crayon dessine en direct un visage
 * qui sourit (mot trouvé) ou fait la moue (tour fini sans trouver), puis tout s'efface.
 * Les éléments viennent de `components/Reaction.tsx` ; la séquence dure moins de 2,5 s.
 */
export interface ReactionParts {
  veil: HTMLElement;
  face: HTMLElement;
  pencil: HTMLElement;
  head: SVGPathElement;
  eyes: SVGPathElement[];
  mouth: SVGPathElement;
  drop: SVGPathElement;
  joy: SVGGElement;
}

export const SMILE = 'M62 116c18 30 58 30 76 0';
export const FROWN = 'M66 140c10-14 20-16 34-10s22 4 34-4';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
const hidden = [{ strokeDasharray: '1 1', strokeDashoffset: 1 }];
const drawn = [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }];

export async function playReaction(p: ReactionParts, win: boolean, signal: AbortSignal) {
  const reduce = reducedMotion();
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
    });
  const run = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) =>
    el.animate(frames, { easing: EASE, fill: 'both', ...opts, ...(reduce ? { duration: 1, delay: 0 } : {}) });
  const draw = (path: SVGPathElement, ms: number, delay = 0) => {
    run(path, drawn, { duration: ms, delay, easing: 'ease-in-out' });
    // Le crayon suit le trait qu'il dessine.
    p.pencil.style.offsetPath = `path("${path.getAttribute('d')}")`;
    run(p.pencil, [{ offsetDistance: '0%', opacity: 1 }, { offsetDistance: '100%', opacity: 1 }], { duration: ms, delay, easing: 'ease-in-out' });
  };

  for (const path of [p.head, ...p.eyes, p.mouth]) path.animate(hidden, { fill: 'forwards' });
  run(p.veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  run(p.face, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 200 });

  if (reduce) {
    for (const path of [p.head, ...p.eyes, p.mouth]) path.getAnimations().forEach((a) => a.cancel());
    p.pencil.style.opacity = '0';
    await wait(1400);
  } else {
    draw(p.head, 520, 120);
    await wait(640);
    for (const eye of p.eyes) {
      draw(eye, 90);
      await wait(110);
    }
    draw(p.mouth, 380, 40);
    await wait(460);
    if (win) {
      run(p.pencil, [{ offsetDistance: '100%', opacity: 1 }, { offsetDistance: '100%', opacity: 0, transform: 'translate(30px,-30px)' }], { duration: 250 });
      run(p.face, [{ transform: 'scale(1)' }, { transform: 'scale(1.1) rotate(-3deg)' }, { transform: 'scale(1)' }], { duration: 420, easing: SPRING, fill: 'none' });
      run(
        p.joy,
        [
          { opacity: 0, transform: 'scale(.6)' },
          { opacity: 1, transform: 'scale(1.05)' },
          { opacity: 0, transform: 'scale(1.2)' },
        ],
        { duration: 700 },
      );
    } else {
      // Le crayon s'affaisse, une goutte glisse.
      run(p.pencil, [{ offsetDistance: '100%', opacity: 1 }, { offsetDistance: '100%', opacity: 0.6, transform: 'translateY(26px) rotate(50deg)' }], { duration: 500, easing: 'ease-in' });
      run(p.drop, [{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'translateY(4px)', offset: 0.3 }, { opacity: 0, transform: 'translateY(22px)' }], { duration: 1100, easing: 'ease-in' });
      run(p.face, [{ transform: 'none' }, { transform: 'translateY(4px) rotate(2deg)' }], { duration: 600, easing: 'ease-in-out' });
    }
    await wait(1100);
  }
  run(p.face, [{ opacity: 1 }, { opacity: 0, transform: win ? 'scale(1.06)' : 'translateY(8px)' }], { duration: 300 });
  run(p.veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
  run(p.pencil, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 });
  await wait(320);
}
