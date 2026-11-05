import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PASSWORD_MIN, type UserPublic } from '@julaika/shared';
import { AVATARS } from '../../lib/avatars';
import { ApiError, api, signedIn } from '../../lib/account';
import { go } from '../../lib/route';
import { playAsGuest } from './Landing';
import { shake } from '../../motion';
import { TremaLoader } from '../Logo';
import { ErrorLine, Field, GoogleButton } from './ui';
import { useMusicTucked } from '../MusicPlayer';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/**
 * La carte qui se retourne : connexion au recto, inscription au verso. Le sourire du logo suit
 * l'e-mail qu'on tape et ferme les yeux pendant le mot de passe.
 */
export function AuthCard({ start = 'connexion', onDone, onGuest }: { start?: 'connexion' | 'inscription'; onDone: () => void; onGuest?: () => void }) {
  const [back, setBack] = useState(start === 'inscription');
  const error = new URLSearchParams(location.search).get('erreur') === 'google' ? 'La connexion avec Google n’a pas abouti. Réessaie, ou utilise ton e-mail.' : null;
  const flip = (toBack: boolean) => {
    setBack(toBack);
    // L'adresse suit la face, pour un lien direct vers l'inscription.
    if (location.pathname === '/connexion' || location.pathname === '/inscription') history.replaceState(null, '', toBack ? '/inscription' : '/connexion');
  };
  return (
    <div className="auth-scene w-full max-w-[25rem]">
      <div className={`auth-card ${back ? 'flip' : ''}`}>
        <div className="auth-face auth-front">
          <Login onDone={onDone} onGuest={onGuest} onFlip={() => flip(true)} initialError={error} />
        </div>
        <div className="auth-face auth-back">
          <Signup onDone={onDone} onFlip={() => flip(false)} />
        </div>
      </div>
    </div>
  );
}

const face = 'grid content-start gap-3 rounded-[22px] border border-edge bg-surface p-6 text-center shadow-[0_1px_2px_rgb(42_26_18/0.06),0_18px_40px_-20px_rgb(42_26_18/0.45)] sm:p-7';

/** Le picto du logo dont les yeux suivent le texte et se ferment pendant le mot de passe. */
function Face({ look, shy, sad }: { look: number | null; shy: boolean; sad: boolean }) {
  const x = look === null ? 0 : Math.max(-4, Math.min(4, -4 + look * 0.35));
  return (
    <svg viewBox="0 0 64 64" className={`auth-face-mark mx-auto size-[74px] ${shy ? 'shy' : ''}`} aria-hidden>
      <rect width="64" height="64" rx="14" style={{ fill: 'var(--color-primary)' }} />
      <g className="eyes" style={{ transform: look === null ? undefined : `translate(${x}px, 2px)` }}>
        <circle className="eye" cx="24" cy="25" r="5.5" style={{ fill: 'var(--color-logo-eye)' }} />
        <circle className="eye" cx="40" cy="25" r="5.5" style={{ fill: 'var(--color-logo-eye)' }} />
      </g>
      <path
        className="mouth"
        d={sad ? 'M20 46Q32 36 44 46' : 'M18 37Q32 51 46 37'}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        style={{ stroke: 'var(--color-on-primary)' }}
      />
    </svg>
  );
}

function useSubmit(run: () => Promise<UserPublic>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signedIn(await run());
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ça n’a pas marché, réessaie.');
      shake(form.current);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit, form };
}

