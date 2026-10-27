import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { shareInvite } from '../lib/invite';
import { serverNow, useGame } from '../lib/store';
import { animate, reducedMotion, Ticker, useMedia } from '../motion';
import { Wordmark } from './Logo';
import { MeetButton } from './MeetButton';
import { MusicDock } from './MusicPlayer';
import { QuitButton } from './QuitButton';
import { ShuffleGlyph, SwitchButton } from './GamePicker';
import { SoundButton } from './SoundBoard';

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

export function TopBar({ onQuit, onSwitch }: { onQuit: () => void; onSwitch?: () => void }) {
  const room = useGame((s) => s.room!);
  const left = useCountdown(room.endsAt);
  const [copied, setCopied] = useState(false);
  const urgent = (room.phase === 'drawing' || room.phase === 'guess' || room.phase === 'draw' || room.phase === 'write' || room.phase === 'describe' || room.phase === 'clue' || room.phase === 'vote' || room.phase === 'steal' || room.phase === 'fill' || room.phase === 'answer' || room.phase === 'duel' || room.phase === 'pick' || room.phase === 'dare') && left <= 10;
  const timer = useRef<HTMLSpanElement>(null);
  // Téléphone (debout ou couché) : une seule ligne d'icônes, le reste dans « ⋯ ».
  const compact = useMedia('(max-width: 639.98px), (max-height: 500px) and (pointer: coarse)');

  // Sous 10 s, la pastille bat doucement à chaque seconde.
  useEffect(() => {
    if (urgent && left > 0) animate(timer.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out', fill: 'none' });
  }, [urgent, left]);

  const copy = async () => {
    if ((await shareInvite(room.code)) !== 'copied') return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className={`panel flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:gap-x-3 ${compact ? 'tb-compact' : ''}`}>
      <span
        ref={timer}
        className={`rounded-md px-2 py-1 font-mono text-sm font-bold tabular-nums transition-colors duration-300 ${urgent ? 'bg-bad text-white' : 'bg-primary text-on-primary'}`}
        aria-label="Temps restant"
      >
        <Ticker value={room.endsAt ? clock(left) : '--:--'} />
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <Wordmark className="h-7 w-auto" />
      </span>
      <span className="text-sm text-muted max-sm:text-xs">
        {room.phase === 'lobby'
          ? 'Salon'
          : room.connait
            ? `Question ${room.connait.turn}/${room.connait.turns}`
          : room.quiz
            ? room.phase === 'prep'
              ? 'Préparation'
              : `Question ${room.quiz.index}/${room.quiz.total}`
          : room.bomb
            ? `${Object.values(room.bomb.lives).filter(Boolean).length} en lice`
          : room.motamot
            ? room.phase === 'album'
              ? 'Lecture'
              : `Histoire ${room.motamot.story}/${room.motamot.stories}`
          : room.pitch
            ? `Pitch ${room.pitch.turn + 1}/${room.pitch.turns}`
          : room.aov
            ? `Tour ${room.aov.turn}/${room.aov.turns}`
          : room.sourire
            ? `Duel ${room.sourire.turn + 1}/${room.sourire.turns}`
          : room.bras
            ? `Duel ${room.bras.turn + 1}/${room.bras.turns}`
          : room.arcade
            ? `Partie ${room.arcade.turn + 1}/${room.arcade.turns}`
          : room.cadavre
            ? room.phase === 'reveal'
              ? 'Dévoilement'
              : `Morceau ${room.cadavre.step + 1}/3`
          : room.interdits
            ? `Tour ${room.interdits.turn + 1}/${room.interdits.turns}`
          : room.alibi
            ? `Affaire ${room.alibi.case + 1}/${room.alibi.cases}`
          : room.cerveau
            ? room.phase === 'album'
              ? 'Album'
              : `Dessin ${room.cerveau.turn + 1}/${room.cerveau.turns}`
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
      <div className="ml-auto flex items-center gap-1.5 sm:ml-0 sm:gap-2">
        {(!compact || room.meetUrl) && <MeetButton />}
        <MusicDock />
        <SoundButton />
        {compact ? (
          <MoreMenu code={room.code} copied={copied} onCopy={copy} onSwitch={onSwitch && room.phase !== 'lobby' ? onSwitch : undefined} />
        ) : (
          <>
          <button className="btn-ghost relative overflow-hidden px-2.5 py-1.5 font-mono max-sm:px-2 max-sm:text-xs" onClick={copy} title="Inviter : partager le lien du salon">
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
                <>
                  {/* Téléphone, en partie : une icône de lien, pour garder la barre sur une ligne. */}
                  {room.phase !== 'lobby' && (
                    <svg viewBox="0 0 24 24" className="size-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                    </svg>
                  )}
                  <span className={room.phase !== 'lobby' ? 'max-sm:sr-only' : ''}>#{room.code}</span>
                </>
              )}
            </span>
          </button>
          {/* Au salon, le choix du jeu est dans les réglages ; en partie, l'hôte peut en changer d'ici. */}
          {onSwitch && room.phase !== 'lobby' && <SwitchButton onClick={onSwitch} label="Jeu" className="m-pop" />}
          </>
        )}
        <QuitButton onAsk={onQuit} />
      </div>
    </header>
  );
}

/** Téléphone : inviter, changer de jeu… rangés derrière « ⋯ » pour garder la barre sur une ligne. */
function MoreMenu({ code, copied, onCopy, onSwitch }: { code: string; copied: boolean; onCopy: () => void; onSwitch?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', down);
    addEventListener('keydown', key);
    panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]').forEach((el, i) =>
      animate(el, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: reducedMotion() ? 0 : 260, delay: i * 45 }),
    );
    return () => {
      document.removeEventListener('pointerdown', down);
      removeEventListener('keydown', key);
    };
  }, [open]);
  const item = 'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition hover:bg-edge/50 active:scale-[.98]';
  return (
    <div ref={root} className="relative">
      <button type="button" className="btn-ghost tb-more px-2.5 py-1.5" aria-haspopup="menu" aria-expanded={open} aria-label="Plus d'options" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open && (
        <div ref={panel} role="menu" className="panel m-pop absolute right-0 top-full z-30 mt-2 w-60 origin-top-right p-1.5 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={onCopy}>
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
            <span key={String(copied)} className="m-rise flex-1">{copied ? 'Lien copié' : 'Inviter'}</span>
            <span className="font-mono text-xs text-muted">#{code}</span>
          </button>
          {onSwitch && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                onSwitch();
              }}
            >
              <ShuffleGlyph className="size-4 shrink-0" />
              Changer de jeu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
