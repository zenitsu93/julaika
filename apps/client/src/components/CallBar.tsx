import { useEffect, useRef } from 'react';
import { MAX_CALL, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../lib/avatars';
import { call, useCall } from '../lib/call';
import { useGame } from '../lib/store';

function Tile({ player, stream, self }: { player: PlayerPublic; stream: MediaStream | null; self: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);

  return (
    <figure className="relative aspect-[4/3] w-36 shrink-0 overflow-hidden rounded-md border border-edge bg-page sm:w-40">
      {/* La vidéo reste montée même caméra coupée : elle porte aussi le son. */}
      <video
        ref={video}
        autoPlay
        playsInline
        muted={self}
        className={`size-full object-cover ${self ? '-scale-x-100' : ''} ${player.cam ? '' : 'invisible'}`}
      />
      {!player.cam && <span className="absolute inset-0 grid place-items-center text-4xl">{avatarOf(player.avatar)}</span>}
      <figcaption className="absolute inset-x-1 bottom-1 flex items-center gap-1 truncate rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
        {!player.mic && <span title="Micro coupé">🔇</span>}
        <span className="truncate">{self ? 'Toi' : player.name}</span>
      </figcaption>
    </figure>
  );
}

/** Visio sous le dessin. */
export function CallBar() {
  const view = useCall();
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const inCall = players.filter((p) => p.inCall);
  const full = inCall.length >= MAX_CALL && !view.joined;

  if (!view.joined) {
    return (
      <div className="panel flex flex-wrap items-center justify-center gap-2 p-2 text-sm">
        <span className="text-muted">
          {inCall.length ? `${inCall.length} en visio` : 'Visio'} · jusqu'à {MAX_CALL} personnes
        </span>
        <button className="btn-primary" disabled={full} onClick={() => call.join(true, true)}>
          🎥 Rejoindre la visio
        </button>
        <button className="btn-ghost" disabled={full} onClick={() => call.join(false, true)}>
          🎙️ Micro seulement
        </button>
        {view.error && <p className="w-full text-center text-bad">{view.error}</p>}
      </div>
    );
  }

  return (
    <div className="panel flex items-center gap-2 p-2">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
        {inCall.map((p) => (
          <Tile key={p.id} player={p} self={p.id === selfId} stream={p.id === selfId ? view.local : (view.remotes[p.id] ?? null)} />
        ))}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button className={view.cam ? 'btn-ghost' : 'btn-primary'} title={view.cam ? 'Couper la caméra' : 'Activer la caméra'} onClick={() => call.toggle('video')}>
          {view.cam ? '📷' : '🚫📷'}
        </button>
        <button className={view.mic ? 'btn-ghost' : 'btn-primary'} title={view.mic ? 'Couper le micro' : 'Activer le micro'} onClick={() => call.toggle('audio')}>
          {view.mic ? '🎙️' : '🔇'}
        </button>
        <button className="btn-ghost text-bad" title="Quitter la visio" onClick={() => call.leave()}>
          ✕
        </button>
      </div>
      {view.error && <p className="text-xs text-bad">{view.error}</p>}
    </div>
  );
}