function Login({ onDone, onGuest, onFlip, initialError }: { onDone: () => void; onGuest?: () => void; onFlip: () => void; initialError: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focus, setFocus] = useState<'email' | 'pw' | null>(null);
  const { busy, error, submit, form } = useSubmit(
    async () => (await api<{ user: UserPublic }>('/api/auth/connexion', { body: { email, password } })).user,
    onDone,
  );
  return (
    <form ref={form} className={face} onSubmit={submit} noValidate>
      <Face look={focus === 'email' ? email.length : null} shy={focus === 'pw'} sad={!!error} />
      <h1 className="text-2xl tracking-[-0.02em]">Bon retour !</h1>
      <p className="-mt-1 mb-1 text-sm text-muted">Connecte-toi pour retrouver ton album.</p>
      <ErrorLine text={error ?? initialError} />
      <Field label="E-mail">
        <input
          className="input"
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ton@email.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus(null)}
          required
        />
      </Field>
      <Field
        label="Mot de passe"
        aside={
          <button type="button" className="font-semibold text-accent" onClick={() => go('mot-de-passe', email ? `?email=${encodeURIComponent(email)}` : '')}>
            Oublié ?
          </button>
        }
      >
        <input
          className="input"
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setFocus('pw')}
          onBlur={() => setFocus(null)}
          required
        />
      </Field>
      <button className="btn-primary mt-1 w-full py-2.5" disabled={busy || !email || !password}>
        {busy ? <TremaLoader className="h-4 w-5" /> : 'Se connecter'}
      </button>
      <GoogleButton />
      <p className="mt-1 text-sm text-muted">
        Pas encore de compte ?{' '}
        <button type="button" className="font-semibold text-accent" onClick={onFlip}>
          Crée-le
        </button>
        {' · '}
        <button type="button" className="font-semibold text-accent" onClick={onGuest ?? playAsGuest}>
          Jouer sans compte
        </button>
      </p>
    </form>
  );
}

function Signup({ onDone, onFlip }: { onDone: () => void; onFlip: () => void }) {
  const [name, setName] = useState(() => load('julaika:name', ''));
  const [avatar, setAvatar] = useState(() => load('julaika:avatar', 0) % AVATARS.length);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, setError, submit, form } = useSubmit(
    async () => (await api<{ user: UserPublic }>('/api/auth/inscription', { body: { email, password, name, avatar } })).user,
    onDone,
  );
  useEffect(() => setError(null), [email, password, name]);
  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  return (
    <form ref={form} className={face} onSubmit={submit} noValidate>
      <h1 className="mt-1 text-2xl tracking-[-0.02em]">Bienvenue !</h1>
      <p className="-mt-1 text-sm text-muted">Choisis ta tête, ton pseudo, et c'est parti.</p>
      <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Avatar">
        {AVATARS.slice(0, 8).map((a, i) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={avatar === i}
            onClick={() => setAvatar(i)}
            className={`grid size-10 place-items-center rounded-full bg-page text-xl transition ${avatar === i ? '-translate-y-0.5 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:-translate-y-0.5'}`}
          >
            {a}
          </button>
        ))}
      </div>
      <ErrorLine text={error} />
      <Field label="Pseudo" hint={name ? undefined : 'Celui que verront les autres joueurs.'}>
        <input className="input" id="signup-name" maxLength={20} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="E-mail">
        <input className="input" id="signup-email" type="email" autoComplete="email" inputMode="email" placeholder="ton@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Mot de passe" hint={tooShort ? `Encore ${PASSWORD_MIN - password.length} caractère${PASSWORD_MIN - password.length > 1 ? 's' : ''}.` : undefined}>
        <input
          className="input"
          id="signup-password"
          type="password"
          autoComplete="new-password"
          placeholder={`${PASSWORD_MIN} caractères minimum`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={tooShort || undefined}
          required
        />
      </Field>
      <button className="btn-primary mt-1 w-full py-2.5" disabled={busy || !email || password.length < PASSWORD_MIN || !name.trim()}>
        {busy ? <TremaLoader className="h-4 w-5" /> : 'Créer mon compte'}
      </button>
      <GoogleButton />
      <p className="text-sm text-muted">
        Déjà un compte ?{' '}
        <button type="button" className="font-semibold text-accent" onClick={onFlip}>
          Se connecter
        </button>
      </p>
    </form>
  );
}

/** Page /connexion et /inscription : la carte au centre, sur un papier pointillé. */
export function AuthPage({ start }: { start: 'connexion' | 'inscription' }) {
  const next = new URLSearchParams(location.search).get('suite');
  useMusicTucked();
  return (
    <main className="auth-dots grid min-h-full place-items-center px-4 py-8">
      <AuthCard start={start} onDone={() => (next === 'jeux' ? go(null) : go('album'))} />
    </main>
  );
}
