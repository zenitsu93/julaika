import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BAC_ANSWER_MAX, BAC_LETTERS, BAC_ROLL_TIME, bacFits, bacNormalize, vetoKey, type BacState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { serverNow, useGame } from '../../lib/store';
import { animate, bump, confetti, Presence, reducedMotion, shake, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Podium } from '../Overlay';

/** Plateau du Petit Bac : les joueurs et leur avancée, la grille, le vote puis le décompte. Visio dessous. */
export function BacBoard() {
  const phase = useGame((s) => s.room!.phase);
  const ranking = useGame((s) => s.ranking);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <BacBar />
      <div className="panel relative min-h-[26rem] overflow-hidden">
        <Stage />
        <Presence>
          {phase === 'lobby' ? (
            <Veil key="lobby" flow>
              <Lobby />
            </Veil>
          ) : phase === 'gameEnd' && ranking ? (
            <Veil key="end">
              <Podium ranking={ranking} />
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

const Dots = () => (
  <span className="m-dots" aria-hidden>
    <span>.</span>
    <span>.</span>
    <span>.</span>
  </span>
);

// ---- Barre des joueurs -----------------------------------------------------------

/** Chaque joueur avec un anneau qui se remplit case après case ; au vote, une coche quand il a fini. */
function BacBar() {
  const players = useGame((s) => s.room!.players);
  const phase = useGame((s) => s.room!.phase);
  const bac = useGame((s) => s.room!.bac);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const ordered = [...players].sort((a, b) => b.score - a.score);
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const playing = bac?.players.includes(p.id) ?? false;
          const voted = phase === 'vote' && bac?.done.includes(p.id);
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-sm transition-colors duration-300 ${
                voted ? 'border-good/50 bg-good/10' : 'border-edge bg-surface'
              }`}
            >
              {phase === 'fill' && playing ? (
                <Ring value={bac!.filled[p.id] ?? 0} max={bac!.categories.length} stopped={bac!.stoppedBy === p.id}>
                  {avatarOf(p.avatar)}
                </Ring>
              ) : (
                <span className="grid size-7 place-items-center" aria-hidden>
                  {avatarOf(p.avatar)}
                </span>
              )}
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              <Score value={p.score} />
              {voted && (
                <span key="ok" className="m-pop text-good" title="A voté">
                  ✓
                </span>
              )}
              {p.isHost && (
                <span title="Hôte" className="text-xs">
                  👑
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <Rounds />
    </div>
  );
}

function Score({ value }: { value: number }) {
  const shown = useCountUp(value, { duration: 700 });
  return <span className="font-mono text-xs tabular-nums text-muted">{shown}</span>;
}

/** Anneau de progression autour de l'avatar : une case remplie = un cran. */
function Ring({ value, max, stopped, children }: { value: number; max: number; stopped: boolean; children: ReactNode }) {
  const c = 2 * Math.PI * 12;
  const full = value >= max;
  return (
    <span className="relative grid size-7 place-items-center" title={`${value}/${max} cases`}>
      <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="14" cy="14" r="12" fill="none" stroke="var(--color-edge)" strokeWidth="2.5" />
        <circle
          className="bac-ring"
          cx="14"
          cy="14"
          r="12"
          fill="none"
          stroke={stopped ? 'var(--color-bad)' : full ? 'var(--color-good)' : '#f5b700'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / max)}
        />
      </svg>
      <span className="text-sm" aria-hidden>
        {children}
      </span>
    </span>
  );
}

/** Une pastille par manche : jouées, en cours (elle respire), à venir. */
function Rounds() {
  const round = useGame((s) => s.room!.round);
  const rounds = useGame((s) => s.room!.settings.rounds);
  const phase = useGame((s) => s.room!.phase);
  if (phase === 'lobby') return null;
  return (
    <span className="flex items-center gap-1" aria-label={`Manche ${round} sur ${rounds}`}>
      {Array.from({ length: rounds }, (_, i) => {
        const past = i + 1 < round || phase === 'gameEnd';
        const current = i + 1 === round && phase !== 'gameEnd';
        return (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${past ? 'm-pop bg-[#ea580c]' : current ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`}
          />
        );
      })}
    </span>
  );
}

