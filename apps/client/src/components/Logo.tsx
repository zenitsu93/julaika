// Picto « crayon-J » : le corps suit la couleur du texte, la gomme et le trait restent jaunes.
// Source des fichiers de marque : docs/brand.
const ACCENT = '#f5b700';

export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="15 2 34 60" className={className} aria-hidden>
      <rect x="32" y="4" width="14" height="7" rx="3" fill={ACCENT} />
      <rect x="32" y="13" width="14" height="22" fill="currentColor" />
      <path d="M32 37.5H46L42.4 43.6H35.6Z" fill="currentColor" />
      <path d="M39 50.5C38.5 59 27 60.5 20 53.5" fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
