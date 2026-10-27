import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  PITCH_FUNDED,
  PITCH_MIN_TALK,
  PITCH_OFFERS,
  PITCH_SLIDES,
  PITCH_SLIDE_COOLDOWN,
  PITCH_TIME,
  type PitchProduct,
  type PitchState,
  type PlayerPublic,
} from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { useCall } from '../../lib/call';
import { net } from '../../lib/net';
import { play, tick } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, Ticker, useCountUp, useMedia } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { SoundBoard } from '../SoundBoard';
import { Slide } from './Slide';
import './pitch.css';

/** Transitions façon logiciel de présentation, tirées à chaque diapo (le nom s'affiche, c'est la blague). */
const TRANSITIONS = [
  { cls: 'pt-tr-zoom', name: 'Zoom dramatique' },
  { cls: 'pt-tr-spin', name: 'Tourbillon' },
  { cls: 'pt-tr-cube', name: 'Cube 3D' },
  { cls: 'pt-tr-drop', name: 'Chute libre' },
  { cls: 'pt-tr-blinds', name: 'Stores vénitiens' },
  { cls: 'pt-tr-swing', name: 'Balançoire' },
] as const;

/** Durée de la diapo en plein écran chez le vendeur avant qu'elle rejoigne l'écran de la salle (ms). */
const TAKEOVER = 2600;

/** Plateau du Pitch saboté : l'écran de présentation, la visio du vendeur, et l'arsenal des investisseurs. */
export function PitchBoard() {
  const phase = useGame((s) => s.room!.phase);
  const p = useGame((st) => st.room!.pitch);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {p && <Turns p={p} />}
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' || !p ? (
          <Teaser />
        ) : phase === 'brief' ? (
          <Brief key={p.turn} p={p} />
        ) : phase === 'pitch' ? (
          <Stage key={p.turn} p={p} />
        ) : phase === 'vote' ? (
          <Offers key={p.turn} p={p} />
        ) : phase === 'verdict' ? (
          <Verdict key={p.turn} p={p} />
        ) : (
          <Teaser />
        )}
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

function useSeconds(endsAt: number | null): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

const isPitcher = (p: PitchState, selfId: string | null) => p.pitcherId === selfId;

/** Derrière les réglages : un petit écran de présentation qui fait défiler ses pires diapos. */
function Teaser() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, []);
  const slide = PITCH_SLIDES[(i * 7) % PITCH_SLIDES.length]!;
  const tr = TRANSITIONS[i % TRANSITIONS.length]!;
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="pt-teaser w-full max-w-md">
        <div className="pt-screen">
          <Slide key={i} slide={slide} brand="Plouify" className={tr.cls} />
        </div>
        <span className="pt-stand" />
      </div>
    </div>
  );
}

/** Une pastille par pitch, et le vendeur du moment. */
function Turns({ p }: { p: PitchState }) {
  const pitcher = usePlayer(p.pitcherId);
  const selfId = useGame((st) => st.selfId);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span key={p.turn} className="m-rise flex items-center gap-2">
        <span className="rounded-full border border-accent/60 bg-accent/15 px-2.5 py-1 font-medium">
          🎤 {avatarOf(pitcher?.avatar ?? 0)} {pitcher ? (pitcher.id === selfId ? 'Toi' : pitcher.name) : '…'}
        </span>
        <span className="font-mono text-xs text-muted">vend</span>
        <span className="rounded-full border border-edge bg-surface px-2.5 py-1 font-semibold">{p.product.brand}</span>
      </span>
      <span className="flex items-center gap-1" aria-label={`Pitch ${p.turn + 1} sur ${p.turns}`}>
        {Array.from({ length: p.turns }, (_, i) => (
          <span key={i} className={`size-2.5 rounded-full transition-all duration-500 ${i < p.turn ? 'm-pop bg-accent' : i === p.turn ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`} />
        ))}
      </span>
    </div>
  );
}

