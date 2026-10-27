import './cadavre.css';

/** La feuille pliée en trois : tête de chat, pull rayé, pattes de poulet, qui se déplient tour à tour. */
export const CadArt = ({ className = 'mx-auto max-h-36 w-full' }: { className?: string }) => (
  <svg viewBox="0 0 220 140" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g className="cad-art-panel">
      <rect x="76" y="10" width="68" height="40" rx="3" className="fill-butter" />
      <path d="M99 24l-3-10 9 6M121 24l3-10-9 6" className="stroke-cacao" strokeWidth="3.5" />
      <circle cx="110" cy="31" r="12" className="stroke-cacao" strokeWidth="3.5" />
      <g className="cad-art-eyes">
        <circle cx="105.5" cy="29.5" r="2" className="fill-cacao" />
        <circle cx="114.5" cy="29.5" r="2" className="fill-cacao" />
      </g>
      <path d="M106 35q4 3 8 0M105 43v7M115 43v7" className="stroke-cacao" strokeWidth="3" />
    </g>
    <g className="cad-art-panel" style={{ animationDelay: '350ms' }}>
      <rect x="76" y="50" width="68" height="42" rx="1" className="fill-butter" />
      <path d="M105 50l-17 11 4 7 5-4v28M115 50l17 11-4 7-5-4v28" className="stroke-cacao" strokeWidth="3.5" />
      <path d="M98 70h24M98 80h24" className="stroke-gold" strokeWidth="4" />
    </g>
    <g className="cad-art-panel" style={{ animationDelay: '700ms' }}>
      <rect x="76" y="92" width="68" height="38" rx="3" className="fill-butter" />
      <path d="M103 92v22m0 0l-8 6m8-6v8m0-8l8 6M117 92v22m0 0l-8 6m8-6v8m0-8l8 6" className="stroke-gold" strokeWidth="3.5" />
    </g>
    <path d="M70 50h80M70 92h80" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" strokeDasharray="4 5" />
  </svg>
);
