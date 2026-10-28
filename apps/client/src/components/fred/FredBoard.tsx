import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { FredSong, FredState, PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { call, useCall } from '../../lib/call';
import { net } from '../../lib/net';
import { play, tick } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { animate, bump, confetti, Presence, reducedMotion, shake, Ticker, useCountUp } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import './fred.css';

/** Plateau de Fredonne ! : la platine (ou la caméra du chanteur), l'égaliseur, et la visio dessous. */
export function FredBoard() {
  const phase = useGame((s) => s.room!.phase);
  const f = useGame((s) => s.room!.fred);
  useStage(f, phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {f && <Turns f={f} />}
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' || !f ? <Teaser /> : phase === 'pick' ? <Pick key={f.turn} f={f} /> : phase === 'reveal' ? <Reveal key={f.turn} f={f} /> : <Hum key={f.turn} f={f} />}
        <Presence>
          {phase === 'lobby' ? (
            <div key="lobby" className="m-veil absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none">
              <div className="m-card w-full max-w-lg text-center">
                <Lobby />
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <CallBar />
    </section>
  );
}

/** Pendant le fredonnement, seul le micro du chanteur reste ouvert. */
function useStage(f: FredState | null, phase: string) {
  const selfId = useGame((s) => s.selfId);
  const role = phase === 'hum' && f ? (f.singerId === selfId ? 'singer' : 'listener') : null;
  useEffect(() => call.setStage(role), [role]);
  useEffect(() => () => call.setStage(null), []);
}

function usePlayer(id: string | undefined): PlayerPublic | undefined {
  return useGame((s) => s.room!.players.find((p) => p.id === id));
}

function useSeconds(endsAt: number | null): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

/** Un disque : sillons, reflet qui tourne avec lui, étiquette dorée. */
function Vinyl({ className = '', spin = 'on' }: { className?: string; spin?: 'on' | 'off' | 'slow' }) {
  return (
    <svg viewBox="0 0 200 200" className={`f-vinyl f-spin-${spin} ${className}`} aria-hidden>
      <circle cx="100" cy="100" r="98" fill="#1b110c" />
      {[88, 78, 68, 58, 50].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#fff" strokeOpacity=".07" strokeWidth="1.5" />
      ))}
      <path d="M100 6a94 94 0 0 1 66 27L100 100Z" fill="#fff" fillOpacity=".06" />
      <path d="M100 194a94 94 0 0 1-66-27L100 100Z" fill="#fff" fillOpacity=".06" />
      <circle cx="100" cy="100" r="36" className="fill-gold" />
      <circle cx="100" cy="100" r="36" fill="none" stroke="#000" strokeOpacity=".15" strokeWidth="2" />
      <path d="M84 106q16 10 32 0" fill="none" className="stroke-cacao" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="100" r="4" fill="#1b110c" />
    </svg>
  );
}

/** Derrière les réglages : la platine qui tourne doucement, une note s'en échappe. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="relative">
        <Vinyl spin="slow" className="size-48 opacity-60" />
        {[0, 1, 2].map((i) => (
          <span key={i} className="f-note-idle absolute -right-4 top-6 text-3xl text-accent" style={{ animationDelay: `${i * 1.1}s` }}>
            ♪
          </span>
        ))}
      </div>
    </div>
  );
}

/** Qui chante, et une pastille par chanson : faites, en cours, à venir. */
function Turns({ f }: { f: FredState }) {
  const singer = usePlayer(f.singerId);
  const selfId = useGame((s) => s.selfId);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span key={f.turn} className="m-rise flex items-center gap-2 rounded-full border border-accent/60 bg-accent/15 px-2.5 py-1 font-medium">
        🎙️ {avatarOf(singer?.avatar ?? 0)} {singer ? (singer.id === selfId ? 'Toi' : singer.name) : '…'}
        <span className="font-mono text-xs text-muted">au micro</span>
      </span>
      <span className="flex items-center gap-1" aria-label={`Chanson ${f.turn + 1} sur ${f.turns}`}>
        {Array.from({ length: f.turns }, (_, i) => (
          <span key={i} className={`text-xs transition-all duration-500 ${i < f.turn ? 'm-pop text-accent' : i === f.turn ? 'm-breathe scale-125 text-ink' : 'text-edge'}`}>
            ♪
          </span>
        ))}
      </span>
    </div>
  );
}

/** La consigne du tour, tamponnée en biais. */
function Style({ style, delay = 0 }: { style: string | null; delay?: number }) {
  if (!style) return null;
  return (
    <p className="f-style mx-auto w-fit rounded-lg border-2 border-dashed border-accent px-3 py-1 text-sm font-semibold text-accent" style={{ animationDelay: `${delay}ms` }}>
      🎭 {style}
    </p>
  );
}

