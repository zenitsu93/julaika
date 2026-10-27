import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CAD_IDEAS,
  CAD_JOIN,
  CAD_NAME_MAX,
  CAD_PARTS,
  CANVAS_H,
  CANVAS_W,
  cadRandomName,
  cadWinner,
  type CadName,
  type CadPart,
  type Creature,
  type DrawPacket,
} from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { BoardCanvas, Pen, replay } from '../../lib/board';
import { net } from '../../lib/net';
import { play } from '../../lib/sounds';
import { useGame } from '../../lib/store';
import { attachWipe, bump, confetti, Presence, reducedMotion, shake, Ticker, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Toolbar } from '../Toolbar';
import { CadArt } from './CadArt';
import './cadavre.css';

const PART_LABEL = ['La tête', 'Le corps', 'Les jambes'] as const;
const PART_ICON = ['🙂', '👕', '🦵'] as const;

/** Plateau du Cadavre exquis : qui a fini, la feuille pliée, puis le dévoilement. Visio dessous. */
export function CadBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <CadBar />
      <div className="panel relative min-h-[30rem] overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,color-mix(in_oklab,var(--color-accent)_8%,transparent),transparent_70%)]">
        {phase === 'reveal' ? <Reveal /> : phase === 'draw' ? <Stage /> : <Teaser />}
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

