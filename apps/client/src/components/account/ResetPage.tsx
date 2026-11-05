import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PASSWORD_MIN, PASSWORD_RULES, passwordScore, type UserPublic } from '@julaika/shared';
import { ApiError, api, signedIn } from '../../lib/account';
import { go } from '../../lib/route';
import { shake } from '../../motion';
import { TremaLoader } from '../Logo';
import { ErrorLine, Field, Icon } from './ui';
import { useMusicTucked } from '../MusicPlayer';

const RESEND = 60;

/** Mot de passe oublié : e-mail → code à 6 chiffres → nouveau mot de passe → connecté. */
export function ResetPage() {
  useMusicTucked();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(() => new URLSearchParams(location.search).get('email') ?? '');
  const [token, setToken] = useState('');
  return (
    <main className="grid min-h-full content-start justify-items-center px-4 pt-14 pb-8 sm:place-content-center">
      <div className="grid w-full max-w-[26rem] gap-5">
        <ol className="steps-bar flex gap-1.5" aria-label={`Étape ${step} sur 3`}>
          {[1, 2, 3].map((n) => (
            <li key={n} className={`relative h-1 flex-1 overflow-hidden rounded-full bg-edge ${step >= n ? 'on' : ''}`} />
          ))}
        </ol>
        {step === 1 && <AskCode email={email} setEmail={setEmail} onSent={() => setStep(2)} />}
        {step === 2 && (
          <EnterCode
            email={email}
            onBack={() => setStep(1)}
            onOk={(t) => {
              setToken(t);
              setStep(3);
            }}
          />
        )}
        {step === 3 && <NewPassword token={token} onDone={() => setStep(4)} />}
        {step === 4 && <Done />}
      </div>
    </main>
  );
}

function AskCode({ email, setEmail, onSent }: { email: string; setEmail: (v: string) => void; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/code', { body: { email } });
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ça n’a pas marché, réessaie.');
      shake(form.current);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form ref={form} onSubmit={submit} className="acc-up grid gap-3.5">
      <button type="button" className="inline-flex w-max items-center gap-1.5 text-sm text-muted hover:text-ink" onClick={() => go('connexion')}>
        <Icon name="left" />
        Retour à la connexion
      </button>
      <h1 className="text-[1.7rem] tracking-[-0.02em]">Récupérer mon compte</h1>
      <p className="-mt-1 text-muted">On t'envoie un code à 6 chiffres par e-mail.</p>
      <ErrorLine text={error} />
      <Field label="E-mail">
        <input className="input" id="reset-email" type="email" autoComplete="email" inputMode="email" placeholder="ton@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
      </Field>
      <button className="btn-primary w-full py-2.5" disabled={busy || !email.includes('@')}>
        {busy ? <TremaLoader className="h-4 w-5" /> : 'Recevoir le code'}
      </button>
    </form>
  );
}