// ---- Choix de la chanson ----------------------------------------------------------

function Pick({ f }: { f: FredState }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const singer = usePlayer(f.singerId);
  const left = useSeconds(endsAt);
  const self = f.singerId === selfId;
  useEffect(() => {
    if (self && left > 0 && left <= 3) tick(left === 1);
  }, [left, self]);

  if (!self || !f.choices) {
    return (
      <div className="grid min-h-[28rem] place-items-center p-6 text-center">
        <div>
          <div className="f-crate relative mx-auto h-36 w-52" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="f-crate-sleeve absolute inset-x-6 bottom-0 h-32 rounded-lg" style={{ animationDelay: `${i * 0.35}s`, '--i': i } as CSSProperties} />
            ))}
          </div>
          <p className="mt-5 text-lg">
            <b>{singer?.name ?? '…'}</b> choisit une chanson
            <span className="m-dots" aria-hidden>
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
          <p className="mt-1 text-sm text-muted">Prépare tes oreilles : tu taperas le titre ici.</p>
          <div className="mt-4">
            <Style style={f.style} delay={200} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center gap-5 p-4 sm:p-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">Choisis ta chanson</h2>
        <p className="text-sm text-muted">
          Celle que tu sauras fredonner · <span className="font-mono tabular-nums">{left} s</span>
        </p>
      </div>
      <Style style={f.style} />
      {/* Téléphone : trois pochettes en bandeau, les trois choix tiennent dans un écran. */}
      <div className="mt-6 grid w-full max-w-3xl gap-x-4 gap-y-10 max-sm:mt-3 max-sm:gap-y-3 sm:grid-cols-3">
        {f.choices.map((song, i) => (
          <Sleeve key={`${f.rerolled}-${song.title}`} song={song} index={i} />
        ))}
      </div>
      <button
        className="btn-ghost text-sm"
        disabled={f.rerolled}
        onClick={(e) => {
          bump(e.currentTarget);
          net.send({ t: 'fred', reroll: true });
        }}
      >
        {f.rerolled ? 'Plus d’autres chansons ce tour-ci' : '🎲 Je n’en connais aucune'}
      </button>
    </div>
  );
}

/** Une pochette : au survol, le disque sort à moitié ; au clic, il file sur la platine. */
function Sleeve({ song, index }: { song: FredSong; index: number }) {
  const btn = useRef<HTMLButtonElement>(null);
  const tilt = (index - 1) * 2.5;
  return (
    <button
      ref={btn}
      type="button"
      style={{ animationDelay: `${index * 90}ms`, '--tilt': `${tilt}deg` } as CSSProperties}
      className="f-sleeve group relative flex aspect-square flex-col justify-end overflow-visible rounded-xl text-left max-sm:aspect-[3.4/1] outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onClick={() => {
        bump(btn.current, 1.05);
        net.send({ t: 'fred', pick: index });
      }}
    >
      <Vinyl spin="off" className="f-sleeve-disc absolute left-[8%] top-[8%] size-[84%] max-sm:hidden" />
      <span className="f-sleeve-cover relative flex size-full flex-col justify-between rounded-xl p-4 text-butter max-sm:flex-row max-sm:items-center max-sm:justify-start max-sm:gap-4 max-sm:py-3">
        <span className="font-mono text-xs opacity-70 max-sm:text-2xl max-sm:font-bold max-sm:opacity-50">{index + 1}</span>
        <span>
          <span className="block text-xl font-bold leading-tight tracking-[-0.03em] max-sm:text-lg">{song.title}</span>
          <span className="mt-0.5 block text-sm opacity-75">{song.artist}</span>
        </span>
      </span>
    </button>
  );
}

// ---- Fredonnement ------------------------------------------------------------------

function Hum({ f }: { f: FredState }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const drawTime = useGame((s) => s.room!.settings.drawTime);
  const left = useSeconds(endsAt);
  const singer = f.singerId === selfId;
  const found = selfId !== null && f.found.includes(selfId);
  useEffect(() => {
    if (left > 0 && left <= 5) tick(left <= 3);
  }, [left]);

  return (
    <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <Stage f={f} endsAt={endsAt} left={left} total={drawTime} />
        {!singer && !found && <Answer />}
      </div>
      <aside className="flex flex-col gap-3">{singer ? <SingerCard f={f} /> : <ListenerCard f={f} found={found} />}</aside>
    </div>
  );
}

