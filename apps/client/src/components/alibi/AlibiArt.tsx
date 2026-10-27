import './alibi.css';

/** Carte de l'accueil : le marteau frappe, et une pièce à conviction se balance au bout de sa ficelle. */
export const AlibiArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g className="al-art-tag" style={{ transformOrigin: '168px 6px' }}>
      <path d="M168 6v30" className="stroke-gold" strokeWidth="3" />
      <rect x="138" y="36" width="60" height="64" rx="8" className="fill-butter" stroke="none" />
      <circle cx="168" cy="46" r="4" className="fill-cacao" stroke="none" />
      <text x="168" y="80" textAnchor="middle" fontSize="22" fontWeight="800" className="fill-cacao" stroke="none">
        n°1
      </text>
    </g>
    <rect x="16" y="112" width="112" height="16" rx="5" fill="currentColor" fillOpacity=".25" strokeWidth="4" />
    <g className="al-gavel" style={{ transformOrigin: '120px 98px' }}>
      <path d="M120 98 66 44" strokeWidth="9" />
      <rect x="34" y="25" width="56" height="30" rx="7" transform="rotate(-45 62 40)" fill="currentColor" stroke="none" />
    </g>
    <g className="al-sparks stroke-gold" strokeWidth="5">
      <path d="M20 104l-12-4M26 92l-8-10M58 96l8-10" />
    </g>
  </svg>
);
