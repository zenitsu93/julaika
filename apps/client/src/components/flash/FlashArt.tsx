import './flash.css';

/** Carte de l'accueil : un éclair, la maison apparaît dans le cadre, s'éteint, et le crayon la recopie de mémoire. */
export const FlashArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="46" y="14" width="128" height="104" rx="10" fill="currentColor" fillOpacity=".1" strokeWidth="4" strokeOpacity=".5" />
    <g className="fl-art-image">
      <circle cx="148" cy="38" r="10" className="fill-gold" stroke="none" />
      <path d="M72 70 110 40l38 30z" className="fill-gold" stroke="none" />
      <rect x="80" y="70" width="60" height="38" className="fill-butter" stroke="none" />
      <rect x="104" y="84" width="12" height="24" className="fill-cacao" stroke="none" />
    </g>
    <g strokeWidth="4.5">
      <path className="fl-art-draw stroke-gold" pathLength={1} d="M74 72 109 43l37 29" />
      <path className="fl-art-draw" pathLength={1} style={{ animationDelay: '.25s' }} d="M82 72v34h57V71" />
      <path className="fl-art-draw stroke-gold" pathLength={1} style={{ animationDelay: '.5s' }} d="M148 30a8 8 0 1 0 .1 0" />
    </g>
    <g className="fl-art-pencil">
      <path d="m168 92 22-22 8 8-22 22-11 3z" className="fill-butter" strokeWidth="0" />
      <path d="m190 70 8 8" className="stroke-gold" strokeWidth="4" />
    </g>
    <g className="fl-art-flash">
      <path d="M38 8 26 30h11l-6 18 18-25H37l6-15z" className="fill-gold stroke-gold" strokeWidth="2" />
    </g>
  </svg>
);
