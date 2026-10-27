import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import {
  AGENTS_COUNT_MAX,
  AGENTS_DUO_TOTAL,
  AGENTS_TEAM_NAME,
  agentsClueError,
  otherTeam,
  type AgentsCard,
  type AgentsColor,
  type AgentsState,
  type AgentsTeam,
  type PlayerPublic,
} from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { play } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, shake, Ticker, useCountUp, useIndicator } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { AgentGlyph } from './AgentGlyph';
import './agents.css';

const send = (msg: { clue: string; count: number } | { point: number } | { guess: number } | { pass: true }) => net.send({ t: 'agents', ...msg });

/** Rôle du joueur sur ce tour : il donne l'indice, il retourne les cartes, ou il regarde. */
function roleOf(a: AgentsState, selfId: string | null): 'clue' | 'guess' | 'watch' {
  if (!selfId || !a.myTeam) return 'watch';
  if (a.mode === 'duo') return a.myTeam === a.turn ? 'clue' : 'guess';
  if (a.myTeam !== a.turn) return 'watch';
  return a.spies[a.turn] === selfId ? 'clue' : 'guess';
}

/** Plateau d'Agents secrets : les équipes, l'indice, la grille de 25 mots. */
export function AgentsBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
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

/** Derrière les réglages : une grille dont les cartes se retournent sur des agents. */
function Teaser() {
  const tones = ['or', 'neutre', 'cacao', 'or', 'neutre', 'cacao', 'neutre', 'or', 'assassin', 'cacao', 'neutre', 'or', 'cacao', 'neutre', 'or'];
  return (
    <div className="grid h-full min-h-[26rem] place-items-center p-6 opacity-40 max-sm:hidden" aria-hidden>
      <div className="grid grid-cols-5 gap-2">
        {tones.map((t, i) => (
          <span key={i} className={`ag-teaser ag-face-${t} grid h-12 w-20 place-items-center rounded-lg`} style={{ animationDelay: `${((i * 7) % 15) * 180}ms` }}>
            <AgentGlyph className="h-7" />
          </span>
        ))}
      </div>
    </div>
  );
}

function Stage() {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const a = room.agents;
  const box = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);

  // Fin de grille : confettis pour les gagnants, éclair noir et secousse pour l'assassin.
  const result = a?.result ?? null;
  useEffect(() => {
    if (!a || !result) return;
    const won = result.winner === 'duo' || (result.winner !== null && result.winner === a.myTeam);
    if (result.reason === 'assassin') {
      play('boum');
      shake(box.current);
      flash.current?.classList.remove('ag-flash');
      void flash.current?.offsetWidth;
      flash.current?.classList.add('ag-flash');
    } else play(won ? 'bravo' : 'trombone');
    if (won) return confetti(sparks.current, 120);
  }, [result?.winner, result?.reason, a?.grid]);

  if (!a) return null;
  const role = roleOf(a, selfId);

  return (
    <div ref={box} className="relative flex min-h-[26rem] flex-col gap-3 px-2 pb-4 pt-3 sm:px-5">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <div ref={flash} className="pointer-events-none absolute inset-0 z-[4] bg-[#120b08] opacity-0" aria-hidden />
      {(room.phase === 'clue' || room.phase === 'guess') && <TimeBar endsAt={room.endsAt} turnKey={`${a.grid}-${a.history.length}-${room.phase}`} />}
      {a.mode === 'duo' ? <DuoBar a={a} /> : <TeamsBar a={a} />}
      <TurnSweep a={a} phase={room.phase} />
      <ClueZone a={a} phase={room.phase} role={role} />
      <Grid a={a} phase={room.phase} role={role} selfId={selfId} />
      <History a={a} />
    </div>
  );
}

