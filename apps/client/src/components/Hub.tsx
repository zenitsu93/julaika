import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { GAMES, SOON, matchesGame, matchesSoon, type GameId, type GameInfo, type SoonId } from '../lib/games';
import { AgentsArt } from './agents/AgentsArt';
import { BombGlyph } from './bombe/BombGlyph';
import { BrasGlyph } from './bras/BrasGlyph';
import { CadArt } from './cadavre/CadArt';
import { ConnaitArt } from './connait/ConnaitArt';
import { FlashArt } from './flash/FlashArt';
import { LogoMark } from './Logo';
import { StoryArt } from './motamot/StoryArt';
import './photo/photo.css';
import './interdits/interdits.css';

// L'entrée animée ne se joue qu'une fois par visite, comme sur l'écran du pseudo.
let introPlayed = false;

/** Accueil : une carte par jeu, posée dans un écrin chocolat, et une recherche. */
export function Hub({ onPick, onCode }: { onPick: (id: GameId) => void; onCode: () => void }) {
  const [intro] = useState(() => !introPlayed);
  useEffect(() => void (introPlayed = true), []);
  const rise = intro ? 'm-rise' : '';
  const after = (ms: number) => ({ animationDelay: `${ms}ms` });

  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const games = GAMES.filter((g) => matchesGame(g, query));
  const soon = SOON.filter((g) => matchesSoon(g, query));

  // « / » place le curseur dans la recherche, comme sur la plupart des outils.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative isolate min-h-full overflow-x-clip pb-16">
      <div className="hub-aurora" aria-hidden>
        <i />
        <i />
      </div>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-auto" animated={intro} />
          <span style={after(300)} className={`font-logo text-2xl font-semibold tracking-[-0.04em] ${rise}`}>
            julaïka
          </span>
        </div>
        <button type="button" className="btn-ghost" onClick={onCode}>
          J'ai un code de salon
        </button>
      </header>

      <section className="px-4 pt-8 text-center sm:pt-12">
        <h1 style={after(340)} className={`text-4xl font-semibold leading-none tracking-[-0.045em] sm:text-6xl ${rise}`}>
          <span className="accroche text-5xl text-accent sm:text-7xl">entre amis</span>
          Salut ! On joue à quoi ?
        </h1>
        <p style={after(400)} className={`mx-auto mt-3 max-w-md text-base text-muted sm:text-lg ${rise}`}>
          Choisis un jeu, crée un salon et envoie le lien à tes amis.
        </p>
        <label
          style={after(460)}
          className={`mx-auto mt-7 flex min-h-13 max-w-xl items-center gap-2.5 rounded-xl border border-edge bg-surface px-3.5 shadow-[0_10px_30px_-20px_rgb(0_0_0/0.35)] transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/20 ${rise}`}
        >
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={search}
            type="search"
            aria-label="Chercher un jeu"
            placeholder="Chercher un jeu (dessin, mime, visio…)"
            className="min-h-11 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && games[0]) onPick(games[0].id);
              if (e.key === 'Escape') setQuery('');
            }}
          />
          <span className="kbd max-sm:hidden">/</span>
        </label>
      </section>

      <section className="mx-auto mt-10 grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5 px-4 sm:mt-12 sm:px-6">
        {games.map((g, i) => (
          <GameCard key={g.id} game={g} style={after(520 + i * 60)} className={rise} onPick={() => onPick(g.id)} />
        ))}
        {soon.map((g, i) => (
          <SoonCard key={g.id} game={g} style={after(520 + (games.length + i) * 60)} className={rise} />
        ))}
        {games.length === 0 && soon.length === 0 && (
          <p className="col-span-full py-10 text-center text-muted">Aucun jeu ne s'appelle comme ça… pour l'instant.</p>
        )}
      </section>
    </main>
  );
}

const Arrow = () => (
  <span className="hub-go" aria-hidden>
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  </span>
);

/** Carte d'un jeu : le dessin dans un écrin chocolat, le nom dessous. Le premier jeu garde son liseré doré allumé. */
function GameCard({ game, className, style, onPick }: { game: GameInfo; className: string; style: CSSProperties; onPick: () => void }) {
  const featured = GAMES.indexOf(game) === 0;
  return (
    <div style={style} className={className}>
      <button
        type="button"
        onClick={onPick}
        aria-label={`${game.name} : ${game.pitch}`}
        className={`hub-card ${featured ? 'hub-feat' : ''} relative flex h-80 w-full flex-col gap-3 rounded-[1.375rem] border border-edge bg-surface p-2 pb-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-page sm:h-96`}
      >
        <span className="hub-panel flex flex-1 flex-col gap-2 rounded-2xl p-3.5 text-butter">
          <span className="relative flex items-center justify-between gap-2 text-xs">
            <span className="opacity-75">{game.players}</span>
            {game.badge && <span className="rounded-full bg-gold px-2 py-0.5 font-semibold text-cacao">{game.badge}</span>}
          </span>
          <span className="relative grid flex-1 place-items-center">{ART[game.id]}</span>
        </span>
        <span className="block px-2.5 pr-12">
          <span className="block text-3xl font-bold tracking-[-0.04em]">{game.name}</span>
          <span className="mt-1 block text-[15px] leading-snug text-muted">{game.pitch}</span>
        </span>
        <Arrow />
      </button>
    </div>
  );
}

