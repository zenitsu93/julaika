import { useEffect, useRef, type CSSProperties } from 'react';
import { animate } from '../../motion';
import './bombe.css';

/**
 * La bombe dessinée : corps, bouchon, mèche et étincelle. `beat` (s) règle son battement,
 * 0 = immobile ; `lit` allume l'étincelle. Avec `pulse`, le corps ne bat plus en boucle : il
 * sursaute à chaque changement de `pulse`, calé sur le tic-tac (et `heat`, 0 à 1, le fait trembler).
 */
export function BombGlyph({ lit, beat, pulse, heat = 0, className = '' }: { lit: boolean; beat: number; pulse?: number; heat?: number; className?: string }) {
  const body = useRef<SVGGElement>(null);
  const driven = pulse !== undefined;

  useEffect(() => {
    if (!driven || !pulse) return;
    const tilt = (pulse % 2 ? 1 : -1) * heat * 4;
    animate(
      body.current,
      [{ transform: 'scale(1)' }, { transform: `scale(${1.05 + heat * 0.05}) rotate(${tilt}deg)`, offset: 0.3 }, { transform: 'scale(1)' }],
      { duration: Math.min(520, beat * 900), easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'none' },
    );
  }, [pulse]);

  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <ellipse cx="56" cy="112" rx="30" ry="4" fill="currentColor" opacity=".12" />
      <g
        ref={body}
        className={beat && !driven ? 'bomb-body' : ''}
        style={{ '--beat': `${beat}s`, transformOrigin: '56px 70px', transformBox: 'view-box' } as CSSProperties}
      >
        <path d="M86 26c6-9 14-12 22-16" fill="none" stroke="#a1a1aa" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="70" y="24" width="20" height="16" rx="4" transform="rotate(38 80 32)" fill="#3f3f46" />
        <circle cx="56" cy="70" r="40" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
        {/* La bombe rougeoie à mesure que la mèche brûle. */}
        {heat > 0 && <circle className="bomb-glow" cx="56" cy="70" r="40" style={{ opacity: heat * 0.55 }} />}
        <ellipse cx="40" cy="50" rx="11" ry="6.5" transform="rotate(-35 40 50)" fill="#fff" opacity=".16" />
      </g>
      {lit && (
        <g className="bomb-spark" style={{ transformOrigin: '108px 10px', scale: `${1 + heat * 0.5}` } as CSSProperties}>
          <path d="M108 0l2.6 6.6L117 5l-4.6 5.4 4.8 5-6.6-1.4L108 20l-2.6-6-6.6 1.4 4.8-5L99 5l6.4 1.6z" fill="#f5b700" />
          <circle cx="108" cy="10" r="3" fill="#fff7d6" />
        </g>
      )}
    </svg>
  );
}
