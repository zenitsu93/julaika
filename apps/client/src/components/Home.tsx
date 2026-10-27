import { useEffect, useRef, useState } from 'react';
import { AVATARS } from '../lib/avatars';
import { isRoomGame } from '@julaika/shared';
import { GAMES, type GameId } from '../lib/games';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { bump, shake, useIndicator } from '../motion';
import { LogoMark } from './Logo';

export const codeFromUrl = () => location.pathname.match(/^\/r\/([A-Z0-9]{4,8})/i)?.[1]?.toUpperCase() ?? '';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

// L'entrée animée ne se joue qu'une fois par visite, pas au retour d'une partie.
let introPlayed = false;

/** Pseudo, avatar et salon. `game` : jeu choisi sur l'accueil (null = arrivé avec un code). */
export function Home({ game, onBack }: { game: GameId | null; onBack: () => void }) {
  const info = GAMES.find((g) => g.id === game);
  const [intro] = useState(() => !introPlayed);
  useEffect(() => void (introPlayed = true), []);
  const rise = intro ? 'm-rise' : '';
  const after = (ms: number) => ({ animationDelay: `${ms}ms` });
  const [name, setName] = useState(() => load('julaika:name', ''));
  const [avatar, setAvatar] = useState(() => load('julaika:avatar', Math.floor(Math.random() * AVATARS.length)));
  const [code, setCode] = useState(codeFromUrl);
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const failed = Boolean(error) || status === 'closed';
  const codeInput = useRef<HTMLInputElement>(null);
  const avatars = useIndicator<HTMLDivElement>(avatar);

  // Arrivé par « J'ai un code de salon » : le curseur attend le code.
  useEffect(() => {
    if (game === null && !codeFromUrl()) codeInput.current?.focus();
  }, []);

  useEffect(() => {
    if (error) shake(codeInput.current?.value ? codeInput.current : avatars.container.current?.closest('form'));
  }, [error]);

  const play = (room?: string) => {
    try {
      localStorage.setItem('julaika:name', JSON.stringify(name));
      localStorage.setItem('julaika:avatar', JSON.stringify(avatar));
    } catch {}
    // Le jeu ne compte qu'à la création : avec un code, on rejoint le jeu du salon.
    net.connect(name, avatar, room || undefined, isRoomGame(game) ? game : 'dessin', game === 'mime' ? 'mime' : undefined);
  };

  return (
    <main className="grid min-h-full place-items-center p-4">
      <div className="w-full max-w-md">
        <button type="button" onClick={onBack} className="btn -ml-3 mb-4 text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Tous les jeux
        </button>
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-12 w-auto" animated={intro} />
          <div>
            <h1 style={after(300)} className={`text-3xl font-semibold leading-tight tracking-[-0.04em] ${rise}`}>
              <span className="accroche text-3xl text-muted">on joue à</span>
              {info?.name ?? 'julaïka'}
            </h1>
            <p style={after(360)} className={`text-sm text-muted ${rise}`}>
              {info?.pitch ?? 'Entre ton pseudo pour rejoindre tes amis.'}
            </p>
          </div>
        </div>

        <form
          style={after(420)}
          className={`panel space-y-5 p-5 shadow-sm ${rise}`}
          onSubmit={(e) => {
            e.preventDefault();
            play(code);
          }}
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="name">Pseudo</label>
            <input
              id="name"
              className="input"
              maxLength={20}
              value={name}
              placeholder="Ton pseudo"
              enterKeyHint="go"
              onChange={(e) => setName(e.target.value)}
              // « OK » du clavier : rejoint le salon si un code est saisi, sinon en crée un.
              // (Sans ça, rien ne se passe : le bouton Rejoindre, désactivé, bloque l'envoi implicite.)
              onKeyDown={(e) => {
                if (e.key === 'Enter' && status !== 'connecting') {
                  e.preventDefault();
                  play(code);
                }
              }}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Avatar</span>
            <div ref={avatars.container} className="relative grid grid-cols-8 gap-2">
              {/* Le cadre de sélection glisse d'un avatar à l'autre. */}
              <span ref={avatars.indicator} className="m-indicator rounded-md border border-ink bg-page ring-2 ring-ink/10" />
              {AVATARS.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  data-slot
                  aria-label={`Avatar ${i + 1}`}
                  aria-pressed={avatar === i}
                  onClick={(e) => {
                    setAvatar(i);
                    bump(e.currentTarget.firstElementChild);
                  }}
                  className={`relative aspect-square rounded-md border text-xl transition hover:scale-105 ${avatar === i ? 'border-transparent' : 'border-edge'}`}
                >
                  <span className="inline-block">{a}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              ref={codeInput}
              aria-invalid={failed && Boolean(code)}
              aria-label="Code salon"
              className="input font-mono uppercase tracking-widest"
              placeholder="Code salon"
              enterKeyHint="go"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn-ghost shrink-0" disabled={!code || status === 'connecting'}>Rejoindre</button>
          </div>

          <button
            type="button"
            className={`btn-primary w-full py-2.5 ${status === 'connecting' ? 'm-shimmer' : ''}`}
            disabled={status === 'connecting'}
            onClick={() => play()}
          >
            {status === 'connecting' ? 'Connexion…' : 'Créer un salon privé'}
          </button>

          {error && (
            <p key={error} className="m-rise text-center text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          {status === 'closed' && !error && (
            <p className="m-rise text-center text-sm text-bad" role="alert">
              Connexion perdue. Réessaie.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
