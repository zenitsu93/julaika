import { useEffect, useState } from 'react';
import { serverNow, useGame } from '../lib/store';
import { LogoMark } from './Logo';
import { MeetButton } from './MeetButton';

function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
    <header className="panel flex items-center gap-3 px-3 py-2">
      <span
        className={`rounded-md px-2 py-1 font-mono text-sm font-bold tabular-nums ${urgent ? 'bg-bad text-white' : 'bg-primary text-on-primary'}`}
        aria-label="Temps restant"
      >
        {room.endsAt ? clock(left) : '--:--'}
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <LogoMark className="h-6 w-auto" />
        <b className="font-semibold tracking-[-0.05em]">julaika</b>
      </span>
      <span className="text-sm text-muted">
        {room.phase === 'lobby' ? 'Salon' : `Manche ${Math.min(room.round, room.settings.rounds)}/${room.settings.rounds}`}
      </span>
      <div className="min-w-0 flex-1 truncate text-center font-mono text-lg font-bold tracking-[0.3em] sm:text-xl" aria-live="polite">
        {room.hint ?? (room.phase === 'choosing' ? <span className="text-sm font-normal tracking-normal text-muted">choix du mot…</span> : '')}
      </div>
      <MeetButton />
      <button className="btn-ghost px-2.5 py-1.5 font-mono" onClick={copy} title="Copier le lien d'invitation">
        {copied ? 'Lien copié' : `#${room.code}`}
      </button>
    </header>
  );
}
