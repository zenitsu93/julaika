import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CANVAS_H,
  CANVAS_W,
  FLASH_DRAW_TIME,
  FLASH_IMAGES,
  FLASH_SHOW_TIME,
  FLASH_STAR_POINTS,
  PALETTE,
  flashSvg,
  type DrawPacket,
  type FlashSketch,
  type FlashState,
} from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { BoardCanvas, Pen, replay } from '../../lib/board';
import { net } from '../../lib/net';
import { serverNow, useGame } from '../../lib/store';
import { attachWipe, bump, confetti, Presence, reducedMotion, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Stars } from '../photo/PhotoBoard';
import { Toolbar } from '../Toolbar';
import './flash.css';

/** Meilleur croquis d'une manche, gardé pour la planche de fin. */
interface Best {
  round: number;
  image: number;
  sketch: FlashSketch;
}

/** Plateau de Flash : l'image qui passe, la feuille et son chrono, puis la galerie autour de l'original. */
export function FlashBoard() {
  const phase = useGame((s) => s.room!.phase);
  const reel = useReel();
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <FlashBar />
      <div className="panel relative min-h-[30rem] overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,color-mix(in_oklab,var(--color-accent)_8%,transparent),transparent_70%)]">
        {phase === 'memorize' ? <Memorize /> : phase === 'draw' ? <DrawStage /> : phase === 'vote' || phase === 'reveal' ? <Gallery /> : <Teaser />}
        <Presence>
          {phase === 'lobby' ? (
            <Veil key="lobby" flow>
              <Lobby />
            </Veil>
          ) : phase === 'gameEnd' ? (
            <Veil key="end">
              <Finale reel={reel} />
            </Veil>
          ) : null}
        </Presence>
      </div>
      <CallBar />
    </section>
  );
}

/** À chaque révélation, le croquis le mieux noté rejoint la planche de fin. */
function useReel() {
  const [reel, setReel] = useState<Best[]>([]);
  const phase = useGame((s) => s.room!.phase);
  const flash = useGame((s) => s.room!.flash);
  const sketches = useGame((s) => s.sketches);
  useEffect(() => {
    if (phase === 'lobby') return setReel([]);
    if (phase !== 'reveal' || !flash || flash.image === null || sketches?.round !== flash.round) return;
    const best = sketches.sketches
      .filter((s) => flash.stars[s.by]?.votes)
      .sort((a, b) => flash.stars[b.by]!.total - flash.stars[a.by]!.total)[0];
    if (best) setReel((r) => (r.some((b) => b.round === flash.round) ? r : [...r, { round: flash.round, image: flash.image!, sketch: best }]));
  }, [phase, flash, sketches]);
  return reel;
}