const DrawArt = () => (
  <svg viewBox="0 0 200 140" className="mx-auto max-h-36 w-full" aria-hidden>
    <path className="m-draw" pathLength={1} d="M30 100C60 20 110 20 120 80S170 120 180 40" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
  </svg>
);

const MimeArt = () => (
  <svg viewBox="0 0 60 60" className="mx-auto max-h-36 w-1/2" aria-hidden>
    <circle cx="30" cy="20" r="10" className="fill-current opacity-30" />
    <path d="M12 56c2-14 10-20 18-20s16 6 18 20" className="fill-current opacity-30" />
    <path className="m-wave stroke-gold" d="M46 34l6-16" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

/** Le cadran de Wavelength : les zones de points et l'aiguille qui cherche la cible. */
const WaveArt = () => (
  <svg viewBox="0 0 200 120" className="mx-auto max-h-36 w-full" aria-hidden>
    <path d="M20 106a80 80 0 0 1 160 0" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="26" />
    <path d="M118.7 28.2A80 80 0 0 1 177.8 87.3" fill="none" className="stroke-gold" strokeOpacity=".3" strokeWidth="26" />
    <path d="M135.2 34.2A80 80 0 0 1 171.8 70.8" fill="none" className="stroke-gold" strokeOpacity=".6" strokeWidth="26" />
    <path d="M150.0 43.6A80 80 0 0 1 162.4 56.0" fill="none" className="stroke-gold" strokeWidth="26" />
    <g className="m-needle" style={{ transformOrigin: '100px 106px' }}>
      <path d="M100 106 149.5 56.5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </g>
    <circle cx="100" cy="106" r="9" className="fill-current" />
    <circle cx="100" cy="106" r="3.5" className="fill-gold" />
  </svg>
);

/** Le mot qui se dévoile : les cases se retournent une à une, puis tout est vert. */
const MotArt = () => (
  <span className="mx-auto flex justify-center gap-1" aria-hidden>
    {[...'JOLIE'].map((c, i) => (
      <span
        key={i}
        style={{ animationDelay: `${i * 160}ms` }}
        className="mot-art grid size-9 place-items-center rounded-md border-2 border-butter/60 text-xl font-bold sm:size-10"
      >
        {c}
      </span>
    ))}
  </span>
);

/** La chaîne du téléphone : une phrase, son dessin, puis « c'est quoi ? », qui arrivent tour à tour. */
const TelArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g className="tel-art" style={{ transformOrigin: '40px 70px' }}>
      <path d="M14 42h52a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H38l-12 10V84H14a8 8 0 0 1-8-8V50a8 8 0 0 1 8-8z" fill="currentColor" fillOpacity=".18" strokeWidth="4" />
      <path d="M18 56h40M18 68h28" strokeWidth="5" strokeOpacity=".7" />
    </g>
    <g className="tel-art" style={{ animationDelay: '500ms', transformOrigin: '110px 70px' }}>
      <rect x="80" y="34" width="60" height="72" rx="8" className="fill-butter" stroke="none" />
      <path className="m-draw stroke-cacao" pathLength={1} d="M92 86c6-26 16-34 20-14s12 20 16-6" strokeWidth="5" />
      <circle cx="122" cy="52" r="6" className="fill-gold" stroke="none" />
    </g>
    <g className="tel-art" style={{ animationDelay: '1000ms', transformOrigin: '180px 70px' }}>
      <path d="M154 42h52a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8h-12v10l-12-10h-28a8 8 0 0 1-8-8V50a8 8 0 0 1 8-8z" fill="currentColor" fillOpacity=".18" strokeWidth="4" />
      <path d="M174 56a7 7 0 1 1 9 7v4M183 75v.5" className="stroke-gold" strokeWidth="5" />
    </g>
  </svg>
);

