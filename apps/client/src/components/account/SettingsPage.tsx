import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PASSWORD_MIN, type UserPublic } from '@julaika/shared';
import { ApiError, api, logout, refreshAccount, setUser, useAccount } from '../../lib/account';
import { AVATARS } from '../../lib/avatars';
import { go } from '../../lib/route';
import { TremaLoader } from '../Logo';
import { Strength } from './ResetPage';
import { AccountNav, Avatar, ErrorLine, Field, Icon, useToast } from './ui';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Ça n’a pas marché, réessaie.');

function Card({ title, sub, children, danger, delay = 0 }: { title: string; sub?: ReactNode; children: ReactNode; danger?: boolean; delay?: number }) {
  return (
    <section className={`acc-up grid gap-3.5 rounded-[18px] border bg-surface p-5 ${danger ? 'border-bad/35' : 'border-edge'}`} style={{ animationDelay: `${delay}ms` }}>
      <div>
        <h2 className={`text-lg ${danger ? 'text-bad' : ''}`}>{title}</h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** Réglages du compte : profil, mot de passe, appareils, album, suppression. */
export function SettingsPage() {
  const { user, ready } = useAccount();
  const [toast, show] = useToast();
  useEffect(() => {
    if (ready && !user) go('connexion');
  }, [ready, user]);
  if (!user) return null;
  return (
    <div className="min-h-full pb-16">
      <AccountNav page="reglages" />
      <main className="mx-auto grid max-w-2xl gap-4 px-4 pt-6 sm:px-6">
        <h1 className="text-[1.7rem] tracking-[-0.02em]">Réglages</h1>
        <Profile user={user} show={show} />
        <Password user={user} show={show} />
        <Devices show={show} />
        <Card title="Mon album" sub="Toutes tes images, rangées par jeu, dans un seul fichier .zip." delay={180}>
          <a className="btn-ghost w-max no-underline" href="/api/album/zip" download onClick={() => show('Ton album arrive en .zip')}>
            <Icon name="dl" />
            Télécharger tout mon album
          </a>
        </Card>
        <Card title="Se déconnecter" sub={`Connecté en tant que ${user.email}.`} delay={220}>
          <button
            type="button"
            className="btn-ghost w-max"
            onClick={async () => {
              await logout();
              go('bienvenue');
            }}
          >
            Me déconnecter
          </button>
        </Card>
        <Remove user={user} />
      </main>
      {toast}
    </div>
  );
}

function Profile({ user, show }: { user: UserPublic; show: (t: string) => void }) {
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== user.name || avatar !== user.avatar;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: UserPublic }>('/api/compte', { method: 'PATCH', body: { name, avatar } });
      setUser(r.user);
      show('Profil enregistré');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Profil" sub="Ton pseudo et ta tête dans les salons.">
      <form onSubmit={submit} className="grid gap-3.5">
        <div className="flex items-center gap-3">
          <Avatar avatar={avatar} className="size-14 text-3xl ring-[3px] ring-accent" />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Avatar">
            {AVATARS.map((a, i) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={avatar === i}
                onClick={() => setAvatar(i)}
                className={`grid size-9 place-items-center rounded-full bg-page text-lg transition ${avatar === i ? '-translate-y-0.5 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:-translate-y-0.5'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <ErrorLine text={error} />
        <Field label="Pseudo">
          <input className="input" id="settings-name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className="btn-primary w-max" disabled={busy || !dirty || !name.trim()}>
          {busy ? <TremaLoader className="h-4 w-5" /> : 'Enregistrer'}
        </button>
      </form>
    </Card>
  );
}

function Password({ user, show }: { user: UserPublic; show: (t: string) => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/compte/mot-de-passe', { body: { current, password } });
      setCurrent('');
      setPassword('');
      await refreshAccount();
      show(user.hasPassword ? 'Mot de passe changé' : 'Mot de passe créé');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="Mot de passe"
      sub={user.hasPassword ? 'Les autres appareils seront déconnectés.' : 'Ton compte passe par Google. Crée un mot de passe pour te connecter aussi avec ton e-mail.'}
      delay={60}
    >
      <form onSubmit={submit} className="grid gap-3.5">
        <ErrorLine text={error} />
        {user.hasPassword && (
          <Field label="Mot de passe actuel">
            <input className="input" id="settings-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label="Nouveau mot de passe">
          <input className="input" id="settings-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {password && <Strength value={password} />}
        <button className="btn-primary w-max" disabled={busy || password.length < PASSWORD_MIN || (user.hasPassword && !current)}>
          {busy ? <TremaLoader className="h-4 w-5" /> : user.hasPassword ? 'Changer' : 'Créer mon mot de passe'}
        </button>
      </form>
    </Card>
  );
}

function Devices({ show }: { show: (t: string) => void }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    api<{ count: number }>('/api/compte/appareils')
      .then((r) => setCount(r.count))
      .catch(() => {});
  }, []);
  const others = Math.max(0, (count ?? 1) - 1);
  return (
    <Card
      title="Appareils"
      sub={count === null ? '…' : others ? `Ton compte est ouvert ici et sur ${others} autre${others > 1 ? 's' : ''} appareil${others > 1 ? 's' : ''}.` : 'Ton compte n’est ouvert que sur cet appareil.'}
      delay={120}
    >
      <button
        type="button"
        className="btn-ghost w-max"
        disabled={!others}
        onClick={async () => {
          try {
            await api('/api/compte/deconnecter-partout', { body: {} });
            setCount(1);
            show('Les autres appareils sont déconnectés');
          } catch (err) {
            show(errText(err));
          }
        }}
      >
        Déconnecter les autres appareils
      </button>
    </Card>
  );
}

function Remove({ user }: { user: UserPublic }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sans mot de passe (compte Google), on fait taper le mot SUPPRIMER pour confirmer.
  const ok = user.hasPassword ? password.length > 0 : password.trim().toUpperCase() === 'SUPPRIMER';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/compte/supprimer', { body: { password: user.hasPassword ? password : '' } });
      await logout();
      go('bienvenue');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Ce n’est pas le bon mot de passe.' : errText(err));
      setBusy(false);
    }
  };
  return (
    <Card title="Supprimer mon compte" sub="Ton album, ton historique et ton profil sont effacés pour de bon." danger delay={260}>
      {!open ? (
        <button type="button" className="btn-ghost w-max text-bad" onClick={() => setOpen(true)}>
          <Icon name="trash" />
          Supprimer mon compte
        </button>
      ) : (
        <form onSubmit={submit} className="m-pop grid gap-3">
          <p className="text-sm">Pense à télécharger ton album avant : on ne pourra pas le récupérer.</p>
          <ErrorLine text={error} />
          <Field label={user.hasPassword ? 'Ton mot de passe, pour confirmer' : 'Tape SUPPRIMER pour confirmer'}>
            <input
              className="input"
              id="settings-delete"
              type={user.hasPassword ? 'password' : 'text'}
              autoComplete={user.hasPassword ? 'current-password' : 'off'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-bad text-white" disabled={busy || !ok}>
              {busy ? <TremaLoader className="h-4 w-5" /> : 'Supprimer définitivement'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
