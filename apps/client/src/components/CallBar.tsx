import { useEffect, useRef } from 'react';
import { MAX_CALL, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../lib/avatars';
import { call, useCall } from '../lib/call';
import { useGame } from '../lib/store';
import { bump, useSpeaking } from '../motion';

/** Trois barres qui ondulent quand la personne parle. */
function Level({ on }: { on: boolean }) {
  return (
    <span className={`m-level inline-flex h-2.5 items-end gap-px ${on ? 'on' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

function Tile({ player, stream, self, drawing, psychic }: { player: PlayerPublic; stream: MediaStream | null; self: boolean; drawing: boolean; psychic: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const speaking = useSpeaking(stream, player.mic);
  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);

  return (
    // Pellicule : la tuile de qui parle s'élargit, les autres se serrent.
    <figure
      className={`m-pop relative m-0 h-20 min-w-24 shrink-0 overflow-hidden rounded-[9px] border bg-page transition-[flex-grow,border-color] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] sm:h-24 sm:min-w-32 ${
        player.guessed ? 'border-good' : 'border-edge'
      } ${speaking ? 'm-speaking grow-[1.7] outline-2 outline-good' : 'grow'} basis-0`}
    >
      {/* La vidéo reste montée même caméra coupée : elle porte aussi le son. */}
      <video
        ref={video}
        autoPlay
        playsInline
        muted={self}
        className={`size-full object-cover ${self ? '-scale-x-100' : ''} ${player.cam ? '' : 'invisible'}`}
      />
      {!player.cam && <span className="absolute inset-0 grid place-items-center text-3xl">{avatarOf(player.avatar)}</span>}
      <span className="absolute left-1.5 top-1.5 flex gap-1 font-mono text-[10px] font-semibold">
        {drawing && <span className="m-pop rounded-full bg-accent px-1.5 text-[#18181b]">{psychic ? '🔮 télépathe' : '✏️ dessine'}</span>}
        {player.guessed && <span className="m-pop rounded-full bg-good px-1.5 text-white">✓ trouvé</span>}
      </span>
      <figcaption className="absolute inset-x-1.5 bottom-1.5 flex">
        <span className="flex min-w-0 items-center gap-1 rounded-full bg-black/50 px-2 py-px text-[11px] text-white backdrop-blur-md">
          {player.mic ? <Level on={speaking} /> : <span title="Micro coupé">🔇</span>}
          <span className="truncate">{self ? 'Toi' : player.name}</span>
        </span>
      </figcaption>
    </figure>
  );
}

const dockBtn = 'grid size-8 place-items-center rounded-full text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-info';

/** Visio sous le dessin, en pellicule. */
export function CallBar() {
  const view = useCall();
  const players = useGame((s) => s.room!.players);
  // Dessin : qui dessine ; Wavelength : qui est télépathe.
  const psychicId = useGame((s) => s.room!.wave?.psychicId ?? null);
  const drawerId = useGame((s) => s.room!.drawerId) ?? psychicId;
  const selfId = useGame((s) => s.selfId);
  const inCall = players.filter((p) => p.inCall);
  const full = inCall.length >= MAX_CALL && !view.joined;

  if (!view.joined) {
    return (
      <div className="panel flex flex-wrap items-center justify-center gap-2 p-2 text-sm">
        {inCall.length > 0 && (
          <span className="flex -space-x-2" aria-hidden>
            {inCall.slice(0, 4).map((p) => (
              <span key={p.id} className="m-pop grid size-7 place-items-center rounded-full border-2 border-surface bg-page text-sm">
                {avatarOf(p.avatar)}
              </span>
            ))}
          </span>
        )}
        <span className="text-muted">
          {inCall.length ? `${inCall.length} en visio` : 'Visio'} · jusqu'à {MAX_CALL} personnes
        </span>
        <button className="btn-primary" disabled={full} onClick={() => call.join(true, true)}>
          🎥 Rejoindre la visio
        </button>
        <button className="btn-ghost" disabled={full} onClick={() => call.join(false, true)}>
          🎙️ Micro seulement
        </button>
        {view.error && <p className="m-rise w-full text-center text-bad">{view.error}</p>}
      </div>
    );
  }

  return (
    <div className="panel m-rise flex items-center gap-1.5 p-1.5">
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-1">
        {inCall.map((p) => (
          <Tile
            key={p.id}
            player={p}
            self={p.id === selfId}
            drawing={p.id === drawerId}
            psychic={p.id === psychicId}
            stream={p.id === selfId ? view.local : (view.remotes[p.id] ?? null)}
          />
        ))}
      </div>
      {/* Dock vertical, comme la barre d'outils du dessinateur. */}
      <div className="flex shrink-0 flex-col gap-0.5 rounded-2xl bg-primary p-1 text-on-primary shadow-lg">
        <button
          className={`${dockBtn} ${view.cam ? 'hover:bg-on-primary/15' : 'bg-bad text-white'}`}
          title={view.cam ? 'Couper la caméra' : 'Activer la caméra'}
          aria-pressed={view.cam}
          onClick={(e) => {
            bump(e.currentTarget);
            void call.toggle('video');
          }}
        >
          📷
        </button>
        <button
          className={`${dockBtn} ${view.mic ? 'hover:bg-on-primary/15' : 'bg-bad text-white'}`}
          title={view.mic ? 'Couper le micro' : 'Activer le micro'}
          aria-pressed={view.mic}
          onClick={(e) => {
            bump(e.currentTarget);
            void call.toggle('audio');
          }}
        >
          {view.mic ? '🎙️' : '🔇'}
        </button>
        <button className={`${dockBtn} bg-bad/85 text-white hover:bg-bad`} title="Quitter la visio" onClick={() => call.leave()}>
          ✕
        </button>
      </div>
      {view.error && <p className="text-xs text-bad">{view.error}</p>}
    </div>
  );
}