// ---- Étapes ----------------------------------------------------------------------

function Stage() {
  const phase = useGame((s) => s.room!.phase);
  const round = useGame((s) => s.room!.round);
  const bac = useGame((s) => s.room!.bac);
  const selfId = useGame((s) => s.selfId);
  if (phase === 'lobby' || !bac) return <Teaser />;
  const playing = bac.players.includes(selfId ?? '');
  if (phase === 'fill')
    return playing ? (
      <Fill key={round} bac={bac} />
    ) : (
      <Center>
        <p className="text-4xl">🍿</p>
        <p className="mt-2 text-lg font-semibold">Manche en cours, lettre {bac.letter}</p>
        <p className="text-muted">
          Tu joueras à la prochaine ; tu pourras voter dès que les grilles tombent
          <Dots />
        </p>
      </Center>
    );
  if (phase === 'vote') return <Vote key={round} bac={bac} />;
  return <Reveal key={round} bac={bac} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="m-rise grid min-h-[26rem] place-items-center p-6 text-center">{<div>{children}</div>}</div>;
}

/** Derrière les réglages : la lettre qui tourne et une grille qui se remplit, pour donner l'idée du jeu. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[26rem] place-items-center p-6 opacity-40 max-sm:hidden" aria-hidden>
      <div className="flex items-center gap-6">
        <span className="soon-spin grid size-24 place-items-center rounded-2xl bg-accent text-6xl font-bold text-[#18181b]">B</span>
        <span className="flex flex-col gap-3">
          {[160, 120, 140].map((w, i) => (
            <span key={i} className="h-5 rounded-md bg-edge" style={{ width: w }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/** La lettre tirée : un rouleau de lettres qui défile puis se cale sur la bonne, avec un léger rebond. */
function LetterReel({ letter }: { letter: string }) {
  const reel = useRef<HTMLSpanElement>(null);
  const tile = useRef<HTMLSpanElement>(null);
  const [strip] = useState(() => {
    const pool = [...BAC_LETTERS].filter((l) => l !== letter);
    return [...Array.from({ length: 14 }, () => pool[Math.floor(Math.random() * pool.length)]!), letter];
  });
  useLayoutEffect(() => {
    const steps = strip.length - 1;
    const roll = animate(reel.current, [{ transform: 'translateY(0)' }, { transform: `translateY(-${(steps / strip.length) * 100}%)` }], {
      duration: 1300,
      easing: 'cubic-bezier(.15,.75,.25,1)',
      fill: 'forwards',
    });
    const land = setTimeout(() => {
      animate(
        tile.current,
        [
          { transform: 'scale(1)', boxShadow: '0 0 0 0 rgb(245 183 0 / .6)' },
          { transform: 'scale(1.08)', boxShadow: '0 0 0 14px rgb(245 183 0 / 0)' },
          { transform: 'scale(1)', boxShadow: '0 0 0 0 rgb(245 183 0 / 0)' },
        ],
        { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'none' },
      );
    }, 1250);
    return () => {
      roll?.cancel();
      clearTimeout(land);
    };
  }, [strip]);
  return (
    <span
      ref={tile}
      className="relative block size-20 shrink-0 overflow-hidden rounded-2xl bg-accent text-[#18181b] shadow-[0_18px_40px_-18px_rgb(245_183_0/0.9),inset_0_-4px_0_rgb(0_0_0/0.12)] sm:size-24"
      aria-label={`Lettre ${letter}`}
    >
      <span ref={reel} className="absolute inset-x-0 top-0 flex flex-col" style={{ transform: `translateY(-${((strip.length - 1) / strip.length) * 100}%)` }} aria-hidden>
        {strip.map((l, i) => (
          <span key={i} className="grid size-20 place-items-center text-5xl font-bold sm:size-24 sm:text-6xl">
            {l}
          </span>
        ))}
      </span>
    </span>
  );
}

// ---- Remplissage -----------------------------------------------------------------

