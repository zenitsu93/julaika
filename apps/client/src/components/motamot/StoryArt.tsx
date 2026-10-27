import './story.css';

// Mots de l'illustration : chacun arrive à son tour, en alternant deux « joueurs ».
const WORDS: { x: number; y: number; w: number; text: string }[] = [
  { x: 22, y: 58, w: 34, text: 'Hier' },
  { x: 60, y: 58, w: 26, text: 'soir' },
  { x: 90, y: 58, w: 18, text: 'un' },
  { x: 112, y: 58, w: 42, text: 'pingouin' },
  { x: 22, y: 84, w: 40, text: 'dansait' },
  { x: 66, y: 84, w: 22, text: 'la' },
  { x: 92, y: 84, w: 62, text: 'mayonnaise' },
  { x: 22, y: 110, w: 38, text: 'tout nu' },
];

/** Carte de l'accueil : l'histoire s'écrit mot à mot, et une contrainte se balance au-dessus. */
export function StoryArt() {
  return (
    <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" strokeLinecap="round" aria-hidden>
      <rect x="10" y="34" width="156" height="98" rx="10" className="fill-butter" />
      {[64, 90, 116].map((y) => (
        <path key={y} d={`M20 ${y + 4}h136`} className="stroke-cacao" strokeOpacity=".12" strokeWidth="1.5" />
      ))}
      {WORDS.map((w, i) => (
        <g key={i} className="st-art-word" style={{ animationDelay: `${i * 0.45}s` }}>
          <text x={w.x} y={w.y + 2} fontSize="11.5" fontWeight={i === 6 ? 800 : 600} className={i === 6 ? 'fill-gold' : i % 2 ? 'fill-cacao-2' : 'fill-cacao'}>
            {w.text}
          </text>
        </g>
      ))}
      <path className="st-art-caret stroke-gold" d="M66 102v14" strokeWidth="3" />
      {/* L'étiquette de la contrainte, pendue à son fil, qui se balance. */}
      <g className="st-art-tag" style={{ transformOrigin: '186px 6px' }}>
        <path d="M186 6v18" className="stroke-gold" strokeWidth="2" />
        <rect x="160" y="24" width="52" height="40" rx="8" className="fill-gold" />
        <circle cx="186" cy="31" r="2.5" className="fill-butter" />
        <text x="186" y="47" textAnchor="middle" fontSize="9" fontWeight="700" className="fill-cacao">
          un verbe
        </text>
        <text x="186" y="58" textAnchor="middle" fontSize="8" className="fill-cacao" opacity=".7">
          8 s
        </text>
      </g>
    </svg>
  );
}
