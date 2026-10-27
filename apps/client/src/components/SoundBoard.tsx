import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SOUNDS, type SoundId } from '@julaika/shared';
import { onSound, send, SOUND_INFO, toggleMuted, useMuted, type SoundEvent } from '../lib/sounds';
import { useGame } from '../lib/store';
import { animate, bump, reducedMotion } from '../motion';

/** Raccourcis des pads, dans l'ordre de SOUNDS (rangée du haut du clavier). */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='] as const;
/** Recharge après un envoi, contre le mitraillage (le serveur et les autres clients filtrent aussi). */
const COOLDOWN = 600;

/** Onde circulaire depuis le point touché (ou le centre au clavier), retirée à la fin de son animation. */
function ripple(el: HTMLElement, at: { x: number; y: number } | null) {
  if (reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'sb-ripple';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.left = `${at ? at.x - r.left : r.width / 2}px`;
  dot.style.top = `${at ? at.y - r.top : r.height / 2}px`;
  el.appendChild(dot);
  const done = () => dot.remove();
  dot.addEventListener('animationend', done, { once: true });
  setTimeout(done, 1000);
}

/** Grille de pads : clic ou touche 1…= quand la grille a le focus. */
export function SoundBoard({ compact = false, onSend }: { compact?: boolean; onSend?: (id: SoundId) => void }) {
  const [cooling, setCooling] = useState<{ id: SoundId; n: number } | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pads = useRef<Partial<Record<SoundId, HTMLButtonElement | null>>>({});
  useEffect(() => () => clearTimeout(timer.current), []);

  const fire = (id: SoundId, at: { x: number; y: number } | null) => {
    if (busy.current) return;
    busy.current = true;
    const el = pads.current[id];
    if (el) {
      bump(el, 0.9);
      ripple(el, at);
    }
    send(id);
    onSend?.(id);
    setCooling((c) => ({ id, n: (c?.n ?? 0) + 1 }));
    timer.current = setTimeout(() => {
      busy.current = false;
      setCooling(null);
    }, COOLDOWN);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const id = SOUNDS[(KEYS as readonly string[]).indexOf(e.key)];
    if (!id) return;
    e.preventDefault();
    fire(id, null);
  };

  return (
    <div data-sb-grid tabIndex={-1} role="group" aria-label="Boîte à sons" onKeyDown={onKeyDown} className={`grid grid-cols-4 outline-none ${compact ? 'gap-1.5' : 'gap-2 sm:grid-cols-6'}`}>
      {SOUNDS.map((id, i) => {
        const { label, emoji } = SOUND_INFO[id];
        return (
          <button
            key={id}
            ref={(el) => void (pads.current[id] = el)}
            type="button"
            aria-disabled={cooling ? true : undefined}
            aria-keyshortcuts={KEYS[i]}
            title={`${label} (touche ${KEYS[i]})`}
            style={{ animationDelay: `${i * 28}ms` }}
            className={`sb-pad flex flex-col items-center justify-center gap-0.5 rounded-lg border border-edge bg-surface text-ink outline-none focus-visible:ring-2 focus-visible:ring-info ${compact ? 'h-16 text-[11px]' : 'h-20 text-xs'}`}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
            }}
            // detail = 0 : activé au clavier (Entrée, Espace), l'onde part du centre.
            onClick={(e) => fire(id, e.detail ? { x: e.clientX, y: e.clientY } : null)}
          >
            <span className={`sb-emoji ${compact ? 'text-xl' : 'text-2xl'}`} aria-hidden>
              {emoji}
            </span>
            <span className="line-clamp-2 px-1 text-center leading-tight">{label}</span>
            <kbd className="kbd absolute right-1 top-1 max-sm:hidden" aria-hidden>
              {KEYS[i]}
            </kbd>
            {cooling?.id === id && <span key={cooling.n} className="sb-recharge" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** Haut-parleur dessiné à la main : les ondes rentrent et une croix se trace en muet ; `live` les fait battre à chaque son. */
function SpeakerIcon({ muted, live = false, className = '' }: { muted: boolean; live?: boolean; className?: string }) {
  const waves = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!live) return;
    return onSound(() => {
      if (!waves.current) return;
      waves.current.querySelectorAll('.sb-wave').forEach((w, i) =>
        animate(w, [{ transform: 'none' }, { transform: 'translateX(2px) scale(1.25)' }, { transform: 'none' }], { duration: 360, delay: i * 70, fill: 'none', easing: 'ease-out' }),
      );
    });
  }, [live]);
  return (
    <svg viewBox="0 0 24 24" className={`sb-speaker ${muted ? 'sb-muted' : ''} ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" />
      <g ref={waves}>
        <path className="sb-wave" d="M15.5 9.2a4 4 0 0 1 0 5.6" />
        <path className="sb-wave" d="M18.4 6.5a7.8 7.8 0 0 1 0 11" />
      </g>
      <path className="sb-cross" pathLength={1} d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  );
}

/** Interrupteur du son, pour tous les bruitages (reçus, envoyés et tic-tac des jeux). */
export function MuteButton({ className = '' }: { className?: string }) {
  const off = useMuted();
  return (
    <button
      type="button"
      className={`btn-ghost gap-1.5 px-2 py-1.5 ${className}`}
      aria-pressed={off}
      aria-label="Couper les sons"
      title={off ? 'Réactiver les sons' : 'Couper les sons'}
      onClick={(e) => {
        toggleMuted();
        bump(e.currentTarget);
      }}
    >
      <SpeakerIcon muted={off} className="size-4" />
      <span key={String(off)} className="m-rise text-xs">
        {off ? 'Muet' : 'Son'}
      </span>
    </button>
  );
}

/** Bouton de la barre du haut : ouvre la boîte à sons dans un panneau. */
export function SoundButton() {
  const off = useMuted();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(
      () => {
        setOpen(false);
        setLeaving(false);
      },
      reducedMotion() ? 0 : 140,
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Le panneau reste dans l'écran (téléphone) et se déplie depuis le bouton ; les raccourcis marchent d'emblée.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el || !btn.current) return;
    el.style.right = '0px';
    const r = el.getBoundingClientRect();
    const shift = Math.max(0, 8 - r.left);
    el.style.right = `${-shift}px`;
    const b = btn.current.getBoundingClientRect();
    el.style.transformOrigin = `${b.left + b.width / 2 - (r.left + shift)}px top`;
    el.querySelector<HTMLElement>('[data-sb-grid]')?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={btn}
        type="button"
        className="btn-ghost px-2.5 py-1.5"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Boîte à sons"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SpeakerIcon muted={off} live className="size-4" />
        <span className="hidden sm:inline">Sons</span>
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Boîte à sons"
          data-leaving={leaving || undefined}
          className="panel sb-pop absolute top-full z-30 mt-2 w-[min(20rem,calc(100vw-1rem))] space-y-3 p-3 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              Boîte à sons <span className="font-normal text-muted max-sm:hidden">· touches 1 à =</span>
            </p>
            <MuteButton />
          </div>
          <SoundBoard compact />
        </div>
      )}
    </div>
  );
}

const TOAST_LIFE = 2400;
const MAX_TOASTS = 4;

/** Bulles « 🎺 Léa » qui montent et s'effacent à chaque bruitage envoyé ou reçu. */
export function SoundToasts() {
  const players = useGame((s) => s.room?.players);
  const selfId = useGame((s) => s.selfId);
  const [items, setItems] = useState<(SoundEvent & { key: number })[]>([]);

  useEffect(() => {
    let n = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = onSound((e) => {
      const key = ++n;
      setItems((l) => [...l, { ...e, key }].slice(-MAX_TOASTS));
      const tm = setTimeout(() => {
        timers.delete(tm);
        setItems((l) => l.filter((x) => x.key !== key));
      }, TOAST_LIFE);
      timers.add(tm);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2" aria-live="polite">
      {items.map((e) => {
        const { emoji, label } = SOUND_INFO[e.id];
        const name = e.by === selfId ? 'Toi' : (players?.find((p) => p.id === e.by)?.name ?? 'Quelqu’un');
        return (
          <div
            key={e.key}
            className="sb-bubble panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink shadow-lg"
            style={{ '--sb-r': e.key % 2 ? '-8deg' : '8deg' } as CSSProperties}
          >
            <span className="sb-emoji text-lg" aria-hidden>
              {emoji}
            </span>
            <b className="font-semibold">{name}</b>
            <span className="text-muted">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
