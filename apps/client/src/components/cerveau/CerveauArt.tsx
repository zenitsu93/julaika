import './cerveau.css';

/** Carte de l'accueil : une maison dessinée à deux crayons, chacun sa moitié, qui se rejoignent au milieu. */
export const CerveauArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path className="cv-art-seam" d="M110 14v116" stroke="currentColor" strokeOpacity=".35" strokeWidth="3" strokeDasharray="4 7" />
    <path d="M60 66v54h100V66L110 30z" stroke="currentColor" strokeOpacity=".12" strokeWidth="6" />
    <path className="cv-art-left" pathLength={1} d="M110 30 60 66v54h50M60 66h0M76 120V92h18v28" stroke="currentColor" strokeWidth="6" />
    <path className="cv-art-right stroke-gold" pathLength={1} d="M110 30l50 36v54h-50M126 84h20v16h-20z" strokeWidth="6" />
    <g className="cv-art-pen-l" style={{ transformOrigin: '40px 110px' }}>
      <path d="M22 120 40 96l8 6-18 24-10 4z" className="fill-butter" />
      <path d="M40 96l8 6 6-8-8-6z" fill="currentColor" fillOpacity=".5" />
    </g>
    <g className="cv-art-pen-r" style={{ transformOrigin: '180px 110px' }}>
      <path d="M198 120l-18-24-8 6 18 24 10 4z" className="fill-gold" />
      <path d="M180 96l-8 6-6-8 8-6z" fill="currentColor" fillOpacity=".5" />
    </g>
    <circle className="cv-art-spark fill-gold" cx="110" cy="30" r="5" />
  </svg>
);
