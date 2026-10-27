import { useEffect, useRef, useState, type CSSProperties, type JSX, type PointerEvent } from 'react';
import { GAMES, SOON, matchesGame, matchesSoon, type GameId, type GameInfo, type SoonId } from '../lib/games';
import { reducedMotion } from '../motion';
import { BombGlyph } from './bombe/BombGlyph';
import { LogoMark } from './Logo';

// L'entrée animée ne se joue qu'une fois par visite, comme sur l'écran du pseudo.
let introPlayed = false;

/** Accueil : une carte par jeu, qui s'incline sous la souris, et une recherche. */
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
    <main className="min-h-full pb-16">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-auto" animated={intro} />
          <span style={after(300)} className={`text-2xl font-semibold tracking-[-0.04em] ${rise}`}>
            julaïka
          </span>
        </div>
        <button type="button" className="btn-ghost" onClick={onCode}>
          J'ai un code de salon
        </button>
      </header>

      <section className="px-4 pt-8 text-center sm:pt-12">
        <h1 style={after(340)} className={`text-4xl font-semibold leading-none tracking-[-0.045em] sm:text-6xl ${rise}`}>
          Salut ! On joue à quoi ?
        </h1>
        <p style={after(400)} className={`mx-auto mt-3 max-w-md text-base text-muted sm:text-lg ${rise}`}>
          Choisis un jeu, crée un salon et envoie le lien à tes amis.
        </p>
        <label
          style={after(460)}
          className={`mx-auto mt-7 flex min-h-13 max-w-xl items-center gap-2.5 rounded-xl border border-edge bg-surface px-3.5 shadow-[0_10px_30px_-20px_rgb(0_0_0/0.35)] transition focus-within:border-ink focus-within:ring-4 focus-within:ring-ink/10 ${rise}`}
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

      <section className="mx-auto mt-10 grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5 px-4 [perspective:1000px] sm:mt-12 sm:px-6">
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

/** La carte s'incline vers la souris et un reflet suit le pointeur. */
function tilt(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== 'mouse' || reducedMotion()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.transform = `rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 16}deg) translateY(-4px)`;
  el.style.setProperty('--gx', `${x * 100}%`);
  el.style.setProperty('--gy', `${y * 100}%`);
}

const untilt = (e: PointerEvent<HTMLElement>) => {
  e.currentTarget.style.transform = '';
};

const SKINS: Record<GameId, string> = {
  dessin: 'border-accent bg-accent text-[#18181b]',
  mime: 'border-primary bg-primary text-on-primary',
  wavelength: 'border-edge bg-surface text-ink',
  motdujour: 'border-[#15803d] bg-[#16a34a] text-white',
  telephone: 'border-[#6d28d9] bg-[#7c3aed] text-white',
  bombe: 'border-[#c2410c] bg-[#ea580c] text-white',
};

