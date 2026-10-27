// Picto « crayon-J » : le corps suit la couleur du texte, la gomme et le trait prennent l'or du thème.
// Source des fichiers de marque : docs/brand.
const ACCENT = { fill: 'var(--color-accent)' };
const ACCENT_STROKE = { stroke: 'var(--color-accent)' };

/** `animated` : le crayon se pose puis trace sa boucle (accueil, une fois par visite). */
export function LogoMark({ className = '', animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="15 2 34 60" className={`${animated ? 'm-logo' : ''} ${className}`} aria-hidden>
      <g className="m-pencil">
        <rect x="32" y="4" width="14" height="7" rx="3" style={ACCENT} />
        <rect x="32" y="13" width="14" height="22" fill="currentColor" />
        <path d="M32 37.5H46L42.4 43.6H35.6Z" fill="currentColor" />
      </g>
      <path className="m-stroke" pathLength={1} d="M39 50.5C38.5 59 27 60.5 20 53.5" fill="none" style={ACCENT_STROKE} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
