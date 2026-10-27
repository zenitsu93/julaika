import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SOURIRE_DUEL, WARPS, type PlayerPublic, type SourireState, type WarpId } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { call, useCall } from '../../lib/call';
import { net } from '../../lib/net';
import { play, tick } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, Ticker, useCountUp } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { SoundBoard } from '../SoundBoard';

const WARP_INFO: Record<WarpId, { label: string; emoji: string }> = {
  bulle: { label: 'Gros nez', emoji: '🔍' },
  pince: { label: 'Mini-tête', emoji: '🤏' },
  tourbillon: { label: 'Tourbillon', emoji: '🌀' },
  etire: { label: 'Étiré', emoji: '🫠' },
  miroir: { label: 'Miroir', emoji: '🪞' },
  vague: { label: 'Vague', emoji: '🌊' },
};

/** Plateau de Pas un sourire ! : les deux visages face à face, la visio dessous. */
export function SourireBoard() {
  const phase = useGame((s) => s.room!.phase);
  const s = useGame((st) => st.room!.sourire);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {s && <Duels s={s} />}
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' || !s ? <Teaser /> : phase === 'faceoff' ? <Faceoff key={s.turn} s={s} /> : phase === 'verdict' ? <Verdict key={s.turn} s={s} /> : <Duel key={s.turn} s={s} />}
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

function usePlayer(id: string | undefined): PlayerPublic | undefined {
  return useGame((s) => s.room!.players.find((p) => p.id === id));
}

/** Le sourire de julaïka, dessiné : il hésite, s'élargit, puis se retient. */
function Smile({ className = '', tight = false }: { className?: string; tight?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <circle cx="60" cy="60" r="52" strokeWidth="5" strokeOpacity=".25" />
      <g className="s-blink" style={{ transformOrigin: '60px 46px' }}>
        <circle cx="42" cy="46" r="6" fill="currentColor" stroke="none" />
        <circle cx="78" cy="46" r="6" fill="currentColor" stroke="none" />
      </g>
      <path className={tight ? '' : 's-mouth'} d={tight ? 'M38 80h44' : 'M36 74c8 14 40 14 48 0'} strokeWidth="6" />
      <circle className="s-dimple" cx="88" cy="72" r="3.5" fill="var(--color-accent)" stroke="none" />
    </svg>
  );
}

/** Derrière les réglages : un visage qui lutte pour ne pas sourire. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <Smile className="s-teaser size-40 text-ink/40" />
    </div>
  );
}

/** Une pastille par duel : faits, en cours, à venir ; et les deux rôles du duel. */
function Duels({ s }: { s: SourireState }) {
  const defender = usePlayer(s.defenderId);
  const attacker = usePlayer(s.attackerId);
  const selfId = useGame((st) => st.selfId);
  const name = (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span key={s.turn} className="m-rise flex items-center gap-2">
        <Role tone="bad">{`${avatarOf(attacker?.avatar ?? 0)} ${name(attacker)}`}</Role>
        <span className="font-mono text-xs text-muted">fait rire</span>
        <Role tone="ink">{`${avatarOf(defender?.avatar ?? 0)} ${name(defender)}`}</Role>
      </span>
      <span className="flex items-center gap-1" aria-label={`Duel ${s.turn + 1} sur ${s.turns}`}>
        {Array.from({ length: s.turns }, (_, i) => (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${i < s.turn ? 'm-pop bg-accent' : i === s.turn ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`}
          />
        ))}
      </span>
    </div>
  );
}

function Role({ tone, children }: { tone: 'bad' | 'ink'; children: ReactNode }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 font-medium ${tone === 'bad' ? 'border-accent/60 bg-accent/15' : 'border-edge bg-surface'}`}>{children}</span>
  );
}

/** Le visage d'un joueur : sa caméra s'il est en visio, sinon son avatar qui respire. */
function Face({ id, big, pip, label, tone }: { id: string; big?: boolean; pip?: boolean; label: string; tone: 'attack' | 'defend' }) {
  const player = usePlayer(id);
  const selfId = useGame((s) => s.selfId);
  const view = useCall();
  const self = id === selfId;
  const stream = self ? view.local : (view.remotes[id] ?? null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);
  const cam = Boolean(player?.cam && stream);

  return (
    <figure
      className={`s-face relative m-0 overflow-hidden rounded-xl border bg-page transition-[box-shadow,border-color] duration-500 ${
        tone === 'attack' ? 'border-accent/70' : 'border-edge'
      } ${big ? 'aspect-[4/3]' : 'aspect-[4/3] sm:aspect-[3/4]'}`}
    >
      {/* Le son passe déjà par la visio : la vidéo ici reste muette. */}
      <video ref={video} autoPlay playsInline muted className={`size-full object-cover ${self ? '-scale-x-100' : ''} ${cam ? '' : 'invisible'}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="m-breathe text-6xl sm:text-7xl">{avatarOf(player?.avatar ?? 0)}</span>
        </span>
      )}
      <figcaption className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        {/* Une seule étiquette par visage ; la caméra coupée n'est plus qu'une icône (la petite vignette débordait). */}
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-0.5 text-xs text-white backdrop-blur-md">
          {!cam && (
            <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="caméra coupée">
              <path d="M3 3l18 18M10.5 6H14l1.5 2H19a2 2 0 0 1 2 2v7M17 19H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1" />
            </svg>
          )}
          <span className="truncate">
            {self ? 'Toi' : (player?.name ?? '…')}
            {!pip && ` · ${label}`}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

/** Face-à-face : les deux visages arrivent de chaque côté, puis 3, 2, 1. */
function Faceoff({ s }: { s: SourireState }) {
  const endsAt = useGame((st) => st.room!.endsAt);
  const selfId = useGame((st) => st.selfId);
  const left = useSeconds(endsAt);
  useEffect(() => {
    if (left > 0 && left <= 3) tick(left === 1);
  }, [left]);
  const role = selfId === s.attackerId ? 'Fais-le craquer !' : selfId === s.defenderId ? 'Garde ton sérieux.' : 'Ouvre l’œil.';

  return (
    <div className="grid min-h-[28rem] place-items-center p-4 sm:p-6">
      <div className="grid w-full max-w-3xl grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <div className="s-in-left">
          <Face id={s.attackerId} label="attaque" tone="attack" />
        </div>
        <div className="grid place-items-center">
          <span key={left} className="s-count font-mono text-6xl font-bold tabular-nums sm:text-8xl" aria-live="assertive">
            {left > 3 ? 'VS' : left || 'Go'}
          </span>
        </div>
        <div className="s-in-right">
          <Face id={s.defenderId} label="défend" tone="defend" />
        </div>
      </div>
      <p className="m-rise mt-4 text-center text-lg font-semibold tracking-[-0.02em]" style={{ animationDelay: '300ms' }}>
        {role}
      </p>
    </div>
  );
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

/** Le duel : le visage à surveiller en grand, l'anneau du temps, et les armes de l'attaquant. */
function Duel({ s }: { s: SourireState }) {
  const selfId = useGame((st) => st.selfId);
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const attacker = selfId === s.attackerId;
  const defender = selfId === s.defenderId;

  useEffect(() => {
    if (left > 0 && left <= 5) tick(left <= 3);
  }, [left]);

  // Le défenseur regarde son attaquant ; les autres surveillent le défenseur.
  const watched = defender ? s.attackerId : s.defenderId;
  const other = defender ? s.defenderId : s.attackerId;

  return (
    <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative">
          <div className="m-rise">
            <Face id={watched} big label={watched === s.defenderId ? 'défend' : 'attaque'} tone={watched === s.defenderId ? 'defend' : 'attack'} />
          </div>
          <div className="absolute right-3 top-3 w-24 sm:w-32">
            <div className="m-pop" style={{ animationDelay: '150ms' }}>
              <Face id={other} pip label={other === s.defenderId ? 'défend' : 'attaque'} tone={other === s.defenderId ? 'defend' : 'attack'} />
            </div>
          </div>
          <Ring endsAt={endsAt} left={left} />
          {s.warp && (
            <span key={s.warp} className="m-pop absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur-md">
              {WARP_INFO[s.warp].emoji} {WARP_INFO[s.warp].label}
            </span>
          )}
        </div>
        <SmiledButton defender={defender} />
      </div>
      <aside className="flex flex-col gap-3">
        {attacker ? <Weapons s={s} /> : defender ? <Stoic /> : <Spectator />}
      </aside>
    </div>
  );
}

/** Anneau du temps, en bas à droite du visage : il se vide, rougit sur la fin. */
function Ring({ endsAt, left }: { endsAt: number | null; left: number }) {
  const circle = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = circle.current;
    if (!el || !endsAt) return;
    const total = SOURIRE_DUEL * 1000;
    let raf = 0;
    const loop = () => {
      const ratio = Math.max(0, Math.min(1, (endsAt - serverNow()) / total));
      el.style.strokeDashoffset = String(1 - ratio);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  const urgent = left <= 5;
  return (
    <div className={`absolute bottom-3 right-3 grid size-16 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md sm:size-20 ${urgent ? 's-urgent' : ''}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="19" fill="none" stroke="white" strokeOpacity=".2" strokeWidth="3" />
        <circle
          ref={circle}
          cx="22"
          cy="22"
          r="19"
          fill="none"
          pathLength={1}
          strokeDasharray="1"
          stroke={urgent ? 'var(--color-bad)' : 'var(--color-accent)'}
          strokeWidth="3"
          strokeLinecap="round"
          className="transition-[stroke] duration-300"
        />
      </svg>
      <span className="relative font-mono text-xl font-bold tabular-nums sm:text-2xl" aria-label="Secondes restantes">
        <Ticker value={left} />
      </span>
    </div>
  );
}

/** Le gros bouton : tout le monde peut siffler le sourire ; le défenseur, lui, peut avouer. */
function SmiledButton({ defender }: { defender: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={btn}
      className={`s-smiled btn w-full py-3 text-base font-semibold sm:text-lg ${defender ? 'border border-edge bg-surface text-ink' : 'bg-bad text-white'}`}
      onClick={() => {
        bump(btn.current, 1.04);
        net.send({ t: 'sourire', smiled: true });
      }}
    >
      {defender ? '🙈 J’avoue, j’ai souri' : '😁 Il a souri !'}
      <span className="kbd border-current/30 text-current/70 max-sm:hidden">Espace</span>
    </button>
  );
}

/** Consigne de grimace, bruitages et déformations : l'arsenal de l'attaquant. */
function Weapons({ s }: { s: SourireState }) {
  const view = useCall();
  const card = useRef<HTMLDivElement>(null);

  // La déformation suit l'état du serveur et s'arrête en quittant le duel.
  useEffect(() => {
    void call.setWarp(s.warp);
  }, [s.warp]);
  useEffect(() => () => void call.setWarp(null), []);

  const pickWarp = (w: WarpId | null) => net.send({ t: 'sourire', warp: s.warp === w ? null : w });

  return (
    <>
      <div ref={card} className="s-dare relative overflow-hidden rounded-xl bg-primary p-4 text-on-primary">
        <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Ta mission</p>
        <p key={s.dare} className="s-dare-text mt-1 text-lg font-semibold leading-snug tracking-[-0.02em]">
          {s.dare ?? '…'}
        </p>
        <button
          className="btn mt-3 border border-on-primary/25 px-2.5 py-1 text-xs text-on-primary hover:bg-on-primary/10 max-sm:min-h-11 max-sm:px-4 max-sm:text-sm"
          onClick={(e) => {
            bump(e.currentTarget);
            net.send({ t: 'sourire', dare: true });
          }}
        >
          🎲 Une autre
        </button>
      </div>

      <div className="panel p-3">
        <p className="mb-2 text-xs font-medium text-muted">Déforme ta tête</p>
        {view.joined && view.cam ? (
          <div className="grid grid-cols-3 gap-1.5">
            {WARPS.map((w, i) => (
              <button
                key={w}
                style={{ animationDelay: `${i * 40}ms` }}
                aria-pressed={s.warp === w}
                className={`m-pop flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] transition ${
                  s.warp === w ? 'border-accent bg-accent/15 font-semibold' : 'border-edge hover:-translate-y-px hover:border-ink/30'
                }`}
                onClick={(e) => {
                  bump(e.currentTarget);
                  pickWarp(w);
                }}
              >
                <span className="text-lg">{WARP_INFO[w].emoji}</span>
                {WARP_INFO[w].label}
              </button>
            ))}
          </div>
        ) : (
          <button className="btn-ghost w-full text-xs" onClick={() => (view.joined ? call.toggle('video') : call.join(true, true))}>
            🎥 Allume ta caméra pour te déformer
          </button>
        )}
      </div>

      <div className="panel p-3">
        <p className="mb-2 text-xs font-medium text-muted">Bruitages</p>
        <SoundBoard compact />
      </div>
    </>
  );
}

function Stoic() {
  return (
    <div className="panel m-rise flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
      <Smile tight className="s-stoic size-24 text-ink" />
      <p className="text-lg font-semibold tracking-[-0.02em]">Visage de marbre.</p>
      <p className="text-sm text-muted">Pas un sourire, pas un rictus. Tiens bon jusqu'au bout !</p>
    </div>
  );
}

function Spectator() {
  return (
    <div className="panel m-rise flex flex-1 flex-col gap-3 p-3">
      <p className="text-sm text-muted">Guette le moindre coin de lèvre qui frémit… et aide l'attaquant :</p>
      <SoundBoard compact />
    </div>
  );
}

/** Verdict : « Craqué ! » tamponné, ou le visage de marbre applaudi ; les points défilent. */
function Verdict({ s }: { s: SourireState }) {
  const r = s.result;
  const defender = usePlayer(s.defenderId);
  const attacker = usePlayer(s.attackerId);
  const selfId = useGame((st) => st.selfId);
  const burst = useRef<HTMLCanvasElement>(null);
  const name = (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');

  useEffect(() => {
    if (!r) return;
    if (r.smiled) play('boum');
    else {
      play('bravo');
      return confetti(burst.current, 120);
    }
  }, [r]);

  if (!r) return null;
  return (
    <div className="relative grid min-h-[28rem] place-items-center p-6 text-center">
      <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative">
        {r.smiled ? (
          <>
            <p className="s-stamp inline-block rounded-xl border-4 border-bad px-5 py-1 text-5xl font-black uppercase tracking-[-0.03em] text-bad sm:text-7xl">Craqué !</p>
            <Smile className="s-crack mx-auto mt-4 size-24 text-ink" />
            <p className="m-rise mt-3 text-lg" style={{ animationDelay: '250ms' }}>
              <b>{name(attacker)}</b> a fait sourire <b>{name(defender)}</b> en <b>{r.held} s</b>.
            </p>
          </>
        ) : (
          <>
            <Smile tight className="s-stoic mx-auto size-28 text-ink" />
            <p className="m-pop mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Visage de marbre !</p>
            <p className="m-rise mt-2 text-lg" style={{ animationDelay: '200ms' }}>
              <b>{name(defender)}</b> a tenu {SOURIRE_DUEL} s sans sourire.
            </p>
          </>
        )}
        <div className="mt-5 flex justify-center gap-3">
          {[attacker, defender].map((p, i) =>
            p ? <Gain key={p.id} player={p} self={p.id === selfId} gain={r.gains[p.id] ?? 0} delay={400 + i * 120} /> : null,
          )}
        </div>
      </div>
    </div>
  );
}

function Gain({ player, self, gain, delay }: { player: PlayerPublic; self: boolean; gain: number; delay: number }) {
  const shown = useCountUp(gain);
  return (
    <span style={{ animationDelay: `${delay}ms` }} className={`m-pop flex items-center gap-2 rounded-full border px-3 py-1.5 ${gain ? 'border-good/50 bg-good/10' : 'border-edge'}`}>
      <span>{avatarOf(player.avatar)}</span>
      <span className="text-sm">{self ? 'Toi' : player.name}</span>
      <b className={`font-mono tabular-nums ${gain ? 'text-good' : 'text-muted'}`}>+{shown}</b>
    </span>
  );
}

/** Raccourci : Espace siffle le sourire pendant le duel (hors champ de saisie). */
export function useSmiledKey() {
  const phase = useGame((s) => s.room!.phase);
  useEffect(() => {
    if (phase !== 'duel') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== 'Space' || e.repeat || t.closest('input, textarea, button, [contenteditable]')) return;
      e.preventDefault();
      net.send({ t: 'sourire', smiled: true });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [phase]);
}