/** Trois silhouettes pareilles ; la quatrième, en jaune, se trahit et la loupe la trouve. */
const IntrusArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {[36, 82, 128].map((x, i) => (
      <g key={x} className="intrus-head" style={{ animationDelay: `${i * 1.1}s`, transformOrigin: `${x}px 112px` }}>
        <circle cx={x} cy="56" r="15" fill="currentColor" fillOpacity=".18" strokeWidth="5" />
        <path d={`M${x - 22} 112c2-20 12-28 22-28s20 8 22 28`} fill="currentColor" fillOpacity=".18" strokeWidth="5" />
      </g>
    ))}
    <g className="soon-bob" style={{ transformOrigin: '176px 100px' }}>
      <circle cx="176" cy="56" r="15" className="fill-gold stroke-gold" strokeWidth="5" />
      <path d="M154 112c2-20 12-28 22-28s20 8 22 28" className="fill-gold stroke-gold" strokeWidth="5" />
    </g>
    <g className="intrus-lens">
      <circle cx="176" cy="60" r="27" strokeWidth="6" />
      <path d="m196 80 14 14" strokeWidth="8" />
    </g>
  </svg>
);

/** Un visage qui se retient : la bouche frémit, une fossette dorée trahit le sourire. */
const SourireArt = () => (
  <svg viewBox="0 0 200 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
    <circle cx="100" cy="70" r="54" strokeWidth="5" strokeOpacity=".3" />
    <g className="s-blink" style={{ transformOrigin: '100px 56px' }}>
      <circle cx="80" cy="56" r="7" fill="currentColor" stroke="none" />
      <circle cx="120" cy="56" r="7" fill="currentColor" stroke="none" />
    </g>
    <path className="s-mouth" d="M74 90c8 14 44 14 52 0" strokeWidth="7" />
    <circle className="s-dimple fill-gold" cx="132" cy="86" r="4.5" stroke="none" />
    <g className="s-note stroke-gold" strokeWidth="4">
      <path d="M164 34v-14l10-3" />
      <path d="M30 46c4-6 10-6 14 0" />
    </g>
  </svg>
);

/** L'appareil instantané : le flash éclate, puis le polaroid sort de la fente et se révèle. */
const PhotoArt = () => (
  <svg viewBox="0 0 200 150" className="mx-auto max-h-36 w-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g className="pm-art-print">
      <rect x="66" y="66" width="68" height="78" rx="3" className="fill-butter" />
      <rect className="pm-art-develop" x="72" y="72" width="56" height="52" rx="1" fill="#2a1a12" />
      <path className="pm-art-develop stroke-gold" d="M84 104q16 12 32 0" strokeWidth="4" />
      <circle className="pm-art-develop fill-gold" cx="88" cy="90" r="3.5" />
      <circle className="pm-art-develop fill-gold" cx="112" cy="90" r="3.5" />
    </g>
    <rect x="44" y="18" width="112" height="56" rx="12" fill="currentColor" />
    <rect x="58" y="66" width="84" height="5" rx="2.5" fill="#000" fillOpacity=".35" />
    <circle cx="100" cy="46" r="19" className="fill-cacao" stroke="#000" strokeOpacity=".2" strokeWidth="3" />
    <circle cx="100" cy="46" r="10" className="fill-cacao-2" />
    <circle cx="95" cy="41" r="3.5" fill="#fff" fillOpacity=".7" />
    <rect x="128" y="27" width="18" height="11" rx="3" className="fill-gold" />
    <g className="pm-art-flash" style={{ transformOrigin: '137px 32px' }}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d="M137 18v-8" className="stroke-gold" strokeWidth="4" transform={`rotate(${a} 137 32)`} />
      ))}
    </g>
  </svg>
);

/** La bombe qui bat, l'étincelle qui crépite, et une syllabe posée dessus. */
const BombArt = () => (
  <span className="bomb-art relative mx-auto block w-36" aria-hidden>
    <BombGlyph lit beat={0.9} className="w-full" />
    <span className="absolute left-[47%] top-[60%] -translate-x-1/2 -translate-y-1/2 rounded-md bg-butter px-2 font-mono text-xl font-bold text-cacao">TION</span>
  </span>
);

/** La grille du Petit Bac : la lettre tourne, les cases se remplissent, puis le tampon « Stop ! ». */
const BacArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g className="soon-spin" style={{ transformOrigin: '50px 70px' }}>
      <rect x="18" y="38" width="64" height="64" rx="14" className="fill-gold" stroke="none" />
      <text x="50" y="86" textAnchor="middle" fontSize="44" fontWeight="700" className="fill-cacao" stroke="none">
        B
      </text>
    </g>
    {[44, 70, 96].map((y, i) => (
      <g key={y}>
        <rect x="98" y={y - 10} width="104" height="20" rx="6" fill="currentColor" fillOpacity=".16" stroke="none" />
        <path className="m-draw" style={{ animationDelay: `${i * 300}ms` }} pathLength={1} d={`M106 ${y}h${68 - i * 14}`} strokeWidth="5" />
      </g>
    ))}
    <g className="bac-art-stamp" style={{ transformOrigin: '176px 112px' }}>
      <rect x="146" y="100" width="60" height="24" rx="6" className="fill-butter" stroke="none" />
      <text x="176" y="117" textAnchor="middle" fontSize="14" fontWeight="800" className="fill-bad" stroke="none" letterSpacing="1">
        STOP!
      </text>
    </g>
  </svg>
);

