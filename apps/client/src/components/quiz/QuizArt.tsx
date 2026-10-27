import './quiz.css';

/** Carte de l'accueil : une question, quatre réponses dont une s'allume à tour de rôle, et le chrono qui tourne. */
export const QuizArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="30" y="14" width="160" height="34" rx="10" fill="currentColor" fillOpacity=".18" stroke="none" />
    <path d="M44 31h86" strokeWidth="5" strokeOpacity=".7" />
    <circle cx="170" cy="31" r="10" strokeWidth="3" strokeOpacity=".3" />
    <circle cx="170" cy="31" r="10" strokeWidth="3" pathLength={100} className="q-art-timer stroke-gold" transform="rotate(-90 170 31)" />
    {[0, 1, 2, 3].map((i) => {
      const x = i % 2 ? 114 : 30;
      const y = i < 2 ? 60 : 98;
      return (
        <g key={i}>
          <rect x={x} y={y} width="76" height="30" rx="8" className="q-art-bar fill-gold" stroke="none" style={{ animationDelay: `${[0, 3.6, 1.2, 2.4][i]}s` }} />
          <rect x={x} y={y} width="76" height="30" rx="8" strokeWidth="2.5" strokeOpacity=".35" />
          <text x={x + 14} y={y + 20} fontSize="13" fontWeight="800" className="fill-current" stroke="none">
            {'ABCD'[i]}
          </text>
          <path d={`M${x + 30} ${y + 15}h${[30, 22, 34, 26][i]}`} strokeWidth="4" strokeOpacity=".5" />
        </g>
      );
    })}
  </svg>
);
