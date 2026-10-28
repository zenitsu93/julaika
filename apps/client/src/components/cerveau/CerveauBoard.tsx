import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CANVAS_H, CANVAS_W, CERVEAU_SPLIT, type CerveauModel, type CerveauState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { BoardCanvas, Pen } from '../../lib/board';
import { useCall } from '../../lib/call';
import { albumFile, cerveauPages, flatten, inkLayers, type CerveauPage } from '../../lib/cerveau';
import { saveImageFile, type SaveResult } from '../../lib/polaroid';
import { net } from '../../lib/net';
import { serverNow, useGame } from '../../lib/store';
import { attachWipe, bump, confetti, Presence, useCountUp, useSpeaking } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Toolbar } from '../Toolbar';
import { KIND_INFO, verdict } from './info';
import './cerveau.css';

/** Plateau du Cerveau coupé : le binôme en haut, le modèle et le tableau commun, la visio dessous. */
export function CerveauBoard() {
  const phase = useGame((s) => s.room!.phase);
  const turn = useGame((s) => s.room!.cerveau?.turn ?? -1);

  // Nouvelle partie : l'album repart de zéro.
  useEffect(() => {
    if (turn === 0 && phase === 'draw') cerveauPages.reset();
  }, [turn, phase]);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <DuoBar />
      <div className="panel relative min-h-[26rem] overflow-hidden">
        {phase === 'album' ? <Album /> : phase === 'lobby' ? <Teaser /> : <Stage key={turn} />}
        <Presence>
          {phase === 'lobby' ? (
            <Veil key="lobby">
              <Lobby />
            </Veil>
          ) : null}
        </Presence>
      </div>
      <CallBar />
    </section>
  );
}

function Veil({ children }: { children: ReactNode }) {
  return (
    <div className="m-veil absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none">
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Derrière les réglages : deux moitiés de cerveau qui se cherchent. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[26rem] place-items-center p-6 opacity-40 max-sm:hidden" aria-hidden>
      <svg viewBox="0 0 200 140" className="w-64" fill="none" strokeLinecap="round" strokeWidth="6" stroke="currentColor">
        <path className="cv-tease-l" d="M96 22c-30-8-60 10-62 38-16 8-16 36 4 44 6 18 30 22 58 12z" />
        <path className="cv-tease-r stroke-gold" d="M104 22c30-8 60 10 62 38 16 8 16 36-4 44-6 18-30 22-58 12z" />
      </svg>
    </div>
  );
}

/** Voix d'un joueur dans la visio : vrai quand il parle (mesure locale). */
function useVoice(player: PlayerPublic | undefined, selfId: string | null) {
  const view = useCall();
  const stream = !player ? null : player.id === selfId ? view.local : (view.remotes[player.id] ?? null);
  return useSpeaking(stream, Boolean(player?.mic));
}

/** Le binôme de la manche et son rôle, les dessins faits, et la jauge de complicité. */
function DuoBar() {
  const cv = useGame((s) => s.room!.cerveau);
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const album = useGame((s) => s.room!.phase === 'album');
  if (!cv) return null;
  const info = KIND_INFO[cv.kind];
  const avg = cv.scores.length ? Math.round(cv.scores.reduce((a, b) => a + b, 0) / cv.scores.length) : 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {!album && (
        <>
          <span key={cv.turn} className="m-pop flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-on-primary">
            <span aria-hidden>{info.icon}</span>
            {info.name}
          </span>
          <ol className="flex items-center gap-1.5" aria-label="Binôme">
            {cv.duo.map((id, i) => (
              <DuoChip key={`${cv.turn}-${i}`} player={players.find((p) => p.id === id)} selfId={selfId} role={info.roles[i]!} icon={info.icons[i]!} done={cv.done.includes(id)} index={i} />
            ))}
          </ol>
        </>
      )}
      <span className="flex items-center gap-1" aria-label={`Dessin ${cv.turn + 1} sur ${cv.turns}`}>
        {Array.from({ length: cv.turns }, (_, i) => {
          const s = cv.scores[i];
          return (
            <span
              key={i}
              title={s === undefined ? undefined : `${s} %`}
              className={`size-2.5 rounded-full transition-all duration-500 ${s !== undefined ? 'm-pop' : i === cv.turn ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`}
              style={s !== undefined ? { background: `color-mix(in oklab, var(--color-gold) ${30 + s * 0.7}%, var(--color-edge))` } : undefined}
            />
          );
        })}
      </span>
      {cv.scores.length > 0 && <Bond value={avg} />}
    </div>
  );
}

