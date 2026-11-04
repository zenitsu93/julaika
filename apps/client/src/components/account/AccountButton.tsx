import { useAccount } from '../../lib/account';
import { go } from '../../lib/route';
import { Avatar, Icon } from './ui';

/** En haut de l'accueil : l'album du joueur connecté, sinon « Connexion ». */
export function AccountButton() {
  const { user, ready } = useAccount();
  if (!ready) return <span className="size-9" aria-hidden />;
  if (!user)
    return (
      <button type="button" className="btn-ghost" onClick={() => go('connexion')}>
        Connexion
      </button>
    );
  return (
    <button type="button" className="btn-ghost gap-2 py-1 pr-3 pl-1" onClick={() => go('album')} aria-label={`Mon album (${user.name})`}>
      <Avatar avatar={user.avatar} className="size-7 text-sm" />
      <span className="max-sm:hidden">Mon album</span>
      <Icon name="album" className="size-4 sm:hidden" />
    </button>
  );
}
