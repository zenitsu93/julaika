import { useEffect, useRef, useState, type ReactNode } from 'react';
import { avatarOf } from '../../lib/avatars';
import { useAccount } from '../../lib/account';
import { go, type Page } from '../../lib/route';
import { Wordmark } from '../Logo';
import './account.css';

const PATHS = {
  dl: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  left: 'm14.5 6-6 6 6 6',
  right: 'm9.5 6 6 6-6 6',
  share: 'M12 15V4m0 0L8 8m4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  chev: 'm6 9 6 6 6-6',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  replay: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4',
  album: 'M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5ZM3.5 16l5-5 4 4 2.5-2.5 5.5 5.5',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V12l3 2',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5Z',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z',
} as const;

export function Icon({ name, className = 'size-4' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Rond d'avatar (l'emoji du joueur sur fond or). */
export function Avatar({ avatar, className = 'size-8 text-base' }: { avatar: number; className?: string }) {
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full bg-butter ring-2 ring-surface dark:bg-cacao-2 ${className}`} aria-hidden>
      {avatarOf(avatar)}
    </span>
  );
}

/** Bandeau des pages du compte : logo (retour aux jeux), onglets, avatar. */
export function AccountNav({ page }: { page: Page }) {
  const { user } = useAccount();
  const tabs: [Page | null, string][] = [
    [null, 'Jouer'],
    ['album', 'Album'],
    ['historique', 'Historique'],
    ['reglages', 'Réglages'],
  ];
  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-page/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <button type="button" onClick={() => go(null)} className="rounded-md" aria-label="Retour aux jeux">
          <Wordmark className="h-8 w-auto" />
        </button>
        <nav className="ml-auto flex items-center gap-0.5 overflow-x-auto text-sm font-medium" aria-label="Mon compte">
          {tabs.map(([p, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => go(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`rounded-lg px-2.5 py-1.5 transition ${p === page ? 'bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]' : 'text-muted hover:text-ink'} ${p === 'reglages' ? 'max-sm:hidden' : ''}`}
            >
              {label}
            </button>
          ))}
          {user && (
            <button type="button" onClick={() => go('reglages')} className="ml-1.5 rounded-full" aria-label="Réglages du compte">
              <Avatar avatar={user.avatar} />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

/** Petit message en bas de l'écran (« Image téléchargée »). */
export function useToast(): [ReactNode, (text: string) => void] {
  const [text, setText] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (t: string) => {
    setText(t);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2800);
  };
  const node = (
    <div
      role="status"
      aria-live="polite"
      className={`acc-toast fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[92vw] items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-[0_14px_30px_-14px_rgb(0_0_0/0.6)] ${on ? 'on' : ''}`}
    >
      <Icon name="check" />
      {text}
    </div>
  );
  return [node, show];
}

/** Champ de formulaire avec son libellé. */
export function Field({ label, aside, hint, children }: { label: string; aside?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-left">
      <span className="flex justify-between gap-2 text-[13px] font-semibold">
        {label}
        {aside}
      </span>
      {children}
      {hint && <small className="text-xs text-muted">{hint}</small>}
    </label>
  );
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="m-pop rounded-lg bg-bad/10 px-3 py-2 text-left text-sm font-medium text-bad">
      {text}
    </p>
  );
}

/** Bouton Google (affiché seulement si le serveur a ses clés). */
export function GoogleButton({ next = '/album' }: { next?: string }) {
  const { google } = useAccount();
  if (!google) return null;
  return (
    <a href={`/api/auth/google?suite=${encodeURIComponent(next)}`} className="btn-ghost w-full py-2.5 no-underline">
      <span className="grid size-[18px] place-items-center rounded-full bg-[conic-gradient(#ea4335_0_25%,#fbbc05_0_50%,#34a853_0_75%,#4285f4_0)]" aria-hidden>
        <span className="size-[9px] rounded-full bg-surface" />
      </span>
      Continuer avec Google
    </a>
  );
}

export const dateFr = (t: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('fr-FR', opts).format(new Date(t));