/** La fiche produit : la marque s'écrit lettre à lettre, les trois lignes tombent, le mot imposé est tamponné. */
function ProductCard({ product, compact = false }: { product: PitchProduct; compact?: boolean }) {
  return (
    <div className={`pt-card ${compact ? 'pt-card-sm' : ''}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] opacity-70">Le produit</p>
      <p className="pt-brand" aria-label={product.brand}>
        {[...product.brand].map((c, i) => (
          <span key={i} className="m-letter inline-block" style={{ animationDelay: `${i * 55}ms` }} aria-hidden>
            {c}
          </span>
        ))}
        <span className="pt-tm">™</span>
      </p>
      <ul className="pt-lines">
        {[product.what, product.twist, product.target].map((l, i) => (
          <li key={l} className="m-rise" style={{ animationDelay: `${350 + i * 160}ms` }}>
            {l}
          </li>
        ))}
      </ul>
      <p className="pt-buzz" style={{ animationDelay: compact ? '0ms' : '950ms' }}>
        Mot obligatoire : <b>{product.buzzword}</b>
      </p>
    </div>
  );
}

/** Découverte du produit : le vendeur se prépare (et peut changer une fois), les investisseurs affûtent leurs diapos. */
function Brief({ p }: { p: PitchState }) {
  const selfId = useGame((st) => st.selfId);
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const me = isPitcher(p, selfId);
  const pitcher = usePlayer(p.pitcherId);
  useEffect(() => {
    if (left > 0 && left <= 3) tick(left === 1);
  }, [left]);

  return (
    <div className="grid min-h-[28rem] place-items-center gap-5 p-4 sm:p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-4 text-center">
        <p className="m-rise text-lg font-semibold tracking-[-0.02em]">
          {me ? 'Voici ce que tu vas vendre. Prépare ton baratin !' : `${pitcher?.name ?? '…'} va vous vendre…`}
        </p>
        <div key={`${p.product.brand}-${p.product.what}`} className="pt-unbox w-full">
          <ProductCard product={p.product} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span key={left} className="s-count font-mono text-4xl font-bold tabular-nums" aria-live="polite">
            {left || 'Go'}
          </span>
          {me && !p.rerolled && (
            <button
              className="btn-ghost text-sm"
              onClick={(e) => {
                bump(e.currentTarget);
                net.send({ t: 'pitch', reroll: true });
              }}
            >
              🎲 Un autre produit
            </button>
          )}
        </div>
        <p className="text-sm text-muted">
          {me ? '60 secondes, caméra allumée. Les investisseurs vont t’envoyer des diapos absurdes : improvise avec !' : 'Pendant le pitch, envoie-lui des diapos absurdes et des bruitages. Il devra faire avec.'}
        </p>
      </div>
    </div>
  );
}

/** Le visage du vendeur : sa caméra s'il est en visio, sinon son avatar. */
function Face({ id, className = '' }: { id: string; className?: string }) {
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
    <figure className={`pt-face relative m-0 overflow-hidden rounded-xl border border-accent/60 bg-page ${className}`}>
      {/* Le son passe déjà par la visio : la vidéo ici reste muette. */}
      <video ref={video} autoPlay playsInline muted className={`size-full object-cover ${self ? '-scale-x-100' : ''} ${cam ? '' : 'invisible'}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="m-breathe text-5xl">{avatarOf(player?.avatar ?? 0)}</span>
        </span>
      )}
      <figcaption className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white backdrop-blur-md">
        🎤 {self ? 'Toi' : (player?.name ?? '…')}
      </figcaption>
    </figure>
  );
}

