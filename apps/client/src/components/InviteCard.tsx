import { useState } from 'react';
import { inviteLink, shareInvite } from '../lib/invite';
import { useGame } from '../lib/store';
import { bump } from '../motion';

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" />
    <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
);

/**
 * Invitation du salon : le code en grand, un bouton qui ouvre la feuille de partage du téléphone
 * (WhatsApp, SMS…) et un rappel que le salon attend l'hôte pendant qu'il est dans l'autre appli.
 */
export function InviteCard() {
  const code = useGame((s) => s.room!.code);
  const alone = useGame((s) => s.room!.players.length < 2);
  const [done, setDone] = useState<'shared' | 'copied' | null>(null);

  const share = async (e: React.MouseEvent<HTMLButtonElement>) => {
    bump(e.currentTarget, 0.96);
    const out = await shareInvite(code);
    if (out === 'cancelled') return;
    setDone(out);
    setTimeout(() => setDone(null), 1800);
  };
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    bump(e.currentTarget, 0.96);
    await navigator.clipboard?.writeText(inviteLink(code)).catch(() => {});
    setDone('copied');
    setTimeout(() => setDone(null), 1800);
  };

  return (
    <div className="mb-5 rounded-xl border border-edge bg-page p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Code du salon</p>
          <p className="inv-code font-mono text-2xl font-bold tracking-[0.3em]" aria-label={`Code ${code}`}>
            {[...code].map((c, i) => (
              <span key={i} style={{ animationDelay: `${120 + i * 60}ms` }} aria-hidden>
                {c}
              </span>
            ))}
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`btn-primary ${alone ? 'inv-share' : ''} px-3 py-2`} onClick={share}>
            <span key={done ?? 'idle'} className="m-rise inline-flex items-center gap-1.5">
              {done ? (
                <>
                  <svg viewBox="0 0 14 14" className="m-logo size-3.5" aria-hidden>
                    <path className="m-stroke" pathLength={1} d="M2 7.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {done === 'shared' ? 'Envoyé' : 'Lien copié'}
                </>
              ) : (
                <>
                  <ShareIcon />
                  Inviter
                </>
              )}
            </span>
          </button>
          <button className="btn-ghost px-3 py-2" onClick={copy} title="Copier le lien">
            Copier
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Tu peux passer sur WhatsApp pour l'envoyer : le salon t'attend 10 minutes et tu retrouves ta place en revenant.
      </p>
    </div>
  );
}