/** La scène : la caméra du chanteur s'il en a une, sinon la platine ; l'égaliseur par-dessus. */
function Stage({ f, endsAt, left, total }: { f: FredState; endsAt: number | null; left: number; total: number }) {
  const view = useCall();
  const singer = usePlayer(f.singerId);
  const selfId = useGame((s) => s.selfId);
  const self = f.singerId === selfId;
  const stream = self ? view.local : (view.remotes[f.singerId] ?? null);
  const live = Boolean(singer?.cam && stream);
  const video = useRef<HTMLVideoElement>(null);
  // Le son : son propre micro pour le chanteur, le flux reçu pour les autres.
  const audio = useMemo(() => (self ? (view.mic ? call.micStream() : null) : (view.remotes[f.singerId] ?? null)), [self, view.mic, view.remotes, f.singerId]);
  const notes = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream, live]);

  return (
    <div className="f-stage relative aspect-[4/3] max-h-[60vh] w-full overflow-hidden rounded-xl bg-[#1b110c] text-white">
      {live ? (
        <video ref={video} autoPlay playsInline muted className={`m-fade size-full object-cover ${self ? '-scale-x-100' : ''}`} />
      ) : (
        <div className="grid size-full place-items-center">
          <div className="relative">
            <Vinyl className="f-drop size-56 sm:size-72" />
            <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-cacao text-3xl ring-4 ring-gold/40">
              {avatarOf(singer?.avatar ?? 0)}
            </span>
            <Tonearm />
          </div>
        </div>
      )}
      <div ref={notes} className="pointer-events-none absolute inset-0" aria-hidden />
      <Equalizer stream={audio} notes={notes} />
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2 font-mono text-xs font-semibold">
        <span className="m-pop rounded-full bg-gold px-2.5 py-1 text-cacao">🎙️ {self ? 'Tu fredonnes' : `${singer?.name ?? '…'} fredonne`}</span>
        {f.style && (
          <span className="m-pop rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-md" style={{ animationDelay: '120ms' }}>
            🎭 {f.style}
          </span>
        )}
        {singer && !singer.mic && (
          <span className="m-pop rounded-full bg-bad px-2.5 py-1" style={{ animationDelay: '200ms' }}>
            🔇 micro fermé
          </span>
        )}
      </div>
      <Ring endsAt={endsAt} left={left} total={total} />
    </div>
  );
}

/** Le bras de la platine, posé sur le disque. */
const Tonearm = () => (
  <svg viewBox="0 0 80 160" className="f-arm absolute -right-10 -top-6 h-40 sm:-right-12 sm:h-48" fill="none" strokeLinecap="round" aria-hidden>
    <circle cx="60" cy="18" r="12" className="fill-butter" />
    <path d="M60 18 50 110 26 140" className="stroke-butter" strokeWidth="6" />
    <rect x="14" y="132" width="22" height="14" rx="3" transform="rotate(-35 25 139)" className="fill-gold" />
  </svg>
);

/**
 * Égaliseur : un analyseur Web Audio sur la voix du chanteur, lu à chaque image. Les barres
 * suivent les fréquences ; quand ça chante fort, une note s'envole de la scène.
 */
function Equalizer({ stream, notes }: { stream: MediaStream | null; notes: RefObject<HTMLDivElement | null> }) {
  const bars = useRef<HTMLDivElement>(null);
  const BARS = 28;
  useEffect(() => {
    const wrap = bars.current;
    if (!wrap) return;
    const els = [...wrap.children] as HTMLElement[];
    if (!stream || !stream.getAudioTracks().length || typeof AudioContext === 'undefined') {
      wrap.classList.add('idle');
      return;
    }
    wrap.classList.remove('idle');
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let lastNote = 0;
    const loop = (t: number) => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < BARS; i++) {
        // Les voix vivent dans les basses : on étale les premières cases sur toute la largeur.
        const v = data[Math.min(data.length - 1, 1 + Math.floor(i * 0.9))]! / 255;
        sum += v;
        els[i]!.style.transform = `scaleY(${0.06 + v * 0.94})`;
      }
      const avg = sum / BARS;
      if (avg > 0.22 && t - lastNote > 420 && !reducedMotion()) {
        lastNote = t;
        spawnNote(notes.current, avg);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close().catch(() => {});
      for (const el of els) el.style.transform = '';
    };
  }, [stream, notes]);

  return (
    <div ref={bars} className="f-eq idle pointer-events-none absolute inset-x-6 bottom-4 flex h-16 items-end gap-[3px] sm:h-20" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} style={{ animationDelay: `${(i * 97) % 900}ms` }} />
      ))}
    </div>
  );
}