/** Le pitch : l'écran de la salle, la barre du temps, et selon le rôle les antisèches ou l'arsenal. */
function Stage({ p }: { p: PitchState }) {
  const selfId = useGame((st) => st.selfId);
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const me = isPitcher(p, selfId);
  const slide = p.slide ? PITCH_SLIDES[p.slide.index] : null;
  const tr = TRANSITIONS[(p.slide?.n ?? 0) % TRANSITIONS.length]!;
  const pages = Object.values(p.sent).reduce((a, b) => a + b, 0);
  const sender = usePlayer(p.slide?.by);
  // Téléphone : la diapo est minuscule ; un toucher l'ouvre en grand, couchée pour remplir l'écran.
  const coarse = useMedia('(pointer: coarse)');
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (left > 0 && left <= 5) tick(left <= 3);
  }, [left]);
  useEffect(() => {
    if (p.slide) play('ding');
  }, [p.slide?.n]);

  return (
    <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative">
          <div className="flex items-center gap-3">
            <TimeBar endsAt={endsAt} />
            <span className={`pt-clock ${left <= 10 ? 's-urgent bg-bad' : 'bg-primary'}`} aria-label="Secondes restantes">
              <Ticker value={left} />
            </span>
          </div>
          <div className="pt-screen mt-2" onClick={() => coarse && setZoom(true)} title={coarse ? 'Agrandir la diapo' : undefined}>
            {slide ? (
              <Slide key={p.slide!.n} slide={slide} brand={p.product.brand} page={pages} className={tr.cls} />
            ) : (
              <TitleSlide product={p.product} />
            )}
            {coarse && (
              <span className="pt-zoom-hint" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </span>
            )}
            {slide && (
              <span key={`tag-${p.slide!.n}`} className="pt-tag m-pop">
                ✨ {tr.name}
                {sender && sender.id !== selfId ? ` · de ${sender.name}` : ''}
              </span>
            )}
          </div>
          <Face id={p.pitcherId} className="pt-pip" />
        </div>
        {me && <Conclude endsAt={endsAt} />}
      </div>
      <aside className="flex flex-col gap-3">{me ? <Notes p={p} /> : <Arsenal p={p} />}</aside>
      {zoom &&
        createPortal(
          <div className="pt-zoom" role="dialog" aria-label="Diapo en grand" onClick={() => setZoom(false)}>
            <div className="pt-zoom-frame">{slide ? <Slide slide={slide} brand={p.product.brand} page={pages} /> : <TitleSlide product={p.product} />}</div>
            <p className="pt-zoom-close">Touche pour fermer</p>
          </div>,
          document.body,
        )}
      {me && p.slide && slide && p.slide.by !== selfId && <Takeover key={p.slide.n} slide={slide} brand={p.product.brand} tr={tr} />}
    </div>
  );
}

/** La première diapo, avant tout sabotage : le nom du produit en grand. */
function TitleSlide({ product }: { product: PitchProduct }) {
  return (
    <div className="pt-slide pt-k-title">
      <div className="pt-slide-in">
        <p className="pt-title-big">
          {product.brand}
          <span className="pt-tm">™</span>
        </p>
        <p className="pt-sub">
          {product.what} {product.twist}
        </p>
        <p className="pt-foot">
          <span>Levée de fonds · Série A</span>
          <span>1 / ∞</span>
        </p>
      </div>
    </div>
  );
}

/** Barre du temps au-dessus de l'écran : dorée, puis rouge sur les 10 dernières secondes. */
function TimeBar({ endsAt }: { endsAt: number | null }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el || !endsAt) return;
    let raf = 0;
    const loop = () => {
      const ms = endsAt - serverNow();
      el.style.transform = `scaleX(${Math.max(0, Math.min(1, ms / (PITCH_TIME * 1000)))})`;
      el.classList.toggle('pt-time-late', ms < 10_000);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  return (
    <div className="pt-time flex-1" role="presentation">
      <span ref={bar} />
    </div>
  );
}

/** La diapo arrive en plein écran chez le vendeur, puis rejoint l'écran de la salle. */
function Takeover({ slide, brand, tr }: { slide: (typeof PITCH_SLIDES)[number]; brand: string; tr: (typeof TRANSITIONS)[number] }) {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOut(true), TAKEOVER);
    const b = setTimeout(() => setGone(true), TAKEOVER + 450);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  if (gone) return null;
  return (
    <div className={`pt-takeover ${out ? 'pt-takeover-out' : ''}`} onClick={() => setOut(true)} role="dialog" aria-label={`Nouvelle diapo : ${slide.title}`}>
      <div className="pt-takeover-frame">
        <Slide slide={slide} brand={brand} className={tr.cls} />
        <p className="pt-takeover-hint">Improvise ! Elle fait partie de ton pitch.</p>
      </div>
    </div>
  );
}

/** Le bouton du vendeur pour conclure, grisé les premières secondes. */
function Conclude({ endsAt }: { endsAt: number | null }) {
  const left = useSeconds(endsAt);
  const talked = PITCH_TIME - left;
  const ready = talked >= PITCH_MIN_TALK;
  return (
    <button
      disabled={!ready}
      className="pt-conclude btn w-full bg-primary py-3 text-base font-semibold text-on-primary disabled:opacity-50"
      onClick={(e) => {
        bump(e.currentTarget, 1.04);
        net.send({ t: 'pitch', done: true });
      }}
    >
      🤝 Je conclus, à vous de jouer
      {!ready && <span className="font-mono text-xs opacity-70">({PITCH_MIN_TALK - talked} s)</span>}
    </button>
  );
}

