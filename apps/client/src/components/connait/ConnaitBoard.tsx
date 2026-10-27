import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { connaitVerdict, type ConnaitRound, type ConnaitState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, shake, Ticker, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import './connait.css';

const LETTERS = ['A', 'B', 'C', 'D'];
/** Temps de suspense avant que les cartes se retournent (ms). */
const DRUM_MS = 1100;

const pick = (index: number) => net.send({ t: 'connait', pick: index });

/** Plateau de Qui me connaît le mieux : les joueurs, la question sur la vedette, puis la révélation. */
export function ConnaitBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <StarBar />
      <div className="panel relative min-h-[26rem] overflow-hidden">
        {phase === 'lobby' ? (
          <Teaser />
        ) : phase === 'gameEnd' ? (
          <div className="m-fade mx-auto w-full max-w-lg px-4 py-8 text-center">
            <Finale />
          </div>
        ) : (
          <Stage />
        )}
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
  const mobile = 'max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none';
  return (
    <div className={`m-veil absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] ${mobile}`}>
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Derrière les réglages : la carte qui se retourne, pour donner l'idée du jeu. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[26rem] place-items-center p-6 opacity-40 max-sm:hidden" aria-hidden>
      <div className="flex gap-3">
        {LETTERS.map((l, i) => (
          <span key={l} className="k-flip grid size-16 place-items-center rounded-xl border border-edge bg-surface font-mono text-xl font-bold" style={{ animationDelay: `${i * 140}ms` }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Joueurs : la vedette passe en tête, une coche tombe sur ceux qui ont répondu. */
function StarBar() {
  const players = useGame((s) => s.room!.players);
  const k = useGame((s) => s.room!.connait);
  const phase = useGame((s) => s.room!.phase);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const answered = new Set(phase === 'answer' ? (k?.answered ?? []) : []);
  const ordered = [...players].sort((a, b) => Number(b.id === k?.starId) - Number(a.id === k?.starId));
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const star = p.id === k?.starId && phase !== 'lobby' && phase !== 'gameEnd';
          const done = answered.has(p.id);
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${
                star ? 'border-ink bg-ink text-page' : done ? 'border-good/50 bg-good/10' : 'border-edge bg-surface'
              }`}
            >
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              {phase !== 'lobby' && (
                <span className="font-mono text-xs tabular-nums opacity-70">
                  <Ticker value={p.score} />
                </span>
              )}
              {star && <span className="m-pop rounded-full bg-accent px-1.5 text-[11px] font-semibold text-[#18181b]">vedette</span>}
              {done && !star && (
                <span key="ok" className="m-pop text-good" title="A répondu">
                  ✓
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {k && <Progress k={k} />}
    </div>
  );
}

/** Une pastille par question : pleine selon la part de bons paris, la question en cours respire. */
function Progress({ k }: { k: ConnaitState }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Question ${k.turn} sur ${k.turns}`}>
      {Array.from({ length: k.turns }, (_, i) => {
        const done = k.history[i];
        const current = !done && i === k.turn - 1;
        const ratio = done && done.total ? done.right / done.total : 0;
        return (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${done ? `m-pop ${ratio >= 0.5 ? 'bg-accent' : ratio > 0 ? 'bg-accent/50' : 'bg-bad/30'}` : current ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`}
          />
        );
      })}
    </span>
  );
}

/** La question en cours, puis la révélation. */
function Stage() {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const k = room.connait;
  const phase = room.phase;
  const star = room.players.find((p) => p.id === k?.starId);
  const isStar = k?.starId === selfId;
  const reveal = phase === 'reveal' && k?.reveal ? k.reveal : null;

  // Suspense : un battement de cœur, puis les cartes se retournent ensemble.
  const [drum, setDrum] = useState(false);
  useLayoutEffect(() => {
    if (!reveal || reducedMotion()) return setDrum(false);
    setDrum(true);
    const t = setTimeout(() => setDrum(false), DRUM_MS);
    return () => clearTimeout(t);
  }, [Boolean(reveal), k?.turn]);
  const shown = drum ? null : reveal;

  // Ton résultat : confettis si tu marques, petite secousse si ton pari tombe à côté.
  const box = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!shown || !selfId) return;
    if (shown.gains[selfId]) return confetti(sparks.current, 90);
    const mine = shown.picks[selfId];
    if (!isStar && mine !== undefined && shown.answer !== null) shake(box.current);
  }, [Boolean(shown), k?.turn]);

  // Touches 1 à 4 (ou A à D) pour répondre sans la souris.
  useEffect(() => {
    if (phase !== 'answer') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (i >= 0 && e.key.length === 1) pick(i);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [phase]);

  if (!k || !k.question || !star) return null;

  return (
    <div ref={box} className="relative flex min-h-[26rem] flex-col items-center gap-5 px-4 pb-6 pt-6 sm:px-8">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      {phase === 'answer' && <TimeBar endsAt={room.endsAt} turnKey={`${k.turn}-${k.question.topic}`} />}
      <Spotlight star={star} isStar={isStar} topic={k.question.topic} turn={k.turn} />

      <div className="grid w-full max-w-2xl gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Réponses">
        {k.question.options.map((option, i) => (
          <Option key={`${k.turn}-${k.question!.topic}-${i}`} index={i} text={option} k={k} star={star} selfId={selfId} reveal={shown} drum={drum} />
        ))}
      </div>

      {drum ? (
        <p className="flex items-center gap-2 text-lg font-semibold" role="status">
          <span className="k-drum inline-block text-2xl text-accent" aria-hidden>
            ♥
          </span>
          Révélation…
        </p>
      ) : shown ? (
        <Outcome k={k} star={star} isStar={isStar} selfId={selfId} />
      ) : (
        <Footer k={k} isStar={isStar} total={room.players.length} />
      )}
    </div>
  );
}

/** Une fine barre qui se vide sur le temps restant. */
function TimeBar({ endsAt, turnKey }: { endsAt: number | null; turnKey: string }) {
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - serverNow());
  return (
    <span className="absolute inset-x-0 top-0 h-1 bg-edge/60" aria-hidden>
      <span key={turnKey + endsAt} className="k-deplete block h-full bg-accent" style={{ animationDuration: `${left}ms` }} />
    </span>
  );
}

/** La vedette sous le projecteur, et le sujet de la question qui tombe mot à mot. */
function Spotlight({ star, isStar, topic, turn }: { star: PlayerPublic; isStar: boolean; topic: string; turn: number }) {
  return (
    <div key={turn} className="flex flex-col items-center gap-2 text-center">
      <span className="m-pop relative grid size-20 place-items-center rounded-full p-[3px]">
        <span className="k-spot absolute inset-0 rounded-full" aria-hidden />
        <span className="relative grid size-full place-items-center rounded-full bg-surface text-4xl ring-1 ring-edge">{avatarOf(star.avatar)}</span>
      </span>
      <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted" style={{ animationDelay: '80ms' }}>
        {isStar ? 'À propos de toi' : `À propos de ${star.name}`}
      </p>
      <h2 key={topic} className="max-w-xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
        {topic.split(' ').map((w, i) => (
          <span key={i} className="w-word" style={{ animationDelay: `${120 + i * 60}ms` }}>
            {w}&nbsp;
          </span>
        ))}
      </h2>
    </div>
  );
}

/** Lumière qui suit le pointeur sur la carte. */
function glow(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--kx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--ky', `${e.clientY - r.top}px`);
}

function Option({
  index,
  text,
  k,
  star,
  selfId,
  reveal,
  drum,
}: {
  index: number;
  text: string;
  k: ConnaitState;
  star: PlayerPublic;
  selfId: string | null;
  reveal: ConnaitState['reveal'];
  drum: boolean;
}) {
  const players = useGame((s) => s.room!.players);
  const chosen = k.mine === index;
  const btn = useRef<HTMLButtonElement>(null);
  const right = reveal && reveal.answer === index;
  const bettors = reveal ? players.filter((p) => p.id !== star.id && reveal.picks[p.id] === index) : [];

  const tone = reveal
    ? right
      ? 'k-win border-accent bg-accent text-[#18181b]'
      : 'border-edge bg-surface opacity-55'
    : chosen
      ? 'k-beam border-accent bg-accent/10'
      : 'border-edge bg-surface enabled:hover:-translate-y-0.5 enabled:hover:border-ink/40';

  return (
    <div className="flex flex-col gap-1.5">
      <button
        ref={btn}
        type="button"
        role="radio"
        aria-checked={chosen}
        disabled={Boolean(reveal) || drum}
        onPointerMove={glow}
        onClick={() => {
          bump(btn.current, 1.03);
          pick(index);
        }}
        className={`k-option m-rise relative flex min-h-16 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-[transform,border-color,background-color,opacity] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-default ${tone} ${
          reveal ? 'k-flip' : drum ? 'm-shimmer' : ''
        }`}
        style={{ animationDelay: reveal ? `${index * 90}ms` : `${200 + index * 60}ms` }}
      >
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold transition-colors ${
            right ? 'bg-[#18181b] text-accent' : chosen && !reveal ? 'bg-accent text-[#18181b]' : 'bg-edge/60 text-muted'
          }`}
        >
          {LETTERS[index]}
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{text}</span>
        {right ? (
          <span className="m-pop shrink-0 rounded-full bg-[#18181b] px-2 py-0.5 text-[11px] font-semibold text-accent" style={{ animationDelay: '500ms' }}>
            {star.id === selfId ? 'ta réponse' : `réponse de ${star.name}`}
          </span>
        ) : chosen && !reveal ? (
          <span className="m-pop shrink-0 text-accent" aria-hidden>
            ✓
          </span>
        ) : null}
      </button>
      {/* Les paris de chacun tombent sous la carte qu'ils ont choisie. */}
      {bettors.length > 0 && (
      <span className="flex flex-wrap gap-1 px-1" aria-label={bettors.length ? `Parié par ${bettors.map((p) => p.name).join(', ')}` : undefined}>
        {bettors.map((p, j) => (
          <span
            key={p.id}
            title={p.name}
            className={`m-drop grid size-7 place-items-center rounded-full border text-base ${right ? 'border-accent bg-accent/15' : 'border-edge bg-surface'} ${p.id === selfId ? 'ring-2 ring-ink' : ''}`}
            style={{ animationDelay: `${450 + index * 90 + j * 70}ms` }}
          >
            {avatarOf(p.avatar)}
          </span>
        ))}
      </span>
      )}
    </div>
  );
}

/** Pendant la question : la consigne, qui a déjà répondu, et le joker de la vedette. */
function Footer({ k, isStar, total }: { k: ConnaitState; isStar: boolean; total: number }) {
  const players = useGame((s) => s.room!.players);
  const star = players.find((p) => p.id === k.starId);
  const done = players.filter((p) => k.answered.includes(p.id));
  return (
    <div className="m-rise flex flex-col items-center gap-2 text-center" style={{ animationDelay: '420ms' }}>
      <p className="text-sm text-muted">
        {isStar ? (
          <>
            <b className="text-ink">Réponds sincèrement</b> : les autres parient sur ta réponse.
          </>
        ) : (
          <>
            Que va répondre <b className="text-ink">{star?.name}</b> ? Parie sur sa réponse.
          </>
        )}
        <span className="max-sm:hidden"> Touches 1 à 4.</span>
      </p>
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="flex -space-x-1.5">
          {done.map((p) => (
            <span key={p.id} title={p.name} className="m-pop grid size-6 place-items-center rounded-full border-2 border-surface bg-edge text-xs">
              {avatarOf(p.avatar)}
            </span>
          ))}
        </span>
        <span className="tabular-nums">
          <Ticker value={done.length} />/{total} ont choisi
        </span>
      </div>
      {k.canReroll && (
        <button
          type="button"
          className="btn mx-auto text-muted hover:text-ink"
          onClick={(e) => {
            bump(e.currentTarget);
            net.send({ t: 'connait', reroll: true });
          }}
        >
          ↻ Autre question
        </button>
      )}
    </div>
  );
}

/** Après la révélation : ton résultat, tamponné. */
function Outcome({ k, star, isStar, selfId }: { k: ConnaitState; star: PlayerPublic; isStar: boolean; selfId: string | null }) {
  const r = k.reveal!;
  const round = k.history.at(-1);
  const gain = selfId ? (r.gains[selfId] ?? 0) : 0;
  const mine = selfId ? r.picks[selfId] : undefined;
  let line: string;
  if (r.answer === null) line = isStar ? "Tu n'as pas répondu à temps…" : `${star.name} n'a pas répondu à temps.`;
  else if (isStar) line = round?.right ? `${round.right} sur ${round.total} te connaissent bien !` : 'Personne ne t’a deviné… quel mystère !';
  else if (gain) line = 'Bien vu, tu le savais !';
  else if (mine === undefined) line = "Tu n'as pas parié.";
  else line = `Raté ! C'était « ${k.question!.options[r.answer]} ».`;

  return (
    <div className="flex min-h-14 justify-center">
      <span className="w-stamp flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-lg ring-1 ring-edge" style={{ animationDelay: '600ms' }} role="status">
        <span className={`grid h-8 min-w-8 place-items-center rounded-full px-1.5 font-mono text-sm font-bold ${gain ? 'bg-accent text-[#18181b]' : 'bg-edge/60 text-muted'}`}>+{gain}</span>
        <span className="font-semibold">{line}</span>
      </span>
    </div>
  );
}

/** Fin de partie : le titre du groupe, le classement, et le rappel de chaque question. */
function Finale() {
  const k = useGame((s) => s.room!.connait);
  const players = useGame((s) => s.room!.players);
  const canvas = useRef<HTMLCanvasElement>(null);
  const right = k?.history.reduce((n, r) => n + r.right, 0) ?? 0;
  const total = k?.history.reduce((n, r) => n + r.total, 0) ?? 0;
  const percent = useCountUp(total ? Math.round((100 * right) / total) : 0, { from: 0, delay: 300, duration: 900 });
  const verdict = connaitVerdict(right, total);
  const ranking = [...players].sort((a, b) => b.score - a.score);
  useEffect(() => {
    if (!total || right / total < 0.4) return;
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 900);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  if (!k) return null;

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-20 size-full" aria-hidden />
      <p className="text-sm text-muted">Vous vous connaissez à</p>
      <p className="font-mono text-5xl font-bold tabular-nums">
        {percent}
        <span className="text-xl text-muted"> %</span>
      </p>
      <h2 className="m-pop mt-1 text-3xl font-semibold tracking-[-0.03em]" style={{ animationDelay: '120ms' }}>
        {verdict.title}
      </h2>
      <p className="m-rise mb-4 text-muted" style={{ animationDelay: '200ms' }}>
        {verdict.line}
      </p>
      <ol className="panel mx-auto mb-3 max-w-sm divide-y divide-edge text-left text-sm">
        {ranking.map((p, i) => (
          <li key={p.id} className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${300 + i * 70}ms` }}>
            <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
            <span aria-hidden>{avatarOf(p.avatar)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            {i === 0 && p.score > 0 && <span title="Celui ou celle qui connaît le mieux les autres">👑</span>}
            <Score value={p.score} delay={400 + i * 70} />
          </li>
        ))}
      </ol>
      <ul className="panel mx-auto max-w-sm divide-y divide-edge text-left text-sm">
        {k.history.map((r, i) => (
          <RoundLine key={i} round={r} index={i} />
        ))}
      </ul>
    </>
  );
}

function Score({ value, delay }: { value: number; delay: number }) {
  const shown = useCountUp(value, { from: 0, delay, duration: 700 });
  return <span className="font-mono tabular-nums">{shown}</span>;
}

function RoundLine({ round, index }: { round: ConnaitRound; index: number }) {
  const full = round.total > 0 && round.right === round.total;
  return (
    <li className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${500 + index * 60}ms` }}>
      <span aria-hidden>{avatarOf(round.avatar)}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{round.topic}</b>
        <span className="block truncate text-xs text-muted">
          {round.name} : {round.answer ? `« ${round.answer} »` : 'pas de réponse'}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${full ? 'bg-accent text-[#18181b]' : round.right ? 'bg-accent/25' : 'bg-edge/60 text-muted'}`}>
        {round.right}/{round.total}
      </span>
    </li>
  );
}
