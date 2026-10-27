import { useEffect, useRef, useState } from 'react';
import { net } from '../lib/net';
import { useGame } from '../lib/store';

/**
 * Bandeau de reconnexion : il descend quand la connexion tombe (appli passée en arrière-plan),
 * un fil d'or court dessous le temps des essais, puis une coche se dessine au retour et il remonte.
 */
export function ReconnectBanner() {
  const status = useGame((s) => s.status);
  const [back, setBack] = useState(false);
  const prev = useRef(status);
  useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (was === 'reconnecting' && status === 'online') {
      setBack(true);
      const id = setTimeout(() => setBack(false), 1600);
      return () => clearTimeout(id);
    }
  }, [status]);

  const lost = status === 'reconnecting';
  if (!lost && !back) return null;
  return (
    <div className="rc-wrap" role="status" aria-live="polite">
      <div key={lost ? 'lost' : 'back'} className={`rc-pill ${back && !lost ? 'rc-back' : ''}`}>
        {lost ? (
          <>
            <svg viewBox="0 0 24 24" className="rc-wifi size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M2.5 8.5a14 14 0 0 1 19 0" />
              <path d="M5.5 12a9.5 9.5 0 0 1 13 0" />
              <path d="M8.7 15.4a5 5 0 0 1 6.6 0" />
              <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                Connexion perdue<span className="m-dots"><span>.</span><span>.</span><span>.</span></span>
              </span>
              <span className="block text-xs opacity-80">Ta place est gardée, on te reconnecte.</span>
            </span>
            <button className="rc-retry" onClick={() => net.retryNow()}>
              Réessayer
            </button>
            <span className="rc-thread" aria-hidden />
          </>
        ) : (
          <>
            <svg viewBox="0 0 14 14" className="m-logo size-4 shrink-0" aria-hidden>
              <path className="m-stroke" pathLength={1} d="M2 7.5l3 3 7-7" fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-semibold">De retour, rien n'a bougé !</span>
          </>
        )}
      </div>
    </div>
  );
}