/** Antisèche du vendeur : sa fiche produit et un rappel des règles. */
function Notes({ p }: { p: PitchState }) {
  return (
    <>
      <ProductCard product={p.product} compact />
      <div className="panel m-rise p-3 text-sm text-muted">
        <p className="mb-1 font-medium text-ink">Tes antisèches</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Présente le problème, puis ta solution géniale.</li>
          <li>Chaque diapo qui tombe fait partie de ton plan. Assume-la !</li>
          <li>
            Place « <b className="text-ink">{p.product.buzzword}</b> » au moins une fois.
          </li>
        </ul>
      </div>
    </>
  );
}

/** Trois diapos en main, à envoyer d'un clic ; la main se recharge pendant le délai entre deux envois. */
function Arsenal({ p }: { p: PitchState }) {
  const [hand, setHand] = useState(() => drawHand([], 3));
  const [cool, setCool] = useState(0);
  const ring = useRef<HTMLDivElement>(null);
  const busy = cool > 0;

  const send = (slot: number, el: HTMLElement) => {
    if (busy) return;
    const index = hand[slot]!;
    bump(el, 0.94);
    net.send({ t: 'pitch', slide: index });
    setHand((h) => h.map((v, i) => (i === slot ? drawHand(h, 1)[0]! : v)));
    setCool((c) => c + 1);
  };

  useEffect(() => {
    if (!cool) return;
    const el = ring.current;
    el?.style.setProperty('--pt-cool', `${PITCH_SLIDE_COOLDOWN}ms`);
    el?.classList.remove('pt-cooling');
    void el?.offsetWidth;
    el?.classList.add('pt-cooling');
    const t = setTimeout(() => setCool(0), PITCH_SLIDE_COOLDOWN);
    return () => clearTimeout(t);
  }, [cool]);

  return (
    <>
      <div ref={ring} className="panel pt-hand p-3">
        <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted">
          <span>Tes diapos · clique pour l’envoyer</span>
          <span className="font-mono">{busy ? 'recharge…' : 'prêt'}</span>
        </p>
        <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-1">
          {hand.map((index, slot) => (
            <button
              key={`${slot}-${index}`}
              aria-disabled={busy || undefined}
              title={PITCH_SLIDES[index]!.title}
              className="pt-hand-card m-pop"
              style={{ animationDelay: `${slot * 60}ms` } as CSSProperties}
              onClick={(e) => send(slot, e.currentTarget)}
            >
              <Slide slide={PITCH_SLIDES[index]!} brand={p.product.brand} still />
              <span className="pt-hand-title">{PITCH_SLIDES[index]!.title}</span>
            </button>
          ))}
        </div>
        <span className="pt-cool-bar" aria-hidden />
      </div>
      <div className="panel p-3">
        <p className="mb-2 text-xs font-medium text-muted">Bruitages</p>
        <SoundBoard compact />
      </div>
    </>
  );
}