const NOTE_GLYPHS = ['♪', '♫', '♩', '♬'];

/** Une note qui monte en ondulant puis s'efface. */
function spawnNote(host: HTMLDivElement | null, strength: number) {
  if (!host) return;
  const el = document.createElement('span');
  el.textContent = NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)]!;
  el.className = 'f-note';
  const x = 10 + Math.random() * 80;
  el.style.left = `${x}%`;
  el.style.fontSize = `${20 + strength * 40}px`;
  host.append(el);
  const drift = (Math.random() - 0.5) * 80;
  const a = animate(
    el,
    [
      { transform: 'translate(0, 0) rotate(0deg) scale(.6)', opacity: 0 },
      { transform: `translate(${drift * 0.3}px, -40px) rotate(-10deg) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${drift}px, -180px) rotate(14deg) scale(1.1)`, opacity: 0 },
    ],
    { duration: 1800, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
  );
  if (a) a.onfinish = () => el.remove();
  else el.remove();
}

/** Anneau du temps, comme au duel du sourire : il se vide et rougit sur la fin. */
function Ring({ endsAt, left, total }: { endsAt: number | null; left: number; total: number }) {
  const circle = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = circle.current;
    if (!el || !endsAt) return;
    let raf = 0;
    const loop = () => {
      const ratio = Math.max(0, Math.min(1, (endsAt - serverNow()) / (total * 1000)));
      el.style.strokeDashoffset = String(1 - ratio);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [endsAt, total]);
  const urgent = left <= 5;
  return (
    <div className={`absolute right-3 top-3 grid size-14 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md sm:size-16 ${urgent ? 'f-urgent' : ''}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="19" fill="none" stroke="white" strokeOpacity=".2" strokeWidth="3" />
        <circle ref={circle} cx="22" cy="22" r="19" fill="none" pathLength={1} strokeDasharray="1" stroke={urgent ? 'var(--color-bad)' : 'var(--color-gold)'} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="relative font-mono text-lg font-bold tabular-nums sm:text-xl" aria-label="Secondes restantes">
        <Ticker value={left} />
      </span>
    </div>
  );
}

/** Champ de réponse sous la scène : la proposition part au serveur, qui la juge. */
function Answer() {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const chat = useGame((s) => s.chat);
  // « Tu chauffes » : le champ se secoue.
  useEffect(() => {
    if (chat.at(-1)?.kind === 'close') shake(input.current);
  }, [chat]);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        net.send({ t: 'chat', text: t });
        setText('');
      }}
    >
      <input
        ref={input}
        className="input flex-1 text-base"
        placeholder="Le titre de la chanson…"
        aria-label="Le titre de la chanson"
        maxLength={120}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
      />
      <button className="btn-primary px-4">Proposer</button>
    </form>
  );
}

function SingerCard({ f }: { f: FredState }) {
  const view = useCall();
  const players = useGame((s) => s.room!.players);
  return (
    <>
      <div className="f-ticket relative overflow-hidden rounded-xl bg-primary p-4 text-on-primary">
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Ta chanson</p>
        <p className="mt-1 text-xl font-semibold leading-snug tracking-[-0.02em]">{f.song?.title ?? '…'}</p>
        <p className="text-sm opacity-75">{f.song?.artist}</p>
        <p className="mt-3 text-xs opacity-70">Fredonne l’air, sans dire les paroles !</p>
      </div>
      {!view.joined || !view.mic ? (
        <button className="btn-primary m-pop f-mic-call py-3 text-base" onClick={() => (view.joined ? void call.toggle('audio') : void call.join(false, true))}>
          🎙️ Ouvrir mon micro
        </button>
      ) : (
        <p className="m-rise rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-sm">🎙️ Micro ouvert, réglé pour la musique. Les autres sont en sourdine.</p>
      )}
      <div className="panel p-3">
        <p className="mb-2 text-xs font-medium text-muted">Ont trouvé</p>
        {f.found.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {f.found.map((id) => {
              const p = players.find((x) => x.id === id);
              return (
                <li key={id} className="m-pop rounded-full border border-good/50 bg-good/10 px-2 py-0.5 text-sm">
                  {avatarOf(p?.avatar ?? 0)} {p?.name ?? '?'}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Personne pour l’instant…</p>
        )}
      </div>
    </>
  );
}

/** Pour ceux qui écoutent : le titre masqué, les indices qui tombent, la sourdine. */
function ListenerCard({ f, found }: { f: FredState; found: boolean }) {
  const view = useCall();
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (found) {
      play('ding');
      bump(card.current, 1.04);
    }
  }, [found]);
  return (
    <>
      <div ref={card} className={`f-ticket relative overflow-hidden rounded-xl p-4 ${found ? 'bg-good text-white' : 'bg-primary text-on-primary'}`}>
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">{found ? 'Trouvé !' : 'Le titre'}</p>
        {found && f.song ? (
          <p className="m-pop mt-1 text-xl font-semibold leading-snug tracking-[-0.02em]">{f.song.title}</p>
        ) : (
          <Mask mask={f.mask ?? ''} />
        )}
        <p className="mt-3 text-xs opacity-70">Interprète</p>
        {f.artist ? (
          <p key={f.artist} className="f-flip text-sm font-semibold">
            {f.artist}
          </p>
        ) : (
          <p className="text-sm opacity-60">indice dans un instant…</p>
        )}
      </div>
      {view.joined ? (
        <p className="rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-muted">🔇 Ton micro est en sourdine : écoute bien, et tape le titre.</p>
      ) : (
        <button className="btn-primary py-2.5" onClick={() => void call.join(false, false)}>
          🎧 Écouter le chanteur
        </button>
      )}
      <p className="text-xs text-muted">Plus tu trouves vite, plus tu marques. Le chanteur gagne des points pour chaque personne qui trouve.</p>
    </>
  );
}

/** Le titre en cases : une case vide par lettre, les initiales tombent dedans au second indice. */
function Mask({ mask }: { mask: string }) {
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 font-mono text-lg font-semibold" aria-label={`Titre en ${mask.split('   ').length} mots`}>
      {mask.split('   ').map((word, w) => (
        <span key={w} className="flex gap-1">
          {word.split(' ').map((c, i) =>
            c === '_' ? <span key={i} className="f-slot" style={{ animationDelay: `${(w * 3 + i) * 25}ms` }} /> : <span key={`${i}-${c}`} className="f-letter w-[1ch] text-center text-gold">{c}</span>,
          )}
        </span>
      ))}
    </p>
  );
}

// ---- Révélation --------------------------------------------------------------------

function Reveal({ f }: { f: FredState }) {
  const r = f.result;
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const burst = useRef<HTMLCanvasElement>(null);
  const title = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!r) return;
    const anyone = f.found.length > 0;
    play(anyone ? 'bravo' : 'trombone');
    animate(title.current, [{ transform: 'scale(1.6) rotate(-4deg)', opacity: 0, filter: 'blur(6px)' }, { transform: 'scale(1) rotate(-2deg)', opacity: 1, filter: 'blur(0)' }], {
      duration: 520,
      easing: 'cubic-bezier(.34,1.56,.64,1)',
      fill: 'backwards',
    });
    if (anyone) return confetti(burst.current, 90);
  }, [r, f.found.length]);

  if (!r) return null;
  const ranked = Object.entries(r.gains).sort((a, b) => b[1] - a[1]);
  return (
    <div className="relative grid min-h-[28rem] place-items-center overflow-hidden p-6 text-center">
      <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative">
        <Vinyl spin="off" className="f-stop mx-auto size-32" />
        <p className="mt-4 text-sm uppercase tracking-[0.2em] text-muted">C’était</p>
        <p ref={title} className="mt-1 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
          « {r.song.title} »
        </p>
        <p className="m-rise mt-1 text-lg text-muted" style={{ animationDelay: '200ms' }}>
          {r.song.artist}
        </p>
        <span className="accroche mt-3 text-4xl text-accent" style={{ animationDelay: '300ms' }}>
          {f.found.length ? (f.found.length === 1 ? 'une oreille d’or' : 'quelle chorale') : 'personne…'}
        </span>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {ranked.map(([id, gain], i) => {
            const p = players.find((x) => x.id === id);
            return p ? <Gain key={id} player={p} self={id === selfId} singer={id === f.singerId} gain={gain} delay={400 + i * 110} /> : null;
          })}
        </div>
      </div>
    </div>
  );
}

function Gain({ player, self, singer, gain, delay }: { player: PlayerPublic; self: boolean; singer: boolean; gain: number; delay: number }) {
  const shown = useCountUp(gain);
  return (
    <span style={{ animationDelay: `${delay}ms` }} className={`m-pop flex items-center gap-2 rounded-full border px-3 py-1.5 ${gain ? 'border-good/50 bg-good/10' : 'border-edge'}`}>
      <span>{singer ? '🎙️' : avatarOf(player.avatar)}</span>
      <span className="text-sm">{self ? 'Toi' : player.name}</span>
      <b className={`font-mono tabular-nums ${gain ? 'text-good' : 'text-muted'}`}>+{shown}</b>
    </span>
  );
}
