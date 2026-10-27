import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CONNAIT_SCALE_CLOSE, CONNAIT_SCALE_MAX, type ConnaitScale, type ConnaitState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { useGame } from '../../lib/store';
import { bump, shake, Ticker, useSpring } from '../../motion';

const clamp = (v: number) => Math.max(0, Math.min(CONNAIT_SCALE_MAX, Math.round(v)));
const pct = (v: number) => `${(100 * v) / CONNAIT_SCALE_MAX}%`;

/**
 * Question au curseur : chacun fait glisser son repère entre les deux extrêmes, puis valide
 * (on peut corriger jusqu'à la révélation). À la révélation, le drapeau de la vedette tombe,
 * la zone « tu la connais » s'ouvre autour, et les paris de chacun se posent sur la piste.
 */
export function ScaleDial({
  question,
  k,
  star,
  selfId,
  reveal,
  drum,
}: {
  question: ConnaitScale;
  k: ConnaitState;
  star: PlayerPublic;
  selfId: string | null;
  reveal: ConnaitState['reveal'];
  drum: boolean;
}) {
  const [low, high] = question.scale;
  const [value, setValue] = useState(k.mine ?? CONNAIT_SCALE_MAX / 2);
  const [touched, setTouched] = useState(k.mine !== null);
  const rail = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const locked = Boolean(reveal) || drum;
  const isStar = star.id === selfId;

  // Nouvelle question (ou question changée par la vedette) : repère au milieu.
  useEffect(() => {
    setValue(k.mine ?? CONNAIT_SCALE_MAX / 2);
    setTouched(k.mine !== null);
  }, [k.turn, question.topic]);

  // Le repère suit le doigt avec un petit ressort, sans re-rendu à chaque image.
  useSpring(value, (v) => {
    const at = pct(v);
    if (thumb.current) thumb.current.style.left = at;
    if (fill.current) fill.current.style.width = at;
  });

  const fromPointer = (e: PointerEvent) => {
    const r = rail.current!.getBoundingClientRect();
    setValue(clamp(((e.clientX - r.left) / r.width) * CONNAIT_SCALE_MAX));
    setTouched(true);
  };

  const confirm = () => {
    if (locked) return;
    net.send({ t: 'connait', pick: value });
    bump(thumb.current, 1.25);
  };

  const onKey = (e: KeyboardEvent) => {
    if (locked) return;
    const step = e.shiftKey ? 10 : 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? value + step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? value - step
      : e.key === 'Home' ? 0
      : e.key === 'End' ? CONNAIT_SCALE_MAX
      : null;
    if (e.key === 'Enter') {
      e.preventDefault();
      return confirm();
    }
    if (next === null) return;
    e.preventDefault();
    setValue(clamp(next));
    setTouched(true);
  };

  const saved = k.mine !== null && k.mine === value;

  return (
    <div className="m-rise flex w-full max-w-2xl flex-col gap-3" style={{ animationDelay: '220ms' }}>
      <div className="flex items-end justify-between gap-4 text-sm font-medium">
        <span className="max-w-[45%] text-left">{low}</span>
        <span className="max-w-[45%] text-right">{high}</span>
      </div>

      {/* À la révélation, la place sous la piste accueille les paris qui tombent. */}
      <div className={`relative px-4 transition-[margin] duration-500 ${reveal ? 'mb-14' : ''}`}>
        <div
          ref={rail}
          role="slider"
          tabIndex={locked ? -1 : 0}
          aria-label={isStar ? 'Ta place sur le curseur' : `Ton pari sur ${star.name}`}
          aria-valuemin={0}
          aria-valuemax={CONNAIT_SCALE_MAX}
          aria-valuenow={value}
          aria-valuetext={`${value} sur ${CONNAIT_SCALE_MAX}, entre « ${low} » et « ${high} »`}
          aria-disabled={locked}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            if (locked) return;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          className={`k-rail relative h-16 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-info ${locked ? '' : 'cursor-pointer'} ${drum ? 'm-shimmer' : ''}`}
        >
          <span className="k-rail-track absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full" aria-hidden />
          {!reveal && <span ref={fill} className="k-rail-fill absolute left-0 top-1/2 h-3 -translate-y-1/2 rounded-full" aria-hidden />}
          {/* Graduations : une tous les dix, plus marquée au milieu. */}
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className={`absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-ink/25 ${i === 5 ? 'h-6' : 'h-4'}`}
              style={{ left: `${i * 10}%` }}
              aria-hidden
            />
          ))}
          {reveal ? (
            <Revealed answer={reveal.answer} picks={reveal.picks} gains={reveal.gains} star={star} selfId={selfId} />
          ) : (
            <span ref={thumb} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
              <span className={`k-thumb relative grid size-9 place-items-center rounded-full border-2 text-lg ${saved ? 'k-beam border-accent bg-accent' : touched ? 'border-ink bg-surface' : 'border-edge bg-surface opacity-70'}`}>
                {isStar ? avatarOf(star.avatar) : '🎯'}
              </span>
              <span className="k-bubble absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 font-mono text-xs font-bold text-page">
                <Ticker value={value} />
              </span>
            </span>
          )}
        </div>
      </div>

      {!reveal && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={locked || saved}
            onClick={(e) => (touched ? confirm() : shake(e.currentTarget))}
            className={saved ? 'btn text-good' : 'btn-primary'}
          >
            {saved ? '✓ Validé, tu peux encore bouger' : k.mine !== null ? 'Changer ma réponse' : isStar ? 'C’est moi, ça' : 'Je parie ici'}
          </button>
        </div>
      )}
    </div>
  );
}

