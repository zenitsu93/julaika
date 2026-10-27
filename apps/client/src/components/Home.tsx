import { useState } from 'react';
import { AVATARS } from '../lib/avatars';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { LogoMark } from './Logo';

const codeFromUrl = () => location.pathname.match(/^\/r\/([A-Z0-9]{4,8})/i)?.[1]?.toUpperCase() ?? '';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function Home() {
  const [name, setName] = useState(() => load('julaika:name', ''));
  const [avatar, setAvatar] = useState(() => load('julaika:avatar', Math.floor(Math.random() * AVATARS.length)));
  const [code, setCode] = useState(codeFromUrl);
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);

  const play = (room?: string) => {
    try {
      localStorage.setItem('julaika:name', JSON.stringify(name));
      localStorage.setItem('julaika:avatar', JSON.stringify(avatar));
    } catch {}
    net.connect(name, avatar, room || undefined);
  };

  return (
    <main className="grid min-h-full place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="h-12 w-auto" />
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em]">julaïka</h1>
            <p className="text-sm text-muted">Dessine, devine, marque des points.</p>
          </div>
        </div>

        <form
          className="panel space-y-5 p-5 shadow-sm"
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
            <div className="grid grid-cols-8 gap-2">
              {AVATARS.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  aria-label={`Avatar ${i + 1}`}
                  aria-pressed={avatar === i}
                  onClick={() => setAvatar(i)}
                  className={`aspect-square rounded-md border text-xl transition hover:scale-105 ${
                    avatar === i ? 'border-ink bg-page ring-2 ring-ink/10' : 'border-edge'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
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

          <button type="button" className="btn-primary w-full py-2.5" disabled={status === 'connecting'} onClick={() => play()}>
            {status === 'connecting' ? 'Connexion…' : 'Créer un salon privé'}
          </button>

          {error && <p className="text-center text-sm text-bad">{error}</p>}
          {status === 'closed' && !error && <p className="text-center text-sm text-bad">Connexion perdue. Réessaie.</p>}
        </form>
      </div>
    </main>
  );
}