/** Tire `n` diapos au hasard, aucune déjà en main. */
function drawHand(exclude: number[], n: number): number[] {
  const pool = PITCH_SLIDES.map((_, i) => i).filter((i) => !exclude.includes(i));
  const out: number[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  return out;
}

/** Les offres : chaque investisseur dit combien il met ; le vendeur voit les mains se lever. */
function Offers({ p }: { p: PitchState }) {
  const selfId = useGame((st) => st.selfId);
  const players = useGame((st) => st.room!.players);
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const me = isPitcher(p, selfId);
  const [mine, setMine] = useState<number | null>(null);
  const investors = players.filter((pl) => pl.id !== p.pitcherId);

  return (
    <div className="grid min-h-[28rem] place-items-center p-4 sm:p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-5 text-center">
        <p className="m-rise text-2xl font-bold tracking-[-0.03em]">{me ? 'Les investisseurs délibèrent…' : `Combien tu mets dans ${p.product.brand}\u00a0?`}</p>
        {!me && (
          <div className="grid w-full gap-2 sm:grid-cols-5">
            {PITCH_OFFERS.map((o, i) => (
              <button
                key={o.label}
                aria-pressed={mine === i + 1}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`pt-offer m-rise ${mine === i + 1 ? 'pt-offer-on' : ''}`}
                onClick={(e) => {
                  bump(e.currentTarget, 1.06);
                  setMine(i + 1);
                  net.send({ t: 'pitch', rate: i + 1 });
                }}
              >
                <span className="pt-offer-stars">{'★'.repeat(i + 1)}</span>
                <span className="text-sm font-semibold">{o.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {investors.map((pl, i) => {
            const done = p.rated.includes(pl.id);
            return (
              <span key={pl.id} style={{ animationDelay: `${i * 80}ms` }} className={`m-pop flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-300 ${done ? 'border-good/50 bg-good/10' : 'border-edge'}`}>
                <span className={done ? 'pt-hand-up' : 'm-breathe'}>{done ? '✋' : avatarOf(pl.avatar)}</span>
                {pl.id === selfId ? 'Toi' : pl.name}
                <span className="text-xs text-muted">{done ? 'a fait son offre' : 'réfléchit…'}</span>
              </span>
            );
          })}
        </div>
        <span className="font-mono text-sm text-muted tabular-nums">{left} s</span>
      </div>
    </div>
  );
}

/** Verdict : le tampon « Financé ! » ou « Recalé », la levée de fonds qui défile, l'offre de chacun. */
function Verdict({ p }: { p: PitchState }) {
  const r = p.result;
  const selfId = useGame((st) => st.selfId);
  const players = useGame((st) => st.room!.players);
  const pitcher = usePlayer(p.pitcherId);
  const burst = useRef<HTMLCanvasElement>(null);
  const funded = Boolean(r && r.avg >= PITCH_FUNDED);
  const raised = useCountUp(r?.raised ?? 0, { delay: 350, duration: 1100 });

  useEffect(() => {
    if (!r) return;
    if (funded) {
      play('bravo');
      return confetti(burst.current, 140);
    }
    play('trombone');
  }, [r, funded]);

  if (!r) return null;
  return (
    <div className="relative grid min-h-[28rem] place-items-center p-6 text-center">
      <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative flex flex-col items-center gap-3">
        <p className={`pt-stamp inline-block rounded-xl border-4 px-5 py-1 text-5xl font-black uppercase tracking-[-0.03em] sm:text-7xl ${funded ? 'border-good text-good' : 'border-bad text-bad'}`}>
          {funded ? 'Financé !' : 'Recalé'}
        </p>
        <p className="m-rise text-lg" style={{ animationDelay: '200ms' }}>
          <b>{pitcher ? (pitcher.id === selfId ? 'Tu as' : `${pitcher.name} a`) : '…'}</b> levé
        </p>
        <p className="pt-raised font-mono text-4xl font-bold tabular-nums sm:text-6xl">{raised.toLocaleString('fr-FR')} €</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {players
            .filter((pl) => pl.id !== p.pitcherId)
            .map((pl, i) => {
              const stars = r.ratings[pl.id];
              return (
                <span key={pl.id} style={{ animationDelay: `${600 + i * 140}ms` }} className="m-pop flex items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-sm">
                  {avatarOf(pl.avatar)} {pl.id === selfId ? 'Toi' : pl.name} :<b>{stars ? PITCH_OFFERS[stars - 1]!.label : 'muet'}</b>
                </span>
              );
            })}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {players
            .filter((pl) => r.gains[pl.id])
            .map((pl, i) => (
              <Gain key={pl.id} player={pl} self={pl.id === selfId} gain={r.gains[pl.id]!} delay={900 + i * 120} />
            ))}
        </div>
      </div>
    </div>
  );
}

function Gain({ player, self, gain, delay }: { player: PlayerPublic; self: boolean; gain: number; delay: number }) {
  const shown = useCountUp(gain);
  return (
    <span style={{ animationDelay: `${delay}ms` }} className="m-pop flex items-center gap-2 rounded-full border border-good/50 bg-good/10 px-3 py-1.5">
      <span>{avatarOf(player.avatar)}</span>
      <span className="text-sm">{self ? 'Toi' : player.name}</span>
      <b className="font-mono tabular-nums text-good">+{shown}</b>
    </span>
  );
}
