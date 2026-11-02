import { useEffect, useState } from 'react';
import { GAMES } from '../../lib/games';
import { go } from '../../lib/route';
import { Wordmark } from '../Logo';
import { GoogleButton, Icon } from './ui';

const VERBS = ['dessiné', 'mimé', 'photographié', 'inventé', 'fredonné'];
const SEEN = 'julaika:bienvenue';

/** La landing a déjà été vue (ou écartée) : on ne la remontre pas à l'arrivée sur « / ». */
export function landingSeen() {
  try {
    return localStorage.getItem(SEEN) === '1';
  } catch {
    return true;
  }
}
export function markLandingSeen() {
  try {
    localStorage.setItem(SEEN, '1');
  } catch {}
}

/** Le verbe du titre change toutes les 2,2 s : l'ancien monte et se floute, le nouveau arrive d'en bas. */
function RotatingVerb() {
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      setI((n) => {
        setPrev(n);
        return (n + 1) % VERBS.length;
      });
    }, 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="land-rot" aria-live="off">
      {/* La largeur suit le mot le plus long : le titre ne saute pas d'une ligne à l'autre. */}
      <span aria-hidden className="invisible">photographié</span>
      {prev !== null && (
        <span key={`o${prev}-${i}`} className="out" aria-hidden>
          {VERBS[prev]}
        </span>
      )}
      <Enter key={i}>{VERBS[i]!}</Enter>
    </span>
  );
}
function Enter({ children }: { children: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  return <span className={on ? '' : 'in'}>{children}</span>;
}

/** Landing « Le carnet » : titre qui tourne, deux rubans de jeux, trois étapes. */
export function Landing() {
  // Vue une fois suffit : au prochain passage sur « / », on va droit aux jeux.
  useEffect(markLandingSeen, []);
  const half = Math.ceil(GAMES.length / 2);
  const rows = [GAMES.slice(0, half), GAMES.slice(half)];
  const guest = () => go(null);
  return (
    <main className="relative min-h-full overflow-x-clip pb-14">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Wordmark className="h-10 w-auto" />
        <button type="button" className="btn-ghost" onClick={() => go('connexion')}>
          Se connecter
        </button>
      </header>

      <section className="mx-auto grid max-w-3xl justify-items-center gap-5 px-4 pt-8 text-center sm:pt-14">
        <span className="land-kicker acc-up inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1 text-[13px] font-semibold text-muted">
          <i className="dot" aria-hidden />
          Nouveau : ton album de souvenirs
        </span>
        <h1 className="acc-up text-[2.35rem] leading-[1.05] font-semibold tracking-[-0.045em] sm:text-6xl" style={{ animationDelay: '80ms' }}>
          Tout ce que vous avez <RotatingVerb />
          <br />
          ensemble,{' '}
          <span className="land-mark">
            gardé
            <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
              <path pathLength={1} d="M2 8Q30 2 52 6T98 5" />
            </svg>
          </span>
          .
        </h1>
        <p className="acc-up max-w-xl text-lg text-muted" style={{ animationDelay: '160ms' }}>
          Crée ton compte : les dessins, les polaroids et les créatures de chaque partie arrivent dans ton album, prêts à télécharger sur ton téléphone ou ton ordi.
        </p>
        <div className="acc-up flex flex-wrap justify-center gap-2.5" style={{ animationDelay: '240ms' }}>
          <button type="button" className="btn-primary px-5 py-2.5" onClick={() => go('inscription')}>
            Créer mon compte
            <Icon name="right" />
          </button>
          <button type="button" className="btn-ghost px-5 py-2.5" onClick={guest}>
            Jouer sans compte
          </button>
        </div>
        <div className="acc-up w-full max-w-xs" style={{ animationDelay: '300ms' }}>
          <GoogleButton next="/album" />
        </div>
      </section>

      <section className="mt-14 grid gap-3" aria-label="Les jeux">
        {rows.map((row, r) => (
          <div key={r} className="land-marquee overflow-hidden">
            <div className={`land-track ${r ? 'rev' : ''}`}>
              {[...row, ...row].map((g, i) => (
                <div key={`${g.id}-${i}`} className="land-card grid w-56 shrink-0 gap-1 rounded-2xl p-4 text-left" aria-hidden={i >= row.length}>
                  <b className="text-[15px]">{g.name}</b>
                  <span className="text-sm opacity-75">{g.pitch}</span>
                  <small className="mt-1 text-xs text-gold">{g.players}</small>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-14 grid max-w-5xl gap-4 px-4 [counter-reset:land] sm:grid-cols-3 sm:px-6">
        {[
          ['Tu joues', 'Dessin, Mime, Photomaton, Cadavre exquis… avec tes amis, en visio ou dans le canapé.'],
          ['On garde', 'À la fin de chaque partie, les images rejoignent ton album, rangées par jeu et par date.'],
          ['Tu télécharges', 'Une image ou tout l’album en .zip, sur ton téléphone ou ton ordinateur.'],
        ].map(([t, d], i) => (
          <article key={t} className="land-step acc-up grid content-start gap-2 rounded-[18px] border border-edge bg-surface p-5" style={{ animationDelay: `${380 + i * 90}ms` }}>
            <h2 className="text-lg">{t}</h2>
            <p className="text-sm text-muted">{d}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