/** La grille : un champ par catégorie, envoyée au fil de la frappe pour que rien ne se perde au buzzer. */
function Fill({ bac }: { bac: BacState }) {
  const [answers, setAnswers] = useState(() => bac.categories.map(() => ''));
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const stopBtn = useRef<HTMLButtonElement>(null);
  const endsAt = useGame((s) => s.room!.endsAt);
  const stopper = useGame((s) => s.room!.players.find((p) => p.id === s.room!.bac?.stoppedBy) ?? null);
  const selfId = useGame((s) => s.selfId);
  const filled = answers.filter((a) => a.trim()).length;
  const full = filled === answers.length;
  // Tant que le rouleau tourne, la lettre n'apparaît nulle part ailleurs.
  const [rolling, setRolling] = useState(true);

  // Envoi groupé pendant la frappe, et tout de suite juste avant la fin.
  const latest = useRef(answers);
  latest.current = answers;
  useEffect(() => {
    const t = setTimeout(() => net.send({ t: 'bac', answers }), 250);
    return () => clearTimeout(t);
  }, [answers]);
  useEffect(() => {
    if (!endsAt) return;
    const t = setTimeout(() => net.send({ t: 'bac', answers: latest.current }), endsAt - serverNow() - 400);
    return () => clearTimeout(t);
  }, [endsAt]);

  // La lettre a fini de tourner : on l'annonce et on place le curseur dans la première case.
  useEffect(() => {
    const t = setTimeout(
      () => {
        setRolling(false);
        fields.current[0]?.focus({ preventScroll: true });
      },
      reducedMotion() ? 0 : Math.min(1300, BAC_ROLL_TIME * 1000),
    );
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (full && !stopper) bump(stopBtn.current, 1.06);
  }, [full, stopper]);

  const stop = () => {
    if (!full) return shake(stopBtn.current);
    net.send({ t: 'bac', answers });
    net.send({ t: 'bac', stop: true });
  };

  return (
    <div className="relative flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <LetterReel letter={bac.letter} />
        <div className="min-w-0 flex-1">
          <p className="m-rise truncate text-xs uppercase tracking-[0.12em] text-muted sm:tracking-[0.18em]">{rolling ? 'Tirage au sort' : 'Tout commence par'}</p>
          <h2 key={String(rolling)} className="m-pop mt-0.5 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {rolling ? (
              <>
                Quelle lettre
                <Dots />
              </>
            ) : (
              `La lettre ${bac.letter}`
            )}
          </h2>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-edge sm:w-40">
              <span className="bac-bar block h-full rounded-full bg-good" style={{ transform: `scaleX(${filled / answers.length})` }} />
            </span>
            <span className="font-mono tabular-nums">
              {filled}/{answers.length}
            </span>
          </div>
        </div>
        <button
          ref={stopBtn}
          type="button"
          onClick={stop}
          disabled={!!stopper}
          aria-disabled={!full}
          className={`rounded-xl px-4 py-3 text-base font-bold tracking-wide transition sm:px-6 ${
            full && !stopper ? 'bac-stop text-white shadow-[0_12px_30px_-12px_var(--color-bad)]' : 'cursor-not-allowed border border-dashed border-edge text-muted'
          }`}
          title={full ? 'Arrêter la manche : les autres ont 5 secondes' : 'Remplis toutes les cases pour crier Stop'}
        >
          Stop !
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {bac.categories.map((cat, i) => (
          <Field
            key={cat}
            ref={(el) => void (fields.current[i] = el)}
            index={i}
            label={cat}
            letter={bac.letter}
            hidden={rolling}
            value={answers[i]!}
            onChange={(v) => setAnswers((list) => list.map((a, j) => (j === i ? v : a)))}
            onNext={() => (i + 1 < answers.length ? fields.current[i + 1]?.focus() : full && stop())}
          />
        ))}
      </div>

      <Presence>
        {stopper ? (
          <div key="stop" className="pointer-events-none absolute inset-x-0 top-3 z-[5] flex justify-center" role="status">
            <span className="bac-stamp rounded-xl border-4 border-bad bg-surface/95 px-5 py-1.5 text-2xl font-black uppercase tracking-widest text-bad shadow-xl sm:text-3xl">
              Stop ! <span className="text-base font-semibold normal-case tracking-normal text-ink">{stopper.id === selfId ? 'toi' : stopper.name}</span>
            </span>
          </div>
        ) : null}
      </Presence>
    </div>
  );
}

