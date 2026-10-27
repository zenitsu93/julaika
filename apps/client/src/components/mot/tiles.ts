import type { LetterMark } from '@julaika/shared';

/** Couleurs d'une case (et de la touche du clavier) ; `c` sert à l'animation qui la retourne. */
export const TILE: Record<LetterMark, { className: string; c: string }> = {
  ok: { className: 'border-good bg-good text-white', c: 'var(--color-good)' },
  near: { className: 'border-accent bg-accent text-[#18181b]', c: 'var(--color-accent)' },
  no: { className: 'border-[#52525b] bg-[#52525b] text-white', c: '#52525b' },
};