function Veil({ children, flow = false }: { children: ReactNode; flow?: boolean }) {
  const mobile = flow ? 'max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none' : '';
  return (
    <div className={`m-veil absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] ${mobile}`}>
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Une image de la collection, en SVG, sur fond blanc. */
function Original({ index, className = '' }: { index: number; className?: string }) {
  const html = useMemo(() => flashSvg(FLASH_IMAGES[index]!), [index]);
  return <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className={`block aspect-[4/3] w-full bg-white ${className}`} dangerouslySetInnerHTML={{ __html: html }} aria-hidden />;
}

/** Derrière les réglages : une image qui flashe, puis sa copie de mémoire qui se gribouille. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[30rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="flex items-center gap-6 opacity-60">
        <div className="fl-teaser-a w-44 overflow-hidden rounded-xl ring-1 ring-edge">
          <Original index={0} />
        </div>
        <span className="text-3xl">→</span>
        <div className="fl-teaser-b w-44 overflow-hidden rounded-xl bg-white ring-1 ring-edge">
          <svg viewBox="0 0 800 600" className="block aspect-[4/3] w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path className="fl-scribble" pathLength={1} d="M230 300 L400 160 L590 310" stroke={PALETTE[2]} strokeWidth="22" />
            <path className="fl-scribble" pathLength={1} style={{ animationDelay: '.5s' }} d="M260 300 V510 H540 V300" stroke={PALETTE[10]} strokeWidth="18" />
            <path className="fl-scribble" pathLength={1} style={{ animationDelay: '1s' }} d="M640 120 a50 50 0 1 0 1 0" stroke={PALETTE[4]} strokeWidth="22" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Joueurs de la partie : une coche sur ceux qui ont rendu (ou fini de noter), et les manches. */
function FlashBar() {
  const players = useGame((s) => s.room!.players);
  const flash = useGame((s) => s.room!.flash);
  const phase = useGame((s) => s.room!.phase);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const done = new Set(flash?.done ?? []);
  const live = phase === 'draw' || phase === 'vote';
  const ordered = [...players].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const finished = live && done.has(p.id);
          const playing = (live || phase === 'memorize') && flash?.players.includes(p.id);
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${
                finished ? 'border-good/50 bg-good/10 text-good' : 'border-edge bg-surface'
              }`}
            >
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              <span className="font-mono text-xs tabular-nums text-muted">{p.score}</span>
              {finished ? (
                <span key="ok" className="m-pop" title={phase === 'draw' ? 'Croquis rendu' : 'A noté'}>
                  ✓
                </span>
              ) : playing ? (
                <span className="m-wobble text-xs" title={phase === 'memorize' ? 'Mémorise' : phase === 'draw' ? 'Dessine' : 'Note les croquis'}>
                  {phase === 'memorize' ? '👀' : phase === 'draw' ? '✏️' : '⭐'}
                </span>
              ) : null}
              {p.isHost && (
                <span title="Hôte" className="text-xs">
                  👑
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {flash && <Rounds flash={flash} />}
    </div>
  );
}

/** Une ampoule par manche : grillées, allumée (elle clignote), éteintes. */
function Rounds({ flash }: { flash: FlashState }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Image ${flash.round} sur ${flash.rounds}`}>
      {Array.from({ length: flash.rounds }, (_, i) => {
        const past = i + 1 < flash.round;
        const current = i + 1 === flash.round;
        return (
          <svg key={i} viewBox="0 0 16 16" className={`size-4 transition-all duration-500 ${past ? 'm-pop text-accent' : current ? 'fl-bulb text-gold' : 'text-edge'}`} aria-hidden>
            <path d="M9.5 1 3 9h4.5L6 15l7-8.5H8.5z" fill="currentColor" />
          </svg>
        );
      })}
    </span>
  );
}

/** L'heure serveur, rafraîchie à chaque image tant que `until` n'est pas largement passé. */
function useClock(until: number | null) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!until) return;
    let raf = 0;
    const tick = () => {
      const t = serverNow();
      setNow(t);
      if (t < until + 1000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [until]);
  return now;
}

function Spectator({ what }: { what: string }) {
  return (
    <div className="m-rise grid min-h-[30rem] place-items-center p-6 text-center">
      <div>
        <p className="text-4xl">🍿</p>
        <p className="mt-2 text-lg font-semibold">{what}</p>
        <p className="text-muted">Tu joueras à la prochaine partie ; les croquis arrivent bientôt.</p>
      </div>
    </div>
  );
}

// ---- Mémorisation ---------------------------------------------------------------

/** « Prêt ? 3, 2, 1 », un éclair, l'image trois secondes sous une jauge qui fond, puis elle s'éteint. */
function Memorize() {
  const flash = useGame((s) => s.room!.flash);
  const endsAt = useGame((s) => s.room!.endsAt);
  const now = useClock(endsAt);
  if (!flash || flash.image === null || !flash.showAt || !endsAt) return null;
  const before = flash.showAt - now;
  const showing = before <= 0;
  const left = endsAt - now;
  const n = Math.max(1, Math.ceil(before / 1000));
  const colors = flash.colors;

  return (
    <div className="flex min-h-[30rem] flex-col items-center justify-center gap-5 p-4 sm:p-6">
      <header className="text-center">
        <p className="m-rise text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Image {flash.round}/{flash.rounds} · {showing ? 'Regarde bien…' : 'Ouvre grand les yeux'}
        </p>
        <h2 className="m-pop mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{showing ? 'Mémorise !' : 'Prêt ?'}</h2>
      </header>
      <div className="relative w-full max-w-[min(32rem,calc((100dvh-22rem)*4/3))] min-w-[16rem]">
        {showing ? (
          <div key="img" className={`fl-shown relative overflow-hidden rounded-2xl shadow-[0_30px_60px_-30px_rgb(40_20_10/0.7)] ring-1 ring-edge ${left < 260 ? 'fl-gone' : ''}`}>
            <Original index={flash.image} />
            <span className="absolute inset-x-0 top-0 h-1.5 bg-black/5">
              <span className="block h-full origin-left bg-accent" style={{ transform: `scaleX(${Math.max(0, Math.min(1, left / (FLASH_SHOW_TIME * 1000)))})` }} />
            </span>
          </div>
        ) : (
          <div key="ready" className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-edge bg-surface/60">
            <span key={n} className="fl-count text-8xl font-extrabold tabular-nums text-ink sm:text-9xl" aria-live="assertive">
              {n}
            </span>
          </div>
        )}
        {showing && !reducedMotion() && <span key="burst" className="fl-burst pointer-events-none absolute -inset-6 rounded-[2rem]" aria-hidden />}
      </div>
      <Palette colors={colors} label={showing ? 'Tu n’auras que ces couleurs' : 'Tes trois couleurs'} />
    </div>
  );
}