function GameCard({ game, className, style, onPick }: { game: GameInfo; className: string; style: CSSProperties; onPick: () => void }) {
  const index = String(GAMES.indexOf(game) + 1).padStart(2, '0');
  return (
    <div style={style} className={className}>
      <button
        type="button"
        onClick={onPick}
        onPointerMove={tilt}
        onPointerLeave={untilt}
        aria-label={`${game.name} : ${game.pitch}`}
        className={`hub-card group relative flex h-80 w-full flex-col justify-between overflow-hidden rounded-[1.375rem] border p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 sm:h-96 ${SKINS[game.id]}`}
      >
        <span className="hub-glare" aria-hidden />
        <span className="hub-pop flex items-center justify-between font-mono text-xs">
          <span className="opacity-80">{index}</span>
          {game.badge ? (
            <span className="rounded-full bg-accent px-2 py-0.5 font-sans font-medium text-[#18181b]">{game.badge}</span>
          ) : (
            <span>{game.players}</span>
          )}
        </span>
        <span className="hub-pop m-float">{ART[game.id]}</span>
        <span className="hub-pop block">
          <span className="block text-4xl font-semibold tracking-[-0.04em]">{game.name}</span>
          <span className="mt-1 block text-[15px] opacity-75">{game.pitch}</span>
        </span>
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
    <path className="m-wave" d="M46 34l6-16" stroke="#f5b700" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

/** Le cadran de Wavelength : les zones de points et l'aiguille qui cherche la cible. */
const WaveArt = () => (
  <svg viewBox="0 0 200 120" className="mx-auto max-h-36 w-full" aria-hidden>
    <path d="M20 106a80 80 0 0 1 160 0" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="26" />
    <path d="M118.7 28.2A80 80 0 0 1 177.8 87.3" fill="none" stroke="#2563eb" strokeOpacity=".55" strokeWidth="26" />
    <path d="M135.2 34.2A80 80 0 0 1 171.8 70.8" fill="none" stroke="#d97706" strokeWidth="26" />
    <path d="M150.0 43.6A80 80 0 0 1 162.4 56.0" fill="none" stroke="#f5b700" strokeWidth="26" />
    <g className="m-needle" style={{ transformOrigin: '100px 106px' }}>
      <path d="M100 106 149.5 56.5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </g>
    <circle cx="100" cy="106" r="9" className="fill-current" />
    <circle cx="100" cy="106" r="3.5" fill="#f5b700" />
  </svg>
);

/** Le mot qui se dévoile : les cases se retournent une à une, puis tout est vert. */
const MotArt = () => (
  <span className="mx-auto flex justify-center gap-1.5" aria-hidden>
    {[...'JOLIE'].map((c, i) => (
      <span
        key={i}
        style={{ animationDelay: `${i * 160}ms` }}
        className="mot-art grid size-11 place-items-center rounded-md border-2 border-white/70 text-2xl font-bold"
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
      <rect x="80" y="34" width="60" height="72" rx="8" fill="#fff" stroke="none" />
      <path className="m-draw" pathLength={1} d="M92 86c6-26 16-34 20-14s12 20 16-6" stroke="#18181b" strokeWidth="5" />
      <circle cx="122" cy="52" r="6" fill="#f5b700" stroke="none" />
    </g>
    <g className="tel-art" style={{ animationDelay: '1000ms', transformOrigin: '180px 70px' }}>
      <path d="M154 42h52a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8h-12v10l-12-10h-28a8 8 0 0 1-8-8V50a8 8 0 0 1 8-8z" fill="currentColor" fillOpacity=".18" strokeWidth="4" />
      <path d="M174 56a7 7 0 1 1 9 7v4M183 75v.5" stroke="#f5b700" strokeWidth="5" />
    </g>
  </svg>
);

/** La bombe qui bat, l'étincelle qui crépite, et une syllabe posée dessus. */
const BombArt = () => (
  <span className="bomb-art relative mx-auto block w-36" aria-hidden>
    <BombGlyph lit beat={0.9} className="w-full" />
    <span className="absolute left-[47%] top-[60%] -translate-x-1/2 -translate-y-1/2 rounded-md bg-white px-2 font-mono text-xl font-bold text-[#18181b]">TION</span>
  </span>
);

const ART: Record<GameId, JSX.Element> = { dessin: <DrawArt />, mime: <MimeArt />, wavelength: <WaveArt />, motdujour: <MotArt />, telephone: <TelArt />, bombe: <BombArt /> };

/** Carte d'un jeu en préparation : même mise en scène, en pointillés et sans clic. */
function SoonCard({ game, className, style }: { game: (typeof SOON)[number]; className: string; style: CSSProperties }) {
  const index = String(GAMES.length + SOON.indexOf(game) + 1).padStart(2, '0');
  return (
    <div style={style} className={className}>
      <div
        onPointerMove={tilt}
        onPointerLeave={untilt}
        aria-label={`${game.name}, bientôt : ${game.pitch}`}
        role="group"
        className="hub-card soon-card group relative flex h-80 w-full flex-col justify-between overflow-hidden rounded-[1.375rem] border border-dashed border-edge bg-surface/60 p-5 text-muted sm:h-96"
      >
        <span className="hub-glare" aria-hidden />
        <span className="hub-pop flex items-center justify-between font-mono text-xs">
          <span className="opacity-80">{index}</span>
          <span className="rounded-full border border-dashed border-edge px-2 py-0.5 font-sans font-medium">Bientôt</span>
        </span>
        <span className="hub-pop m-float text-ink/70">{SOON_ART[game.id]}</span>
        <span className="hub-pop block">
          <span className="block text-3xl font-semibold tracking-[-0.04em] text-ink/80">{game.name}</span>
          <span className="mt-1 block text-[15px]">{game.pitch}</span>
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
  // Quatre têtes pareilles, une qui n'est pas comme les autres.
  intrus: svg(
    <>
      {[40, 80, 120].map((x) => (
        <g key={x}>
          <circle cx={x} cy="58" r="15" strokeWidth="5" />
          <path d={`M${x - 22} 112c2-20 12-28 22-28s20 8 22 28`} strokeWidth="5" />
        </g>
      ))}
      <g className="soon-bob" style={{ transformOrigin: '160px 90px' }}>
        <circle cx="160" cy="58" r="15" stroke="#f5b700" strokeWidth="5" />
        <path d="M138 112c2-20 12-28 22-28s20 8 22 28" stroke="#f5b700" strokeWidth="5" />
        <path d="M154 54a6 6 0 1 1 8 6v4M158 70v.5" stroke="#f5b700" strokeWidth="4" />
      </g>
    </>,
  ),
  // Un mot barré d'un trait rouge, encore et encore.
  interdits: svg(
    <>
      <rect x="36" y="30" width="128" height="80" rx="14" strokeWidth="5" />
      <path d="M58 58h84M58 82h56" strokeWidth="7" strokeOpacity=".35" />
      <path className="m-draw" pathLength={1} d="M50 96 150 44" stroke="#dc2626" strokeWidth="7" />
    </>,
  ),
  // La lettre tourne, les lignes se remplissent.
  petitbac: svg(
    <>
      <g className="soon-spin" style={{ transformOrigin: '52px 70px' }}>
        <rect x="26" y="44" width="52" height="52" rx="10" fill="#f5b700" stroke="none" />
        <text x="52" y="83" textAnchor="middle" fontSize="34" fontWeight="700" fill="#18181b" stroke="none">
          B
        </text>
      </g>
      {[48, 72, 96].map((y, i) => (
        <path key={y} className="m-draw" style={{ animationDelay: `${i * 300}ms` }} pathLength={1} d={`M98 ${y}h${70 - i * 12}`} strokeWidth="6" />
      ))}
    </>,
  ),
  // Des notes qui s'envolent.
  fredonne: svg(
    <>
      <path d="M70 104V44l50-12v60" strokeWidth="5" />
      <ellipse cx="60" cy="104" rx="12" ry="9" fill="currentColor" stroke="none" />
      <ellipse cx="110" cy="92" rx="12" ry="9" fill="currentColor" stroke="none" />
      {[0, 1, 2].map((i) => (
        <path key={i} className="soon-note" style={{ animationDelay: `${i * 600}ms` }} d="M150 100v-18l12-4" stroke="#f5b700" strokeWidth="5" />
      ))}
    </>,
  ),
  // Un cœur qui bat.
  connait: svg(
    <path
      className="soon-beat"
      style={{ transformOrigin: '100px 72px' }}
      d="M100 112S48 82 48 52a24 24 0 0 1 52-6 24 24 0 0 1 52 6c0 30-52 60-52 60z"
      fill="#f5b700"
      stroke="none"
    />,
  ),
  // La grille des agents : les cases changent d'équipe.
  agents: svg(
    <>
      {Array.from({ length: 9 }, (_, i) => (
        <rect
          key={i}
          className="soon-flip"
          style={{ animationDelay: `${((i * 7) % 9) * 220}ms`, transformOrigin: `${62 + (i % 3) * 30}px ${42 + Math.floor(i / 3) * 30}px` }}
          x={50 + (i % 3) * 30}
          y={30 + Math.floor(i / 3) * 30}
          width="24"
          height="24"
          rx="5"
          strokeWidth="3"
        />
      ))}
    </>,
  ),
};
