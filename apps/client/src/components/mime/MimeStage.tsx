import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MIME_TWIST_EVERY, type SoundId } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { call, useCall } from '../../lib/call';
import { setMimeVideo, shotTilt } from '../../lib/mime';
import { onSound, play, SOUND_INFO } from '../../lib/sounds';
import { useGame } from '../../lib/store';
import { reducedMotion } from '../../motion';
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
    <div className="absolute inset-0 overflow-hidden bg-cacao text-white">
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
              {self ? 'Allume ta caméra, ou mime en vrai devant tes amis.' : 'Pas de caméra : regarde-le mimer en vrai et devine dans le chat.'}
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
        <div className="mime-cheer m-rise absolute inset-x-2 bottom-2 z-10 mx-auto max-w-md rounded-xl bg-black/45 p-1.5 backdrop-blur-md sm:inset-x-3 sm:bottom-3">
          <p className="mb-1 px-1 text-left font-mono text-[10px] font-semibold tracking-[0.18em] text-white/70 uppercase max-sm:hidden">
            Bruitages pour {mimer.name}
          </p>
          <SoundBoard compact only={CHEERS} />
        </div>
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