/** Derrière les réglages : la feuille qui se plie et se déplie. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[30rem] place-items-center p-6 text-ink max-sm:hidden" aria-hidden>
      <CadArt className="w-80 opacity-60" />
    </div>
  );
}

/** Joueurs (une coche tombe sur ceux qui ont fini) et les trois morceaux de la créature. */
function CadBar() {
  const players = useGame((s) => s.room!.players);
  const cad = useGame((s) => s.room!.cadavre);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const done = new Set(cad?.done ?? []);
  const drawing = cad && cad.reveal === null;
  const ordered = [...players].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const finished = drawing && done.has(p.id);
          const playing = drawing && cad.players.includes(p.id);
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
              {finished ? (
                <span key="ok" className="m-pop" title="A fini">
                  ✓
                </span>
              ) : playing ? (
                <span className="m-wobble text-xs" title="En train de dessiner">
                  ✏️
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
      {cad && (
        <span className="flex items-center gap-1" aria-label={drawing ? `Morceau ${cad.step + 1} sur 3` : 'Dévoilement'}>
          {CAD_PARTS.map((part, i) => {
            const past = !drawing || i < cad.step;
            const now = drawing && i === cad.step;
            return (
              <span
                key={part}
                title={part}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-all duration-500 ${
                  now ? 'cad-pip-now bg-primary text-on-primary' : past ? 'bg-gold/25 text-ink' : 'bg-edge/60 text-muted'
                }`}
              >
                <span aria-hidden>{PART_ICON[i]}</span>
                <span className="max-sm:hidden">{part}</span>
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}

/** Le morceau à dessiner, ou l'attente pour qui arrive en cours de partie. */
function Stage() {
  const cad = useGame((s) => s.room!.cadavre);
  const selfId = useGame((s) => s.selfId);
  const prompt = useGame((s) => s.cadPrompt);
  if (!cad) return null;
  if (!cad.players.includes(selfId ?? ''))
    return (
      <Center>
        <p className="text-4xl">🍿</p>
        <p className="mt-2 text-lg font-semibold">Des créatures sont en préparation</p>
        <p className="text-muted">
          Tu joueras à la prochaine ; le dévoilement arrive bientôt
          <Dots />
        </p>
      </Center>
    );
  const above = prompt?.step === cad.step ? prompt.above : null;
  // Une clé par morceau : chaque étape arrive avec sa propre feuille, neuve.
  return <DrawPart key={cad.step} part={cad.step as CadPart} above={above} done={cad.done.includes(selfId!)} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="m-rise grid min-h-[30rem] place-items-center p-6 text-center">{<div>{children}</div>}</div>;
}

const Dots = () => (
  <span className="m-dots" aria-hidden>
    <span>.</span>
    <span>.</span>
    <span>.</span>
  </span>
);

/** Où les traits d'au-dessus touchent le bord : un point doré par raccord (en % de la largeur). */
function joinPoints(strokes: DrawPacket[]): number[] {
  const xs = new Set<number>();
  for (const s of strokes) {
    for (let i = 0; i < s.points.length; i += 2) {
      if (s.points[i + 1]! + s.size / 2 >= CANVAS_H - 2) xs.add(Math.round(s.points[i]! / 40));
    }
  }
  return [...xs].sort((a, b) => a - b).map((b) => ((b * 40) / CANVAS_W) * 100).filter((x) => x >= 0 && x <= 100);
}

/** Ta feuille : la bande du morceau d'au-dessus, puis ton dessin, que personne ne voit avant la fin. */
function DrawPart({ part, above, done }: { part: CadPart; above: { name: string; strokes: DrawPacket[] } | null; done: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLCanvasElement>(null);
  const [sheet] = useState(() => new BoardCanvas());
  const [pen] = useState(() => new Pen((buf) => net.sendBinary(buf), sheet));
  const [idea, setIdea] = useState<string | null>(null);
  const ideaEl = useRef<HTMLSpanElement>(null);
  const last = part === CAD_PARTS.length - 1;
  const others = useGame((s) => {
    const cad = s.room!.cadavre!;
    const present = new Set(s.room!.players.map((p) => p.id));
    return cad.players.filter((id) => present.has(id) && !cad.done.includes(id)).length;
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
    if (done) pen.end();
  }, [done, pen]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H] as const;
  };
  const dots = useMemo(() => (above ? joinPoints(above.strokes) : []), [above]);
  const rollIdea = () => {
    const ideas = CAD_IDEAS[part].filter((i) => i !== idea);
    setIdea(ideas[Math.floor(Math.random() * ideas.length)]!);
    bump(ideaEl.current, 1.08);
  };

  const line =
    part === 0
      ? 'Fais descendre le cou sous les pointillés : le suivant verra ce qui dépasse.'
      : last
        ? 'Raccorde-toi aux points dorés, puis donne-lui de quoi tenir debout.'
        : 'Raccorde-toi aux points dorés, et laisse dépasser sous les pointillés.';

  return (
    <div className="flex flex-col items-center gap-3 p-3 sm:p-4">
      <div className="text-center">
        <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">
          Morceau {part + 1}/3 · {above ? `sous le morceau de ${above.name}` : 'en secret'}
        </p>
        <h2 className="m-pop mt-0.5 text-2xl tracking-[-0.03em] sm:text-3xl" style={{ animationDelay: '60ms' }}>
          {PART_LABEL[part].split(' ').map((w, i) => (
            <span key={i} className="w-word" style={{ animationDelay: `${80 + i * 70}ms` }}>
              {w}&nbsp;
            </span>
          ))}
          <span className="m-wobble inline-block" aria-hidden>
            {PART_ICON[part]}
          </span>
        </h2>
        <p className="m-rise mt-1 text-sm text-muted" style={{ animationDelay: '120ms' }}>
          {line}
        </p>
      </div>

      <div className="relative w-full max-w-[max(20rem,calc((100dvh-27rem)*4/3))]">
        {above && <Peek name={above.name} strokes={above.strokes} part={part} />}
        <div className="relative">
        <div className={`relative overflow-hidden border border-edge bg-white ${above ? 'rounded-b-lg border-t-0' : 'rounded-lg'}`}>
          <canvas
            ref={canvas}
            width={CANVAS_W}
            height={CANVAS_H}
            aria-label={`Feuille de dessin : ${PART_LABEL[part].toLowerCase()}`}
            className={`block aspect-[4/3] w-full touch-none bg-white ${done ? '' : 'cursor-crosshair'}`}
            onPointerDown={(e) => {
              if (done || e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              pen.start(...toCanvas(e));
            }}
            onPointerMove={(e) => {
              if (done) return;
              const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
              pen.move(events.flatMap((ev) => toCanvas(ev)));
            }}
            onPointerUp={() => pen.end()}
            onPointerCancel={() => pen.end()}
          />
          <canvas ref={wipe} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
          {!last && (
            <div className="cad-fold-guide pointer-events-none absolute inset-x-0 bottom-0 flex items-start justify-end px-2 pt-0.5" style={{ height: `${(CAD_JOIN / CANVAS_H) * 100}%` }} aria-hidden>
              <span className="rounded bg-white/80 px-1.5 text-[10px] font-medium text-accent max-sm:hidden">visible par le suivant</span>
            </div>
          )}
          <Presence>
            {done ? (
              <div key="sent" className="m-veil absolute inset-0 grid place-items-center bg-page/70 backdrop-blur-[1px]">
                <div className="m-card text-center">
                  <Check />
                  <p className="mt-2 font-semibold">Morceau plié et passé !</p>
                  <p className="text-sm text-muted">
                    {others ? `Encore ${others} ${others > 1 ? 'artistes' : 'artiste'} au travail` : 'On déplie la suite'}
                    <Dots />
                  </p>
                  <button className="btn-ghost mt-3" onClick={() => net.send({ t: 'cadavre', edit: true })}>
                    Retoucher
                  </button>
                </div>
              </div>
            ) : null}
          </Presence>
        </div>
        {!done &&
          dots.map((x, i) => <span key={i} className="cad-dot" style={{ left: `${x}%`, animationDelay: `${i * 120}ms` }} aria-hidden />)}
        </div>
      </div>

      <Presence>
        {done ? null : (
          <div className="flex w-full flex-col items-center gap-2">
            <Toolbar pen={pen} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" className="btn text-muted hover:text-ink" onClick={rollIdea}>
                🎲 Une idée ?
              </button>
              {idea && (
                <span ref={ideaEl} key={idea} className="m-pop rounded-full bg-butter px-3 py-1 text-sm font-medium text-cacao">
                  {idea}
                </span>
              )}
              <button
                className="btn-primary px-6 py-2.5 text-base"
                onClick={(e) => {
                  bump(e.currentTarget);
                  pen.end();
                  net.send({ t: 'cadavre', done: true });
                }}
              >
                J'ai fini !
              </button>
            </div>
          </div>
        )}
      </Presence>
    </div>
  );
}

/** Le morceau d'au-dessus, plié : un volet rayé, et sous lui la seule bande qu'on a le droit de voir. */
function Peek({ name, strokes, part }: { name: string; strokes: DrawPacket[]; part: CadPart }) {
  const strip = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // Le morceau est rendu en entier hors de l'écran, puis on n'en recopie que le bas.
    const off = document.createElement('canvas');
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    const sheet = new BoardCanvas();
    sheet.attach(off);
    for (const s of strokes) sheet.apply(s);
    strip.current?.getContext('2d')?.drawImage(off, 0, CANVAS_H - CAD_JOIN, CANVAS_W, CAD_JOIN, 0, 0, CANVAS_W, CAD_JOIN);
  }, [strokes]);
  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 border-edge">
      <div className="cad-flap flex h-7 items-center justify-center gap-1.5 text-xs font-semibold">
        <span aria-hidden>🙈</span> {PART_LABEL[part - 1]} de {name}, pliée
      </div>
      <canvas ref={strip} width={CANVAS_W} height={CAD_JOIN} className="cad-peek block w-full bg-white" aria-label="Bande de jonction du morceau d'au-dessus" />
    </div>
  );
}

/** Coche qui se dessine. */
const Check = () => (
  <svg viewBox="0 0 48 48" className="tel-check mx-auto size-14" aria-hidden>
    <circle cx="24" cy="24" r="21" fill="var(--color-good)" opacity=".15" />
    <path pathLength={1} d="M14 25l7 7 13-15" fill="none" stroke="var(--color-good)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ---- Dévoilement --------------------------------------------------------------------

/** Durée du dépliage d'un morceau, et pause entre deux. */
const UNFOLD_STEP = 1100;

/** Un morceau rejoué trait par trait, après `delay` (ou affiché d'un coup). */
function PartCanvas({ strokes, delay = 0, ms = 1400, instant = false }: { strokes: DrawPacket[]; delay?: number; ms?: number; instant?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheet] = useState(() => new BoardCanvas());
  useEffect(() => {
    sheet.attach(canvas.current);
    const now = instant || reducedMotion();
    let stop = () => {};
    const t = setTimeout(() => (stop = replay(sheet, strokes, ms, now)), now ? 0 : delay);
    return () => {
      clearTimeout(t);
      stop();
      sheet.attach(null);
    };
  }, [sheet, strokes, delay, ms, instant]);
  return <canvas ref={canvas} width={CANVAS_W} height={CANVAS_H} className="block aspect-[4/3] w-full bg-white" />;
}

/** La créature : trois morceaux bord à bord, qui se déplient un à un (ou posés d'un coup). */
function Strip({ creature, unfold, credits = true }: { creature: Creature; unfold: boolean; credits?: boolean }) {
  return (
    <div className="cad-strip overflow-hidden rounded-lg border border-edge bg-white shadow-[0_24px_50px_-30px_rgb(40_20_10/0.6)]">
      {creature.pieces.map((p, i) => (
        <div key={i} className={`relative ${unfold ? 'cad-part' : ''}`} style={{ animationDelay: `${i * UNFOLD_STEP}ms` }}>
          <PartCanvas strokes={p.strokes} delay={i * UNFOLD_STEP + 500} instant={!unfold} />
          {credits && (
            <span
              className="cad-credit absolute left-1.5 top-1.5 z-[2] flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink shadow-sm ring-1 ring-edge"
              style={{ animationDelay: unfold ? `${i * UNFOLD_STEP + 700}ms` : '0ms' }}
            >
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              {CAD_PARTS[i]} · {p.name}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Une créature à la fois : elle se déplie, on propose des noms, on donne son cœur. */
function Reveal() {
  const creatures = useGame((s) => s.creatures);
  const cad = useGame((s) => s.room!.cadavre);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const hostName = useGame((s) => s.room!.players.find((p) => p.isHost)?.name ?? "l'hôte");
  const index = cad?.reveal ?? null;
  const [ready, setReady] = useState(false);
  const sparks = useRef<HTMLCanvasElement>(null);

  // Tout est déplié : ba-dum-tss, une poignée de confettis, et on peut la baptiser.
  useEffect(() => {
    setReady(false);
    if (index === null || !creatures || index >= creatures.length) return;
    let stop = () => {};
    const t = setTimeout(
      () => {
        setReady(true);
        play('badum');
        stop = confetti(sparks.current, 40);
      },
      reducedMotion() ? 0 : UNFOLD_STEP * 3 + 300,
    );
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [index, creatures]);

  const next = () => isHost && net.send({ t: 'cadavre', next: true });
  useEffect(() => {
    if (!isHost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [isHost]);

  if (!creatures || index === null || !cad) return <Center>On déplie les feuilles<Dots /></Center>;
  if (index >= creatures.length) return <Bestiary creatures={creatures} titles={cad.titles} isHost={isHost} hostName={hostName} />;

  const creature = creatures[index]!;
  const winner = cadWinner(cad.names);
  const lastOne = index === creatures.length - 1;
  const baptized = index > 0 ? cad.titles[index - 1] : null;

  return (
    <div className="relative flex min-h-[30rem] flex-col">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Créature {index + 1}/{creatures.length}
          </p>
          <h2 key={String(ready)} className="m-rise truncate text-lg">
            {ready ? 'La voilà entière !' : 'Dépliez la feuille…'}
          </h2>
        </div>
        {baptized && (
          <span key={index} className="w-stamp shrink-0 rounded-full bg-butter px-3 py-1 text-sm text-cacao" role="status">
            Baptisée <b>{baptized}</b> ✨
          </span>
        )}
      </header>
      <div className="grid flex-1 items-start gap-5 p-4 md:grid-cols-[auto_1fr]">
        <div className="mx-auto flex w-[min(100%,15rem,calc((100dvh-17rem)/2.25))] flex-col items-center gap-3 md:w-[max(11rem,min(17rem,calc((100dvh-22rem)/2.25)))]">
          <div className="w-full">
            <Strip key={index} creature={creature} unfold />
          </div>
          <Nameplate text={ready ? (winner?.text ?? null) : null} />
        </div>
        {ready ? <Naming key={index} names={cad.names} /> : <Suspense />}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-edge px-4 py-3">
        <span className="text-sm text-muted max-sm:hidden">{winner ? `${winner.hearts.length} ♥ pour « ${winner.text} »` : 'Aucun nom pour l’instant'}</span>
        {isHost ? (
          <button className="btn-primary px-5" onClick={(e) => (bump(e.currentTarget), next())}>
            {lastOne ? 'Baptiser · le bestiaire →' : 'Baptiser · la suivante →'}
            <kbd className="kbd border-on-primary/30 text-on-primary/70 max-sm:hidden">→</kbd>
          </button>
        ) : (
          <span className="text-sm text-muted">
            {hostName} passe à la suite
            <Dots />
          </span>
        )}
      </footer>
    </div>
  );
}

/** Pendant le dépliage : trois points qui attendent leur tour. */
function Suspense() {
  return (
    <div className="m-rise grid place-items-center self-center py-8 text-center">
      <p className="text-lg font-semibold">
        Qui a dessiné quoi
        <Dots />
      </p>
      <p className="text-sm text-muted">Le nom se décide juste après.</p>
    </div>
  );
}

/** Le nom en tête, en lettres de script, qui se recompose quand le classement change. */
function Nameplate({ text }: { text: string | null }) {
  return (
    <p className="min-h-12 text-center font-script text-4xl leading-tight text-accent" aria-live="polite">
      {text ? (
        <span key={text}>
          {[...text].map((c, i) => (
            <span key={i} className="cad-letter" style={{ animationDelay: `${i * 35}ms` }}>
              {c}
            </span>
          ))}
        </span>
      ) : (
        <span className="font-sans text-base text-muted">Comment s'appelle-t-elle ?</span>
      )}
    </p>
  );
}

/** Proposer un nom (un par joueur) et donner son cœur à celui d'un autre. */
function Naming({ names }: { names: CadName[] }) {
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.room!.players);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const mine = names.find((n) => n.by === selfId);
  const winner = cadWinner(names);
  // Les plus aimés remontent, la liste glisse.
  const sorted = names.map((n, i) => ({ n, i })).sort((a, b) => b.n.hearts.length - a.n.hearts.length || a.i - b.i);
  useFlip(list, [sorted.map((s) => s.n.by).join()]);

  useEffect(() => field.current?.focus({ preventScroll: true }), []);

  return (
    <div className="m-rise flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-xl font-bold tracking-[-0.02em]">Baptisez la créature</h3>
        <p className="text-sm text-muted">Un nom chacun, puis un cœur pour votre préféré : le plus aimé l'emporte.</p>
      </div>
      <form
        ref={form}
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return shake(field.current);
          bump(form.current, 1.02);
          net.send({ t: 'cadavre', name: text });
          setText('');
        }}
      >
        <input
          ref={field}
          className="input"
          maxLength={CAD_NAME_MAX}
          placeholder={mine ? `Remplacer « ${mine.text} »` : 'Gérard le poulpe…'}
          enterKeyHint="send"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="btn shrink-0 text-lg"
          title="Un nom au hasard"
          aria-label="Un nom au hasard"
          onClick={(e) => {
            bump(e.currentTarget);
            setText(cadRandomName());
            field.current?.focus();
          }}
        >
          🎲
        </button>
        <button className="btn-primary shrink-0">Proposer</button>
      </form>
      <ul ref={list} className="flex flex-col gap-2">
        {sorted.map(({ n }) => {
          const author = players.find((p) => p.id === n.by);
          const own = n.by === selfId;
          const lead = n === winner && n.hearts.length > 0;
          return (
            <li
              key={n.by}
              data-flip={n.by}
              className={`m-pop flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors duration-300 ${lead ? 'border-gold bg-gold/10' : own ? 'border-edge bg-butter/30' : 'border-edge bg-surface'}`}
            >
              <span aria-hidden className="text-lg">
                {lead ? '👑' : author ? avatarOf(author.avatar) : '🙂'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{n.text}</span>
                <span className="block text-xs text-muted">{own ? 'Ta proposition' : `par ${author?.name ?? '?'}`}</span>
              </span>
              <Heart name={n} own={own} selfId={selfId} />
            </li>
          );
        })}
        {!names.length && <li className="rounded-xl border border-dashed border-edge px-3 py-4 text-center text-sm text-muted">Aucune proposition pour l'instant : lance-toi !</li>}
      </ul>
    </div>
  );
}

/** Bouton cœur : il bat quand on le donne, et deux petits cœurs s'envolent. */
function Heart({ name, own, selfId }: { name: CadName; own: boolean; selfId: string | null }) {
  const on = !!selfId && name.hearts.includes(selfId);
  const [burst, setBurst] = useState(0);
  return (
    <button
      type="button"
      disabled={own}
      aria-pressed={on}
      aria-label={own ? 'Ton nom' : on ? 'Retirer mon cœur' : 'Donner mon cœur'}
      title={own ? 'Pas de cœur pour soi !' : on ? 'Retirer mon cœur' : 'Donner mon cœur'}
      onClick={() => {
        if (!on) setBurst((b) => b + 1);
        net.send({ t: 'cadavre', heart: name.by });
      }}
      className={`relative flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors duration-200 disabled:cursor-default ${
        on ? 'cad-heart-on border-bad/40 bg-bad/10 text-bad' : 'border-edge text-muted enabled:hover:text-bad'
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path d="M12 21s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.1-8 11-8 11z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <Ticker value={name.hearts.length} />
      {burst > 0 &&
        [-14, 12].map((dx) => (
          <span key={`${burst}${dx}`} className="cad-fly text-xs text-bad" style={{ '--dx': `${dx}px` } as CSSProperties} aria-hidden>
            ♥
          </span>
        ))}
    </button>
  );
}

/** Inclinaison d'une carte du bestiaire : stable pour une créature, variée d'une à l'autre. */
const tiltOf = (i: number) => (((i * 7) % 5) - 2) * 1.6;

/** Toutes les créatures baptisées, posées sur la table. */
function Bestiary({ creatures, titles, isHost, hostName }: { creatures: Creature[]; titles: (string | null)[]; isHost: boolean; hostName: string }) {
  const sparks = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    play('bravo');
    return confetti(sparks.current, 90);
  }, []);
  return (
    <div className="relative flex min-h-[30rem] flex-col">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <header className="border-b border-edge px-4 py-3 text-center">
        <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">Fin de partie</p>
        <h2 className="m-pop text-2xl tracking-[-0.03em]">Le bestiaire</h2>
      </header>
      <ul className="flex flex-1 flex-wrap content-start justify-center gap-x-5 gap-y-6 p-5">
        {creatures.map((c, i) => (
          <li key={c.owner} className="cad-card w-[calc(50%-0.75rem)] max-w-44 rounded-lg bg-white p-2 pb-3" style={{ '--tilt': `${tiltOf(i)}deg`, animationDelay: `${i * 140}ms` } as CSSProperties}>
            <Strip creature={c} unfold={false} credits={false} />
            <p className="mt-2 text-center font-script text-3xl leading-[1.05] break-words text-cacao">{titles[i] ?? '?'}</p>
            <p className="flex justify-center gap-0.5 text-sm" title={c.pieces.map((p) => p.name).join(', ')}>
              {c.pieces.map((p, j) => (
                <span key={j} aria-hidden>
                  {avatarOf(p.avatar)}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <footer className="flex items-center justify-end gap-3 border-t border-edge px-4 py-3">
        {isHost ? (
          <button className="btn-primary px-5" onClick={(e) => (bump(e.currentTarget), net.send({ t: 'cadavre', next: true }))}>
            Terminer
          </button>
        ) : (
          <span className="text-sm text-muted">
            {hostName} referme le carnet
            <Dots />
          </span>
        )}
      </footer>
    </div>
  );
}