/** La révélation sur la piste : zone gagnante, drapeau de la vedette, puis les paris qui tombent. */
function Revealed({
  answer,
  picks,
  gains,
  star,
  selfId,
}: {
  answer: number | null;
  picks: Record<string, number>;
  gains: Record<string, number>;
  star: PlayerPublic;
  selfId: string | null;
}) {
  const players = useGame((s) => s.room!.players);
  const bettors = players.filter((p) => p.id !== star.id && picks[p.id] !== undefined).sort((a, b) => picks[a.id]! - picks[b.id]!);
  // Deux paris trop proches ne se cachent pas : le second monte d'un cran.
  let lastAt = -Infinity;
  let row = 0;
  const placed = bettors.map((p) => {
    const at = picks[p.id]!;
    row = at - lastAt < 7 ? row + 1 : 0;
    lastAt = at;
    return { p, at, row };
  });

  return (
    <>
      {answer !== null && (
        <span
          className="k-zone absolute top-1/2 h-9 -translate-y-1/2 rounded-full"
          style={{
            left: pct(Math.max(0, answer - CONNAIT_SCALE_CLOSE)),
            width: pct(Math.min(CONNAIT_SCALE_MAX, answer + CONNAIT_SCALE_CLOSE) - Math.max(0, answer - CONNAIT_SCALE_CLOSE)),
          }}
          aria-hidden
        />
      )}
      {placed.map(({ p, at, row }, j) => {
        const gain = gains[p.id] ?? 0;
        return (
          <span key={p.id} className="absolute top-full -translate-x-1/2" style={{ left: pct(at), marginTop: `${4 + row * 30}px` }}>
            <span className="m-drop flex flex-col items-center" style={{ animationDelay: `${650 + j * 110}ms` }}>
              <span
                title={`${p.name} : ${at}`}
                className={`grid size-7 place-items-center rounded-full border text-base ${gain ? 'border-accent bg-accent/20' : 'border-edge bg-surface'} ${p.id === selfId ? 'ring-2 ring-ink' : ''}`}
              >
                {avatarOf(p.avatar)}
              </span>
              <span className={`font-mono text-[10px] font-bold tabular-nums ${gain ? 'text-ink' : 'text-muted'}`}>{gain ? `+${gain}` : at}</span>
            </span>
          </span>
        );
      })}
      {answer !== null && (
        <span className="absolute bottom-1/2 -translate-x-1/2" style={{ left: pct(answer) }} aria-label={`Réponse de ${star.name} : ${answer}`}>
          <span className="k-flag flex flex-col items-center">
            <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-sm font-bold text-[#18181b] shadow-lg">
              <span aria-hidden>{avatarOf(star.avatar)}</span>
              <span className="font-mono tabular-nums">{answer}</span>
            </span>
            <span className="h-5 w-0.5 bg-accent" aria-hidden />
          </span>
        </span>
      )}
    </>
  );
}

/** Écart entre ton pari et la réponse, pour la phrase de résultat. */
export function scaleGap(reveal: NonNullable<ConnaitState['reveal']>, selfId: string | null): number | null {
  const mine = selfId ? reveal.picks[selfId] : undefined;
  return mine === undefined || reveal.answer === null ? null : Math.abs(mine - reveal.answer);
}