function DuoChip({ player, selfId, role, icon, done, index }: { player: PlayerPublic | undefined; selfId: string | null; role: string; icon: string; done: boolean; index: number }) {
  const speaking = useVoice(player, selfId);
  return (
    <>
      {index === 1 && (
        <li className="cv-link text-gold" aria-hidden>
          <svg viewBox="0 0 28 12" className="h-3 w-7">
            <path d="M2 6h24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 4" />
          </svg>
        </li>
      )}
      <li
        className={`m-pop flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 text-sm transition-colors duration-300 ${done ? 'border-good/50 bg-good/10' : 'border-edge bg-surface'} ${speaking ? 'cv-speaking' : ''}`}
        style={{ animationDelay: `${index * 90}ms` }}
      >
        <span className="grid size-6 place-items-center rounded-full bg-page text-base" aria-hidden>
          {player ? avatarOf(player.avatar) : '?'}
        </span>
        <span className={`max-w-28 truncate ${player?.id === selfId ? 'font-semibold' : ''}`}>{player?.id === selfId ? 'Toi' : (player?.name ?? 'Parti')}</span>
        <span className="rounded-full bg-gold/25 px-1.5 text-xs font-medium whitespace-nowrap" title={role}>
          {icon}
          <span className="max-sm:sr-only"> {role}</span>
        </span>
        {done && (
          <span className="m-pop text-good" title="A fini">
            ✓
          </span>
        )}
      </li>
    </>
  );
}

/** Jauge de complicité : la moyenne des ressemblances, qui se remplit d'or. */
function Bond({ value }: { value: number }) {
  const shown = useCountUp(value, { duration: 700 });
  return (
    <span className="flex items-center gap-2 text-sm" title="Complicité moyenne">
      <span aria-hidden>🧠</span>
      <span className="relative h-2 w-20 overflow-hidden rounded-full bg-edge">
        <span className="cv-bond absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${value}%` }} />
      </span>
      <b className="tabular-nums">{shown} %</b>
    </span>
  );
}

/** Rôle du joueur : son calque (null s'il ne dessine pas) et ce qu'il voit du modèle. */
function roleOf(cv: CerveauState, selfId: string | null) {
  const index = cv.duo.indexOf(selfId ?? '');
  const layer = index < 0 || (cv.kind === 'guide' && index === 0) ? null : index;
  const half = cv.kind === 'moitie' && index >= 0 ? (index === 0 ? 'left' : 'right') : null;
  return { index, layer, half } as const;
}

/** Une manche : briefing, dessin, puis révélation. */
function Stage() {
  const cv = useGame((s) => s.room!.cerveau);
  const phase = useGame((s) => s.room!.phase);
  const selfId = useGame((s) => s.selfId);
  const [briefing, setBriefing] = useState(() => (cv ? serverNow() < cv.goAt : false));

  useEffect(() => {
    if (!cv || !briefing) return;
    const t = setTimeout(() => setBriefing(false), Math.max(0, cv.goAt - serverNow()));
    return () => clearTimeout(t);
  }, [cv?.goAt, briefing]);

  if (!cv) return null;
  const role = roleOf(cv, selfId);
  const reveal = phase === 'reveal';
  const partner = role.index >= 0 ? (cv.duo[1 - role.index] ?? null) : null;

  return (
    <div className="relative grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-3">
        {/* À la révélation, le modèle est déjà posé sur le dessin : sur mobile, on ne le répète pas. */}
        <div className={reveal ? 'max-lg:hidden' : ''}>
          <ModelCard cv={cv} role={role} partner={partner} reveal={reveal} />
        </div>
        {reveal && cv.score !== null && <Verdict cv={cv} />}
      </div>
      <div className={`min-w-0 ${reveal ? 'max-lg:order-first' : ''}`}>
        <Sheet cv={cv} role={role} reveal={reveal} briefing={briefing} />
      </div>
      <Presence>{briefing && !reveal ? <Brief key="brief" cv={cv} index={role.index} /> : null}</Presence>
    </div>
  );
}

