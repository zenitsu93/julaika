import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { serverNow, useGame } from '../lib/store';
import { animate, Ticker } from '../motion';
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

/**
 * Indice du mot : chaque lettre révélée pivote et s'allume en jaune ; à l'apparition du mot,
 * les tirets arrivent un par un.
 */
function Hint({ text }: { text: string }) {
  const slots = useRef<(HTMLSpanElement | null)[]>([]);
  const prev = useRef('');
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = text;
    if (before.length !== text.length) {
      slots.current.forEach((el, i) => animate(el, [{ transform: 'translateY(6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, delay: i * 25 }));
      return;
    }
    [...text].forEach((c, i) => {
      if (before[i] === c) return;
      animate(
        slots.current[i],
        [
          { transform: 'perspective(300px) rotateX(-90deg)', backgroundColor: 'rgb(245 183 0 / .45)' },
          { transform: 'none', backgroundColor: 'rgb(245 183 0 / .45)', offset: 0.4 },
          { transform: 'none', backgroundColor: 'rgb(245 183 0 / 0)' },
        ],
        { duration: 700 },
      );
    });
  }, [text]);
  return (
    <>
      <span className="sr-only">{text}</span>
      {[...text].map((c, i) => (
        <span key={i} ref={(el) => void (slots.current[i] = el)} className="inline-block rounded" aria-hidden>
          {c === ' ' ? '\u00a0' : c}
        </span>
      ))}
    </>
  );
}

export function TopBar() {
  const room = useGame((s) => s.room!);
  const left = useCountdown(room.endsAt);
  const [copied, setCopied] = useState(false);
  const urgent = (room.phase === 'drawing' || room.phase === 'guess' || room.phase === 'draw' || room.phase === 'write' || room.phase === 'describe' || room.phase === 'clue' || room.phase === 'vote' || room.phase === 'steal') && left <= 10;
  const timer = useRef<HTMLSpanElement>(null);

  // Sous 10 s, la pastille bat doucement à chaque seconde.
  useEffect(() => {
    if (urgent && left > 0) animate(timer.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out', fill: 'none' });
  }, [urgent, left]);

  const copy = async () => {
    await navigator.clipboard?.writeText(`${location.origin}/r/${room.code}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className="panel flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <span
        ref={timer}
        className={`rounded-md px-2 py-1 font-mono text-sm font-bold tabular-nums transition-colors duration-300 ${urgent ? 'bg-bad text-white' : 'bg-primary text-on-primary'}`}
        aria-label="Temps restant"
      >
        <Ticker value={room.endsAt ? clock(left) : '--:--'} />
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <LogoMark className="h-6 w-auto" />
        <b className="font-logo font-semibold tracking-[-0.035em]">julaïka</b>
      </span>
      <span className="text-sm text-muted">
        {room.phase === 'lobby'
          ? 'Salon'
          : room.tel
            ? room.phase === 'album'
              ? 'Album'
              : `Étape ${room.tel.step + 1}/${room.tel.steps}`
            : `Manche ${Math.min(room.round, room.settings.rounds)}/${room.settings.rounds}`}
      </span>
      <div className="order-last min-w-0 basis-full truncate text-center font-mono text-lg font-bold tracking-[0.2em] empty:hidden sm:order-none sm:flex-1 sm:basis-auto sm:text-xl sm:tracking-[0.3em]" aria-live="polite">
        {room.hint ? (
          <Hint text={room.hint} />
        ) : room.phase === 'choosing' ? (
          <span className="text-sm font-normal tracking-normal text-muted">
            choix du mot<span className="m-dots"><span>.</span><span>.</span><span>.</span></span>
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2 sm:ml-0">
        <MeetButton />
        <button className="btn-ghost relative overflow-hidden px-2.5 py-1.5 font-mono" onClick={copy} title="Copier le lien d'invitation">
          {/* Le code glisse vers le haut et laisse place à une coche qui se dessine. */}
          <span key={String(copied)} className="m-rise inline-flex items-center gap-1.5" aria-live="polite">
            {copied ? (
              <>
                <svg viewBox="0 0 14 14" className="m-logo size-3.5" aria-hidden>
                  <path className="m-stroke" pathLength={1} d="M2 7.5l3 3 7-7" fill="none" stroke="var(--color-good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Lien copié
              </>
            ) : (
              `#${room.code}`
            )}
          </span>
        </button>
      </div>
    </header>
  );
}
