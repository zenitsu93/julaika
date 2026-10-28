import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { MIME_TWIST_EVERY, type SoundId } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { call, useCall } from '../../lib/call';
import { setMimeVideo, shotTilt } from '../../lib/mime';
import { onSound, play, SOUND_INFO } from '../../lib/sounds';
import { useGame } from '../../lib/store';
import { animate, reducedMotion } from '../../motion';
import { GuessBox } from '../GuessBox';
import { Polaroid } from '../Polaroid';
import { SoundBoard } from '../SoundBoard';
import './mime.css';

/** Les pads des devineurs : de quoi encourager (ou chambrer) le mimeur, qui n'a pas le droit de parler. */
const CHEERS: readonly SoundId[] = ['bravo', 'rires', 'criquets', 'boing', 'pouet', 'klaxon'];

/**
 * Scène du mime : à la place du tableau, la caméra du mimeur en grand.
 * Sans caméra (ou tous dans la même pièce), une carte annonce qui mime : on devine en vrai.
 * La vidéo est toujours muette ici : le son passe par la pellicule de la visio.
 * Par-dessus : la consigne surprise, les polaroids des trouvailles et les bruitages des devineurs.
 */
export function MimeStage() {
  const view = useCall();
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const mimer = room.players.find((p) => p.id === room.drawerId);
  const self = mimer?.id === selfId;
  const stream = self ? view.local : mimer ? (view.remotes[mimer.id] ?? null) : null;
  const live = Boolean(mimer?.inCall && mimer.cam && stream);
  const miming = room.phase === 'drawing';
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const stage = useTheater(root, miming && !self);

  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream, live]);

  // Sa propre vidéo sert d'appareil photo quand quelqu'un trouve.
  useEffect(() => {
    setMimeVideo(self && live ? video.current : null);
    return () => setMimeVideo(null);
  }, [self, live]);

  if (!mimer) return null;

  return (
    <div
      ref={root}
      className={`overflow-hidden bg-cacao text-white ${stage.on ? 'fixed inset-x-0 z-50' : 'absolute inset-0'}`}
      style={stage.on ? { top: stage.box.top, height: stage.box.height } : undefined}
    >
      {live ? (
        <video ref={video} autoPlay playsInline muted className={`m-fade size-full object-cover ${self ? '-scale-x-100' : ''}`} />
      ) : (
        <div className="mime-spot m-fade grid size-full place-items-center p-6 text-center">
          <div>
            <span className="m-breathe inline-block text-7xl">{avatarOf(mimer.avatar)}</span>
            <p className="mt-3 text-xl">
              {self ? (
                <>À toi de mimer !</>
              ) : (
                <>
                  <b>{mimer.name}</b> mime
                  <span className="m-dots" aria-hidden>
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </>
              )}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {self ? 'Allume ta caméra, ou mime en vrai devant tes amis.' : 'Pas de caméra : regarde-le mimer en vrai et tape ta réponse.'}
            </p>
            {self && miming && !view.cam && (
              <button className="btn-primary m-pop mt-4" onClick={() => (view.joined ? void call.toggle('video') : void call.join(true, false))}>
                🎥 Allumer ma caméra
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cadre doré de la marque : c'est la scène. */}
      <div className="pointer-events-none absolute inset-0 rounded-lg ring-4 ring-accent ring-inset" aria-hidden />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2 font-mono text-xs font-semibold">
        <span className="m-pop rounded-full bg-accent px-2.5 py-1 text-[#18181b]">🎭 {self ? 'Tu mimes' : `${mimer.name} mime`} · sans parler</span>
        {self && view.hushed && <span className="m-pop rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-md">🔇 Micro coupé pendant ton mime</span>}
      </div>

      {miming && <Twist self={self} mimer={mimer.name} />}
      <Bursts />
      {miming && <ShotPile />}

      {self && miming && room.hint && (
        <p className="m-rise pointer-events-none absolute inset-x-0 bottom-4 text-center">
          <span className="rounded-full bg-black/60 px-4 py-1.5 text-lg font-semibold backdrop-blur-md">
            Ton mot : <span className="text-accent">{room.hint}</span>
          </span>
        </p>
      )}
      {!self && miming && (
        <>
          {/* La réponse se tape sur la vidéo, les bruitages se replient derrière 👏. */}
          <div className="absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md" style={stage.on ? { bottom: 'max(0.5rem, env(safe-area-inset-bottom))' } : undefined}>
            <GuessBox
              variant="stage"
              inputRef={stage.input}
              onFocusChange={stage.focus}
              above={
                stage.tray && (
                  <div className="mime-cheer gb-tray mb-2 rounded-xl bg-black/50 p-1.5 backdrop-blur-md">
                    <SoundBoard compact only={CHEERS} />
                  </div>
                )
              }
              lead={
                <button
                  type="button"
                  className="gb-lead"
                  aria-expanded={stage.tray}
                  aria-label={`Bruitages pour ${mimer.name}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={stage.toggleTray}
                >
                  👏
                </button>
              }
            />
          </div>
          {stage.on && (
            <button
              type="button"
              className="m-pop absolute top-3 right-3 z-30 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md"
              aria-label="Fermer le clavier"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => stage.input.current?.blur()}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Consigne surprise : une étiquette tombe du haut et se balance comme un panneau accroché,
 * avec une jauge qui se vide jusqu'à la suivante. Un coup de sifflet l'annonce.
 */
function Twist({ self, mimer }: { self: boolean; mimer: string }) {
  const twist = useGame((s) => s.room!.twist);
  const n = twist?.n ?? 0;
  useEffect(() => {
    if (n) play('sifflet');
  }, [n]);
  if (!twist) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-11 z-10 flex justify-center px-3" aria-live="polite">
      <div key={twist.n} className="mime-twist relative max-w-[78%] overflow-hidden rounded-2xl border-2 border-gold bg-butter px-3 py-1.5 text-center text-ink shadow-xl sm:max-w-none sm:px-4 sm:py-2">
        <span className="mime-twist-glint" aria-hidden />
        <span className="block font-mono text-[10px] font-bold tracking-[0.25em] text-cacao-2 uppercase">
          Consigne surprise{!self && <span className="max-sm:hidden"> pour {mimer}</span>}
        </span>
        <span className="flex items-center justify-center gap-2 text-base font-semibold sm:text-xl">
          <span className="mime-twist-emoji inline-block text-2xl">{twist.emoji}</span>
          {self ? `Mime ${twist.text.charAt(0).toLowerCase()}${twist.text.slice(1)} !` : twist.text}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-cacao/10" aria-hidden>
          <span className="mime-twist-bar block h-full bg-gold" style={{ '--mime-twist': `${MIME_TWIST_EVERY}s` } as CSSProperties} />
        </span>
      </div>
    </div>
  );
}

/** Les polaroids du tour : un flash, puis chaque tirage sort et se pose sur la pile, penché. */
function ShotPile() {
  const room = useGame((s) => s.room!);
  const all = useGame((s) => s.mimeShots);
  const shots = all.filter((s) => s.round === room.round && s.mimerId === room.drawerId);
  const last = shots.at(-1)?.id ?? 0;
  const [flash, setFlash] = useState(0);
  const seen = useRef(last);
  useEffect(() => {
    if (last <= seen.current) return;
    seen.current = last;
    if (!reducedMotion()) setFlash(last);
  }, [last]);

  return (
    <>
      {flash > 0 && <span key={flash} className="mime-flash pointer-events-none absolute inset-0 z-20 bg-white" onAnimationEnd={() => setFlash(0)} aria-hidden />}
      {shots.length > 0 && (
        <div className="mime-pile pointer-events-none absolute z-10">
          {shots.slice(-4).map((s, i, list) => (
            <div key={s.id} className="mime-pile-card absolute inset-x-0 top-0" style={{ '--i': list.length - 1 - i } as CSSProperties}>
              <Polaroid
                image={s.image}
                avatar={s.avatar}
                caption={`${s.finderName} a trouvé !`}
                tilt={shotTilt(s)}
                enter="eject"
                develop={Boolean(s.image)}
                className="text-[0.8em]"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Chaque bruitage fait monter son emoji sur la scène, comme une salle qui réagit. */
function Bursts() {
  const [items, setItems] = useState<{ key: number; emoji: string; x: number; r: number }[]>([]);
  useEffect(() => {
    if (reducedMotion()) return;
    let n = 0;
    return onSound((e) => {
      const key = ++n;
      const emoji = SOUND_INFO[e.id].emoji;
      setItems((l) => [...l.slice(-11), { key, emoji, x: 8 + Math.random() * 84, r: Math.random() * 40 - 20 }]);
    });
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden [container-type:size]" aria-hidden>
      {items.map((b) => (
        <span
          key={b.key}
          className="mime-burst absolute bottom-6 text-4xl"
          style={{ left: `${b.x}%`, '--r': `${b.r}deg` } as CSSProperties}
          onAnimationEnd={() => setItems((l) => l.filter((x) => x.key !== b.key))}
        >
          {b.emoji}
        </span>
      ))}
    </div>
  );
}

/** Téléphone, tablette : sous la largeur lg de Tailwind, la scène passe en salle obscure. */
const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 1023.98px)').matches;

/**
 * Mode « salle obscure » du devineur au téléphone : quand il tape sa réponse, la scène quitte
 * sa place et remplit tout l'écran au-dessus du clavier (visualViewport), pour ne jamais perdre
 * le mimeur de vue. Elle s'ouvre en dévoilant son cadre d'origine (clip-path), et y retourne au blur.
 */
function useTheater(root: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const [focused, setFocused] = useState(false);
  const [tray, setTray] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const from = useRef<DOMRect | null>(null);
  const on = active && focused;
  const box = useViewportBox(on);

  useEffect(() => {
    // Fin du tour : la boîte disparaît sans blur, on repart à zéro.
    if (active) return;
    setTray(false);
    setFocused(false);
  }, [active]);

  const focus = (f: boolean) => {
    if (f && !narrow()) return;
    from.current = root.current?.getBoundingClientRect() ?? null;
    setFocused(f);
  };

  useLayoutEffect(() => {
    const el = root.current;
    const r = from.current;
    from.current = null;
    if (!el || !r) return;
    if (on) {
      // Le cadre d'origine s'agrandit jusqu'aux bords de l'écran.
      const top = r.top - box.top;
      const inset = `inset(${Math.max(0, top)}px ${Math.max(0, innerWidth - r.right)}px ${Math.max(0, box.height - top - r.height)}px ${Math.max(0, r.left)}px round 8px)`;
      animate(el, [{ clipPath: inset }, { clipPath: 'inset(0 0 0 0 round 0)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else animate(el, [{ opacity: 0.4, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
  }, [on]);

  return { on, box, tray, input, focus, toggleTray: () => setTray((t) => !t) };
}

/** Partie visible de la page, clavier déduit : suivie seulement pendant le mode salle obscure. */
function useViewportBox(active: boolean) {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: typeof window !== 'undefined' ? innerHeight : 0 };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () => setBox(read());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);
  return box;
}
