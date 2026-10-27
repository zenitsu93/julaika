import { useState } from 'react';
import { AVATARS } from '../lib/avatars';
import { net } from '../lib/net';
import { useGame } from '../lib/store';

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
        <h1 className="mb-1 text-center text-5xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-neon-violet via-neon-pink to-neon-cyan bg-clip-text text-transparent">
            julaika
          </span>
        </h1>
        <p className="mb-8 text-center text-muted">Dessine. Devine. Gagne.</p>

        <form
          className="glass space-y-5 p-6 shadow-[0_0_80px_-20px_var(--color-neon-violet)]"
          onSubmit={(e) => {
            e.preventDefault();
            play(code);
          }}
        >
          <div>
            <label className="mb-2 block text-sm text-muted" htmlFor="name">Pseudo</label>
            <input id="name" className="input" maxLength={20} value={name} placeholder="Ton pseudo" onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <span className="mb-2 block text-sm text-muted">Avatar</span>
            <div className="grid grid-cols-8 gap-2">
              {AVATARS.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  aria-label={`Avatar ${i + 1}`}
                  aria-pressed={avatar === i}
                  onClick={() => setAvatar(i)}
                  className={`aspect-square rounded-xl text-2xl transition hover:scale-110 ${
                    avatar === i ? 'bg-neon-violet/30 ring-2 ring-neon-violet' : 'bg-white/5'
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
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button className="btn-ghost shrink-0" disabled={!code || status === 'connecting'}>Rejoindre</button>
          </div>

          <button type="button" className="btn-neon w-full py-3 text-lg" disabled={status === 'connecting'} onClick={() => play()}>
            {status === 'connecting' ? 'Connexion…' : 'Créer un salon privé'}
          </button>

          {error && <p className="text-center text-sm text-neon-pink">{error}</p>}
          {status === 'closed' && !error && <p className="text-center text-sm text-neon-pink">Connexion perdue. Réessaie.</p>}
        </form>
      </div>
    </main>
  );
}
