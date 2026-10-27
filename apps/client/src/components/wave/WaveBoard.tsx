import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BEST_POINTS, DIAL_MAX, waveBoom, waveGap, waveVerdict, type WaveRound, type WaveState } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { store, useGame } from '../../lib/store';
import { bump, confetti, Presence, shake, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { BOOM_AT, Dial } from './Dial';

const POINT_COLOR: Record<number, string> = { 0: 'bg-bad/25', 2: 'bg-[#3b82f6]', 3: 'bg-[#f97316]', 4: 'bg-accent' };
const POINT_LINE: Record<number, string> = {
  4: 'En plein dans le mille !',
  3: 'Tout près !',
  2: 'Pas loin.',
  0: 'Raté… mais quelle idée !',
};

// L'aiguille part tout de suite chez soi, et au plus 30 fois par seconde vers les autres.
let pending: number | null = null;
let throttle: ReturnType<typeof setTimeout> | null = null;
function moveDial(v: number) {
  store.set({ dial: v });
  if (throttle) {
    pending = v;
    return;
  }
  net.send({ t: 'wave', dial: v });
  throttle = setTimeout(() => {
    throttle = null;
    if (pending !== null) {
      const next = pending;
      pending = null;
      moveDial(next);
    }
  }, 33);
}

/** Plateau de Wavelength : l'équipe, le cadran, et la visio en pellicule dessous. */
export function WaveBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <TeamBar />
      <div className="panel relative overflow-hidden">
        <Stage />
        <Presence>
          {phase === 'lobby' ? (
            <Veil key="lobby" flow>
              <Lobby />
            </Veil>
          ) : phase === 'gameEnd' ? (
            <Veil key="end">
              <Finale />
            </Veil>
          ) : null}
        </Presence>
      </div>
      <CallBar />
    </section>
  );
}

