import './bras.css';

/**
 * Deux avant-bras coudes sur la table, mains serrées : la prise penche d'un côté, puis de
 * l'autre, et la petite jauge dessous suit. Chocolat à gauche, or à droite.
 */
export function BrasGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="22" y="108" width="156" height="10" rx="5" fill="currentColor" fillOpacity=".16" />
      <path className="bf-arm-l stroke-cacao-2" d="M62 108L96 50" strokeWidth="17" />
      <path className="bf-arm-r stroke-gold" d="M138 108L104 50" strokeWidth="17" />
      <g className="bf-clasp">
        <circle cx="100" cy="46" r="15" className="fill-cacao" />
        <path d="M90 40q10-7 20 0M90 47q10-6 20 0" className="stroke-butter" strokeWidth="3" />
        <g className="bf-spark stroke-gold" strokeWidth="3.5">
          <path d="M100 20v-9" />
          <path d="M80 26l-6-6" />
          <path d="M120 26l6-6" />
        </g>
      </g>
      <path d="M44 136h112" stroke="currentColor" strokeOpacity=".2" strokeWidth="6" />
      <path d="M100 130v12" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" />
      <circle className="bf-knot fill-gold" cx="100" cy="136" r="6" />
    </svg>
  );
}
