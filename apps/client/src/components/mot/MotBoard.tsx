import { useEffect, useRef, useState } from 'react';
import type { MotState } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { dayLabel, duration, fetchMot, shiftDay } from '../../lib/mot';
import { useFlip } from '../../motion';
import { TILE } from './tiles';

const MEDALS = ['bg-accent text-[#18181b]', 'bg-[#d4d4d8] text-[#18181b]', 'bg-[#d97706] text-white'];

/** Classement d'un jour : aujourd'hui en direct, les jours passés avec leur mot. */
export function MotBoard({ today }: { today: MotState | null }) {
  const [date, setDate] = useState<string | null>(null);
  const [past, setPast] = useState<MotState | null>(null);
  const [dir, setDir] = useState(0);
  const list = useRef<HTMLOListElement>(null);

  const shown = date && date !== today?.date ? past : today;
  const day = date ?? today?.date;

  useEffect(() => {
    if (!date || date === today?.date) return;
    let alive = true;
    setPast(null);
    fetchMot(date)
      .then((s) => alive && setPast(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date, today?.date]);

  const board = shown?.board ?? [];
  useFlip(list, [board.map((e) => `${e.name}${e.tries}${e.ms}`).join()]);

  const go = (n: number) => {
    if (!day) return;
    setDir(n);
    setDate(shiftDay(day, n));
  };
  const isToday = !today || day === today.date;
  const canBack = today && day && day > today.firstDate;

  return (
    <aside className="panel m-rise overflow-hidden shadow-sm" style={{ animationDelay: '120ms' }}>
      <div className="flex items-center justify-between gap-2 border-b border-edge p-2">
        <button type="button" aria-label="Jour précédent" className="btn size-9 p-0 text-muted hover:text-ink" disabled={!canBack} onClick={() => go(-1)}>
          <Chevron d="M15 18l-6-6 6-6" />
        </button>
        <div className="min-w-0 overflow-hidden text-center">
          <p key={day} className={`truncate font-semibold capitalize ${dir < 0 ? 'mot-from-left' : dir > 0 ? 'mot-from-right' : ''}`}>
            {isToday ? 'Aujourd’hui' : day ? dayLabel(day) : '…'}
          </p>
          <p className="text-xs text-muted">{shown ? `Mot n° ${shown.number}` : ' '}</p>
        </div>
        <button type="button" aria-label="Jour suivant" className="btn size-9 p-0 text-muted hover:text-ink" disabled={isToday} onClick={() => go(1)}>
          <Chevron d="M9 18l6-6-6-6" />
        </button>
      </div>

      {!isToday && shown?.answer && (
        <p key={`a${day}`} className="m-rise border-b border-edge px-4 py-2 text-center text-sm text-muted">
          Le mot était <span className="font-semibold uppercase tracking-wider text-ink">{shown.answer}</span>
        </p>
      )}

      <ol ref={list} key={day} className="max-h-[32rem] overflow-y-auto p-2">
        {board.map((e, i) => (
          <li
            key={`${e.name}-${e.avatar}-${i}`}
            data-flip={`${e.name}-${e.avatar}`}
            style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}
            className={`m-rise flex items-center gap-3 rounded-md px-2 py-2 ${e.you ? 'bg-accent/15 ring-1 ring-accent/60' : ''}`}
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold ${e.won && i < 3 ? MEDALS[i] : 'text-muted'}`}
            >
              {e.won ? i + 1 : '–'}
            </span>
            <span className="text-xl leading-none">{avatarOf(e.avatar)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {e.name}
                {e.you && <span className="ml-1.5 text-xs font-normal text-muted">(toi)</span>}
              </span>
              <span className="block text-xs text-muted">
                {e.won ? `${e.tries}/6` : 'X/6'} · {duration(e.ms)}
              </span>
            </span>
            {/* Les couleurs des essais, sans les lettres. */}
            <span className="grid shrink-0 gap-px" aria-hidden>
              {e.marks.map((row, r) => (
                <span key={r} className="flex gap-px">
                  {row.map((m, c) => (
                    <span key={c} className={`size-1.5 rounded-[1px] ${TILE[m].className}`} />
                  ))}
                </span>
              ))}
            </span>
          </li>
        ))}
        {shown && board.length === 0 && (
          <li className="m-rise px-3 py-8 text-center text-sm text-muted">
            {isToday ? 'Personne n’a encore fini. À toi de lancer le classement !' : 'Personne n’a joué ce jour-là.'}
          </li>
        )}
        {!shown && (
          <li className="space-y-2 p-1" aria-label="Chargement">
            {[0, 1, 2].map((i) => (
              <span key={i} className="m-shimmer block h-11 rounded-md bg-edge/60" />
            ))}
          </li>
        )}
      </ol>

      {isToday && shown && shown.playing > 0 && (
        <p className="flex items-center justify-center gap-2 border-t border-edge px-4 py-2.5 text-xs text-muted">
          <span className="m-dots inline-flex gap-0.5" aria-hidden>
            <span className="size-1 rounded-full bg-current" />
            <span className="size-1 rounded-full bg-current" />
            <span className="size-1 rounded-full bg-current" />
          </span>
          {shown.playing} joueur{shown.playing > 1 ? 's' : ''} en train de chercher
        </p>
      )}
    </aside>
  );
}

const Chevron = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