/** Les trois pastilles de la manche, qui tombent l'une après l'autre. */
function Palette({ colors, label }: { colors: number[]; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span>{label}</span>
      <span className="flex gap-1.5">
        {colors.map((c, i) => (
          <span key={c} className="fl-swatch size-6 rounded-full ring-2 ring-surface shadow" style={{ background: PALETTE[c], animationDelay: `${i * 90}ms` }} />
        ))}
      </span>
    </div>
  );
}

// ---- Dessin -----------------------------------------------------------------------

function DrawStage() {
  const flash = useGame((s) => s.room!.flash);
  const selfId = useGame((s) => s.selfId);
  if (!flash) return null;
  if (!flash.players.includes(selfId ?? '')) return <Spectator what="Ils dessinent de mémoire…" />;
  // Une clé par manche : feuille blanche et pinceau neuf.
  return <Sheet key={flash.round} flash={flash} done={flash.done.includes(selfId!)} />;
}

/** La feuille : quinze secondes, trois couleurs, un chrono qui rougit sur la fin. */
function Sheet({ flash, done }: { flash: FlashState; done: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLCanvasElement>(null);
  const [sheet] = useState(() => new BoardCanvas());
  const [pen] = useState(() => {
    const p = new Pen((buf) => net.sendBinary(buf), sheet);
    p.color = flash.colors[0]!;
    return p;
  });
  const endsAt = useGame((s) => s.room!.endsAt);
  const now = useClock(endsAt);
  const left = Math.max(0, (endsAt ?? now) - now);
  const urgent = left > 0 && left <= 5000;
  const others = useGame((s) => {
    const f = s.room!.flash!;
    const present = new Set(s.room!.players.map((p) => p.id));
    return f.players.filter((id) => present.has(id) && !f.done.includes(id)).length;
  });

  useEffect(() => {
    sheet.attach(canvas.current);
    attachWipe(canvas.current, wipe.current);
    return () => {
      sheet.attach(null);
      attachWipe(null, null);
    };
  }, [sheet]);

  useEffect(() => {
    if (done || left === 0) pen.end();
  }, [done, left === 0, pen]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H] as const;
  };
  const locked = done || left === 0;
  const secs = Math.ceil(left / 1000);

  return (
    <div className="flex flex-col items-center gap-3 p-3 sm:p-4">
      <div className="flex w-full max-w-[max(20rem,calc((100dvh-24rem)*4/3))] items-end justify-between gap-3">
        <div>
          <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">Image {flash.round}/{flash.rounds}</p>
          <h2 className="m-pop text-xl font-semibold tracking-[-0.03em] sm:text-2xl">Redessine-la de mémoire</h2>
        </div>
        <span
          key={urgent ? secs : 'calm'}
          className={`font-mono text-3xl font-bold tabular-nums transition-colors ${urgent ? 'fl-tick text-bad' : 'text-ink'}`}
          aria-live={urgent ? 'polite' : 'off'}
        >
          {secs}
          <span className="text-base font-medium text-muted">s</span>
        </span>
      </div>
      <div className={`fl-sheet relative w-full max-w-[max(20rem,calc((100dvh-24rem)*4/3))] overflow-hidden rounded-lg border border-edge ${urgent && !done ? 'fl-urgent' : ''}`}>
        <span className="absolute inset-x-0 top-0 z-[1] h-1.5 bg-black/5" aria-hidden>
          <span
            className={`block h-full origin-left transition-colors duration-300 ${urgent ? 'bg-bad' : 'bg-accent'}`}
            style={{ transform: `scaleX(${Math.min(1, left / (FLASH_DRAW_TIME * 1000))})` }}
          />
        </span>
        <canvas
          ref={canvas}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`block aspect-[4/3] w-full touch-none bg-white ${locked ? '' : 'cursor-crosshair'}`}
          onPointerDown={(e) => {
            if (locked || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pen.start(...toCanvas(e));
          }}
          onPointerMove={(e) => {
            if (locked) return;
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            pen.move(events.flatMap((ev) => toCanvas(ev)));
          }}
          onPointerUp={() => pen.end()}
          onPointerCancel={() => pen.end()}
        />
        <canvas ref={wipe} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        <Presence>
          {locked ? (
            <div key="sent" className="m-veil absolute inset-0 grid place-items-center bg-page/70 backdrop-blur-[1px]">
              <div className="m-card text-center">
                <Check />
                <p className="mt-2 font-semibold">{done ? 'Croquis rendu !' : 'Pinceaux en l’air !'}</p>
                <p className="text-sm text-muted">
                  {others && left ? `Encore ${others} ${others > 1 ? 'artistes' : 'artiste'} au travail` : 'Place à la comparaison'}
                  <Dots />
                </p>
                {done && left > 0 && (
                  <button className="btn-ghost mt-3" onClick={() => net.send({ t: 'flash', edit: true })}>
                    Retoucher
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <Presence>
        {locked ? null : (
          <div className="flex w-full flex-col items-center gap-2">
            <Toolbar pen={pen} colors={flash.colors} />
            <button
              className="btn-primary px-6 py-2.5 text-base"
              onClick={(e) => {
                bump(e.currentTarget);
                pen.end();
                net.send({ t: 'flash', done: true });
              }}
            >
              J'ai fini !
            </button>
          </div>
        )}
      </Presence>
    </div>
  );
}

const Dots = () => (
  <span className="m-dots" aria-hidden>
    <span>.</span>
    <span>.</span>
    <span>.</span>
  </span>
);

/** Coche qui se dessine. */
const Check = () => (
  <svg viewBox="0 0 48 48" className="tel-check mx-auto size-14" aria-hidden>
    <circle cx="24" cy="24" r="21" fill="var(--color-good)" opacity=".15" />
    <path pathLength={1} d="M14 25l7 7 13-15" fill="none" stroke="var(--color-good)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ---- Galerie -------------------------------------------------------------------------

/** Un croquis rejoué trait par trait, avec l'original en calque quand on le demande. */
function Sketch({ strokes, image, overlay, ms = 1500, delay = 0 }: { strokes: DrawPacket[]; image: number; overlay: boolean; ms?: number; delay?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheet] = useState(() => new BoardCanvas());
  useEffect(() => {
    sheet.attach(canvas.current);
    let stop = () => {};
    const t = setTimeout(() => (stop = replay(sheet, strokes, ms, reducedMotion())), reducedMotion() ? 0 : delay);
    return () => {
      clearTimeout(t);
      stop();
      sheet.attach(null);
    };
  }, [sheet, strokes, ms, delay]);
  return (
    <div className="relative">
      <canvas ref={canvas} width={CANVAS_W} height={CANVAS_H} className="block aspect-[4/3] w-full bg-white" />
      <div className={`fl-ghost pointer-events-none absolute inset-0 ${overlay ? 'is-on' : ''}`}>
        <Original index={image} className="!bg-transparent" />
      </div>
    </div>
  );
}

/** Vote : l'original au centre, les croquis autour ; on note la ressemblance. Révélation : les étoiles et le classement. */
function Gallery() {
  const flash = useGame((s) => s.room!.flash);
  const phase = useGame((s) => s.room!.phase);
  const data = useGame((s) => s.sketches);
  const selfId = useGame((s) => s.selfId);
  const grid = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [overlay, setOverlay] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const reveal = phase === 'reveal';

  const round = data?.round ?? 0;
  useEffect(() => setVotes({}), [round]);

  const sketches = data?.sketches ?? [];
  const stars = flash?.stars ?? {};
  const best = reveal ? Math.max(0, ...sketches.map((s) => stars[s.by]?.total ?? 0)) : 0;
  const ordered = reveal ? [...sketches].sort((a, b) => (stars[b.by]?.total ?? 0) - (stars[a.by]?.total ?? 0)) : sketches;
  // L'original trône au milieu de la table.
  const mid = Math.floor(ordered.length / 2);
  useFlip(grid, [ordered.map((s) => s.by).join(), reveal]);

  useEffect(() => {
    if (!reveal || !best) return;
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(sparks.current, 70)), 900);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [reveal, best]);

  if (!flash || flash.image === null || !data) return <Waiting />;
  const image = flash.image;
  const playing = flash.players.includes(selfId ?? '');
  const toRate = sketches.filter((s) => s.by !== selfId && s.strokes.length);
  const rated = toRate.filter((s) => votes[s.by]).length;

  const cards = ordered.map((s, i) => {
    const score = stars[s.by];
    const top = reveal && best > 0 && score?.total === best;
    const blank = !s.strokes.length;
    return (
      <figure
        key={s.by}
        data-flip={s.by}
        className={`fl-card relative w-[clamp(10rem,27vw,15rem)] transition-[opacity,filter] duration-700 ${reveal && !top ? 'opacity-85 saturate-[.85]' : ''}`}
        style={{ '--tilt': `${((i * 37) % 7) - 3}deg`, animationDelay: `${i * 120}ms` } as CSSProperties}
      >
        {top && <span className="fl-halo pointer-events-none absolute -inset-4 -z-10 rounded-[2rem]" aria-hidden />}
        <div
          className="overflow-hidden rounded-xl bg-white shadow-[0_18px_40px_-24px_rgb(40_20_10/0.6)] ring-1 ring-edge"
          onPointerEnter={(e) => e.pointerType === 'mouse' && setPeek(s.by)}
          onPointerLeave={() => setPeek(null)}
          onPointerDown={(e) => e.pointerType !== 'mouse' && setPeek(s.by)}
          onPointerUp={(e) => e.pointerType !== 'mouse' && setPeek(null)}
          title="Survole pour superposer l’original"
        >
          {blank ? (
            <div className="grid aspect-[4/3] place-items-center text-sm text-muted">Page blanche 🫥</div>
          ) : (
            <Sketch strokes={s.strokes} image={image} overlay={overlay || peek === s.by} delay={250 + i * 180} />
          )}
        </div>
        {top && <span className="fl-crown absolute -top-3.5 left-1/2 z-10 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-bold text-[#2a1a12] shadow-lg">👑 Meilleure mémoire</span>}
        <figcaption className="mt-2 flex flex-col items-center gap-1">
          <span className="flex items-center gap-1.5 text-sm">
            <span aria-hidden>{avatarOf(s.avatar)}</span>
            <span className="font-medium">{s.by === selfId ? 'Toi' : s.name}</span>
          </span>
          {reveal ? (
            <Result score={score} index={i} />
          ) : s.by === selfId ? (
            <span className="rounded-full border border-dashed border-edge px-2.5 py-1 text-xs text-muted">Ton croquis</span>
          ) : !blank && playing ? (
            <Stars
              value={votes[s.by] ?? 0}
              onRate={(n) => {
                setVotes((v) => ({ ...v, [s.by]: n }));
                net.send({ t: 'flash', vote: s.by, stars: n });
              }}
            />
          ) : null}
        </figcaption>
      </figure>
    );
  });

  return (
    <div className="relative flex min-h-[30rem] flex-col items-center gap-4 p-4 sm:p-6">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden />
      <header className="text-center">
        <p className="m-rise text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Image {flash.round}/{flash.rounds} ·{' '}
          {reveal ? 'Les résultats' : playing && toRate.length ? `Note la ressemblance (${rated}/${toRate.length})` : 'Les autres notent…'}
        </p>
        <h2 key={reveal ? 'r' : 'v'} className="m-pop mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
          {reveal ? (best ? 'Et la meilleure mémoire est…' : 'Personne n’a noté cette fois !') : 'Qui l’a le mieux retenue ?'}
        </h2>
        <button
          type="button"
          aria-pressed={overlay}
          onClick={(e) => (bump(e.currentTarget), setOverlay((o) => !o))}
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-300 ${overlay ? 'border-accent/50 bg-accent/15 text-ink' : 'border-edge text-muted hover:text-ink'}`}
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="2.5" y="2.5" width="10" height="10" rx="2" />
            <rect x="7.5" y="7.5" width="10" height="10" rx="2" fill="currentColor" fillOpacity={overlay ? 0.35 : 0} />
          </svg>
          Superposer l’original
        </button>
      </header>
      <div ref={grid} className="flex w-full flex-wrap items-start justify-center gap-x-5 gap-y-7 pt-2">
        {cards.slice(0, mid)}
        <figure data-flip="original" className="fl-original relative max-sm:order-first w-[clamp(11rem,30vw,17rem)]">
          <div className="fl-frame rounded-2xl p-1.5">
            <div className="overflow-hidden rounded-xl">
              <Original index={image} />
            </div>
          </div>
          <figcaption className="mt-2 text-center">
            <span className="block text-xs font-medium uppercase tracking-[0.18em] text-accent">L’original</span>
            <span className="font-script text-2xl leading-none">{FLASH_IMAGES[image]!.name}</span>
          </figcaption>
        </figure>
        {cards.slice(mid)}
      </div>
    </div>
  );
}

function Waiting() {
  return (
    <div className="grid min-h-[30rem] place-items-center p-6 text-center">
      <div>
        <span className="m-breathe inline-block text-5xl">🖼️</span>
        <p className="mt-2 text-muted">On ramasse les croquis…</p>
      </div>
    </div>
  );
}

/** Sous chaque croquis : la moyenne qui compte, puis les points gagnés. */
function Result({ score, index }: { score?: { total: number; votes: number }; index: number }) {
  const avg = score?.votes ? score.total / score.votes : 0;
  const shown = useCountUp(Math.round(avg * 10), { from: 0, delay: 300 + index * 90 });
  const points = useCountUp((score?.total ?? 0) * FLASH_STAR_POINTS, { from: 0, delay: 500 + index * 90 });
  if (!score?.votes) return <span className="text-xs text-muted">Aucune note</span>;
  return (
    <span className="m-rise flex items-center gap-2 text-sm" style={{ animationDelay: `${250 + index * 90}ms` }}>
      <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-semibold">
        <span className="text-accent">★</span>
        <span className="font-mono tabular-nums">{(shown / 10).toFixed(1)}</span>
      </span>
      <span className="font-mono text-good tabular-nums">+{points}</span>
    </span>
  );
}

// ---- Fin de partie ---------------------------------------------------------------

/** Le classement, puis la planche : chaque original face au croquis qui l'a le mieux retenu. */
function Finale({ reel }: { reel: Best[] }) {
  const ranking = useGame((s) => s.ranking);
  const selfId = useGame((s) => s.selfId);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 500);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  return (
    <div className="panel relative overflow-hidden p-5 shadow-sm">
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">Fin du Flash</h2>
      {ranking && (
        <ol className="mx-auto mt-4 max-w-xs space-y-1.5 text-left">
          {ranking.map((p, i) => (
            <Rank key={p.id} name={p.id === selfId ? 'Toi' : p.name} avatar={p.avatar} score={p.score} index={i} />
          ))}
        </ol>
      )}
      {reel.length > 0 && (
        <>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-muted">L’original et sa meilleure copie</p>
          <div className="mt-3 space-y-2">
            {reel.map((r, i) => (
              <div key={r.round} className="m-rise grid grid-cols-2 items-center gap-2" style={{ animationDelay: `${600 + i * 160}ms` }}>
                <div className="overflow-hidden rounded-lg ring-1 ring-edge">
                  <Original index={r.image} />
                </div>
                <div className="relative overflow-hidden rounded-lg ring-1 ring-edge">
                  <Sketch strokes={r.sketch.strokes} image={r.image} overlay={false} ms={1200} delay={800 + i * 300} />
                  <span className="absolute bottom-1 right-1 rounded-full bg-surface/90 px-1.5 text-xs">
                    {avatarOf(r.sketch.avatar)} {r.sketch.by === selfId ? 'Toi' : r.sketch.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Rank({ name, avatar, score, index }: { name: string; avatar: number; score: number; index: number }) {
  const shown = useCountUp(score, { from: 0, delay: 200 + index * 120 });
  const medal = ['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`;
  return (
    <li className="m-rise flex items-center justify-between rounded-md border border-edge bg-surface px-3 py-2" style={{ animationDelay: `${150 + index * 120}ms` }}>
      <span className="flex items-center gap-2">
        <span className="w-6 text-center">{medal}</span>
        <span>{avatarOf(avatar)}</span>
        <span className="font-medium">{name}</span>
      </span>
      <span className="font-mono tabular-nums">{shown}</span>
    </li>
  );
}