function Veil({ children, flow = false }: { children: ReactNode; flow?: boolean }) {
  const mobile = flow ? 'max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none' : '';
  return (
    <div className={`m-veil absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] ${mobile}`}>
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Score d'équipe, progression des cartes et qui est télépathe. */
function TeamBar() {
  const players = useGame((s) => s.room!.players);
  const wave = useGame((s) => s.room!.wave);
  const selfId = useGame((s) => s.selfId);
  const score = useCountUp(wave?.score ?? 0, { duration: 700 });
  const badge = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, [wave?.psychicId ?? '']);
  useEffect(() => {
    if (wave?.score) bump(badge.current, 1.15);
  }, [wave?.score]);

  // Le télépathe passe en tête de la rangée.
  const ordered = [...players].sort((a, b) => Number(b.id === wave?.psychicId) - Number(a.id === wave?.psychicId));

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Équipe">
        {ordered.map((p) => {
          const psychic = p.id === wave?.psychicId;
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${psychic ? 'border-ink bg-ink text-page' : 'border-edge bg-surface'}`}
            >
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              {psychic && (
                <span className="m-pop rounded-full bg-accent px-1.5 text-[11px] font-semibold text-[#18181b]" title="Télépathe : voit la cible">
                  télépathe
                </span>
              )}
              {p.isHost && !psychic && (
                <span title="Hôte" className="text-xs">
                  👑
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {wave && (
        <div className="flex items-center gap-3">
          <Progress wave={wave} />
          <span ref={badge} className="inline-flex items-baseline gap-1 rounded-full bg-primary px-3 py-1 text-on-primary">
            <span className="font-mono text-base font-bold tabular-nums">{score}</span>
            <span className="text-xs opacity-75">points de complicité</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Une pastille par carte : couleur des points obtenus, la carte en cours bat doucement. */
function Progress({ wave }: { wave: WaveState }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Carte ${wave.turn} sur ${wave.turns}`}>
      {Array.from({ length: wave.turns }, (_, i) => {
        const done = wave.history[i];
        const current = !done && i === wave.turn - 1;
        return (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${done ? `m-pop ${POINT_COLOR[done.points]}` : current ? 'm-breathe bg-ink' : 'bg-edge'} ${current ? 'scale-125' : ''}`}
          />
        );
      })}
    </span>
  );
}

/** Cadran et consignes selon la phase et ton rôle. */
function Stage() {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const dial = useGame((s) => s.dial);
  const wave = room.wave;
  const psychic = wave?.psychicId === selfId;
  const psychicName = room.players.find((p) => p.id === wave?.psychicId)?.name ?? '…';
  const phase = room.phase;
  const movable = phase === 'guess' && !psychic;
  const lock = () => movable && net.send({ t: 'wave', lock: true });
  const revealed = phase === 'reveal' && wave?.target != null && wave.points != null;
  const boom = revealed && waveBoom(wave.target!, wave.dial);

  const box = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  // Révélation : confettis en plein dans le mille, petite secousse si c'est raté, et le cadran
  // explose (le plateau tremble, le téléphone vibre) quand on est à plus de 25 % de la cible.
  useEffect(() => {
    if (phase !== 'reveal' || wave?.points === null || wave?.points === undefined) return;
    let stop = () => {};
    const t = setTimeout(() => {
      if (wave.points === BEST_POINTS) stop = confetti(sparks.current, 110);
      else if (boom) navigator.vibrate?.([90, 40, 180]);
      else if (wave.points === 0) shake(box.current);
    }, boom ? BOOM_AT : 900);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [phase, wave?.turn]);

  return (
    <div ref={box} className={`relative flex min-h-[24rem] flex-col items-center gap-4 px-4 pb-5 pt-6 sm:px-8 ${boom ? 'w-quake' : ''}`} style={boom ? { animationDelay: `${BOOM_AT}ms` } : undefined}>
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <Clue wave={wave} phase={phase} psychic={psychic} psychicName={psychicName} />
      <Dial
        spectrum={wave?.spectrum ?? { left: 'Nul', right: 'Génial' }}
        target={wave?.target ?? null}
        open={wave?.target !== null && wave?.target !== undefined}
        value={dial ?? DIAL_MAX / 2}
        movable={movable}
        onMove={moveDial}
        onLock={lock}
        boom={boom}
      />
      {revealed ? (
        <Verdict points={wave.points!} gap={waveGap(wave.target!, wave.dial)} target={wave.target!} dial={wave.dial} boom={boom} />
      ) : (
        <Actions wave={wave} phase={phase} psychic={psychic} psychicName={psychicName} onLock={lock} />
      )}
    </div>
  );
}

function Clue({ wave, phase, psychic, psychicName }: { wave: WaveState | null; phase: string; psychic: boolean; psychicName: string }) {
  if (!wave) return <p className="h-14 text-muted">Lisez-vous dans les pensées ?</p>;
  if (wave.clue)
    return (
      <div className="min-h-14 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">{psychic ? 'Ton indice' : `L'indice de ${psychicName}`}</p>
        <p key={wave.clue} className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl" aria-live="polite">
          {wave.clue.split(' ').map((w, i) => (
            <span key={i} className="w-word" style={{ animationDelay: `${i * 70}ms` }}>
              {w}&nbsp;
            </span>
          ))}
        </p>
      </div>
    );
  return (
    <p className="min-h-14 text-center text-lg">
      {psychic ? (
        <>
          <b>Tu es le télépathe.</b> <span className="text-muted">Toi seul vois la cible.</span>
        </>
      ) : (
        <span className="text-muted">
          <b className="text-ink">{psychicName}</b> regarde la cible et cherche un indice
          <span className="m-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
      )}
    </p>
  );
}

function Actions({ wave, phase, psychic, psychicName, onLock }: { wave: WaveState | null; phase: string; psychic: boolean; psychicName: string; onLock: () => void }) {
  const [clue, setClue] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const turn = wave?.turn;
  useEffect(() => {
    setClue('');
    if (phase === 'clue' && psychic) field.current?.focus({ preventScroll: true });
  }, [turn, phase, psychic]);

  if (!wave) return null;

  if (phase === 'clue' && psychic)
    return (
      <form
        className="m-rise flex w-full max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!clue.trim()) return shake(field.current);
          net.send({ t: 'wave', clue });
        }}
      >
        <p className="text-center text-sm text-muted">
          Un mot, un nom, une idée qui place la cible entre <b className="text-ink">{wave.spectrum?.left}</b> et <b className="text-ink">{wave.spectrum?.right}</b>.
        </p>
        <div className="flex gap-2">
          <input ref={field} className="input" maxLength={40} placeholder="Ton indice" enterKeyHint="send" value={clue} onChange={(e) => setClue(e.target.value)} />
          <button className="btn-primary shrink-0">Donner l'indice</button>
        </div>
        {wave.canReroll && (
          <button
            type="button"
            className="btn mx-auto text-muted hover:text-ink"
            onClick={(e) => {
              bump(e.currentTarget);
              net.send({ t: 'wave', reroll: true });
            }}
          >
            ↻ Changer de carte
          </button>
        )}
      </form>
    );

  if (phase === 'guess' && !psychic)
    return (
      <div className="m-rise flex flex-col items-center gap-2">
        <p className="text-center text-sm text-muted">Glissez l'aiguille ensemble (flèches du clavier aussi), puis validez.</p>
        <button className="btn-primary px-6 py-2.5 text-base" onClick={onLock}>
          On valide !
        </button>
      </div>
    );

  if (phase === 'guess')
    return <p className="m-rise text-center text-sm text-muted">Ton équipe place l'aiguille. Plus un mot sur la cible !</p>;

  if (phase === 'clue') return <p className="text-center text-sm text-muted">Le volet reste fermé tant que {psychicName} n'a pas donné son indice.</p>;
  return null;
}

/** Points du tour : le tampon claque une fois le volet ouvert, l'écart à la cible dessous. */
function Verdict({ points, gap, target, dial, boom }: { points: number; gap: number; target: number; dial: number; boom: boolean }) {
  const percent = (v: number) => `${Math.round((v / DIAL_MAX) * 100)} %`;
  return (
    <div className="flex min-h-14 flex-col items-center gap-1.5">
      <span className="w-stamp flex items-center gap-2 whitespace-nowrap rounded-full bg-surface px-4 py-2 shadow-lg ring-1 ring-edge" style={{ animationDelay: boom ? `${BOOM_AT + 300}ms` : '850ms' }} role="status">
        <span className={`grid size-8 place-items-center rounded-full font-mono font-bold ${points ? 'text-[#18181b]' : 'text-muted'} ${POINT_COLOR[points]}`}>+{points}</span>
        <span className="font-semibold">{boom ? 'Boum ! Le cadran a sauté.' : POINT_LINE[points]}</span>
      </span>
      <span className={`w-gap font-mono text-sm tabular-nums ${boom ? 'font-semibold text-bad' : 'text-muted'}`} style={boom ? { animationDelay: `${BOOM_AT + 1300}ms` } : undefined}>
        Cible {percent(target)} · aiguille {percent(dial)} · {gap === 0 ? 'pile sur la cible' : `écart ${gap} %`}
      </span>
    </div>
  );
}

/** Fin de partie : le verdict de l'équipe, puis le rappel de chaque carte. */
function Finale() {
  const wave = useGame((s) => s.room!.wave);
  const canvas = useRef<HTMLCanvasElement>(null);
  const score = useCountUp(wave?.score ?? 0, { from: 0, delay: 300, duration: 900 });
  const verdict = waveVerdict(wave?.score ?? 0, wave?.history.length || wave?.turns || 0);
  const max = (wave?.history.length ?? 0) * BEST_POINTS;
  useEffect(() => {
    if (!wave || wave.score < max * 0.4) return;
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 900);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  if (!wave) return null;

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-20 size-full" aria-hidden />
      <p className="text-sm text-muted">Votre longueur d'onde</p>
      <h2 className="m-pop text-3xl font-semibold tracking-[-0.03em]" style={{ animationDelay: '120ms' }}>
        {verdict.title}
      </h2>
      <p className="m-rise mb-4 text-muted" style={{ animationDelay: '200ms' }}>
        {verdict.line}
      </p>
      <p className="mb-4 font-mono text-5xl font-bold tabular-nums">
        {score}
        <span className="text-xl text-muted"> / {max}</span>
        <span className="block font-sans text-sm font-normal text-muted">points de complicité</span>
      </p>
      <ul className="panel mx-auto max-w-sm divide-y divide-edge text-left text-sm">
        {wave.history.map((r, i) => (
          <RoundLine key={i} round={r} index={i} />
        ))}
      </ul>
    </>
  );
}

function RoundLine({ round, index }: { round: WaveRound; index: number }) {
  return (
    <li className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${400 + index * 70}ms` }}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs font-bold ${round.points ? 'text-[#18181b]' : 'text-muted'} ${POINT_COLOR[round.points]}`}>
        {round.points}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">« {round.clue || '—'} »</b>
        <span className="block truncate text-xs text-muted">
          {round.spectrum.left} ↔ {round.spectrum.right}
        </span>
      </span>
      <span className={`shrink-0 font-mono text-xs tabular-nums ${waveBoom(round.target, round.dial) ? 'text-bad' : 'text-muted'}`} title="Écart à la cible">
        {waveBoom(round.target, round.dial) && <span aria-label="Explosion">💥 </span>}
        {waveGap(round.target, round.dial)} %
      </span>
      {/* Mini-échelle : la cible (jaune) et l'aiguille (rouge). */}
      <span className="relative h-1.5 w-16 shrink-0 rounded-full bg-edge" aria-hidden>
        <span className="absolute -top-0.5 size-2.5 -translate-x-1/2 rounded-full bg-accent" style={{ left: `${round.target}%` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded bg-[#dc2626]" style={{ left: `${round.dial}%` }} />
      </span>
    </li>
  );
}
