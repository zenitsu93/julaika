import { useLayoutEffect, type RefObject } from 'react';

const PHONE = '(max-width: 639.98px)';

/**
 * Téléphone : la feuille de dessin prend la hauteur qui reste à l'écran, pour que la feuille,
 * ses outils et le bouton « J'ai fini » tiennent ensemble sans défiler.
 *
 * On mesure plutôt que deviner : la hauteur visible (barres de Safari comprises, et elle change
 * quand elles se replient), le haut de la feuille et ce qui la suit. La largeur max du cadre
 * en découle (ratio 4:3). Au-delà du téléphone, rien ne change.
 *
 * `box` : le cadre dont on borne la largeur ; `sheet` : la feuille elle-même ;
 * `below` : ce qui vient dessous (outils, bouton) ; `pad` : marge sous le tout (panneau, zone sûre).
 */
export function useFitSheet(
  box: RefObject<HTMLElement | null>,
  sheet: RefObject<HTMLElement | null>,
  below: RefObject<HTMLElement | null>,
  { ratio = 4 / 3, min = 168, pad = 28, active = true }: { ratio?: number; min?: number; pad?: number; active?: boolean } = {},
) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const mq = matchMedia(PHONE);
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const canvas = sheet.current;
        if (!active || !mq.matches || !canvas) {
          el.style.maxWidth = '';
          return;
        }
        const top = canvas.getBoundingClientRect().top + scrollY;
        const after = below.current ? below.current.offsetHeight + parseFloat(getComputedStyle(el.parentElement ?? el).rowGap || '0') : 0;
        const room = innerHeight - top - after - pad;
        const width = `${Math.round(Math.max(min, room * ratio))}px`;
        if (el.style.maxWidth !== width) el.style.maxWidth = width;
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (below.current) ro.observe(below.current);
    ro.observe(document.body);
    addEventListener('resize', fit);
    visualViewport?.addEventListener('resize', fit);
    mq.addEventListener('change', fit);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener('resize', fit);
      visualViewport?.removeEventListener('resize', fit);
      mq.removeEventListener('change', fit);
      el.style.maxWidth = '';
    };
  }, [box, sheet, below, ratio, min, pad, active]);
}
