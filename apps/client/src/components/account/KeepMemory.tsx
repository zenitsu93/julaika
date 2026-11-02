import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '../../lib/account';
import { usePendingCount } from '../../lib/keeper';
import { useGame } from '../../lib/store';
import { AuthCard } from './AuthCard';
import { Icon } from './ui';

/**
 * Pour un invité : en fin de partie, une carte propose de garder les images de la partie.
 * Elles attendent dans le navigateur (24 h) ; créer un compte ou se connecter les envoie dans l'album.
 */
export function KeepMemory() {
  const { user, ready } = useAccount();
  const pending = usePendingCount();
  const ending = useGame((s) => s.room?.phase === 'gameEnd');
  const party = useGame((s) => s.room?.party ?? null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setModal(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [modal]);

  const show = ready && !user && pending > 0 && ending && dismissed !== party;
  return (
    <>
      {show && !modal && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
          <div className="keep-card panel pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl py-2.5 pr-2 pl-3.5 shadow-[0_16px_40px_-18px_rgb(42_26_18/.6)]">
            <Icon name="heart" className="size-5 text-accent" />
            <span className="text-sm">
              <b>{pending} image{pending > 1 ? 's' : ''}</b> de cette partie. Crée ton compte pour les garder.
            </span>
            <button type="button" className="btn-primary shrink-0" onClick={() => setModal(true)}>
              Garder ce souvenir
            </button>
            <button type="button" className="p-1 text-muted" onClick={() => setDismissed(party)} aria-label="Non merci">
              <Icon name="x" />
            </button>
          </div>
        </div>
      )}
      {saved > 0 && <Saved count={saved} onDone={() => setSaved(0)} />}
      {modal &&
        createPortal(
          <div className="lightbox fixed inset-0 z-50 grid place-items-center overflow-auto bg-cacao/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Garder ce souvenir" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
            <AuthCard
              start="inscription"
              onDone={() => {
                setSaved(pending);
                setModal(false);
              }}
              onGuest={() => setModal(false)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function Saved({ count, onDone }: { count: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <div className="keep-card flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-lg">
        <Icon name="check" />
        {count} image{count > 1 ? 's' : ''} dans ton album
      </div>
    </div>
  );
}