/** Une fine barre qui se vide sur le temps restant. */
function TimeBar({ endsAt, turnKey }: { endsAt: number | null; turnKey: string }) {
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - serverNow());
  return (
    <span className="absolute inset-x-0 top-0 h-1 bg-edge/60" aria-hidden>
      <span key={turnKey + endsAt} className="ag-deplete block h-full bg-accent" style={{ animationDuration: `${left}ms` }} />
    </span>
  );
}

function Avatars({ ids, players, spy, selfId }: { ids: string[]; players: PlayerPublic[]; spy?: string | null; selfId: string | null }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const p = players.find((x) => x.id === id);
        if (!p) return null;
        return (
          <span key={id} title={`${p.name}${id === spy ? ' (espion)' : ''}`} className={`m-pop relative grid size-8 place-items-center rounded-full bg-surface text-base ring-1 ring-edge ${id === selfId ? 'ring-2 ring-ink' : ''}`}>
            {avatarOf(p.avatar)}
            {id === spy && (
              <span className="ag-hat absolute -right-1.5 -top-2 grid size-5 place-items-center rounded-full bg-ink text-page" aria-label="espion">
                <AgentGlyph className="h-3" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Les deux équipes ; un liseré glisse vers celle qui a la main. */
function TeamsBar({ a }: { a: AgentsState }) {
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const turn = useIndicator(a.result ? -1 : a.turn === 'or' ? 0 : 1);
  return (
    <div ref={turn.container} className="relative grid grid-cols-2 gap-2">
      <span ref={turn.indicator} className="m-indicator ag-turn rounded-xl" aria-hidden />
      {(['or', 'cacao'] as const).map((t) => (
        <div key={t} data-slot className={`ag-team ag-team-${t} relative flex items-center gap-2 rounded-xl px-2.5 py-2 sm:px-3`}>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
              Équipe {AGENTS_TEAM_NAME[t]}
              {a.myTeam === t && <span className="rounded-full bg-page/70 px-1.5 text-[10px] normal-case tracking-normal text-ink">toi</span>}
            </span>
            <Avatars ids={a.teams[t]} players={players} spy={a.spies[t]} selfId={selfId} />
          </span>
          <span className="flex flex-col items-end leading-none">
            <span className="font-mono text-3xl font-bold tabular-nums">
              <Ticker value={a.left[t]} />
            </span>
            <span className="text-[10px] opacity-75">agents</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Duo : les deux côtés, les tours restants en pastilles, les agents trouvés. */
function DuoBar({ a }: { a: AgentsState }) {
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const found = AGENTS_DUO_TOTAL - countLeftDuo(a);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-edge bg-page/60 px-3 py-2">
      <span className="flex items-center gap-2">
        <Avatars ids={a.teams.or} players={players} selfId={selfId} />
        <span className="text-lg text-accent" aria-hidden>
          ⇄
        </span>
        <Avatars ids={a.teams.cacao} players={players} selfId={selfId} />
      </span>
      <span className="flex items-center gap-1" aria-label={`${a.tokens} tours restants`}>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`ag-token size-3 rounded-full transition-all duration-500 ${i < (a.tokens ?? 0) ? 'bg-accent' : 'scale-75 bg-edge'}`} />
        ))}
        <span className="ml-1 text-xs text-muted">tours</span>
      </span>
      <span className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold tabular-nums">
          <Ticker value={found} />
        </span>
        <span className="text-sm text-muted">/ {AGENTS_DUO_TOTAL} agents</span>
      </span>
    </div>
  );
}

/** Agents qu'il reste à trouver en duo, sans compter deux fois ceux communs aux deux clés. */
function countLeftDuo(a: AgentsState): number {
  return a.cards.filter((c) => c.revealed !== 'or').length - (25 - AGENTS_DUO_TOTAL);
}

/** À chaque changement de main, un bandeau traverse le plateau. */
function TurnSweep({ a, phase }: { a: AgentsState; phase: string }) {
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.room!.players);
  const [shown, setShown] = useState<string | null>(null);
  const key = phase === 'clue' ? `${a.grid}-${a.turn}-${a.history.length}` : null;
  useLayoutEffect(() => {
    if (!key || reducedMotion()) return;
    let text: string;
    if (a.mode === 'duo') {
      const givers = a.teams[a.turn];
      text = givers.includes(selfId ?? '') ? 'À toi de donner un indice' : `Indice de ${givers.map((id) => players.find((p) => p.id === id)?.name ?? '?').join(' et ')}`;
    } else text = `Au tour de l'équipe ${AGENTS_TEAM_NAME[a.turn]}`;
    setShown(text);
    const t = setTimeout(() => setShown(null), 1500);
    return () => clearTimeout(t);
  }, [key]);
  if (!shown) return null;
  return (
    <div className={`ag-sweep ag-face-${a.mode === 'duo' ? 'or' : a.turn} pointer-events-none absolute inset-x-0 top-1/3 z-[6] py-3 text-center text-xl font-semibold tracking-[-0.02em] sm:text-2xl`} role="status">
      {shown}
    </div>
  );
}

/** L'indice en cours, le formulaire de l'espion, ou le résultat de la grille. */
function ClueZone({ a, phase, role }: { a: AgentsState; phase: string; role: 'clue' | 'guess' | 'watch' }) {
  const players = useGame((s) => s.room!.players);
  const name = (id: string | null) => players.find((p) => p.id === id)?.name ?? '?';

  if (phase === 'reveal' && a.result) return <Outcome a={a} name={name} />;
  if (phase === 'clue') {
    if (role === 'clue') return <ClueForm a={a} />;
    const givers = a.mode === 'duo' ? a.teams[a.turn] : [a.spies[a.turn]];
    return (
      <p className="m-rise flex min-h-14 items-center justify-center gap-2 text-center text-muted">
        <AgentGlyph className="ag-think h-5 text-accent" />
        <span>
          <b className="text-ink">{givers.map(name).join(' ou ')}</b> cherche un indice
          <span className="m-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
      </p>
    );
  }
  if (!a.clue) return null;
  const left = a.guessesLeft;
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <span key={a.history.length} className="ag-dossier w-stamp flex items-center gap-3 rounded-xl px-4 py-2">
        <span className="text-xs uppercase tracking-[0.16em] opacity-70">Indice</span>
        <span className="text-2xl font-bold tracking-[-0.02em]">
          {a.clue.word.split('').map((ch, i) => (
            <span key={i} className="m-letter" style={{ animationDelay: `${150 + i * 35}ms` }}>
              {ch}
            </span>
          ))}
        </span>
        <span className="grid size-9 place-items-center rounded-full bg-accent font-mono text-lg font-bold text-[#18181b]">{a.clue.count}</span>
      </span>
      <span className="text-sm text-muted">
        {role === 'guess' ? (
          left !== null ? (
            <>
              Encore <b className="text-ink"><Ticker value={left} /></b> essai{left > 1 ? 's' : ''}
            </>
          ) : (
            <>Retournez autant de cartes que vous voulez.</>
          )
        ) : role === 'clue' ? (
          a.mode === 'duo' ? 'À l’autre de chercher…' : 'Tes coéquipiers cherchent…'
        ) : (
          `L'équipe ${AGENTS_TEAM_NAME[a.turn]} cherche…`
        )}
      </span>
      {role === 'guess' && (
        <button
          type="button"
          className="btn text-muted hover:text-ink disabled:opacity-40"
          disabled={a.clue.found === 0}
          title="Il faut retourner au moins une carte"
          onClick={(e) => {
            bump(e.currentTarget);
            send({ pass: true });
          }}
        >
          Passer la main
        </button>
      )}
    </div>
  );
}

/** Formulaire de l'espion : un mot, un nombre (une pastille glisse vers le nombre choisi). */
function ClueForm({ a }: { a: AgentsState }) {
  const [word, setWord] = useState('');
  const [count, setCount] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const counter = useIndicator(count - 1);
  const mine = a.key ? a.key.filter((c, i) => c === (a.mode === 'duo' ? 'or' : a.turn) && a.cards[i]?.revealed === null).length : 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = agentsClueError(word, a.cards);
    if (err) {
      setError(err);
      shake(form.current);
      return;
    }
    send({ clue: word, count });
  };

  return (
    <form ref={form} onSubmit={submit} className="m-rise mx-auto flex w-full max-w-2xl flex-col items-center gap-2">
      <p className="text-sm text-muted">
        Tu vois la clé : relie le plus d'agents <span className={`ag-chip ag-face-${a.mode === 'duo' ? 'or' : a.turn}`}>{a.mode === 'duo' ? 'dorés' : AGENTS_TEAM_NAME[a.turn]}</span> en un seul mot ({mine} à trouver).
      </p>
      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <input
          className="input min-w-0 flex-1 basis-40 text-lg font-semibold"
          placeholder="Ton indice (un seul mot)"
          maxLength={24}
          autoFocus
          value={word}
          onChange={(e) => {
            setWord(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
        />
        <div ref={counter.container} role="group" aria-label="Nombre de cartes" className="relative flex rounded-md border border-edge p-0.5">
          <span ref={counter.indicator} className="m-indicator rounded bg-primary" />
          {Array.from({ length: AGENTS_COUNT_MAX }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              data-slot
              aria-pressed={n === count}
              onClick={() => setCount(n)}
              className={`relative w-7 rounded py-1.5 font-mono text-sm font-bold transition-colors sm:w-8 ${n === count ? 'text-on-primary' : 'text-muted hover:text-ink'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button type="submit" className="btn-primary">
          Transmettre
        </button>
      </div>
      {error && (
        <p className="m-pop text-sm font-medium text-bad" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Lumière qui suit le pointeur sur la carte. */
function glow(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--gx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--gy', `${e.clientY - r.top}px`);
}

function Grid({ a, phase, role, selfId }: { a: AgentsState; phase: string; role: 'clue' | 'guess' | 'watch'; selfId: string | null }) {
  const players = useGame((s) => s.room!.players);
  const canPlay = phase === 'guess' && role === 'guess';
  // Ce que chacun voit : la clé de fin de grille (celle de l'équipe qui jouait en duo), sinon la sienne.
  const key = a.keys ? (a.mode === 'duo' ? null : a.keys.or) : a.key;
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5" role="grid" aria-label="Grille des agents">
      {a.cards.map((card, i) => (
        <Card
          key={`${a.grid}-${i}`}
          index={i}
          card={card}
          tint={key?.[i] ?? null}
          duoKeys={a.mode === 'duo' ? a.keys : null}
          canPlay={canPlay && !card.revealed && !(a.mode === 'duo' && card.neutral.includes(a.turn))}
          pointers={Object.entries(a.pointers)
            .filter(([, c]) => c === i)
            .map(([id]) => players.find((p) => p.id === id))
            .filter((p): p is PlayerPublic => Boolean(p))}
          mine={selfId !== null && a.pointers[selfId] === i}
          delay={(i % 5) * 40 + Math.floor(i / 5) * 40}
        />
      ))}
    </div>
  );
}

function Card({
  index,
  card,
  tint,
  duoKeys,
  canPlay,
  pointers,
  mine,
  delay,
}: {
  index: number;
  card: AgentsCard;
  tint: AgentsColor | null;
  duoKeys: Record<AgentsTeam, AgentsColor[]> | null;
  canPlay: boolean;
  pointers: PlayerPublic[];
  mine: boolean;
  delay: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const revealed = card.revealed;

  // Une carte retournée : petit son selon ce qu'elle cachait.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (revealed === 'or' || revealed === 'cacao') play('ding');
  }, [revealed]);
  const neutrals = card.neutral.length;
  useEffect(() => {
    if (neutrals) {
      play('boing');
      shake(el.current);
    }
  }, [neutrals]);

  // Fin de grille en duo : la case prend la couleur la plus parlante des deux clés.
  const endTint: AgentsColor | null = duoKeys
    ? duoKeys.or[index] === 'assassin' || duoKeys.cacao[index] === 'assassin'
      ? 'assassin'
      : duoKeys.or[index] === 'or' || duoKeys.cacao[index] === 'or'
        ? 'or'
        : 'neutre'
    : null;
  const shownTint = revealed ? null : (endTint ?? tint);

  const style = { animationDelay: `${delay}ms` } as CSSProperties;
  return (
    <div
      ref={el}
      role="gridcell"
      className={`ag-cell m-rise relative ${mine ? 'ag-mine' : ''}`}
      style={style}
    >
      <button
        type="button"
        disabled={!canPlay}
        onPointerMove={glow}
        onClick={(e) => {
          bump(e.currentTarget, 1.04);
          send({ point: mine ? -1 : index });
        }}
        aria-label={`${card.word}${revealed ? ` : ${revealed}` : ''}`}
        className={`ag-card ${revealed ? `ag-flip ag-face-${revealed}` : shownTint ? `ag-tint-${shownTint}` : ''} relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-lg border px-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-info sm:aspect-[16/10] sm:rounded-xl`}
      >
        {revealed && <AgentGlyph kind={revealed} className="ag-glyph absolute inset-x-0 top-1 mx-auto h-[55%] opacity-80" />}
        <span className={`relative z-[1] w-full break-words font-semibold leading-tight ${revealed ? 'mt-auto pb-1 text-[9px] sm:text-xs' : 'text-[10px] uppercase tracking-[0.02em] sm:text-sm'}`} lang="fr" style={{ hyphens: 'auto' }}>
          {card.word}
        </span>
        {!revealed && shownTint === 'assassin' && (
          <span className="absolute right-1 top-0.5 text-[10px] sm:text-xs" aria-hidden>
            ✕
          </span>
        )}
        {neutrals > 0 && !revealed && (
          <span className="absolute left-1 top-1 flex gap-0.5" aria-label="passant">
            {card.neutral.map((side) => (
              <span key={side} className={`ag-pass ag-face-${side} m-pop block size-2 rounded-full sm:size-2.5`} title={`Passant pour le côté ${AGENTS_TEAM_NAME[side]}`} />
            ))}
          </span>
        )}
      </button>
      {pointers.length > 0 && (
        <span className="pointer-events-none absolute -bottom-1.5 right-0.5 z-[2] flex -space-x-1.5">
          {pointers.map((p) => (
            <span key={p.id} title={p.name} className="m-drop grid size-5 place-items-center rounded-full border border-edge bg-surface text-xs shadow sm:size-6 sm:text-sm">
              {avatarOf(p.avatar)}
            </span>
          ))}
        </span>
      )}
      {mine && canPlay && (
        <button
          type="button"
          className="ag-go m-pop absolute inset-x-1 -top-2.5 z-[3] mx-auto w-max rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-page shadow-lg sm:-top-3 sm:px-3 sm:text-xs"
          onClick={(e) => {
            bump(e.currentTarget, 1.1);
            send({ guess: index });
          }}
        >
          Démasquer
        </button>
      )}
    </div>
  );
}

/** Les indices de la grille, du plus ancien au plus récent. */
function History({ a }: { a: AgentsState }) {
  if (!a.history.length) return null;
  return (
    <ol className="flex flex-wrap justify-center gap-1.5 text-xs" aria-label="Indices donnés">
      {a.history.map((c, i) => (
        <li key={i} className={`m-pop flex items-center gap-1 rounded-full border px-2 py-0.5 ag-hist-${a.mode === 'duo' ? 'duo' : c.team}`}>
          <b>{c.word}</b>
          <span className="font-mono opacity-70">{c.count}</span>
          <span className="font-mono text-good">{c.found ? `✓${c.found}` : ''}</span>
        </li>
      ))}
    </ol>
  );
}

/** Fin de grille : le verdict tamponné. */
function Outcome({ a, name }: { a: AgentsState; name: (id: string | null) => string }) {
  const r = a.result!;
  let title: string;
  let line: string;
  if (a.mode === 'duo') {
    title = r.winner === 'duo' ? 'Mission accomplie !' : 'Mission échouée';
    line = r.winner === 'duo' ? `${AGENTS_DUO_TOTAL} agents démasqués avec ${a.tokens} tour${(a.tokens ?? 0) > 1 ? 's' : ''} d'avance.` : r.reason === 'assassin' ? `${name(r.by)} a réveillé un assassin…` : 'Plus de tours : les agents restants s’échappent.';
  } else {
    title = r.winner && r.winner !== 'duo' ? `L'équipe ${AGENTS_TEAM_NAME[r.winner]} gagne !` : 'Égalité';
    line = r.reason === 'assassin' ? `${name(r.by)} a réveillé l’assassin : l'équipe ${AGENTS_TEAM_NAME[otherTeam(r.winner as AgentsTeam)]} perd.` : r.reason === 'equipe' ? 'L’autre équipe n’a plus assez de joueurs.' : 'Tous ses agents sont démasqués.';
  }
  return (
    <div className="flex min-h-14 flex-col items-center gap-1 text-center">
      <span className={`ag-verdict w-stamp rounded-xl px-5 py-2 text-2xl font-bold tracking-[-0.03em] ${r.reason === 'assassin' && a.mode === 'duo' ? 'ag-face-assassin' : `ag-face-${r.winner === 'duo' ? 'or' : (r.winner ?? 'neutre')}`}`} role="status">
        {title}
      </span>
      <span className="m-rise text-sm text-muted" style={{ animationDelay: '300ms' }}>
        {line} Toutes les clés sont dévoilées.
      </span>
    </div>
  );
}

/** Fin de partie : les grilles gagnées, puis le classement. */
function Finale() {
  const a = useGame((s) => s.room!.agents);
  const players = useGame((s) => s.room!.players);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ranking = [...players].sort((x, y) => y.score - x.score);
  const wins = (t: AgentsTeam | 'duo') => a?.record.filter((w) => w === t).length ?? 0;
  useEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 700);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  if (!a) return null;
  return (
    <>
      <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-20 size-full" aria-hidden />
      <AgentGlyph className="m-pop mx-auto mb-2 h-14 text-accent" />
      {a.mode === 'duo' ? (
        <>
          <p className="text-sm text-muted">Missions réussies</p>
          <p className="font-mono text-5xl font-bold tabular-nums">
            {wins('duo')}
            <span className="text-xl text-muted"> / {a.record.length}</span>
          </p>
        </>
      ) : (
        <div className="mb-1 flex items-center justify-center gap-4">
          {(['or', 'cacao'] as const).map((t) => (
            <span key={t} className={`ag-face-${t} m-pop flex flex-col rounded-xl px-5 py-2`}>
              <span className="text-xs uppercase tracking-[0.14em]">{AGENTS_TEAM_NAME[t]}</span>
              <span className="font-mono text-4xl font-bold">{wins(t)}</span>
            </span>
          ))}
        </div>
      )}
      <ol className="panel mx-auto mt-4 max-w-sm divide-y divide-edge text-left text-sm">
        {ranking.map((p, i) => (
          <li key={p.id} className="m-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${300 + i * 70}ms` }}>
            <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
            <span aria-hidden>{avatarOf(p.avatar)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            <Score value={p.score} delay={400 + i * 70} />
          </li>
        ))}
      </ol>
    </>
  );
}

function Score({ value, delay }: { value: number; delay: number }) {
  const shown = useCountUp(value, { from: 0, delay, duration: 700 });
  return <span className="font-mono tabular-nums">{shown}</span>;
}
