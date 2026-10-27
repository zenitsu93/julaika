import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { AOV_HEAT_BONUS, AOV_JOKERS, AOV_LEVEL_INFO, AOV_POINTS, AOV_LEVELS, AOV_SPIN_MS, aovTitles, type AovHeat, type AovKind, type AovState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { play } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, shake, Ticker, useCountUp, useFlip, useIndicator } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Bottle } from './AovArt';
import './aov.css';

const send = (msg: { spin: true } | { choose: AovKind } | { pass: true } | { vote: boolean }) => net.send({ t: 'aov', ...msg });

const KIND: Record<AovKind, { label: string; icon: string; tone: string }> = {
  action: { label: 'Action', icon: '⚡', tone: 'aov-action' },
  verite: { label: 'Vérité', icon: '💬', tone: 'aov-verite' },
};

/** Plateau d'Action ou vérité : la bouteille, le choix, la carte, puis le verdict des autres. */
export function AovBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <PlayerBar />
      <div className="panel relative min-h-[28rem] overflow-hidden">
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

/** Derrière les réglages : la bouteille qui tourne doucement, pour donner l'idée du jeu. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 opacity-40 max-sm:hidden" aria-hidden>
      <div className="aov-idle size-48 text-ink">
        <Bottle />
      </div>
    </div>
  );
}

/** Sélecteur de niveau, glissé dans les réglages du salon. */
export function AovLevelPicker({ isHost }: { isHost: boolean }) {
  const level = useGame((s) => s.room!.settings.aovLevel);
  const index = Math.max(0, AOV_LEVELS.indexOf(level));
  const ind = useIndicator(index);
  const hot = level === 'spicy' || level === 'crescendo';
  return (
    <div className="mb-3 text-sm">
      <span className="mb-1 block text-muted">Niveau des cartes</span>
      <div ref={ind.container} role="group" aria-label="Niveau des cartes" className="relative grid grid-cols-2 gap-1 rounded-md border border-edge p-1 sm:grid-cols-4">
        <span ref={ind.indicator} className={`m-indicator rounded ${hot ? 'aov-hot' : 'bg-primary'}`} />
        {AOV_LEVELS.map((value) => {
          const active = level === value;
          const info = AOV_LEVEL_INFO[value];
          return (
            <button
              key={value}
              type="button"
              data-slot
              aria-pressed={active}
              disabled={!isHost}
              onClick={(e) => {
                bump(e.currentTarget, 1.05);
                net.send({ t: 'settings', settings: { aovLevel: value } });
              }}
              className={`relative flex items-center justify-center gap-1 rounded px-2 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                active ? (hot ? 'text-white' : 'text-on-primary') : 'text-muted enabled:hover:bg-edge/50'
              }`}
            >
              <span key={String(active)} className={active ? 'aov-jump inline-block' : 'inline-block'} aria-hidden>
                {info.icon}
              </span>
              {info.label}
            </button>
          );
        })}
      </div>
      <p key={level} className="m-fade mt-1 text-xs text-muted">
        {AOV_LEVEL_INFO[level].hint}
      </p>
    </div>
  );
}