function Field({
  ref,
  index,
  label,
  letter,
  hidden,
  value,
  onChange,
  onNext,
}: {
  ref: (el: HTMLInputElement | null) => void;
  index: number;
  label: string;
  letter: string;
  hidden: boolean;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const box = useRef<HTMLLabelElement>(null);
  const [touched, setTouched] = useState(false);
  const ok = bacFits(value, letter);
  const wrong = touched && value.trim().length > 0 && !ok;
  return (
    <label
      ref={box}
      className={`m-rise group flex flex-col gap-1 rounded-xl border bg-surface px-3.5 py-2.5 transition-colors duration-200 focus-within:ring-4 ${
        wrong ? 'border-bad/60 focus-within:ring-bad/10' : ok ? 'border-good/50 focus-within:ring-good/10' : 'border-edge focus-within:border-ink focus-within:ring-ink/10'
      }`}
      style={{ animationDelay: `${120 + index * 50}ms` }}
    >
      <span className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {label}
        {ok ? (
          <svg key="ok" viewBox="0 0 16 16" className="bac-ok size-4" aria-label="Valide">
            <path pathLength={1} d="M3 8.5l3 3 7-7" fill="none" stroke="var(--color-good)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : wrong ? (
          <span key="ko" className="m-pop normal-case tracking-normal text-bad">
            Commence par {letter}
          </span>
        ) : null}
      </span>
      <input
        ref={ref}
        className="min-h-9 bg-transparent text-lg font-medium outline-none placeholder:text-muted/60"
        maxLength={BAC_ANSWER_MAX}
        placeholder={hidden ? '…' : `${letter}…`}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="next"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true);
          if (value.trim() && !bacFits(value, letter)) shake(box.current);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onNext();
          }
        }}
      />
    </label>
  );
}

// ---- Vote ------------------------------------------------------------------------

type Verdict = 'ok' | 'shared' | 'rejected' | 'off' | 'empty';

/** Statut d'une réponse vu par tous : vide, hors lettre, refusée à la majorité, partagée ou unique. */
function verdict(bac: BacState, voters: string[], player: string, c: number): Verdict {
  const a = bac.answers?.[player]?.[c] ?? '';
  if (!a.trim()) return 'empty';
  if (!bacFits(a, bac.letter)) return 'off';
  const others = voters.filter((v) => v !== player).length;
  const against = (bac.vetoes[vetoKey(player, c)] ?? []).filter((v) => voters.includes(v) && v !== player).length;
  if (against * 2 > others) return 'rejected';
  const same = voters.filter((id) => id !== player && bacFits(bac.answers?.[id]?.[c] ?? '', bac.letter) && bacNormalize(bac.answers![id]![c]!) === bacNormalize(a));
  return same.length ? 'shared' : 'ok';
}

function useVoters(bac: BacState): PlayerPublic[] {
  const players = useGame((s) => s.room!.players);
  return bac.players.flatMap((id) => players.find((p) => p.id === id) ?? []);
}

