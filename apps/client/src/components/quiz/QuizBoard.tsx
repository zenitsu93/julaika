import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { QUIZ_READ_MS, quizVerdict, type PlayerPublic, type QuizRound, type QuizState } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { preloadSamples, sample } from '../../lib/samples';
import { serverNow, store, useGame } from '../../lib/store';
import { bump, confetti, Presence, shake, Ticker, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import './quiz.css';

const LETTERS = ['A', 'B', 'C', 'D'];
/** Verrouille une réponse : un « tok » de bois tout de suite, sans attendre le serveur. */
function pick(index: number) {
  if ((store.get().room?.quiz?.mine ?? null) !== null) return;
  void sample('quiz-bois');
  net.send({ t: 'quiz', pick: index });
}

/** Ce que dit la machine pendant que l'IA écrit les questions, une ligne après l'autre. */
const PREP_LINES = ['On fouille les archives…', 'On vérifie les bonnes réponses…', 'On glisse quelques pièges…', 'On mélange les propositions…', 'Presque prêt…'];

/** Plateau du quiz : le classement en direct, puis la machine à questions, les questions et le podium. */
export function QuizBoard() {
  const phase = useGame((s) => s.room!.phase);
  useEffect(() => preloadSamples('quiz-harpe', 'quiz-cartes', 'quiz-bois', 'quiz-coeur', 'quiz-bravo', 'quiz-rate', 'quiz-podium'), []);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <ScoreBar />
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' ? (
          <Teaser />
        ) : phase === 'prep' ? (
          <Machine />
        ) : phase === 'gameEnd' ? (
          <Podium />
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

/** Une horloge qui se rafraîchit tant que `active` est vrai (pour les secondes affichées). */
function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    setNow(serverNow());
    const t = setInterval(() => setNow(serverNow()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

/** Derrière les réglages : les quatre lettres qui tournent autour du point d'interrogation. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center opacity-40 max-sm:hidden" aria-hidden>
      <Orbit />
    </div>
  );
}

/** Le disque doré au point d'interrogation, et ses quatre lettres en orbite. */
function Orbit({ small = false }: { small?: boolean }) {
  const size = small ? 'size-24' : 'size-28';
  return (
    <div className={`relative grid place-items-center ${small ? 'size-56' : 'size-64'}`} style={{ '--q-r': small ? '6.5rem' : '7.5rem' } as CSSProperties}>
      <span className={`q-ping absolute ${size} rounded-full border-2 border-gold/60`} />
      <span className={`q-ping absolute ${size} rounded-full border-2 border-gold/40`} style={{ animationDelay: '1.2s' }} />
      {LETTERS.map((l, i) => (
        <span key={l} className="q-orbit absolute" style={{ animationDelay: `${-i * 2.25}s` }}>
          <span className="grid size-10 place-items-center rounded-xl border border-edge bg-surface font-mono text-sm font-bold shadow-md">{l}</span>
        </span>
      ))}
      <span className={`relative grid ${size} place-items-center rounded-full p-[3px]`}>
        <span className="q-core absolute inset-0 rounded-full" />
        <span className="relative grid size-full place-items-center rounded-full bg-cacao text-5xl font-bold text-butter shadow-inner">
          <span className="q-think inline-block">?</span>
        </span>
      </span>
    </div>
  );
}

/** Préparation : la machine tourne pendant que l'IA écrit les questions sur le thème. */
function Machine() {
  const q = useGame((s) => s.room!.quiz);
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine((n) => Math.min(n + 1, PREP_LINES.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  const ready = Boolean(q?.source);
  const themes = q?.themes ?? [];

  return (
    <div className="m-fade flex min-h-[28rem] flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <Orbit small />
      <div className="flex flex-col items-center">
        <p className="m-rise text-xs uppercase tracking-[0.2em] text-muted">{ready ? 'C’est prêt' : 'L’IA écrit tes questions'}</p>
        <h2 className="mt-1 flex flex-wrap justify-center gap-x-3 leading-none">
          {themes.map((t, i) => (
            <span key={t} className="m-pop flex items-center gap-x-3 font-script text-5xl text-accent sm:text-6xl" style={{ animationDelay: `${120 + i * 120}ms` }}>
              {i > 0 && <span className="font-sans text-2xl text-muted">·</span>}
              {t}
            </span>
          ))}
        </h2>
      </div>
      <p key={ready ? 'ok' : line} className={`m-rise text-sm font-medium ${ready ? 'text-good' : 'q-shine'}`} role="status">
        {ready ? (q?.source === 'ia' ? `✓ ${q.total} questions sur mesure` : `✓ ${q?.total} questions de la réserve`) : PREP_LINES[line]}
      </p>
    </div>
  );
}

/** Classement en direct : les puces se réordonnent à chaque révélation, les points s'envolent. */
function ScoreBar() {
  const players = useGame((s) => s.room!.players);
  const q = useGame((s) => s.room!.quiz);
  const phase = useGame((s) => s.room!.phase);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const playing = phase !== 'lobby';
  const ordered = playing ? [...players].sort((a, b) => b.score - a.score) : players;
  useFlip(list, [ordered.map((p) => p.id).join()]);
  const answered = new Set(phase === 'answer' ? (q?.answered ?? []) : []);
  const gains = phase === 'reveal' ? (q?.reveal?.gains ?? {}) : {};

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Classement">
        {ordered.map((p, i) => {
          const streak = q?.streaks[p.id] ?? 0;
          const done = answered.has(p.id);
          const gain = gains[p.id];
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${
                playing && i === 0 && p.score > 0 ? 'border-gold bg-gold/15' : done ? 'border-good/50 bg-good/10' : 'border-edge bg-surface'
              }`}
            >
              {playing && <span className="font-mono text-[11px] text-muted">{i + 1}</span>}
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              {playing && (
                <span className="font-mono text-xs tabular-nums opacity-70">
                  <Ticker value={p.score} />
                </span>
              )}
              {streak >= 2 && (
                <span className="m-pop text-xs font-semibold text-warn" title={`${streak} bonnes réponses d’affilée`}>
                  <span className="q-flame">🔥</span>
                  {streak}
                </span>
              )}
              {done && (
                <span className="m-pop text-good" title="A répondu">
                  ✓
                </span>
              )}
              {gain ? (
                <span key={`${q?.index}-${p.id}`} className="q-gain pointer-events-none absolute -top-3 left-1/2 rounded-full bg-gold px-1.5 font-mono text-[11px] font-bold text-cacao" aria-hidden>
                  +{gain}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {q && q.total > 0 && <Progress q={q} />}
    </div>
  );
}

/** Une pastille par question : dorée si la plupart ont trouvé, la question en cours respire. */
function Progress({ q }: { q: QuizState }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Question ${q.index} sur ${q.total}`}>
      {Array.from({ length: q.total }, (_, i) => {
        const done = q.history[i];
        const current = !done && i === q.index - 1;
        const ratio = done && done.total ? done.right / done.total : 0;
        return (
          <span
            key={i}
            className={`size-2 rounded-full transition-all duration-500 ${
              done ? `m-pop ${ratio >= 0.5 ? 'bg-gold' : ratio > 0 ? 'bg-gold/50' : 'bg-bad/30'}` : current ? 'm-breathe scale-125 bg-ink' : 'bg-edge'
            }`}
          />
        );
      })}
    </span>
  );
}

/** La question : lecture, réponses, puis révélation. */
function Stage() {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const q = room.quiz;
  const phase = room.phase;
  const reveal = phase === 'reveal' ? (q?.reveal ?? null) : null;

  // Une harpe qui monte quand la nouvelle question se pose.
  useEffect(() => {
    if (phase === 'answer' && q?.openAt && q.openAt > serverNow()) void sample('quiz-harpe');
  }, [q?.index]);

  // Les réponses s'ouvrent après la lecture : un rendu pile à ce moment-là, et quatre cartes posées sur le tapis.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (phase !== 'answer' || !q?.openAt) return setOpen(phase === 'reveal');
    const wait = q.openAt - serverNow();
    setOpen(wait <= 0);
    if (wait <= 0) return;
    const t = setTimeout(() => {
      setOpen(true);
      void sample('quiz-cartes');
    }, wait);
    return () => clearTimeout(t);
  }, [phase, q?.index, q?.openAt]);

  // Ton résultat : confettis et petite fanfare si tu as trouvé, secousse et cordes qui tombent sinon.
  const box = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!reveal || !selfId) return;
    if (reveal.gains[selfId]) {
      void sample('quiz-bravo');
      return confetti(sparks.current, reveal.fastest === selfId ? 120 : 70);
    }
    void sample('quiz-rate', { gain: reveal.picks[selfId] !== undefined ? 1 : 0.7 });
    if (reveal.picks[selfId] !== undefined) shake(box.current);
  }, [Boolean(reveal), q?.index]);

  // Touches 1 à 4 (ou A à D) pour répondre sans la souris.
  useEffect(() => {
    if (phase !== 'answer' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target instanceof HTMLElement && e.target.closest('input, textarea')) || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      const i = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (i >= 0) pick(i);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [phase, open]);

  if (!q?.question) return null;
  const key = `${q.index}`;

  return (
    <div ref={box} className="relative flex min-h-[28rem] flex-col items-center gap-5 px-4 pb-6 pt-6 sm:px-8">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      {phase === 'answer' && <TopLine openAt={q.openAt} endsAt={room.endsAt} turnKey={key} />}

      <div className="flex w-full max-w-2xl items-center justify-between gap-3">
        <span key={`t${key}`} className="m-pop rounded-full bg-cacao px-2.5 py-1 text-xs font-semibold text-butter">
          {q.question.theme}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted">
          Question {q.index}/{q.total}
        </span>
        <Countdown phase={phase} openAt={q.openAt} endsAt={room.endsAt} turnKey={key} />
      </div>

      <h2 key={`q${key}`} className="max-w-2xl text-center text-2xl font-semibold leading-tight tracking-[-0.03em] text-balance sm:text-3xl">
        {q.question.text.split(' ').map((w, i) => (
          <span key={i} className="w-word" style={{ animationDelay: `${80 + i * 45}ms` }}>
            {w}&nbsp;
          </span>
        ))}
      </h2>

      {open ? (
        <div className="grid w-full max-w-2xl gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Réponses">
          {q.question.options.map((option, i) => (
            <Option key={`${key}-${i}`} index={i} text={option} q={q} reveal={reveal} selfId={selfId} />
          ))}
        </div>
      ) : (
        <Reading turnKey={key} openAt={q.openAt} />
      )}

      {reveal ? <Outcome q={q} selfId={selfId} /> : open ? <Waiting q={q} total={room.players.length} /> : null}
    </div>
  );
}

/** Fine barre en haut du plateau : elle se remplit pendant la lecture, puis se vide sur le temps de réponse. */
function TopLine({ openAt, endsAt, turnKey }: { openAt: number | null; endsAt: number | null; turnKey: string }) {
  if (!openAt || !endsAt) return null;
  const now = serverNow();
  const read = Math.max(0, openAt - now);
  const answer = Math.max(0, endsAt - Math.max(now, openAt));
  return (
    <span className="absolute inset-x-0 top-0 h-1 bg-edge/60" aria-hidden>
      {read > 0 && <span key={`r${turnKey}`} className="q-fill absolute inset-0 bg-butter" style={{ animationDuration: `${read}ms` }} />}
      <span key={`a${turnKey}`} className="q-deplete absolute inset-0 bg-gold" style={{ animationDuration: `${answer}ms`, animationDelay: `${read}ms` }} />
    </span>
  );
}

/** Anneau du compte à rebours, avec les secondes au centre. */
function Countdown({ phase, openAt, endsAt, turnKey }: { phase: string; openAt: number | null; endsAt: number | null; turnKey: string }) {
  const now = useNow(phase === 'answer');
  const ref = useRef<HTMLSpanElement>(null);
  const left = phase === 'answer' && endsAt ? Math.max(0, Math.ceil((endsAt - Math.max(now, openAt ?? now)) / 1000)) : 0;
  const urgent = phase === 'answer' && left <= 5 && left > 0 && now >= (openAt ?? 0);
  // Les cinq dernières secondes : un cœur qui bat, un peu plus fort et plus vite à chaque fois.
  useEffect(() => {
    if (!urgent) return;
    bump(ref.current, 1.15);
    const heat = (5 - left) / 4;
    void sample('quiz-coeur', { gain: 0.55 + 0.45 * heat, rate: 1 + 0.1 * heat });
  }, [urgent && left]);
  const start = openAt ?? now;
  const read = Math.max(0, start - serverNow());
  const duration = endsAt ? Math.max(0, endsAt - Math.max(serverNow(), start)) : 0;

  return (
    <span ref={ref} className="relative grid size-11 place-items-center" aria-label={phase === 'answer' ? `${left} secondes` : 'Temps écoulé'}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="19" fill="none" className="stroke-edge" strokeWidth="4" />
        {phase === 'answer' && (
          <circle
            key={turnKey}
            cx="22"
            cy="22"
            r="19"
            fill="none"
            pathLength={100}
            strokeDasharray="100"
            strokeLinecap="round"
            strokeWidth="4"
            className={`q-ring transition-colors ${urgent ? 'stroke-bad' : 'stroke-gold'}`}
            style={{ animationDuration: `${duration}ms`, animationDelay: `${read}ms` }}
          />
        )}
      </svg>
      <span className={`font-mono text-sm font-bold tabular-nums ${urgent ? 'text-bad' : ''}`}>{phase === 'answer' ? <Ticker value={left} /> : '0'}</span>
    </span>
  );
}

/** Pendant la lecture : quatre cartes vides qui scintillent, et la barre « lis bien ». */
function Reading({ turnKey, openAt }: { turnKey: string; openAt: number | null }) {
  const wait = openAt ? Math.max(0, openAt - serverNow()) : QUIZ_READ_MS;
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <div className="grid w-full gap-2.5 sm:grid-cols-2" aria-hidden>
        {LETTERS.map((l, i) => (
          <span key={l} className="m-shimmer m-rise relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl border border-dashed border-edge px-3.5" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="grid size-8 place-items-center rounded-lg bg-edge/60 font-mono text-sm font-bold text-muted">{l}</span>
          </span>
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        Lis bien la question…
        <span className="relative h-1 w-24 overflow-hidden rounded-full bg-edge">
          <span key={turnKey} className="q-fill absolute inset-0 rounded-full bg-gold" style={{ animationDuration: `${wait}ms` }} />
        </span>
      </p>
    </div>
  );
}

/** Lumière qui suit le pointeur sur la carte. */
function glow(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--qx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--qy', `${e.clientY - r.top}px`);
}

function Option({ index, text, q, reveal, selfId }: { index: number; text: string; q: QuizState; reveal: QuizState['reveal']; selfId: string | null }) {
  const players = useGame((s) => s.room!.players);
  const btn = useRef<HTMLButtonElement>(null);
  const chosen = q.mine === index;
  const locked = q.mine !== null;
  const right = reveal?.answer === index;
  const voters = reveal ? players.filter((p) => reveal.picks[p.id] === index) : [];
  const share = reveal && players.length ? voters.length / players.length : 0;

  const tone = reveal
    ? right
      ? 'q-win border-gold bg-gold text-cacao'
      : chosen
        ? 'border-bad/60 bg-bad/10'
        : 'border-edge bg-surface opacity-55'
    : chosen
      ? 'q-beam border-gold bg-gold/10'
      : locked
        ? 'border-edge bg-surface opacity-50'
        : 'border-edge bg-surface enabled:hover:-translate-y-0.5 enabled:hover:border-ink/40';

  return (
    <div className="flex flex-col gap-1.5">
      <button
        ref={btn}
        type="button"
        role="radio"
        aria-checked={chosen}
        disabled={Boolean(reveal) || locked}
        onPointerMove={glow}
        onClick={() => {
          bump(btn.current, 1.03);
          pick(index);
        }}
        className={`q-option q-fan ${index % 2 ? 'q-fan-r' : ''} relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-[transform,border-color,background-color,opacity] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-default ${tone}`}
        style={{ animationDelay: reveal ? '0ms' : `${index * 70}ms` }}
      >
        {/* Part des joueurs qui ont choisi cette réponse, en fond de carte. */}
        {reveal && share > 0 && (
          <span
            className={`q-bar absolute inset-y-0 left-0 ${right ? 'bg-butter/45' : 'bg-edge/70'}`}
            style={{ width: `${share * 100}%`, animationDelay: `${200 + index * 80}ms` }}
            aria-hidden
          />
        )}
        <span
          className={`relative grid size-8 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold transition-colors ${
            right ? 'bg-cacao text-gold' : chosen ? 'bg-gold text-cacao' : 'bg-edge/60 text-muted'
          }`}
        >
          {LETTERS[index]}
        </span>
        <span className="relative min-w-0 flex-1 text-[15px] font-medium leading-snug">{text}</span>
        {reveal ? (
          <span className="relative font-mono text-xs font-bold tabular-nums opacity-80">{Math.round(share * 100)} %</span>
        ) : chosen ? (
          <span className="m-pop relative shrink-0 text-xs font-semibold text-accent" aria-hidden>
            🔒
          </span>
        ) : null}
      </button>
      {voters.length > 0 && (
        <span className="flex flex-wrap gap-1 px-1" aria-label={`Choisi par ${voters.map((p) => p.name).join(', ')}`}>
          {voters.map((p, j) => (
            <span
              key={p.id}
              title={p.name}
              className={`m-drop grid size-7 place-items-center rounded-full border text-base ${right ? 'border-gold bg-gold/15' : 'border-edge bg-surface'} ${p.id === selfId ? 'ring-2 ring-ink' : ''}`}
              style={{ animationDelay: `${350 + index * 80 + j * 60}ms` }}
            >
              {avatarOf(p.avatar)}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Après sa réponse : qui a déjà répondu, en attendant les autres. */
function Waiting({ q, total }: { q: QuizState; total: number }) {
  const players = useGame((s) => s.room!.players);
  const done = players.filter((p) => q.answered.includes(p.id));
  return (
    <div className="m-rise flex flex-col items-center gap-2 text-center text-sm text-muted" style={{ animationDelay: '300ms' }}>
      <p>{q.mine === null ? <>Le plus rapide marque le plus. <span className="max-sm:hidden">Touches 1 à 4.</span></> : <><b className="text-ink">Réponse verrouillée.</b> On attend les autres…</>}</p>
      <div className="flex items-center gap-2">
        <span className="flex -space-x-1.5">
          {done.map((p) => (
            <span key={p.id} title={p.name} className="m-pop grid size-6 place-items-center rounded-full border-2 border-surface bg-edge text-xs">
              {avatarOf(p.avatar)}
            </span>
          ))}
        </span>
        <span className="tabular-nums">
          <Ticker value={done.length} />/{total} ont répondu
        </span>
      </div>
    </div>
  );
}

/** Révélation : ton tampon de points, la série, le plus rapide, et l'anecdote qui monte. */
function Outcome({ q, selfId }: { q: QuizState; selfId: string | null }) {
  const players = useGame((s) => s.room!.players);
  const r = q.reveal!;
  const gain = selfId ? (r.gains[selfId] ?? 0) : 0;
  const shown = useCountUp(gain, { from: 0, delay: 500, duration: 700 });
  const streak = selfId ? (r.streaks[selfId] ?? 0) : 0;
  const mine = selfId ? r.picks[selfId] : undefined;
  const fastest = players.find((p) => p.id === r.fastest);
  const line = gain ? (streak >= 3 ? 'Inarrêtable !' : 'Bonne réponse !') : mine === undefined ? 'Pas de réponse cette fois.' : 'Raté…';

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="w-stamp flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-lg ring-1 ring-edge" style={{ animationDelay: '450ms' }} role="status">
          <span className={`grid h-8 min-w-12 place-items-center rounded-full px-2 font-mono text-sm font-bold tabular-nums ${gain ? 'bg-gold text-cacao' : 'bg-edge/60 text-muted'}`}>+{shown}</span>
          <span className="font-semibold">{line}</span>
          {streak >= 2 && (
            <span className="text-sm font-semibold text-warn">
              <span className="q-flame">🔥</span> ×{streak}
            </span>
          )}
        </span>
        {fastest && (
          <span className="m-pop rounded-full border border-gold/50 px-3 py-1.5 text-sm" style={{ animationDelay: '700ms' }}>
            ⚡ Le plus rapide : <b>{fastest.id === selfId ? 'toi' : fastest.name}</b>
          </span>
        )}
      </div>
      {r.explain && (
        <p className="m-rise max-w-xl rounded-xl border border-edge bg-page/60 px-4 py-2.5 text-center text-sm leading-snug" style={{ animationDelay: '850ms' }}>
          <span className="mr-1.5 font-script text-xl text-accent">Le saviez-vous ?</span>
          {r.explain}
        </p>
      )}
    </div>
  );
}

/** Fin de partie : le podium qui monte, la couronne qui tombe, puis le bilan des questions. */
function Podium() {
  const q = useGame((s) => s.room!.quiz);
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const right = q?.history.reduce((n, r) => n + r.right, 0) ?? 0;
  const total = q?.history.reduce((n, r) => n + r.total, 0) ?? 0;
  const percent = useCountUp(total ? Math.round((100 * right) / total) : 0, { from: 0, delay: 1500, duration: 900 });
  const verdict = quizVerdict(right, total);
  const champion = ranking[0];

  // Roulement de timbales et fanfare : le coup de cymbale tombe avec les confettis.
  useEffect(() => {
    void sample('quiz-podium');
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current, 140)), 1300);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  if (!q || !champion) return null;

  // Ordre du podium : 2e, 1er, 3e ; les marches montent du plus bas au plus haut.
  const steps = [ranking[1], ranking[0], ranking[2]];
  const heights = ['h-24', 'h-36', 'h-16'];
  const delays = [350, 700, 0];

  return (
    <div className="m-fade mx-auto flex w-full max-w-xl flex-col items-center px-4 py-8 text-center">
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-20 size-full" aria-hidden />
      <p className="m-rise text-sm text-muted">{q.themes.join(' · ')}</p>
      <h2 className="mb-6 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
        <span className="accroche text-5xl text-accent sm:text-6xl">et la couronne revient à</span>
        <span className="q-shine m-pop inline-block" style={{ animationDelay: '1200ms' }}>
          {champion.id === selfId ? 'Toi !' : champion.name}
        </span>
      </h2>

      <div className="mb-6 grid w-full max-w-sm grid-cols-3 items-end gap-2">
        {steps.map((p, i) =>
          p ? (
            <PodiumStep key={p.id} player={p} place={i === 1 ? 1 : i === 0 ? 2 : 3} height={heights[i]!} delay={delays[i]!} self={p.id === selfId} />
          ) : (
            <span key={i} />
          ),
        )}
      </div>

      <p className="text-sm text-muted">Bonnes réponses du groupe</p>
      <p className="font-mono text-4xl font-bold tabular-nums">
        {percent}
        <span className="text-lg text-muted"> %</span>
      </p>
      <h3 className="m-pop mt-1 text-xl font-semibold tracking-[-0.02em]" style={{ animationDelay: '1700ms' }}>
        {verdict.title}
      </h3>
      <p className="m-rise mb-4 text-sm text-muted" style={{ animationDelay: '1800ms' }}>
        {verdict.line}
      </p>

      {ranking.length > 3 && (
        <ol className="panel mb-3 w-full max-w-sm divide-y divide-edge text-left text-sm" start={4}>
          {ranking.slice(3).map((p, i) => (
            <li key={p.id} className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${1900 + i * 60}ms` }}>
              <span className="w-5 font-mono text-xs text-muted">{i + 4}</span>
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="font-mono tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>
      )}
      <ul className="panel w-full max-w-sm divide-y divide-edge text-left text-sm">
        {q.history.map((r, i) => (
          <RoundLine key={i} round={r} index={i} />
        ))}
      </ul>
    </div>
  );
}

function PodiumStep({ player, place, height, delay, self }: { player: PlayerPublic; place: 1 | 2 | 3; height: string; delay: number; self: boolean }) {
  const score = useCountUp(player.score, { from: 0, delay: delay + 500, duration: 800 });
  const tone = place === 1 ? 'bg-gold text-cacao' : place === 2 ? 'bg-cacao-2 text-butter' : 'bg-cacao text-butter';
  return (
    <div className="flex flex-col items-center gap-1.5">
      {place === 1 && (
        <span className="q-crown text-2xl" style={{ animationDelay: '1100ms' }} aria-label="Champion">
          👑
        </span>
      )}
      <span className={`m-drop grid size-12 place-items-center rounded-full border-2 bg-surface text-2xl ${place === 1 ? 'border-gold' : 'border-edge'} ${self ? 'ring-2 ring-ink' : ''}`} style={{ animationDelay: `${delay + 450}ms` }}>
        {avatarOf(player.avatar)}
      </span>
      <span className="m-rise max-w-full truncate text-sm font-semibold" style={{ animationDelay: `${delay + 500}ms` }}>
        {self ? 'Toi' : player.name}
      </span>
      <span className={`q-step flex w-full flex-col items-center justify-start rounded-t-xl pt-2 ${height} ${tone}`} style={{ animationDelay: `${delay}ms` }}>
        <span className="font-mono text-2xl font-bold">{place}</span>
        <span className="font-mono text-xs tabular-nums opacity-80">{score}</span>
      </span>
    </div>
  );
}

function RoundLine({ round, index }: { round: QuizRound; index: number }) {
  const full = round.total > 0 && round.right === round.total;
  return (
    <li className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${2000 + index * 50}ms` }}>
      <span className="w-5 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{round.text}</b>
        <span className="block truncate text-xs text-muted">
          {round.theme} · « {round.answer} »
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${full ? 'bg-gold text-cacao' : round.right ? 'bg-gold/25' : 'bg-edge/60 text-muted'}`}>
        {round.right}/{round.total}
      </span>
    </li>
  );
}