/** Joueurs : score qui roule, jokers restants, et le joueur désigné passe en tête. */
function PlayerBar() {
  const players = useGame((s) => s.room!.players);
  const a = useGame((s) => s.room!.aov);
  const phase = useGame((s) => s.room!.phase);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  // Le nom ne passe en tête qu'une fois la bouteille arrêtée, pour garder le suspense.
  const chosen = phase !== 'spin' ? a?.playerId : null;
  const ordered = [...players].sort((x, y) => Number(y.id === chosen) - Number(x.id === chosen));
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const on = p.id === chosen && phase !== 'lobby' && phase !== 'gameEnd';
          const vote = a?.votes[p.id];
          const jokers = a?.jokers[p.id] ?? AOV_JOKERS;
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${
                on ? 'border-ink bg-ink text-page' : 'border-edge bg-surface'
              }`}
            >
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              {phase !== 'lobby' && (
                <>
                  <span className="font-mono text-xs tabular-nums opacity-70">
                    <Ticker value={p.score} />
                  </span>
                  <span className="flex gap-0.5" title={`${jokers} joker${jokers > 1 ? 's' : ''} « je passe »`} aria-label={`${jokers} jokers`}>
                    {Array.from({ length: AOV_JOKERS }, (_, i) => (
                      <i key={i} className={`aov-joker ${i < jokers ? '' : 'aov-joker-used'}`} />
                    ))}
                  </span>
                </>
              )}
              {phase === 'dare' && vote !== undefined && (
                <span key={String(vote)} className="m-pop" title={vote ? 'Validé' : 'Dégonflé'}>
                  {vote ? '👏' : '🐔'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {a && <Progress a={a} />}
    </div>
  );
}

/** Une pastille par tour, teintée du niveau ; le tour en cours respire. */
function Progress({ a }: { a: AovState }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Tour ${a.turn} sur ${a.turns}`}>
      {Array.from({ length: a.turns }, (_, i) => {
        const done = a.history[i];
        const current = !done && i === a.turn - 1;
        return (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${
              done ? `m-pop ${done.outcome === 'done' ? `aov-dot-${done.heat}` : 'bg-bad/30'}` : current ? 'm-breathe scale-125 bg-ink' : 'bg-edge'
            }`}
          />
        );
      })}
    </span>
  );
}

function Stage() {
  const room = useGame((s) => s.room!);
  const a = room.aov;
  if (!a) return null;
  return (
    <div className="relative flex min-h-[28rem] flex-col items-center justify-center gap-5 px-4 pb-6 pt-8 sm:px-8">
      <HeatBadge heat={a.heat} turn={a.turn} />
      {room.phase === 'spin' ? <Wheel a={a} players={room.players} /> : room.phase === 'pick' ? <Pick a={a} /> : <Dare a={a} />}
    </div>
  );
}

function HeatBadge({ heat, turn }: { heat: AovHeat; turn: number }) {
  const info = AOV_LEVEL_INFO[heat];
  return (
    <span key={`${turn}-${heat}`} className={`m-pop absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold aov-badge-${heat}`}>
      <span aria-hidden>{info.icon}</span>
      {info.label}
    </span>
  );
}

/** Une fine barre qui se vide sur le temps restant. */
function TimeBar({ endsAt, k }: { endsAt: number | null; k: string }) {
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - serverNow());
  return (
    <span className="absolute inset-x-0 top-0 h-1 bg-edge/60" aria-hidden>
      <span key={k + endsAt} className="aov-deplete block h-full bg-accent" style={{ animationDuration: `${left}ms` }} />
    </span>
  );
}

// ---- La bouteille -------------------------------------------------------------------

/** Angle (degrés, 0 = droite) de la place du joueur `i` autour de la table. À deux : face à face. */
const seat = (i: number, n: number) => (n === 2 ? 180 : -90) + (360 * i) / n;

function Wheel({ a, players }: { a: AovState; players: PlayerPublic[] }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const bottle = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const [landed, setLanded] = useState(false);
  const spinner = players.find((p) => p.id === a.spinnerId);
  const target = players.findIndex((p) => p.id === a.playerId);
  const canSpin = !a.spinAt && (a.spinnerId === selfId || !spinner);

  // La bouteille part du dernier angle, fait cinq tours et s'arrête pile sur la place désignée,
  // sur le temps qui reste (un joueur qui arrive en plein lancer la voit finir sa course).
  useLayoutEffect(() => {
    const el = bottle.current;
    if (!el) return;
    setLanded(false);
    if (!a.spinAt || target < 0) {
      el.style.transition = 'none';
      el.style.transform = `rotate(${angle.current}deg)`;
      return;
    }
    const left = Math.max(0, a.spinAt + AOV_SPIN_MS - serverNow());
    const aim = (seat(target, players.length) + 90 + 360) % 360;
    const base = Math.ceil(angle.current / 360) * 360;
    angle.current = base + (left > 400 ? 5 * 360 : 0) + aim;
    const duration = reducedMotion() ? 0 : left;
    el.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.7, 0.18, 1)`;
    el.style.transform = `rotate(${angle.current}deg)`;
    const t = setTimeout(() => {
      setLanded(true);
      play('ding');
    }, duration);
    return () => clearTimeout(t);
  }, [a.spinAt, a.turn]);

  const chosen = players[target];
  return (
    <>
      {!a.spinAt && <TimeBar endsAt={endsAt} k={`spin-${a.turn}`} />}
      <div className="relative aspect-square w-full max-w-[22rem]">
        <span className="aov-table absolute inset-[14%] rounded-full" aria-hidden />
        {players.map((p, i) => {
          const rad = (seat(i, players.length) * Math.PI) / 180;
          const on = landed && p.id === a.playerId;
          return (
            <span
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${50 + 42 * Math.cos(rad)}%`, top: `${50 + 42 * Math.sin(rad)}%` }}
            >
              <span
                className={`m-pop relative grid size-14 place-items-center rounded-full bg-surface text-3xl ring-1 ring-edge transition-transform duration-300 sm:size-16 ${on ? 'aov-chosen scale-115' : ''}`}
                style={{ animationDelay: `${i * 70}ms` }}
                title={p.name}
              >
                {avatarOf(p.avatar)}
              </span>
              <span className={`mt-1 block max-w-20 truncate text-center text-xs ${on ? 'font-semibold text-ink' : 'text-muted'}`}>{p.id === selfId ? 'Toi' : p.name}</span>
            </span>
          );
        })}
        <button
          type="button"
          disabled={!canSpin}
          aria-label="Faire tourner la bouteille"
          onClick={() => send({ spin: true })}
          className={`absolute inset-[24%] grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-info ${canSpin ? 'cursor-grab' : 'cursor-default'}`}
        >
          <div ref={bottle} className={`size-full text-ink will-change-transform ${a.spinAt ? '' : 'aov-wobble'}`}>
            <Bottle />
          </div>
        </button>
      </div>
      <p className="min-h-7 text-center text-lg font-semibold" role="status">
        {landed && chosen ? (
          <span key="landed" className="w-stamp inline-block">
            {chosen.id === selfId ? 'C’est toi ! 😏' : `C’est au tour de ${chosen.name} !`}
          </span>
        ) : a.spinAt ? (
          <span className="text-muted">
            Ça tourne<span className="m-dots"><span>.</span><span>.</span><span>.</span></span>
          </span>
        ) : canSpin ? (
          <button type="button" className="btn-primary m-pop px-5 py-2" onClick={(e) => (bump(e.currentTarget), send({ spin: true }))}>
            🍾 Faire tourner la bouteille
          </button>
        ) : (
          <span className="text-muted">{spinner?.name ?? 'Quelqu’un'} va faire tourner la bouteille…</span>
        )}
      </p>
    </>
  );
}

// ---- Le choix -----------------------------------------------------------------------

/** Lumière qui suit le pointeur et carte qui s'incline vers lui. */
function tilt(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  e.currentTarget.style.setProperty('--ax', `${x * 100}%`);
  e.currentTarget.style.setProperty('--ay', `${y * 100}%`);
  if (!reducedMotion()) e.currentTarget.style.transform = `perspective(800px) rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 12}deg) translateY(-4px)`;
}
const untilt = (e: PointerEvent<HTMLElement>) => void (e.currentTarget.style.transform = '');

function Pick({ a }: { a: AovState }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const player = useGame((s) => s.room!.players.find((p) => p.id === a.playerId));
  const mine = a.playerId === selfId;

  // Touches A et V pour choisir sans la souris.
  useEffect(() => {
    if (!mine) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target instanceof HTMLElement && e.target.closest('input, textarea')) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'a') send({ choose: 'action' });
      if (e.key.toLowerCase() === 'v') send({ choose: 'verite' });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [mine]);

  return (
    <>
      <TimeBar endsAt={endsAt} k={`pick-${a.turn}`} />
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="m-pop grid size-16 place-items-center rounded-full bg-surface text-4xl ring-1 ring-edge">{avatarOf(player?.avatar ?? 0)}</span>
        <h2 className="m-rise text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{mine ? 'Action ou vérité ?' : `${player?.name ?? '…'} hésite…`}</h2>
        <p className="m-rise text-sm text-muted" style={{ animationDelay: '80ms' }}>
          {mine ? (
            <>
              Choisis ta carte<span className="max-sm:hidden"> (touches A ou V)</span>.
            </>
          ) : (
            'Action ou vérité ? Le suspense est insoutenable.'
          )}
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-2 gap-3 sm:gap-5">
        {(['action', 'verite'] as const).map((kind, i) => (
          <button
            key={kind}
            type="button"
            disabled={!mine}
            onPointerMove={mine ? tilt : undefined}
            onPointerLeave={untilt}
            onClick={(e) => {
              bump(e.currentTarget, 1.04);
              send({ choose: kind });
            }}
            className={`aov-choice ${KIND[kind].tone} m-rise flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl p-4 outline-none focus-visible:ring-4 focus-visible:ring-info disabled:cursor-default ${mine ? '' : 'aov-waiting'}`}
            style={{ animationDelay: `${150 + i * 90}ms` }}
          >
            <span className="aov-choice-icon text-5xl sm:text-6xl" aria-hidden>
              {KIND[kind].icon}
            </span>
            <span className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{KIND[kind].label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---- La carte et le verdict -----------------------------------------------------------

function Dare({ a }: { a: AovState }) {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const player = room.players.find((p) => p.id === a.playerId);
  const mine = a.playerId === selfId;
  const card = a.card;
  const box = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const verdict = room.phase === 'verdict' ? a.verdict : null;
  const myVote = selfId ? a.votes[selfId] : undefined;
  const jokers = selfId ? (a.jokers[selfId] ?? 0) : 0;
  const points = useCountUp(verdict === 'done' && a.history.at(-1) ? lastGain(a) : 0, { from: 0, delay: 350, duration: 600 });

  // Verdict : confettis et bravo si c'est validé, trombone triste et secousse sinon.
  useEffect(() => {
    if (!verdict) return;
    if (verdict === 'done') {
      play('bravo');
      return confetti(sparks.current, 110);
    }
    play('trombone');
    shake(box.current);
  }, [verdict, a.turn]);

  if (!card) return null;
  return (
    <>
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      {!verdict && <TimeBar endsAt={room.endsAt} k={`dare-${a.turn}-${card.text}`} />}
      <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">{mine ? 'À toi de jouer' : `${player?.name ?? '…'} doit relever…`}</p>
      <div ref={box} className="relative w-full max-w-md">
        <div key={card.text} className={`aov-card ${KIND[card.kind].tone} aov-heat-${card.heat} relative flex min-h-56 flex-col gap-3 rounded-2xl p-5 sm:p-7`}>
          <span className="flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-1.5">
              <span aria-hidden>{KIND[card.kind].icon}</span>
              {KIND[card.kind].label}
            </span>
            {card.ai && (
              <span className="aov-ai rounded-full px-2 py-0.5 text-[11px]" title="Carte inventée par l'IA pour votre salon">
                ✨ IA
              </span>
            )}
          </span>
          <p className="flex-1 text-xl font-semibold leading-snug tracking-[-0.02em] sm:text-2xl">
            {card.text.split(' ').map((w, i) => (
              <span key={i} className="w-word" style={{ animationDelay: `${380 + i * 45}ms` }}>
                {w}&nbsp;
              </span>
            ))}
          </p>
        </div>
        {verdict && (
          <span
            className={`aov-stamp absolute left-1/2 top-1/2 z-[6] rounded-xl border-4 px-4 py-1.5 text-2xl font-black uppercase tracking-wider sm:text-3xl ${
              verdict === 'done' ? 'border-good text-good' : 'border-bad text-bad'
            }`}
            role="status"
          >
            {verdict === 'done' ? 'Validé !' : 'Dégonflé 🐔'}
          </span>
        )}
      </div>

      {verdict ? (
        <p className="m-rise flex items-center gap-2 text-lg font-semibold" style={{ animationDelay: '300ms' }}>
          {verdict === 'done' ? (
            <>
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-accent px-2 font-mono text-sm font-bold text-[#18181b]">+{points}</span>
              {mine ? 'Bravo, défi relevé !' : `${player?.name} a assuré !`}
            </>
          ) : mine ? (
            'Les autres ne sont pas convaincus…'
          ) : (
            `${player?.name} s’est dégonflé·e !`
          )}
        </p>
      ) : mine ? (
        <div className="m-rise flex flex-col items-center gap-2 text-center" style={{ animationDelay: '500ms' }}>
          <p className="text-sm text-muted">{card.kind === 'verite' ? 'Réponds à voix haute, sincèrement.' : 'Fais-le devant ta caméra.'} Les autres valident.</p>
          <button
            type="button"
            className="btn flex items-center gap-2 text-muted enabled:hover:text-ink"
            disabled={jokers <= 0}
            onClick={(e) => {
              bump(e.currentTarget);
              send({ pass: true });
            }}
          >
            🃏 Je passe <span className="font-mono text-xs">({jokers} joker{jokers > 1 ? 's' : ''})</span>
          </button>
        </div>
      ) : (
        <div className="m-rise flex flex-wrap justify-center gap-2" style={{ animationDelay: '500ms' }} role="group" aria-label="Ton verdict">
          <VoteButton on={myVote === true} onClick={() => send({ vote: true })} tone="good">
            👏 Validé
          </VoteButton>
          <VoteButton on={myVote === false} onClick={() => send({ vote: false })} tone="bad">
            🐔 Dégonflé
          </VoteButton>
        </div>
      )}
    </>
  );
}

function lastGain(a: AovState) {
  const r = a.history.at(-1)!;
  return r.kind ? AOV_POINTS[r.kind] + AOV_HEAT_BONUS[r.heat] : 0;
}

function VoteButton({ on, onClick, tone, children }: { on: boolean; onClick: () => void; tone: 'good' | 'bad'; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        bump(e.currentTarget, 1.06);
        onClick();
      }}
      className={`rounded-full border px-5 py-2 font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-info ${
        on ? (tone === 'good' ? 'border-good bg-good text-white' : 'border-bad bg-bad text-white') : 'border-edge bg-surface hover:border-ink/40'
      }`}
    >
      {children}
    </button>
  );
}

// ---- Fin de partie ---------------------------------------------------------------------

function Finale() {
  const a = useGame((s) => s.room!.aov);
  const players = useGame((s) => s.room!.players);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ranking = [...players].sort((x, y) => y.score - x.score);
  const done = a?.history.filter((r) => r.outcome === 'done').length ?? 0;
  const total = a?.history.length ?? 0;
  const shown = useCountUp(done, { from: 0, delay: 300, duration: 800 });
  useEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 700);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  if (!a) return null;
  const titles = aovTitles(a.history);

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-20 size-full" aria-hidden />
      <p className="text-sm text-muted">Défis relevés</p>
      <p className="font-mono text-5xl font-bold tabular-nums">
        {shown}
        <span className="text-xl text-muted"> / {total}</span>
      </p>
      <h2 className="m-pop mt-1 mb-4 text-3xl font-semibold tracking-[-0.03em]" style={{ animationDelay: '120ms' }}>
        {total && done === total ? 'Aucun dégonflé !' : done * 2 >= total ? 'Belle bande d’audacieux' : 'Il y a des poulets ici…'}
      </h2>
      <ol className="panel mx-auto mb-3 max-w-sm divide-y divide-edge text-left text-sm">
        {ranking.map((p, i) => {
          const title = titles.find((t) => t.playerId === p.id);
          return (
            <li key={p.id} className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${300 + i * 70}ms` }}>
              <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              {title && (
                <span className="m-pop rounded-full bg-accent/20 px-2 py-0.5 text-xs" style={{ animationDelay: `${600 + i * 90}ms` }}>
                  {title.icon} {title.title}
                </span>
              )}
              <Score value={p.score} delay={400 + i * 70} />
            </li>
          );
        })}
      </ol>
      <ul className="panel mx-auto max-w-sm divide-y divide-edge text-left text-sm">
        {a.history.map((r, i) => (
          <li key={i} className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${500 + i * 50}ms` }}>
            <span aria-hidden>{avatarOf(r.avatar)}</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate">{r.text ?? '—'}</b>
              <span className="block truncate text-xs text-muted">
                {r.name} · {r.kind === 'action' ? 'Action' : 'Vérité'} · {AOV_LEVEL_INFO[r.heat].icon}
                {r.passes ? ` · ${r.passes} joker${r.passes > 1 ? 's' : ''}` : ''}
              </span>
            </span>
            <span aria-label={r.outcome === 'done' ? 'Validé' : 'Dégonflé'}>{r.outcome === 'done' ? '👏' : '🐔'}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Score({ value, delay }: { value: number; delay: number }) {
  const shown = useCountUp(value, { from: 0, delay, duration: 700 });
  return <span className="font-mono tabular-nums">{shown}</span>;
}
