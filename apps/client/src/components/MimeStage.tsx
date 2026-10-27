import { useEffect, useRef } from 'react';
import { avatarOf } from '../lib/avatars';
import { call, useCall } from '../lib/call';
import { useGame } from '../lib/store';

/**
 * Scène du mime : à la place du tableau, la caméra du mimeur en grand.
 * Sans caméra (ou tous dans la même pièce), une carte annonce qui mime : on devine en vrai.
 * La vidéo est toujours muette ici : le son passe par la pellicule de la visio.
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

  if (!mimer) return null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#18181b] text-white">
      {live ? (
        <video ref={video} autoPlay playsInline muted className={`m-fade size-full object-cover ${self ? '-scale-x-100' : ''}`} />
      ) : (
        <div className="m-fade grid size-full place-items-center p-6 text-center">
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

      {/* Cadre jaune de la marque : c'est la scène. */}
      <div className="pointer-events-none absolute inset-0 rounded-lg ring-4 ring-accent ring-inset" aria-hidden />
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 font-mono text-xs font-semibold">
        <span className="m-pop rounded-full bg-accent px-2.5 py-1 text-[#18181b]">🎭 {self ? 'Tu mimes' : `${mimer.name} mime`} · sans parler</span>
        {self && view.hushed && <span className="m-pop rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-md">🔇 Micro coupé pendant ton mime</span>}
      </div>
      {self && miming && room.hint && (
        <p className="m-rise pointer-events-none absolute inset-x-0 bottom-4 text-center">
          <span className="rounded-full bg-black/60 px-4 py-1.5 text-lg font-semibold backdrop-blur-md">
            Ton mot : <span className="text-accent">{room.hint}</span>
          </span>
        </p>
      )}
    </div>
  );
}