/** La carte de Mots interdits : ses mots se font barrer, le buzzer s'enfonce, « bzz » part. */
const InterditsArt = () => (
  <svg viewBox="0 0 220 140" className="mx-auto max-h-36 w-full" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <g transform="rotate(-6 80 70)">
      <rect x="28" y="14" width="104" height="116" rx="12" className="fill-butter" />
      <text x="80" y="42" textAnchor="middle" fontSize="17" fontWeight="800" className="fill-cacao" letterSpacing="0.5">
        SOURIRE
      </text>
      <path d="M44 52h72" className="stroke-cacao" strokeOpacity=".2" strokeWidth="2" />
      {[68, 86, 104].map((y, i) => (
        <g key={y}>
          <circle cx="48" cy={y} r="5" className="fill-bad" />
          <path d={`M60 ${y}h${48 - i * 8}`} className="stroke-cacao" strokeOpacity=".45" strokeWidth="6" />
          <path className="ti-art-strike stroke-bad" style={{ animationDelay: `${i * 0.35}s` }} pathLength={1} d={`M56 ${y}h${56 - i * 8}`} strokeWidth="3" />
        </g>
      ))}
    </g>
    <g className="ti-art-wave stroke-gold" strokeWidth="4">
      <path d="M150 64a26 26 0 0 1 52 0" />
      <path d="M140 60a36 36 0 0 1 72 0" strokeOpacity=".5" />
    </g>
    <rect x="148" y="98" width="56" height="16" rx="5" fill="currentColor" fillOpacity=".35" />
    <path className="ti-art-buzz fill-bad" d="M156 98a20 20 0 0 1 40 0z" />
  </svg>
);

const ART: Record<GameId, JSX.Element> = {
  dessin: <DrawArt />,
  mime: <MimeArt />,
  wavelength: <WaveArt />,
  motdujour: <MotArt />,
  telephone: <TelArt />,
  intrus: <IntrusArt />,
  petitbac: <BacArt />,
  connait: <ConnaitArt />,
  bombe: <BombArt />,
  photomaton: <PhotoArt />,
  sourire: <SourireArt />,
  brasdefer: <BrasGlyph className="mx-auto max-h-36 w-full" />,
  flash: <FlashArt />,
  cadavre: <CadArt />,
  interdits: <InterditsArt />,
  motamot: <StoryArt />,
  agents: <AgentsArt />,
};

/** Carte d'un jeu en préparation : même mise en page, écrin en pointillés et sans clic. */
function SoonCard({ game, className, style }: { game: (typeof SOON)[number]; className: string; style: CSSProperties }) {
  return (
    <div style={style} className={className}>
      <div
        aria-label={`${game.name}, bientôt : ${game.pitch}`}
        role="group"
        className="hub-card soon-card relative flex h-80 w-full flex-col gap-3 rounded-[1.375rem] border border-dashed border-edge p-2 pb-5 text-muted sm:h-96"
      >
        <span className="hub-panel flex flex-1 flex-col gap-2 rounded-2xl p-3.5">
          <span className="flex justify-end text-xs">
            <span className="rounded-full border border-gold/50 px-2 py-0.5 font-medium text-accent">Bientôt</span>
          </span>
          <span className="grid flex-1 place-items-center text-ink/60">{SOON_ART[game.id]}</span>
        </span>
        <span className="block px-2.5">
          <span className="block text-3xl font-bold tracking-[-0.04em] text-ink/75">{game.name}</span>
          <span className="mt-1 block text-[15px] leading-snug">{game.pitch}</span>
        </span>
      </div>
    </div>
  );
}

const svg = (body: JSX.Element, viewBox = '0 0 200 140') => (
  <svg viewBox={viewBox} className="mx-auto max-h-32 w-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {body}
  </svg>
);

const SOON_ART: Record<SoonId, JSX.Element> = {
  // Des notes qui s'envolent.
  fredonne: svg(
    <>
      <path d="M70 104V44l50-12v60" strokeWidth="5" />
      <ellipse cx="60" cy="104" rx="12" ry="9" fill="currentColor" stroke="none" />
      <ellipse cx="110" cy="92" rx="12" ry="9" fill="currentColor" stroke="none" />
      {[0, 1, 2].map((i) => (
        <path key={i} className="soon-note stroke-gold" style={{ animationDelay: `${i * 600}ms` }} d="M150 100v-18l12-4" strokeWidth="5" />
      ))}
    </>,
  ),
};