function EnterCode({ email, onBack, onOk }: { email: string; onBack: () => void; onOk: (token: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [state, setState] = useState<'idle' | 'busy' | 'ok'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputs.current[0]?.focus();
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const check = async (code: string) => {
    setState('busy');
    setError(null);
    try {
      const { token } = await api<{ token: string }>('/api/auth/code/verifier', { body: { email, code } });
      setState('ok');
      setTimeout(() => onOk(token), 600);
    } catch (err) {
      setState('idle');
      setError(err instanceof ApiError ? err.message : 'Ça n’a pas marché, réessaie.');
      box.current?.classList.remove('acc-shake');
      void box.current?.offsetWidth;
      box.current?.classList.add('acc-shake');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    }
  };

  const put = (i: number, raw: string) => {
    const chars = raw.replace(/\D/g, '');
    if (!chars) return setDigits((d) => d.map((v, j) => (j === i ? '' : v)));
    const next = [...digits];
    // Un code collé (ou dicté par le téléphone) remplit toutes les cases d'un coup.
    for (let k = 0; k < chars.length && i + k < 6; k++) next[i + k] = chars[k]!;
    setDigits(next);
    const el = inputs.current[i];
    el?.classList.remove('fill');
    void el?.offsetWidth;
    el?.classList.add('fill');
    const at = Math.min(5, i + chars.length);
    inputs.current[at]?.focus();
    if (next.every(Boolean)) void check(next.join(''));
  };

  const resend = async () => {
    setLeft(RESEND);
    await api('/api/auth/code', { body: { email } }).catch((e: ApiError) => setError(e.message));
  };

  return (
    <div className="acc-up grid gap-3.5">
      <h1 className="text-[1.7rem] tracking-[-0.02em]">Tape le code</h1>
      <p className="-mt-1 text-muted">
        Envoyé à <b className="text-ink">{email}</b> si un compte existe. Il marche 30 minutes.{' '}
        <button type="button" className="font-semibold text-accent" onClick={onBack}>
          Changer
        </button>
      </p>
      <ErrorLine text={error} />
      <div ref={box} className={`otp grid grid-cols-6 gap-2 ${state === 'ok' ? 'ok' : ''}`}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => void (inputs.current[i] = el)}
            id={`reset-code-${i}`}
            className="w-full min-w-0 rounded-xl border-[1.5px] border-edge bg-surface p-0 text-center text-2xl font-bold outline-none focus:border-ink focus:ring-4 focus:ring-ink/10"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={i === 0 ? 6 : 1}
            aria-label={`Chiffre ${i + 1}`}
            value={d}
            disabled={state !== 'idle'}
            onChange={(e) => put(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus();
            }}
            onPaste={(e) => {
              e.preventDefault();
              put(i, e.clipboardData.getData('text'));
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        {left > 0 ? <span>Renvoyer le code dans 0:{String(left).padStart(2, '0')}</span> : (
          <button type="button" className="font-semibold text-accent" onClick={resend}>
            Renvoyer le code
          </button>
        )}
        <span>Pense à regarder les spams.</span>
      </div>
      {state === 'busy' && <TremaLoader className="mx-auto h-5 w-6" />}
    </div>
  );
}

const SEG_COLORS = ['var(--color-bad)', 'var(--color-warn)', 'var(--color-accent)', 'var(--color-good)'];

/** Jauge en 4 segments et règles qui se cochent. Réutilisée par les réglages. */
export function Strength({ value }: { value: string }) {
  const score = passwordScore(value);
  return (
    <>
      <div className="seg grid grid-cols-4 gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={`relative h-1.5 overflow-hidden rounded-full bg-edge ${i < score ? 'on' : ''}`} style={{ '--seg': SEG_COLORS[Math.max(0, score - 1)] } as React.CSSProperties} />
        ))}
      </div>
      <ul className="grid gap-1.5 text-sm">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.id} className={`rule flex items-center gap-2 ${ok ? 'ok text-ink' : 'text-muted'}`}>
              <i className={`grid size-[18px] place-items-center rounded-full border-[1.5px] ${ok ? 'border-good bg-good text-white' : 'border-edge'}`}>
                <Icon name="check" className="size-[11px] stroke-[3]" />
              </i>
              {r.label}
              {r.id === 'len' ? '' : <span className="text-xs text-muted">(conseillé)</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function NewPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: UserPublic }>('/api/auth/code/nouveau', { body: { token, password } });
      await signedIn(user);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ça n’a pas marché, réessaie.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="acc-up grid gap-3.5">
      <h1 className="text-[1.7rem] tracking-[-0.02em]">Nouveau mot de passe</h1>
      <ErrorLine text={error} />
      <Field label="Mot de passe">
        <span className="relative block">
          <input
            className="input pr-11"
            id="reset-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Essaie : Sourire2026!"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 text-muted" onClick={() => setShow((s) => !s)} aria-label={show ? 'Masquer' : 'Afficher'}>
            <Icon name="eye" />
          </button>
        </span>
      </Field>
      <Strength value={password} />
      <button className="btn-primary w-full py-2.5" disabled={busy || password.length < PASSWORD_MIN}>
        {busy ? <TremaLoader className="h-4 w-5" /> : 'Enregistrer'}
      </button>
    </form>
  );
}

function Done() {
  return (
    <div className="acc-up grid justify-items-center gap-3 text-center">
      <svg viewBox="0 0 64 64" className="done-mark size-24" aria-hidden>
        <rect width="64" height="64" rx="14" style={{ fill: 'var(--color-primary)' }} />
        <circle className="e" cx="24" cy="25" r="5.5" style={{ fill: 'var(--color-logo-eye)' }} />
        <circle className="e" cx="40" cy="25" r="5.5" style={{ fill: 'var(--color-logo-eye)', animationDelay: '.12s' }} />
        <path className="s" pathLength={1} d="M18 37Q32 51 46 37" fill="none" strokeWidth="6" strokeLinecap="round" style={{ stroke: 'var(--color-on-primary)' }} />
      </svg>
      <h1 className="text-[1.7rem] tracking-[-0.02em]">Compte récupéré</h1>
      <p className="text-muted">Tu es connecté. Les autres appareils ont été déconnectés par sécurité.</p>
      <button type="button" className="btn-primary" onClick={() => go('album')}>
        Voir mon album
      </button>
    </div>
  );
}
