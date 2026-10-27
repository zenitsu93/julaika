import './aov.css';

/** La bouteille, goulot vers le haut : c'est lui qui désigne le joueur. */
export const Bottle = (props: { x?: number; y?: number; width?: number; height?: number }) => (
  <svg viewBox="0 0 100 100" className={props.width ? undefined : 'size-full drop-shadow-[0_8px_10px_rgb(0_0_0/0.25)]'} {...props} aria-hidden>
    <path d="M44 6h12v6c0 6 2 10 6 15 4 5 6 10 6 17v40c0 6-4 10-10 10H42c-6 0-10-4-10-10V44c0-7 2-12 6-17 4-5 6-9 6-15z" className="fill-cacao-2" />
    <path d="M44 6h12v6c0 6 2 10 6 15 4 5 6 10 6 17v40c0 6-4 10-10 10H42c-6 0-10-4-10-10V44c0-7 2-12 6-17 4-5 6-9 6-15z" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" />
    <rect x="43" y="3" width="14" height="6" rx="2" className="fill-gold" />
    <rect x="34" y="52" width="32" height="24" rx="4" className="fill-butter" />
    <path d="M50 70s-8-4.6-8-9.2a3.8 3.8 0 0 1 8-1 3.8 3.8 0 0 1 8 1c0 4.6-8 9.2-8 9.2z" className="fill-gold" />
    <path d="M38 34c-2 4-2 8-2 12" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** Carte de l'accueil : la bouteille tourne entre une carte Action et une carte Vérité, puis en choisit une. */
export const AovArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" aria-hidden>
    <g className="aov-art-left">
      <rect x="14" y="30" width="56" height="78" rx="9" className="fill-gold" />
      <text x="42" y="78" textAnchor="middle" fontSize="30">
        ⚡
      </text>
    </g>
    <g className="aov-art-right">
      <rect x="150" y="30" width="56" height="78" rx="9" className="fill-butter" />
      <text x="178" y="78" textAnchor="middle" fontSize="28">
        💬
      </text>
    </g>
    <g className="aov-art-bottle text-ink">
      <Bottle x={75} y={35} width={70} height={70} />
    </g>
  </svg>
);
