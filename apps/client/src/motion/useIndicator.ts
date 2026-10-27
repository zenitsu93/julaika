import { useLayoutEffect, useRef } from 'react';

/**
 * Indicateur (anneau, fond) qui glisse vers l'élément actif au lieu de sauter.
 * Les éléments candidats portent `data-slot` dans le conteneur ; l'indicateur prend leur taille.
 * `index < 0` le cache (ex. gomme : aucune couleur active).
 */
export function useIndicator<C extends HTMLElement = HTMLDivElement, I extends HTMLElement = HTMLSpanElement>(index: number) {
  const container = useRef<C>(null);
  const indicator = useRef<I>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = container.current;
    const mark = indicator.current;
    if (!root || !mark) return;
    const place = (instant: boolean) => {
      const target = root.querySelectorAll<HTMLElement>('[data-slot]')[index];
      if (!target) {
        mark.style.opacity = '0';
        return;
      }
      if (instant) mark.style.transition = 'none';
      mark.style.opacity = '1';
      mark.style.width = `${target.offsetWidth}px`;
      mark.style.height = `${target.offsetHeight}px`;
      mark.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
      if (instant) {
        void mark.offsetWidth;
        mark.style.transition = '';
      }
    };
    place(!placed.current);
    placed.current = true;
    const ro = new ResizeObserver(() => place(true));
    ro.observe(root);
    return () => ro.disconnect();
  }, [index]);

  return { container, indicator };
}
