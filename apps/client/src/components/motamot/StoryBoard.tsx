import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { STORY_EVERY, STORY_POINTS, STORY_WORD_MAX, storyText, type PlayerPublic, type StoryState, type StoryWord } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { tick } from '../../lib/sounds';
import { canSpeak, useNarrator } from '../../lib/speech';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, shake } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import './story.css';

/** Plateau de Mot à mot : la page qui s'écrit, puis la lecture à voix haute. */
export function StoryBoard() {
  const phase = useGame((s) => s.room!.phase);
  const story = useGame((s) => s.room!.motamot);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="panel relative min-h-[32rem] overflow-hidden">
        {story && phase === 'album' ? <Reading key={story.story} s={story} /> : story ? <Writing s={story} /> : <Teaser />}
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
    <div className={`m-veil absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] ${mobile}`}>
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Derrière les réglages : une page vierge qui attend son premier mot. */
function Teaser() {
  return (
    <div className="grid min-h-[32rem] place-items-center p-6 max-sm:hidden">
      <p className="font-script text-6xl text-accent/70">Il était une fois…</p>
    </div>
  );
}

/** Horloge serveur rafraîchie régulièrement (compte à rebours, tic-tac). */
function useNow(ms = 250) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const usePlayers = () => {
  const players = useGame((s) => s.room!.players);
  return useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

// ---- Écriture ---------------------------------------------------------------------

function Writing({ s }: { s: StoryState }) {
  const selfId = useGame((st) => st.selfId);
  const endsAt = useGame((st) => st.room!.endsAt);
  const typing = useGame((st) => (st.storyTyping?.by === s.turn ? st.storyTyping.text : ''));
  const players = usePlayers();
  const now = useNow();
  const mine = s.turn !== null && s.turn === selfId;
  const [draft, setDraft] = useState('');
  const page = useRef<HTMLDivElement>(null);
  const countdown = s.turn === null && endsAt && now < endsAt ? Math.ceil((endsAt - now) / 1000) : 0;
  const last = s.words.at(-1);

  // Nouveau mot : la page défile jusqu'en bas.
  useEffect(() => {
    const el = page.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [s.words.length, typing, draft]);

  // Les deux dernières secondes de son propre tour, ça tique.
  const left = endsAt ? Math.ceil((endsAt - now) / 1000) : 0;
  useEffect(() => {
    if (mine && left > 0 && left <= 2) tick(left === 1);
  }, [mine, left]);

  // Tour à tour, où en est-on avant que ce soit à moi ?
  const inTurns = selfId && s.turn && !mine ? (s.order.indexOf(selfId) - s.order.indexOf(s.turn) + s.order.length) % s.order.length : 0;
  const ghost = mine ? draft : typing;

  return (
    <div className="flex flex-col gap-4 px-3 pb-5 pt-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Histoire {s.story}/{s.stories}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="relative h-1.5 w-32 overflow-hidden rounded-full bg-edge sm:w-44" aria-hidden>
              <span className="absolute inset-0 origin-left rounded-full bg-accent transition-transform duration-500" style={{ transform: `scaleX(${s.written / s.length})` }} />
            </span>
            <span className="font-mono text-xs tabular-nums text-muted">
              {s.written}/{s.length} mots
            </span>
          </div>
        </div>
        <Seats s={s} players={players} selfId={selfId} />
      </header>

      <RuleZone s={s} mine={mine} />

      <div className="relative">
        <div ref={page} className="st-page max-h-[min(44dvh,22rem)] min-h-[10.4rem] overflow-y-auto rounded-2xl px-4 text-xl font-medium sm:px-6 sm:text-2xl" aria-live="polite">
          {s.words.map((w, i) => (
            <Word key={i} w={w} />
          ))}
          {s.turn && (
            <span className={`whitespace-nowrap ${ghost ? 'text-ink/45' : ''}`}>
              {ghost}
              <span className="st-caret" aria-hidden />
            </span>
          )}
        </div>
        {countdown > 0 && (
          <span key={countdown} className="st-count pointer-events-none absolute inset-0 grid place-items-center font-mono text-7xl font-bold text-accent" role="status">
            {countdown}
          </span>
        )}
      </div>

      {s.turn && endsAt && <Fuse key={`${s.written}:${s.turn}`} endsAt={endsAt} />}

      {s.turn && selfId && s.order.includes(selfId) ? (
        <>
          {!mine && (
            <p className="text-center text-sm text-muted">
              <b className="text-ink">{players.get(s.turn)?.name ?? '…'}</b> écrit
              <span className="m-dots" aria-hidden>
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
              {inTurns > 0 && <span className="ml-1">· à toi dans {plural(inTurns, 'mot')}</span>}
            </p>
          )}
          {/* Toujours là pendant l'histoire : au téléphone le clavier reste ouvert d'un tour à l'autre. */}
          <WordInput s={s} mine={mine} selfId={selfId} draft={draft} setDraft={setDraft} />
        </>
      ) : s.turn ? (
        <p className="text-center text-sm text-muted">
          <b className="text-ink">{players.get(s.turn)?.name ?? '…'}</b> écrit
          <span className="m-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
          {inTurns > 0 && <span className="ml-1">· à toi dans {plural(inTurns, 'mot')}</span>}
        </p>
      ) : (
        <p className="text-center text-sm text-muted">
          {s.order[0] === selfId ? 'Tu commences : prépare ton premier mot !' : `${players.get(s.order[0] ?? '')?.name ?? '…'} commence.`}
        </p>
      )}
      {last?.by === selfId && last.ok === true && (
        <p key={s.written} className="m-float-up pointer-events-none text-center text-sm font-semibold text-good">
          Contrainte tenue · +{STORY_POINTS.rule}
        </p>
      )}
    </div>
  );
}

/** Un mot de la page : l'amorce en retrait, les contraintes soulignées d'or. */
function Word({ w }: { w: StoryWord }) {
  const cls = !w.by ? 'text-muted' : w.late ? 'st-late' : w.rule ? `st-ruled ${w.ok ? 'st-ok' : ''} ${w.ok === false ? 'st-vetoed' : ''}` : '';
  return (
    <>
      <span className={`st-word ${cls}`} title={w.rule ? w.rule.text : undefined}>
        {w.text}
      </span>{' '}
    </>
  );
}

/** Les joueurs dans l'ordre de passage ; celui qui écrit porte l'anneau or. */
function Seats({ s, players, selfId }: { s: StoryState; players: Map<string, PlayerPublic>; selfId: string | null }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Ordre de passage">
      {s.order.map((id) => {
        const p = players.get(id);
        if (!p) return null;
        const on = s.turn === id;
        return (
          <li
            key={id}
            className={`flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2.5 text-sm transition-[background-color,border-color,transform] duration-300 ${
              on ? 'st-turn -translate-y-0.5 border-gold bg-butter text-cacao' : 'border-edge text-muted'
            }`}
            aria-current={on ? 'step' : undefined}
          >
            <span className="grid size-7 place-items-center rounded-full bg-surface text-lg" aria-hidden>
              {avatarOf(p.avatar)}
            </span>
            <span className={`max-w-24 truncate ${id === selfId ? 'font-semibold' : ''}`}>{id === selfId ? 'Toi' : p.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** La contrainte tombe au bout de son fil ; sinon, des points disent quand la prochaine arrive. */
function RuleZone({ s, mine }: { s: StoryState; mine: boolean }) {
  const tag = useRef<HTMLDivElement>(null);
  return (
    <div className="flex min-h-[5.5rem] items-end justify-center pt-6">
      {s.rule && s.turn ? (
        <div
          key={s.written}
          ref={tag}
          className="st-tag relative rounded-2xl bg-gold px-5 py-2.5 text-center text-cacao shadow-[0_16px_30px_-16px_rgb(43_26_18/0.7)]"
          role="status"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">{mine ? 'Contrainte pour toi' : 'Contrainte'}</p>
          <p className="text-lg font-bold tracking-[-0.01em] sm:text-xl">{s.rule.text}</p>
          {s.rule.jury && <p className="text-[11px] opacity-70">Les autres peuvent te recaler</p>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-xs text-muted">
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: STORY_EVERY }, (_, i) => {
              const done = i < STORY_EVERY - 1 - s.nextRule;
              const target = i === STORY_EVERY - 1;
              return (
                <span
                  key={i}
                  className={`size-2 rounded-full transition-[background-color,transform] duration-300 ${target ? 'bg-gold/40 ring-2 ring-gold/50' : done ? 'scale-110 bg-accent' : 'bg-edge'}`}
                />
              );
            })}
          </span>
          <span>{!s.turn ? 'Une contrainte tous les 6 mots' : s.written === s.length - 1 ? 'Dernier mot : finis l’histoire en beauté !' : `Contrainte dans ${plural(s.nextRule, 'mot')}`}</span>
        </div>
      )}
    </div>
  );
}

/** La mèche du tour : elle se consume pendant le temps restant (rattrapé à l'arrivée). */
function Fuse({ endsAt }: { endsAt: number }) {
  const [left] = useState(() => Math.max(0.2, (endsAt - serverNow()) / 1000));
  return (
    <div className="relative mx-auto h-2 w-full max-w-xl rounded-full bg-edge" aria-hidden>
      <span className="st-fuse absolute inset-0 rounded-full" style={{ '--d': `${left}s` } as CSSProperties}>
        <i />
        <b />
      </span>
    </div>
  );
}

const PUNCT = [',', '.', '!', '?'];

/** Saisie du mot : Espace ou Entrée valide, les boutons collent une ponctuation et valident. */
function WordInput({ s, mine, selfId, draft, setDraft }: { s: StoryState; mine: boolean; selfId: string; draft: string; setDraft: (v: string) => void }) {
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => () => setDraft(''), []);
  // Mon tour : le champ s'anime et ce que j'avais préparé part aussitôt chez les autres.
  useEffect(() => {
    if (!mine) return;
    field.current?.focus({ preventScroll: true });
    bump(form.current, 1.03);
    if (draft) net.send({ t: 'motamot', typing: draft });
  }, [mine, s.written]);
  // Mon mot est posé : le champ se vide pour préparer le suivant.
  useEffect(() => {
    if (s.words.at(-1)?.by === selfId) setDraft('');
  }, [s.written]);

  const type = (value: string) => {
    const v = value.replace(/\s+/g, '').slice(0, STORY_WORD_MAX);
    setDraft(v);
    if (mine) net.send({ t: 'motamot', typing: v });
  };
  const submit = (suffix = '') => {
    if (!mine) return shake(field.current);
    const word = (draft + suffix).trim();
    if (!/[\p{L}\p{N}]/u.test(word)) return shake(field.current);
    net.send({ t: 'motamot', word });
  };

  return (
    <form
      ref={form}
      className="m-rise mx-auto flex w-full max-w-xl flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-center text-sm">
        {mine ? (
          <>
            <b>À toi !</b> <span className="text-muted">{s.rule ? s.rule.text : 'Un mot, vite'}</span>
          </>
        ) : (
          <span className="text-muted">Prépare ton prochain mot, il partira à ton tour.</span>
        )}
      </p>
      {/* Téléphone : le clavier peut cacher la page ; la fin de la phrase reste sous les yeux. */}
      <p className="truncate text-center text-base italic text-muted sm:hidden" aria-hidden>
        … {s.words.slice(-3).map((w) => w.text).join(' ')}
      </p>
      <div className="flex gap-2">
        <input
          ref={field}
          aria-label="Ton mot"
          className="input text-lg"
          maxLength={STORY_WORD_MAX}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder={mine ? 'Ton mot…' : 'Prépare ton mot…'}
          value={draft}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault();
              submit();
            }
          }}
          onChange={(e) => type(e.target.value)}
        />
        <button className="btn-primary shrink-0 transition-opacity" disabled={!mine}>
          Poser
        </button>
      </div>
      <div className="flex justify-center gap-1.5" role="group" aria-label="Ponctuation">
        {PUNCT.map((p) => (
          <button
            key={p}
            type="button"
            disabled={!mine}
            className="grid size-11 place-items-center rounded-lg border border-edge font-mono text-lg font-bold transition enabled:hover:-translate-y-0.5 enabled:hover:border-accent active:scale-95 disabled:opacity-40"
            onClick={(e) => {
              bump(e.currentTarget);
              submit(p);
            }}
            aria-label={`Poser le mot suivi de « ${p} »`}
          >
            {p}
          </button>
        ))}
      </div>
    </form>
  );
}

// ---- Lecture ----------------------------------------------------------------------

function Reading({ s }: { s: StoryState }) {
  const selfId = useGame((st) => st.selfId);
  const players = usePlayers();
  const narrator = useNarrator();
  const [said, setSaid] = useState(-1);
  const sparks = useRef<HTMLCanvasElement>(null);
  const lastStory = s.story >= s.stories;
  const ready = selfId ? s.ready.includes(selfId) : false;
  const present = s.order.filter((id) => players.has(id));
  const mineStar = selfId ? s.stars[selfId] : undefined;

  const read = () => {
    const lead = `Histoire numéro ${s.story}. `;
    narrator.say([{ text: lead + storyText(s.words), track: { from: lead.length, onWord: setSaid } }]);
  };

  // L'histoire est lue dès qu'elle s'affiche, mot surligné après mot ; rallumer la voix relit.
  useEffect(() => {
    setSaid(-1);
    const t = setTimeout(read, reducedMotion() ? 0 : 700);
    return () => clearTimeout(t);
  }, [narrator.on]);

  useEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(sparks.current, 50)), 400);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);

  const counts = new Map<number, number>();
  for (const i of Object.values(s.stars)) counts.set(i, (counts.get(i) ?? 0) + 1);
  const ruled = s.words.map((w, i) => ({ w, i })).filter(({ w }) => w.rule && w.by);

  return (
    <div className="relative flex flex-col gap-4 px-3 pb-5 pt-4 sm:px-6">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <header className="m-rise flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Lecture · histoire {s.story}/{s.stories}
          </p>
          <h2 className="font-script text-4xl leading-tight text-accent sm:text-5xl">L'histoire est finie !</h2>
        </div>
        {canSpeak && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={(e) => (bump(e.currentTarget), read())} disabled={!narrator.on}>
              ↻ <span className="max-sm:hidden">Réécouter</span>
            </button>
            <VoiceToggle on={narrator.on} speaking={narrator.speaking} onToggle={() => narrator.toggle()} />
          </div>
        )}
      </header>

      <p className="st-page rounded-2xl px-4 py-1 text-xl font-medium sm:px-6 sm:text-2xl">
        {s.words.map((w, i) => {
          const votable = !!w.by && w.by !== selfId && !w.late;
          const n = counts.get(i) ?? 0;
          return (
            <span key={i}>
              <button
                type="button"
                disabled={!votable}
                onClick={(e) => {
                  bump(e.currentTarget, 1.15);
                  net.send({ t: 'motamot', star: i });
                }}
                className={`st-word st-read relative disabled:cursor-default ${!w.by ? 'text-muted' : ''} ${w.late ? 'st-late' : ''} ${w.rule ? 'st-ruled' : ''} ${
                  i === said ? 'is-said' : ''
                } ${mineStar === i ? 'is-starred' : ''}`}
                style={{ animationDelay: `${Math.min(i * 40, 1600)}ms` }}
                aria-label={votable ? `${w.text} : donner mon étoile` : w.text}
                aria-pressed={votable ? mineStar === i : undefined}
              >
                {w.text}
                {n > 0 && (
                  <span key={n} className="st-star" aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>
                    ⭐{n > 1 ? n : ''}
                  </span>
                )}
                {mineStar === i && (
                  <span className="st-rays pointer-events-none absolute inset-0" aria-hidden>
                    {Array.from({ length: 8 }, (_, k) => (
                      <i key={k} style={{ '--a': `${k * 45}deg` } as CSSProperties} />
                    ))}
                  </span>
                )}
              </button>{' '}
            </span>
          );
        })}
      </p>
      <p className="-mt-2 text-center text-xs text-muted">Touche ton mot préféré (pas le tien) : +{STORY_POINTS.star} pour son auteur.</p>

      {ruled.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {ruled.map(({ w, i }, k) => (
            <RuleCard key={i} w={w} index={i} author={players.get(w.by!)} selfId={selfId} judges={present.length - 1} delay={300 + k * 80} />
          ))}
        </ul>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-3">
        <span className="text-sm text-muted">
          {s.ready.length}/{present.length} prêt{s.ready.length > 1 ? 's' : ''}
        </span>
        <button
          className="btn-primary px-5"
          disabled={ready}
          onClick={(e) => {
            bump(e.currentTarget);
            net.send({ t: 'motamot', ready: true });
          }}
        >
          {ready ? 'On attend les autres…' : lastStory ? 'Voir le classement' : 'Histoire suivante →'}
        </button>
      </footer>
    </div>
  );
}

