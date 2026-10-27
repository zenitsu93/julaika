import { useEffect, useState } from 'react';
import { useGame } from '../lib/store';

/**
 * Fond « grand sourire », pour Julaïka : la boucle jaune du logo agrandie en bas de l'écran.
 * Il s'élargit un instant quand quelqu'un trouve le mot et reste grand au podium.
 * Une seule transformation CSS par changement, aucun calcul par image.
 */
export function Smile() {
  const lastCorrect = useGame((s) => {
    const last = s.chat.at(-1);
    return last?.kind === 'correct' ? last : null;
  });
  const podium = useGame((s) => s.room?.phase === 'gameEnd');
  const [beaming, setBeaming] = useState(false);

  useEffect(() => {
    if (!lastCorrect) return;
    setBeaming(true);
    const t = setTimeout(() => setBeaming(false), 1600);
    return () => clearTimeout(t);
  }, [lastCorrect]);

  const scale = podium ? 'scale(1.12, 2.4)' : beaming ? 'scale(1.06, 2)' : 'none';
  const arc = 'M180 670 Q800 820 1420 670';

  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="none"
      className="pointer-events-none fixed inset-0 -z-10 size-full"
      aria-hidden
    >
      <g
        style={{ transform: scale, transformOrigin: '800px 670px', transformBox: 'view-box' }}
        className="transition-transform duration-700 ease-[cubic-bezier(.34,1.56,.64,1)]"
      >
        <path d={arc} fill="none" stroke="var(--color-accent)" strokeWidth="70" strokeLinecap="round" opacity="0.14" style={{ filter: 'blur(18px)' }} />
        <path d={arc} fill="none" stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round" opacity="0.45" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
