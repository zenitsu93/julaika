import type { CSSProperties } from 'react';
import './bombe.css';

/**
 * La bombe dessinée : corps, bouchon, mèche et étincelle. `beat` (s) règle son battement,
 * 0 = immobile ; `lit` allume l'étincelle.
 */
export function BombGlyph({ lit, beat, className = '' }: { lit: boolean; beat: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <ellipse cx="56" cy="112" rx="30" ry="4" fill="currentColor" opacity=".12" />
      <g className={beat ? 'bomb-body' : ''} style={{ '--beat': `${beat}s`, transformOrigin: '56px 70px' } as CSSProperties}>
        <path d="M86 26c6-9 14-12 22-16" fill="none" stroke="#a1a1aa" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="70" y="24" width="20" height="16" rx="4" transform="rotate(38 80 32)" fill="#3f3f46" />
        <circle cx="56" cy="70" r="40" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
        <ellipse cx="40" cy="50" rx="11" ry="6.5" transform="rotate(-35 40 50)" fill="#fff" opacity=".16" />
      </g>
      {lit && (
        <g className="bomb-spark" style={{ transformOrigin: '108px 10px' }}>
          <path d="M108 0l2.6 6.6L117 5l-4.6 5.4 4.8 5-6.6-1.4L108 20l-2.6-6-6.6 1.4 4.8-5L99 5l6.4 1.6z" fill="#f5b700" />
          <circle cx="108" cy="10" r="3" fill="#fff7d6" />
        </g>
      )}
    </svg>
  );
}