/** « 3, 2, 1 » : le mode, ton rôle et ta consigne, avant de pouvoir dessiner. */
function Brief({ cv, index }: { cv: CerveauState; index: number }) {
  const info = KIND_INFO[cv.kind];
  const [left, setLeft] = useState(() => Math.max(1, Math.ceil((cv.goAt - serverNow()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(1, Math.ceil((cv.goAt - serverNow()) / 1000))), 200);
    return () => clearInterval(id);
  }, [cv.goAt]);
  return (
    <div className="m-veil absolute inset-0 z-10 grid place-items-center bg-page/80 p-4 backdrop-blur-[3px]">
      <div className="cv-brief m-card w-full max-w-md rounded-2xl border border-edge bg-surface p-6 text-center shadow-xl">
        <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">Dessin {cv.turn + 1} sur {cv.turns}</p>
        <h2 className="m-pop mt-1 flex items-center justify-center gap-2 text-3xl font-bold tracking-[-0.04em]">
          <span aria-hidden>{info.icon}</span>
          {info.name}
        </h2>
        {index >= 0 ? (
          <>
            <p className="m-rise mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-3 py-1 text-sm font-semibold" style={{ animationDelay: '120ms' }}>
              {info.icons[index]} Tu es {info.roles[index]!.toLowerCase()}
            </p>
            <p className="m-rise mt-2 text-muted" style={{ animationDelay: '180ms' }}>
              {info.tips[index]}
            </p>
          </>
        ) : (
          <p className="m-rise mt-3 text-muted" style={{ animationDelay: '120ms' }}>
            Tu regardes ce binôme dessiner. Chut, pas d'indice !
          </p>
        )}
        <span key={left} className="cv-count mt-4 block font-logo text-6xl font-bold text-accent" aria-live="polite">
          {left}
        </span>
      </div>
    </div>
  );
}

