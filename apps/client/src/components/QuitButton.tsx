import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { net } from '../lib/net';
import { serverNow, useGame } from '../lib/store';
import { Presence, reducedMotion } from '../motion';
import { SwitchButton } from './GamePicker';

/** Le temps que la porte se referme et que la carte s'efface avant de rendre l'accueil. */
const CLOSE_MS = 420;

/** Petite porte : le battant s'entrouvre au survol du bouton et une flèche en sort. */
function Door({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`q-door ${className}`} aria-hidden>
      <path d="M4 21h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h7A1.5 1.5 0 0 1 16 4.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <g className="q-leaf">
        <path d="M6 21V3l7 1.6V22z" fill="var(--color-accent)" fillOpacity=".22" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="11" cy="12.5" r="1" fill="currentColor" />
      </g>
      <path className="q-arrow" d="M15 12h6m-2.5-2.5L21 12l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Carte de confirmation. Elle reste ouverte tant qu'on n'a pas choisi : aucun minuteur ne la
 * referme, même quand la partie change de phase derrière.
 */
function QuitDialog({ onStay, onQuit }: { onStay: () => void; onQuit: () => void }) {
  const room = useGame((s) => s.room!);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const others = room.players.length - 1;
  const [closing, setClosing] = useState(false);
  const stay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stay.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onStay]);

  const quit = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onQuit, reducedMotion() ? 0 : CLOSE_MS);
  };

  const playing = room.phase !== 'lobby';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" data-quitting={closing ? '' : undefined}>
      <div className="m-veil q-veil absolute inset-0 bg-page/75 backdrop-blur-sm" onClick={onStay} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="q-title"
        aria-describedby="q-text"
        className="m-card q-card panel relative w-full max-w-sm overflow-hidden p-6 text-center shadow-[0_24px_60px_-24px_rgb(42_26_18/.55)]"
      >
        <span className="q-glow pointer-events-none absolute inset-x-0 -top-16 mx-auto size-40 rounded-full" aria-hidden />
        <Door className="q-door-big relative mx-auto mb-3 size-14 text-ink" />
        <h2 id="q-title" className="relative text-xl font-semibold">
          Quitter le salon ?
        </h2>
        <p id="q-text" className="relative mt-2 text-sm text-muted">
          {playing && others > 0 ? 'La partie continue sans toi. ' : ''}
          {isHost && others > 0 ? 'Un autre joueur deviendra l’hôte. ' : ''}
          Tu pourras revenir avec le code <span className="font-mono font-semibold text-ink">#{room.code}</span>.
        </p>
        <div className="relative mt-6 grid grid-cols-2 gap-2">
          <button ref={stay} className="btn-ghost" onClick={onStay} disabled={closing}>
            Rester
          </button>
          <button className="btn q-confirm bg-bad text-white hover:opacity-90" onClick={quit} disabled={closing}>
            <Door className="size-4" />
            Quitter
          </button>
        </div>
        <p className="relative mt-3 hidden text-[11px] text-muted sm:block">
          <kbd className="kbd">Échap</kbd> pour rester
        </p>
      </div>
    </div>
  );
}

/** Bouton « Quitter » : toujours dans la barre du haut, dans le salon comme dans chaque jeu. */
export function QuitButton({ onAsk, label = 'Quitter', className = '' }: { onAsk: () => void; label?: string; className?: string }) {
  return (
    <button
      className={`btn-ghost q-btn px-2.5 py-1.5 hover:border-bad/40 hover:text-bad ${className}`}
      onClick={onAsk}
      aria-haspopup="dialog"
      title="Quitter le salon"
    >
      <Door className="size-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
}

/**
 * Sortie du salon, tenue au niveau de la partie : la carte survit aux changements de phase
 * (fin de partie → salon) au lieu de disparaître avec le bouton qui l'a ouverte.
 */
export function useQuit(onQuit: () => void) {
  const [open, setOpen] = useState(false);
  const ask = useCallback(() => setOpen(true), []);
  const stay = useCallback(() => setOpen(false), []);
  const leave = useCallback(() => {
    net.leave();
    onQuit();
  }, [onQuit]);
  const dialog = createPortal(<Presence>{open && <QuitDialog onStay={stay} onQuit={leave} />}</Presence>, document.body);
  return { ask, dialog };
}

/**
 * Fin de partie : le podium ne dure que quelques secondes avant le retour au salon. Un dock
 * rappelle le temps qui reste et offre la sortie sans aller la chercher en haut.
 */
export function EndDock({ onAsk, onSwitch }: { onAsk: () => void; onSwitch?: () => void }) {
  const ending = useGame((s) => s.room!.phase === 'gameEnd');
  const endsAt = useGame((s) => s.room!.endsAt);
  return <Presence>{ending && endsAt && <Dock endsAt={endsAt} onAsk={onAsk} onSwitch={onSwitch} />}</Presence>;
}

function Dock({ endsAt, onAsk, onSwitch }: { endsAt: number; onAsk: () => void; onSwitch?: () => void }) {
  const [start] = useState(() => serverNow());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, []);
  const total = Math.max(1, endsAt - start);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const progress = Math.min(1, Math.max(0, (now - start) / total));
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="m-dock panel pointer-events-auto flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-2 shadow-[0_16px_40px_-18px_rgb(42_26_18/.6)]">
        <svg viewBox="0 0 36 36" className="size-8 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-edge)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={progress}
            className="transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
        <span className="text-sm whitespace-nowrap" aria-live="polite">
          Retour au salon dans <span className="font-mono font-semibold tabular-nums">{`${left}\u00a0s`}</span>
        </span>
        {/* L'hôte enchaîne sur un autre jeu sans attendre la fin du compte à rebours. */}
        {onSwitch && <SwitchButton onClick={onSwitch} label="Autre jeu" className="rounded-full" />}
        <QuitButton onAsk={onAsk} label="Quitter la partie" className="rounded-full" />
      </div>
    </div>
  );
}
