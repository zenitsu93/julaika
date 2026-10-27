import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { GAMES, SOON_SLOTS, matchesGame, matchesSoon, type GameId, type GameInfo } from '../lib/games';
import { reducedMotion } from '../motion';
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
  const soon = matchesSoon(query) ? SOON_SLOTS : 0;

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
        {Array.from({ length: soon }, (_, i) => (
          <div
            key={i}
            style={after(520 + (games.length + i) * 60)}
            className={`flex h-96 flex-col justify-between rounded-[1.375rem] border border-dashed border-edge p-5 text-muted max-sm:h-40 ${rise}`}
          >
            <span className="font-mono text-xs">{String(GAMES.length + i + 1).padStart(2, '0')}</span>
            <svg viewBox="0 0 24 24" className="mx-auto size-10 max-sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <div>
              <p className="text-2xl font-semibold text-ink/80">Bientôt</p>
              <p className="mt-1 text-sm">Un nouveau jeu se prépare.</p>
            </div>
          </div>
        ))}
        {games.length === 0 && soon === 0 && (
          <p className="col-span-full py-10 text-center text-muted">Aucun jeu ne s'appelle comme ça… pour l'instant.</p>
        )}
      </section>
    </main>
  );
}

/** La carte s'incline vers la souris et un reflet suit le pointeur. */
function tilt(e: PointerEvent<HTMLButtonElement>) {
  if (e.pointerType !== 'mouse' || reducedMotion()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  el.style.transform = `rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 16}deg) translateY(-4px)`;
  el.style.setProperty('--gx', `${x * 100}%`);
  el.style.setProperty('--gy', `${y * 100}%`);
}

const untilt = (e: PointerEvent<HTMLButtonElement>) => {
  e.currentTarget.style.transform = '';
};

const SKINS: Record<GameId, string> = {
  dessin: 'border-accent bg-accent text-[#18181b]',
  mime: 'border-primary bg-primary text-on-primary',
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
        <span className="hub-pop m-float">{game.id === 'dessin' ? <DrawArt /> : <MimeArt />}</span>
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