/** Le modèle, ou ce qu'on en voit : rien pour l'artiste guidé, une moitié en mode « moitié ». */
function ModelCard({ cv, role, partner, reveal }: { cv: CerveauState; role: ReturnType<typeof roleOf>; partner: string | null; reveal: boolean }) {
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const guide = players.find((p) => p.id === cv.duo[0]);
  const listening = useVoice(cv.kind === 'guide' ? guide : undefined, selfId);
  const partnerName = players.find((p) => p.id === partner)?.name ?? 'ton binôme';

  if (!cv.model) {
    // L'artiste guidé : une oreille qui s'allume quand le guide parle.
    return (
      <div className={`cv-ear relative grid place-items-center overflow-hidden rounded-xl border border-dashed border-edge bg-page p-3 text-center lg:aspect-[4/3] ${listening ? 'is-on' : ''}`}>
        <div className="flex items-center gap-3 text-left lg:block lg:text-center">
          <svg viewBox="0 0 64 64" className="size-11 shrink-0 lg:mx-auto lg:size-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden>
            <path d="M20 26a14 14 0 1 1 26 7c-3 5-8 7-8 13a7 7 0 0 1-12 4" />
            <path d="M28 27a5 5 0 1 1 9 3" />
            <path className="cv-ear-wave stroke-gold" d="M50 18a20 20 0 0 1 0 24" />
            <path className="cv-ear-wave cv-ear-wave-2 stroke-gold" d="M56 12a28 28 0 0 1 0 36" />
          </svg>
          <div>
          <p className="font-semibold lg:mt-2">Le modèle est caché</p>
          <p className="text-sm text-muted">{listening ? `${guide?.name ?? 'Ton guide'} te parle…` : `Écoute ${guide?.id === selfId ? 'toi-même' : (guide?.name ?? 'ton guide')}`}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <figure className="m-0 max-lg:mx-auto max-lg:w-full max-lg:max-w-xs">
      <div className="cv-model relative aspect-[4/3] overflow-hidden rounded-xl border border-edge bg-butter/40">
        <ModelArt model={cv.model} half={reveal ? null : role.half} />
        {!reveal && role.half && (
          <span className={`absolute top-2 rounded-full bg-surface/90 px-2 py-0.5 text-xs text-muted ${role.half === 'left' ? 'right-2' : 'left-2'}`}>
            Moitié de {partnerName}
          </span>
        )}
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">Modèle</span>
        <b className={cv.kind === 'guide' && !reveal && role.index === 0 ? 'cv-secret' : ''} title={cv.kind === 'guide' && !reveal ? 'Ne le dis pas !' : undefined}>
          {cv.model.name}
        </b>
      </figcaption>
      {cv.kind === 'guide' && role.index === 0 && !reveal && (
        <p className="m-rise mt-1 text-xs text-muted">Décris les formes, leur taille, leur place. Interdit de dire ce que c'est !</p>
      )}
    </figure>
  );
}

/** Les tracés du modèle qui se dessinent l'un après l'autre (masqués à moitié si besoin). */
function ModelArt({ model, half, overlay = false }: { model: CerveauModel; half: 'left' | 'right' | null; overlay?: boolean }) {
  const clip = `cv-clip-${half ?? 'all'}-${model.id}-${overlay ? 'o' : 'm'}`;
  return (
    <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className={`absolute inset-0 size-full ${overlay ? 'cv-overlay' : ''}`} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-label={overlay ? 'Le modèle posé sur le dessin' : 'Le modèle'}>
      {half && (
        <>
          <defs>
            <clipPath id={clip}>
              <rect x={half === 'left' ? 0 : CERVEAU_SPLIT} y="0" width={CERVEAU_SPLIT} height={CANVAS_H} />
            </clipPath>
            <pattern id={`${clip}-hatch`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M0 0v18" stroke="currentColor" strokeOpacity=".12" strokeWidth="6" />
            </pattern>
          </defs>
          <rect x={half === 'left' ? CERVEAU_SPLIT : 0} y="0" width={CERVEAU_SPLIT} height={CANVAS_H} fill={`url(#${clip}-hatch)`} />
          <path d={`M${CERVEAU_SPLIT} 0v${CANVAS_H}`} stroke="currentColor" strokeOpacity=".35" strokeWidth="4" strokeDasharray="10 12" />
        </>
      )}
      <g clipPath={half ? `url(#${clip})` : undefined} className={overlay ? 'stroke-gold' : 'stroke-cacao dark:stroke-butter'} strokeWidth={overlay ? 9 : 10}>
        {model.paths.map((p, i) => (
          <polyline key={i} className="cv-path" pathLength={1} points={p.join(' ')} style={{ animationDelay: `${(overlay ? 300 : 150) + i * 140}ms` }} />
        ))}
      </g>
    </svg>
  );
}

/** Le tableau commun : un calque par membre du binôme, et le modèle qui s'y pose à la révélation. */
function Sheet({ cv, role, reveal, briefing }: { cv: CerveauState; role: ReturnType<typeof roleOf>; reveal: boolean; briefing: boolean }) {
  const c0 = useRef<HTMLCanvasElement>(null);
  const c1 = useRef<HTMLCanvasElement>(null);
  const ghostCanvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLCanvasElement>(null);
  const [ghost] = useState(() => new BoardCanvas(true));
  const [pen] = useState(() => {
    const p = new Pen((buf) => net.sendBinary(buf), inkLayers[role.layer ?? 0]);
    p.ghost = ghost;
    p.color = role.layer === 1 ? 10 : 12; // un brun et un noir : on voit qui a tracé quoi
    if (cv.kind === 'lignes' && role.index === 0) p.trap = { kind: 'straight', color: 12 };
    return p;
  });
  const selfId = useGame((s) => s.selfId);
  const done = cv.done.includes(selfId ?? '');
  const canDraw = role.layer !== null && !reveal && !briefing && !done;

  useEffect(() => {
    inkLayers[0].attach(c0.current);
    inkLayers[1].attach(c1.current);
    ghost.attach(ghostCanvas.current);
    attachWipe(role.layer === null ? null : [c0, c1][role.layer]!.current, wipe.current);
    return () => {
      inkLayers[0].attach(null);
      inkLayers[1].attach(null);
      ghost.attach(null);
      attachWipe(null, null);
    };
  }, [ghost, role.layer]);

  useEffect(() => {
    if (!canDraw) pen.end();
  }, [canDraw, pen]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = ghostCanvas.current!.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * CANVAS_W;
    // Moitié chacun : le crayon s'arrête à la frontière.
    if (role.half === 'left') x = Math.min(x, CERVEAU_SPLIT);
    if (role.half === 'right') x = Math.max(x, CERVEAU_SPLIT);
    return [x, ((e.clientY - r.top) / r.height) * CANVAS_H] as const;
  };

  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div className={`cv-sheet relative w-full overflow-hidden rounded-xl border border-edge bg-white ${reveal ? 'is-reveal' : ''}`}>
        <canvas ref={c0} width={CANVAS_W} height={CANVAS_H} className="block aspect-[4/3] w-full" />
        <canvas ref={c1} width={CANVAS_W} height={CANVAS_H} className="pointer-events-none absolute inset-0 size-full" />
        {cv.kind === 'moitie' && !reveal && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <span className="cv-seam absolute inset-y-0 left-1/2 w-0 border-l-2 border-dashed border-cacao/30" />
            {role.half && <span className={`cv-off absolute inset-y-0 w-1/2 ${role.half === 'left' ? 'right-0' : 'left-0'}`} />}
          </div>
        )}
        {reveal && cv.model && <ModelArt model={cv.model} half={null} overlay />}
        <canvas
          ref={ghostCanvas}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`absolute inset-0 size-full touch-none ${canDraw ? 'cursor-crosshair' : ''}`}
          onPointerDown={(e) => {
            if (!canDraw || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pen.start(...toCanvas(e));
          }}
          onPointerMove={(e) => {
            if (!canDraw) return;
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            pen.move(events.flatMap((ev) => toCanvas(ev)));
          }}
          onPointerUp={() => pen.end()}
          onPointerCancel={() => pen.end()}
        />
        <canvas ref={wipe} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        {reveal && <Score cv={cv} />}
      </div>
      {role.index >= 0 && !reveal && <DuoControls cv={cv} pen={pen} canDraw={canDraw} drawer={role.layer !== null} done={done} />}
      {role.index < 0 && !reveal && <p className="text-sm text-muted">Tu regardes : le dessin se fait sous tes yeux.</p>}
    </div>
  );
}

