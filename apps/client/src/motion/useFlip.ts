import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate } from './animate';

/**
 * Technique FLIP : quand les enfants `[data-flip="clé"]` du conteneur changent de place
 * (classement réordonné, joueur qui arrive), ils glissent de l'ancienne position à la nouvelle.
 * Les positions sont relatives au conteneur, donc insensibles au défilement de la page.
 */
export function useFlip(container: RefObject<HTMLElement | null>, deps: unknown[]) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const next = new Map<string, { x: number; y: number }>();
    for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) {
      const key = el.dataset.flip!;
      const pos = { x: el.offsetLeft, y: el.offsetTop };
      next.set(key, pos);
      const prev = last.current.get(key);
      if (prev && (prev.x !== pos.x || prev.y !== pos.y)) {
        animate(el, [{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: 'none' }], {
          duration: 400,
          easing: 'cubic-bezier(.34,1.3,.64,1)',
          composite: 'add',
        });
      }
    }
    last.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