/** Une contrainte de l'histoire : tenue, ratée, ou au jugement des autres. */
function RuleCard({ w, index, author, selfId, judges, delay }: { w: StoryWord; index: number; author?: PlayerPublic; selfId: string | null; judges: number; delay: number }) {
  const jury = w.ok === null;
  const vetoed = selfId ? w.vetoes.includes(selfId) : false;
  const need = Math.max(1, Math.ceil(judges / 2));
  const out = jury && w.vetoes.length >= need;
  return (
    <li className="m-pop flex items-center gap-3 rounded-xl border border-edge bg-surface px-3 py-2 text-sm" style={{ animationDelay: `${delay}ms` }}>
      <span className="text-xl" aria-hidden>
        {author ? avatarOf(author.avatar) : '?'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted">{w.rule!.text}</p>
        <p className="truncate font-semibold">
          « {w.text} » <span className="font-normal text-muted">· {author?.name ?? '?'}</span>
        </p>
      </div>
      {!jury ? (
        <span key={String(w.ok)} className={`w-stamp shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${w.ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>
          {w.ok ? `✓ +${STORY_POINTS.rule}` : '✗ raté'}
        </span>
      ) : w.by === selfId ? (
        <span className={`shrink-0 text-xs font-semibold ${out ? 'text-bad' : 'text-muted'}`}>{out ? 'Recalé !' : `${w.vetoes.length}/${need} contre`}</span>
      ) : (
        <button
          type="button"
          aria-pressed={vetoed}
          onClick={(e) => {
            shake(e.currentTarget);
            net.send({ t: 'motamot', veto: index });
          }}
          className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${vetoed ? 'border-bad bg-bad text-white' : 'border-edge hover:border-bad hover:text-bad'}`}
        >
          {vetoed ? '👎 Recalé' : 'Recaler ?'}
        </button>
      )}
    </li>
  );
}

/** Voix de la lecture : haut-parleur doré, ondes qui battent quand ça parle. */
function VoiceToggle({ on, speaking, onToggle }: { on: boolean; speaking: boolean; onToggle: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={btn}
      type="button"
      onClick={() => (bump(btn.current), onToggle())}
      aria-pressed={on}
      aria-label={on ? 'Couper la lecture à voix haute' : 'Lire l’histoire à voix haute'}
      className={`tel-voice relative flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-300 ${on ? 'border-gold/60 bg-gold/15 text-accent' : 'border-edge text-muted hover:text-ink'} ${on && speaking ? 'is-speaking' : ''}`}
    >
      <svg viewBox="0 0 24 24" className="size-5 overflow-visible" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" fill="currentColor" fillOpacity=".15" />
        <path className="tel-wave tel-wave-1" d="M15.5 9.2a4 4 0 0 1 0 5.6" />
        <path className="tel-wave tel-wave-2" d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8" />
        <path className="tel-mute" d="M16 9l6 6M22 9l-6 6" />
      </svg>
      <span className="max-sm:hidden">{on ? 'Voix' : 'Muet'}</span>
    </button>
  );
}

// ---- Fin de partie ----------------------------------------------------------------

/** Le classement, puis le recueil des histoires de la partie. */
function Finale() {
  const ranking = useGame((st) => st.ranking);
  const s = useGame((st) => st.room!.motamot);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 500);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  if (!ranking) return null;
  const [winner] = ranking;

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-30 size-full" aria-hidden />
      <p className="text-sm text-muted">Plume d'or</p>
      <p className="m-pop mt-1 text-6xl" style={{ animationDelay: '100ms' }} aria-hidden>
        {winner ? avatarOf(winner.avatar) : '🪶'}
      </p>
      <h2 className="m-pop text-3xl font-semibold tracking-[-0.03em]" style={{ animationDelay: '160ms' }}>
        {winner?.name ?? 'Personne'}
      </h2>
      <ul className="panel mx-auto mt-5 max-w-sm divide-y divide-edge text-left text-sm">
        {ranking.map((p, i) => (
          <li key={p.id} className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${300 + i * 70}ms` }}>
            <span className="w-5 font-mono text-muted">{i + 1}</span>
            <span aria-hidden>{avatarOf(p.avatar)}</span>
            <b className="min-w-0 flex-1 truncate">{p.name}</b>
            <span className="text-xs text-muted">{plural(s?.kept[p.id] ?? 0, 'contrainte')}</span>
            <span className="w-12 text-right font-mono tabular-nums">{p.score}</span>
          </li>
        ))}
      </ul>
      {s && s.tales.length > 0 && (
        <div className="mt-5 text-left">
          <p className="mb-2 text-center font-script text-3xl text-accent">Le recueil</p>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {s.tales.map((tale, i) => (
              <p
                key={i}
                className="st-leaf rounded-xl bg-butter/50 px-3 py-2 text-[15px] leading-relaxed dark:bg-cacao-2/40"
                style={{ animationDelay: `${600 + i * 120}ms`, '--r': `${i % 2 ? 2 : -2}deg` } as CSSProperties}
              >
                <b className="mr-1 text-accent">{i + 1}.</b>
                {storyText(tale)}
              </p>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