/** La boîte à outils (pinceau seul, annuler, effacer) et « On a fini ! ». */
function DuoControls({ cv, pen, canDraw, drawer, done }: { cv: CerveauState; pen: Pen; canDraw: boolean; drawer: boolean; done: boolean }) {
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const partner = cv.duo.find((id) => id !== selfId);
  const partnerDone = partner ? cv.done.includes(partner) : false;
  const partnerName = players.find((p) => p.id === partner)?.name ?? 'ton binôme';
  return (
    <div className="flex w-full flex-col items-center gap-2">
      {drawer && (
        <div className={`transition-opacity duration-300 ${canDraw ? '' : 'pointer-events-none opacity-50'}`}>
          <Toolbar pen={pen} trap={pen.trap} tools={['pen']} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          className={done ? 'btn-ghost' : 'btn-primary px-6 py-2.5 text-base'}
          onClick={(e) => {
            bump(e.currentTarget);
            pen.end();
            net.send({ t: 'cerveau', done: !done });
          }}
        >
          {done ? 'Attends, on retouche' : 'On a fini !'}
        </button>
        <span className="text-sm text-muted" aria-live="polite">
          {partnerDone ? (
            <span key="ok" className="m-pop inline-block text-good">
              ✓ {partnerName} a fini
            </span>
          ) : done ? (
            <>
              On attend {partnerName}
              <span className="m-dots" aria-hidden>
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** Le pourcentage de ressemblance qui grimpe, posé sur le dessin. */
function Score({ cv }: { cv: CerveauState }) {
  const score = cv.score ?? 0;
  const shown = useCountUp(score, { from: 0, delay: 900, duration: 1100 });
  return (
    <div className="cv-score pointer-events-none absolute right-3 bottom-3 rounded-2xl bg-primary px-4 py-2 text-center text-on-primary shadow-lg">
      <span className="block text-[10px] uppercase tracking-[0.18em] opacity-75">Ressemblance</span>
      <b className="block font-logo text-4xl leading-none tabular-nums">{shown} %</b>
    </div>
  );
}

/** Le verdict, la jauge, et l'image gardée pour l'album. */
function Verdict({ cv }: { cv: CerveauState }) {
  const players = useGame((s) => s.room!.players);
  const endsAt = useGame((s) => s.room!.endsAt);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const burst = useRef<HTMLCanvasElement>(null);
  const score = cv.score ?? 0;
  const v = verdict(score);
  const last = cv.turn + 1 >= cv.turns;

  useEffect(() => {
    if (!cv.model) return;
    cerveauPages.add({ turn: cv.turn, kind: cv.kind, duo: cv.duo, model: cv.model, score, image: flatten() });
    if (score < 50) return;
    const t = setTimeout(() => confetti(burst.current, score >= 75 ? 120 : 60), 1900);
    return () => clearTimeout(t);
  }, [cv.turn]);

  const names = cv.duo.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(' & ');
  const ms = endsAt ? Math.max(0, endsAt - serverNow()) : 0;
  return (
    <div className="cv-verdict relative overflow-hidden rounded-xl border border-edge bg-surface p-4 text-center">
      <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{names}</p>
      <h3 className="cv-verdict-title mt-1 text-2xl font-bold tracking-[-0.03em]">{v.title}</h3>
      <p className="m-rise text-sm text-muted" style={{ animationDelay: '2s' }}>
        {v.line}
      </p>
      <span className="relative mt-3 block h-2.5 overflow-hidden rounded-full bg-edge">
        <span className="cv-fill absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${score}%` }} />
      </span>
      <div className="mt-3 flex items-center justify-center gap-2">
        {isHost ? (
          <button className="btn-primary" onClick={() => net.send({ t: 'cerveau', next: true })}>
            {last ? 'Voir l’album' : 'Dessin suivant'}
          </button>
        ) : (
          <span className="text-sm text-muted">{last ? 'L’album arrive…' : 'Dessin suivant dans un instant…'}</span>
        )}
      </div>
      <span key={endsAt} className="cv-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent/60" style={{ animationDuration: `${ms}ms` }} />
    </div>
  );
}

/** L'album : chaque dessin à deux, le modèle en filigrane doré au survol, et la complicité finale. */
function Album() {
  const cv = useGame((s) => s.room!.cerveau);
  const players = useGame((s) => s.room!.players);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const [pages] = useState<CerveauPage[]>(() => cerveauPages.all());
  const scores = cv?.scores ?? [];
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const shown = useCountUp(avg, { from: 0, delay: 300, duration: 1200 });
  const best = pages.reduce<CerveauPage | null>((b, p) => (!b || p.score > b.score ? p : b), null);
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const grid = useRef<HTMLUListElement>(null);

  return (
    <div className="flex flex-col items-center gap-5 p-4 sm:p-6">
      <div className="text-center">
        <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">Fin de partie</p>
        <h2 className="m-pop mt-1 text-3xl font-bold tracking-[-0.04em]">
          <span className="accroche mr-2 text-4xl text-accent">complicité</span>
          <span className="tabular-nums">{shown} %</span>
        </h2>
        <p className="m-rise mt-1 text-muted" style={{ animationDelay: '200ms' }}>
          {verdict(avg).line}
        </p>
      </div>
      {pages.length > 0 ? (
        <ul ref={grid} className="cv-album grid w-full grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-5">
          {pages.map((p, i) => (
            <li key={p.turn} className="cv-page" tabIndex={0} style={{ animationDelay: `${300 + i * 120}ms`, ['--tilt' as string]: `${((i * 37) % 7) - 3}deg` }}>
              <figure className="pola relative m-0 rounded-sm bg-white p-2 pb-3 text-cacao">
                <div className="relative overflow-hidden">
                  <img src={p.image} alt={`Dessin de ${name(p.duo[0])} et ${name(p.duo[1])}`} className="block aspect-[4/3] w-full" />
                  <span className="cv-page-model absolute inset-0">
                    <ModelArt model={p.model} half={null} overlay />
                  </span>
                  {best?.turn === p.turn && p.score > 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-cacao">★ Meilleur</span>}
                </div>
                <figcaption className="mt-2 flex items-center justify-between gap-2 px-0.5 text-sm">
                  <span className="min-w-0 truncate">
                    {KIND_INFO[p.kind].icon} {p.model.name}
                  </span>
                  <b className="shrink-0 tabular-nums">{p.score} %</b>
                </figcaption>
                <p className="truncate px-0.5 text-xs opacity-60">
                  {name(p.duo[0])} & {name(p.duo[1])}
                </p>
              </figure>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Les dessins de cette partie ont été faits avant ton arrivée.</p>
      )}
      {pages.length > 0 && <SaveAlbum pages={pages} name={name} avg={avg} grid={grid} delay={500 + pages.length * 120} />}
      {isHost ? (
        <button className="btn-primary px-6 py-2.5" onClick={() => net.send({ t: 'cerveau', next: true })}>
          Retour au salon
        </button>
      ) : (
        <p className="text-sm text-muted">L'hôte va vous ramener au salon.</p>
      )}
    </div>
  );
}

const SAVED_LABEL: Record<SaveResult, string> = {
  shared: 'Album partagé',
  saved: 'Album enregistré',
  sheet: 'Album prêt',
  cancelled: 'Enregistrer l’album',
};

/**
 * Enregistrer l'album en une image. Le PNG est fabriqué dès l'arrivée sur l'album pour que,
 * au téléphone, la feuille de partage (Photos sur iPhone, Galerie sur Android) s'ouvre au toucher.
 * Au moment de l'enregistrement, un flash d'appareil photo passe sur les tirages.
 */
function SaveAlbum({ pages, name, avg, grid, delay }: { pages: CerveauPage[]; name: (id: string) => string; avg: number; grid: RefObject<HTMLUListElement | null>; delay: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SaveResult | null>(null);
  const print = { pages, name, avg, icon: (k: CerveauPage['kind']) => KIND_INFO[k].icon };

  useEffect(() => {
    let live = true;
    albumFile(print).then((f) => live && setFile(f), () => {});
    return () => {
      live = false;
    };
  }, [pages, avg]);

  const flash = () => {
    const el = grid.current;
    if (!el) return;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  };

  const save = async (btn: HTMLButtonElement) => {
    bump(btn);
    setBusy(true);
    try {
      // Fichier déjà prêt : le partage part dans le même geste, condition de Safari.
      const result = await saveImageFile(file ?? (await albumFile(print)));
      if (result !== 'cancelled') flash();
      setDone(result);
    } catch {
      setDone(null);
    } finally {
      setBusy(false);
    }
  };

  const ok = done && done !== 'cancelled';
  return (
    <button
      type="button"
      className={`cv-save btn-ghost m-rise relative overflow-hidden px-5 py-2.5 ${!file ? 'is-developing' : ''} ${ok ? 'is-done' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      disabled={busy}
      onClick={(e) => void save(e.currentTarget)}
      aria-live="polite"
    >
      {ok ? (
        <svg key="ok" viewBox="0 0 24 24" className="cv-save-ok size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        <svg key="dl" viewBox="0 0 24 24" className="cv-save-icon size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      )}
      <span key={done ?? 'idle'} className="m-rise">
        {busy ? 'Préparation…' : done ? SAVED_LABEL[done] : 'Enregistrer l’album'}
      </span>
    </button>
  );
}