/** Les réponses de tous, par catégorie : un pouce en bas pour refuser celles qui ne passent pas. */
function Vote({ bac }: { bac: BacState }) {
  const selfId = useGame((s) => s.selfId)!;
  const voters = useVoters(bac);
  const ids = voters.map((p) => p.id);
  const done = bac.done.includes(selfId);
  const canVote = bac.players.includes(selfId);
  const waiting = voters.filter((p) => !bac.done.includes(p.id));

  return (
    <div className="flex h-[min(72dvh,46rem)] min-h-[26rem] flex-col">
      <header className="m-rise flex items-center gap-3 border-b border-edge px-4 py-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-2xl font-bold text-[#18181b]">{bac.letter}</span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Vote</p>
          <h2 className="font-semibold">Une réponse ne passe pas ? Refuse-la.</h2>
        </div>
      </header>
      <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-2">
        {bac.categories.map((cat, c) => (
          <article key={cat} className="m-rise rounded-xl border border-edge bg-surface" style={{ animationDelay: `${80 + c * 60}ms` }}>
            <h3 className="border-b border-edge px-3.5 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">{cat}</h3>
            <ul className="divide-y divide-edge">
              {voters.map((p) => (
                <AnswerRow key={p.id} bac={bac} player={p} c={c} self={p.id === selfId} canVote={canVote && !done} verdict={verdict(bac, ids, p.id, c)} />
              ))}
            </ul>
          </article>
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted">
          {waiting.length ? (
            <>
              On attend
              <span className="flex -space-x-1">
                {waiting.map((p) => (
                  <span key={p.id} className="m-pop m-breathe text-lg" title={p.name}>
                    {avatarOf(p.avatar)}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <>
              Décompte
              <Dots />
            </>
          )}
        </span>
        {canVote && (
          <button
            className={done ? 'btn-ghost px-5' : 'btn-primary px-5'}
            onClick={(e) => {
              bump(e.currentTarget);
              net.send({ t: 'bac', done: !done });
            }}
          >
            {done ? 'Modifier mes votes' : 'Valider mes votes'}
          </button>
        )}
      </footer>
    </div>
  );
}

const VERDICT_TAG: Partial<Record<Verdict, { text: string; cls: string }>> = {
  shared: { text: 'Doublon', cls: 'bg-info/10 text-info' },
  rejected: { text: 'Refusée', cls: 'bg-bad/10 text-bad' },
  off: { text: 'Hors lettre', cls: 'bg-edge text-muted' },
};

function AnswerRow({ bac, player, c, self, canVote, verdict: v }: { bac: BacState; player: PlayerPublic; c: number; self: boolean; canVote: boolean; verdict: Verdict }) {
  const selfId = useGame((s) => s.selfId)!;
  const answer = bac.answers?.[player.id]?.[c] ?? '';
  const against = bac.vetoes[vetoKey(player.id, c)] ?? [];
  const mine = against.includes(selfId);
  const votable = !self && (v !== 'empty' && v !== 'off');
  const tag = VERDICT_TAG[v];
  return (
    <li className="flex items-center gap-2.5 px-3.5 py-2">
      <span className="text-lg" aria-hidden title={player.name}>
        {avatarOf(player.avatar)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium transition-colors duration-300 ${v === 'rejected' || v === 'off' ? 'text-muted line-through decoration-bad/70 decoration-2' : ''} ${v === 'empty' ? 'text-muted/60 italic' : ''}`}>
          {v === 'empty' ? 'rien' : answer}
        </span>
        <span className="block truncate text-xs text-muted">{self ? 'Toi' : player.name}</span>
      </span>
      {tag && (
        <span key={v} className={`m-pop rounded-full px-2 py-0.5 text-xs font-medium ${tag.cls}`}>
          {tag.text}
        </span>
      )}
      {votable && (
        <button
          type="button"
          disabled={!canVote}
          aria-pressed={mine}
          aria-label={mine ? `Accepter « ${answer} »` : `Refuser « ${answer} »`}
          onClick={(e) => {
            bump(e.currentTarget, 1.18);
            net.send({ t: 'bac', veto: { player: player.id, category: c, against: !mine } });
          }}
          className={`flex min-h-9 items-center gap-1 rounded-lg border px-2 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-default ${
            mine ? 'border-bad/50 bg-bad/10 text-bad' : 'border-edge text-muted enabled:hover:bg-edge/50'
          }`}
        >
          <span aria-hidden>👎</span>
          {against.length > 0 && <span className="font-mono text-xs tabular-nums">{against.length}</span>}
        </button>
      )}
    </li>
  );
}

// ---- Décompte --------------------------------------------------------------------

const PIP: Record<number, string> = { 10: 'bg-accent/15 ring-accent/60', 5: 'bg-info/10 ring-info/40', 0: 'bg-edge/40 ring-edge text-muted' };
const PIP_POINTS: Record<number, string> = { 10: 'bg-accent text-[#18181b]', 5: 'bg-info text-white', 0: 'bg-edge text-muted' };

/** Le décompte : les points tombent case après case, puis le total de la manche compte. */
function Reveal({ bac }: { bac: BacState }) {
  const voters = useVoters(bac);
  const selfId = useGame((s) => s.selfId);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const last = useGame((s) => s.room!.round >= s.room!.settings.rounds);
  const endsAt = useGame((s) => s.room!.endsAt);
  const sparks = useRef<HTMLCanvasElement>(null);
  const points = bac.points ?? {};
  const total = (id: string) => (points[id] ?? []).reduce((a, b) => a + b, 0);
  const rows = [...voters].sort((a, b) => total(b.id) - total(a.id));
  const best = rows[0] && total(rows[0].id) > 0 ? rows[0].id : null;
  const cascade = 250 + bac.categories.length * 110;

  // Le meilleur de la manche a droit à ses confettis, une fois tous les points tombés.
  useEffect(() => {
    if (!best || best !== selfId) return;
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(sparks.current, 60)), cascade + 300);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [best, selfId, cascade]);

  const left = endsAt ? Math.max(0, endsAt - serverNow()) : 0;
  return (
    <div className="relative flex min-h-[26rem] flex-col">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <header className="m-rise flex items-center gap-3 border-b border-edge px-4 py-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-2xl font-bold text-[#18181b]">{bac.letter}</span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Décompte</p>
          <h2 className="font-semibold">10 points par mot unique, 5 s’il est partagé</h2>
        </div>
      </header>
      <ol className="flex-1 space-y-2 overflow-y-auto p-4">
        {rows.map((p, r) => (
          <li
            key={p.id}
            className={`m-rise flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 ${p.id === best ? 'border-accent/60 bg-accent/5' : 'border-edge bg-surface'}`}
            style={{ animationDelay: `${r * 60}ms` }}
          >
            <span className="flex min-w-0 items-center gap-2 max-sm:flex-1 sm:w-36">
              <span className="text-xl" aria-hidden>
                {avatarOf(p.avatar)}
              </span>
              <span className={`truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              {p.id === best && <span title="Meilleur de la manche">⭐</span>}
            </span>
            <span className="flex flex-1 flex-wrap gap-1.5 max-sm:order-last max-sm:basis-full">
              {bac.categories.map((cat, c) => {
                const pts = points[p.id]?.[c] ?? 0;
                const answer = bac.answers?.[p.id]?.[c]?.trim();
                return (
                  <span
                    key={cat}
                    title={cat}
                    className={`bac-pip flex h-8 max-w-40 items-center gap-1.5 rounded-lg py-1 pr-1 pl-2 text-sm ring-1 ring-inset ${PIP[pts]}`}
                    style={{ animationDelay: `${250 + c * 110}ms` }}
                  >
                    <span className={`truncate ${pts ? '' : 'line-through decoration-1'}`}>{answer || '—'}</span>
                    <span className={`grid h-6 min-w-7 place-items-center rounded-md px-1 font-mono text-xs font-bold tabular-nums ${PIP_POINTS[pts]}`}>
                      {pts ? `+${pts}` : '0'}
                    </span>
                  </span>
                );
              })}
            </span>
            <RoundTotal value={total(p.id)} delay={cascade} />
          </li>
        ))}
      </ol>
      <footer className="flex items-center justify-between gap-3 border-t border-edge px-4 py-3">
        <span className="h-1 w-32 overflow-hidden rounded-full bg-edge" aria-hidden>
          <span
            key={endsAt}
            className="block h-full origin-left rounded-full bg-ink/60"
            style={{ animation: `bac-drain ${left}ms linear forwards` }}
          />
        </span>
        {isHost ? (
          <button className="btn-primary px-5" onClick={(e) => (bump(e.currentTarget), net.send({ t: 'bac', next: true }))}>
            {last ? 'Voir le podium' : 'Manche suivante →'}
          </button>
        ) : (
          <span className="text-sm text-muted">
            {last ? 'Le podium arrive' : 'Prochaine lettre'}
            <Dots />
          </span>
        )}
      </footer>
    </div>
  );
}

function RoundTotal({ value, delay }: { value: number; delay: number }) {
  const shown = useCountUp(value, { from: 0, delay, duration: 600 });
  return <span className={`ml-auto w-14 text-right font-mono text-lg font-bold tabular-nums ${value ? 'text-good' : 'text-muted'}`}>+{shown}</span>;
}
