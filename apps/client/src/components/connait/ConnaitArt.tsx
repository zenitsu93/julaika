import './connait.css';

/** Carte de l'accueil : deux têtes, et entre elles la question qui se retourne en cœur. */
export const ConnaitArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {[38, 182].map((x) => (
      <g key={x} opacity=".55">
        <circle cx={x} cy="58" r="15" strokeWidth="5" />
        <path d={`M${x - 22} 112c2-20 12-28 22-28s20 8 22 28`} strokeWidth="5" />
      </g>
    ))}
    <g className="k-art-card">
      <rect x="78" y="30" width="64" height="84" rx="10" fill="#fff" stroke="none" />
      <path className="k-art-q" d="M100 60a10 10 0 1 1 14 9c-3 1.5-4 3.5-4 7M110 88v.5" stroke="#18181b" strokeWidth="6" />
      <path
        className="k-art-h"
        d="M110 94s-20-11.5-20-23a9.5 9.5 0 0 1 20-2.5 9.5 9.5 0 0 1 20 2.5c0 11.5-20 23-20 23z"
        fill="#f5b700"
        stroke="none"
      />
    </g>
  </svg>
);
