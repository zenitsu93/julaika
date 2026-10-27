import { useEffect, useState } from 'react';
import { serverNow, useGame } from '../lib/store';

function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

export function TopBar() {
  const room = useGame((s) => s.room!);
  const left = useCountdown(room.endsAt);
  const [copied, setCopied] = useState(false);
  const urgent = room.phase === 'drawing' && left <= 10;

  const copy = async () => {
    await navigator.clipboard?.writeText(`${location.origin}/r/${room.code}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className="glass flex items-center gap-4 px-4 py-2">
      <div
        className={`grid size-12 shrink-0 place-items-center rounded-full border-2 font-mono text-lg font-bold ${
          urgent ? 'animate-pulse border-neon-pink text-neon-pink' : 'border-neon-cyan text-neon-cyan'
        }`}
        aria-label="Temps restant"
      >
        {room.endsAt ? left : '∞'}
      </div>
      <div className="text-sm text-muted">
        {room.phase === 'lobby' ? 'Salon' : `Manche ${Math.min(room.round, room.settings.rounds)} / ${room.settings.rounds}`}
      </div>
      <div className="flex-1 text-center font-mono text-xl tracking-[0.3em] sm:text-2xl" aria-live="polite">
        {room.hint ?? (room.phase === 'choosing' ? 'choix du mot…' : '')}
      </div>
      <button className="btn-ghost px-3 py-1.5 font-mono text-sm" onClick={copy} title="Copier le lien d'invitation">
        {copied ? 'Lien copié !' : `#${room.code}`}
      </button>
    </header>
  );
}
