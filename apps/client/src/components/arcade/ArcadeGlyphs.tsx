import type { ArcadeKind } from '@julaika/shared';
import './arcade.css';

/** Illustrations animées des cartes d'accueil et des salons des jeux d'action. */
export function ArcadeGlyph({ kind, className = '' }: { kind: ArcadeKind; className?: string }) {
  if (kind === 'foot') return <FootGlyph className={className} />;
  if (kind === 'oreillers') return <PillowGlyph className={className} />;
  return <DrapGlyph className={className} />;
}

const HEART = 'M0 7C-10 -1 -6 -10 0 -5C6 -10 10 -1 0 7Z';

/** Deux grosses têtes, un ballon qui fait l'aller-retour au-dessus, deux cages. */
function FootGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="10" y="118" width="180" height="8" rx="4" className="fill-cacao-2" fillOpacity=".35" />
      <path d="M14 118V76h18" className="stroke-butter" strokeWidth="5" />
      <path d="M186 118V76h-18" className="stroke-butter" strokeWidth="5" />
      <path d="M14 82l14 36M22 78l10 40M14 96l16 22" className="stroke-current" strokeOpacity=".2" strokeWidth="1.5" />
      <path d="M186 82l-14 36M178 78l-10 40M186 96l-16 22" className="stroke-current" strokeOpacity=".2" strokeWidth="1.5" />
      <g className="ar-g-head-l">
        <circle cx="62" cy="96" r="20" className="fill-cacao-2" />
        <circle cx="68" cy="92" r="2.6" className="fill-butter" />
        <path d="M60 102q6 5 12 0" className="stroke-butter" strokeWidth="2.5" />
      </g>
      <g className="ar-g-head-r">
        <circle cx="138" cy="96" r="20" className="fill-gold" />
        <circle cx="132" cy="92" r="2.6" className="fill-cacao" />
        <path d="M128 102q6 5 12 0" className="stroke-cacao" strokeWidth="2.5" />
      </g>
      <g className="ar-g-ball">
        <circle cx="100" cy="46" r="10" fill="#fffaf0" className="stroke-cacao" strokeWidth="2" />
        <circle cx="100" cy="46" r="3" className="fill-cacao" />
      </g>
    </svg>
  );
}

/** Un lit, deux pantins, un oreiller qui s'abat et des plumes qui volent. */
function PillowGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="20" y="62" width="12" height="70" rx="5" className="fill-cacao-2" />
      <rect x="30" y="104" width="150" height="18" rx="8" fill="#fffaf0" />
      <rect x="30" y="112" width="150" height="12" rx="6" className="fill-butter" />
      <path d="M40 124v10M170 124v10" className="stroke-cacao" strokeWidth="5" />
      <g className="stroke-cacao-2" strokeWidth="6">
        <path d="M70 102l4-16 6 16M74 86v-20" />
        <path d="M74 72l-10 10" />
      </g>
      <circle cx="74" cy="58" r="9" className="fill-cacao-2" />
      <g className="ar-g-swing">
        <path d="M74 72l16-14" className="stroke-cacao-2" strokeWidth="6" />
        <rect x="86" y="40" width="16" height="22" rx="7" fill="#fffaf0" className="stroke-gold" strokeWidth="2" />
      </g>
      <g className="ar-g-wobble">
        <g className="stroke-gold" strokeWidth="6">
          <path d="M132 102l-4-16-6 16M128 86v-20" />
          <path d="M128 72l10 8" />
        </g>
        <circle cx="128" cy="58" r="9" className="fill-gold" />
      </g>
      {[0, 1, 2].map((i) => (
        <ellipse key={i} className="ar-g-feather" style={{ animationDelay: `${i * 260}ms` }} cx={112 + i * 6} cy={56} rx="6" ry="2.4" fill="#fffaf0" stroke="currentColor" strokeOpacity=".25" />
      ))}
    </svg>
  );
}

/** Deux porteurs, un drap qui ondule, des cœurs qui tombent dedans. */
function DrapGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g className="ar-g-sway">
        <path d="M46 100q54 28 108 0q-54 36-108 0Z" fill="#fffaf0" className="stroke-gold" strokeWidth="3" />
        <circle cx="34" cy="104" r="10" className="fill-cacao-2" />
        <path d="M34 114v18M38 106l8-6" className="stroke-cacao-2" strokeWidth="6" />
        <circle cx="166" cy="104" r="10" className="fill-gold" />
        <path d="M166 114v18M162 106l-8-6" className="stroke-gold" strokeWidth="6" />
      </g>
      {[
        [84, 0],
        [116, 700],
        [100, 1400],
      ].map(([x, d]) => (
        <path key={x} className="ar-g-fall" style={{ animationDelay: `${d}ms` }} transform={`translate(${x} 30)`} d={HEART} fill="#d4607a" />
      ))}
      <g className="ar-g-storm">
        <circle cx="150" cy="34" r="9" fill="#7d7884" />
        <circle cx="160" cy="37" r="7" fill="#7d7884" />
        <circle cx="141" cy="38" r="7" fill="#7d7884" />
        <path d="M151 42l-5 9h5l-3 8" stroke="#f6d27a" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
