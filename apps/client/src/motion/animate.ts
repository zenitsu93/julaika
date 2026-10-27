/** Mouvement réduit demandé par le système : relu à chaque appel, il peut changer en cours de partie. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Petite surcouche de `element.animate` : courbe et durée par défaut, et rien du tout en
 * mouvement réduit (l'élément reste dans son état final).
 */
export function animate(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions = {}) {
  if (!el || reducedMotion() || typeof el.animate !== 'function') return null;
  return el.animate(frames, { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards', ...opts });
}

/** Petit rebond de confirmation, pour un bouton cliqué ou un élément choisi. */
export const bump = (el: Element | null | undefined, scale = 1.12) =>
  animate(el, [{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
    duration: 260,
    easing: 'cubic-bezier(.34,1.56,.64,1)',
    fill: 'none',
  });

export const shake = (el: Element | null | undefined) =>
  animate(
    el,
    [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }],
    { duration: 300, easing: 'linear', fill: 'none' },
  );
