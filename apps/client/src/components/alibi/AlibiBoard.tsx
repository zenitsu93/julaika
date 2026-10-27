import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  ALIBI_EXHIBIT,
  ALIBI_NOTE_MAX,
  ALIBI_PENALTY,
  ALIBI_PLOT,
  ALIBI_STATEMENT_MAX,
  ALIBI_THRESHOLD,
  type AlibiObjection,
  type AlibiState,
  type PlayerPublic,
} from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { useCall } from '../../lib/call';
import { net } from '../../lib/net';
import { play, tick } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, shake, Ticker, useCountUp } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import './alibi.css';

const OBJECTION: Record<AlibiObjection, { label: string; key: string; emoji: string }> = {
  contradiction: { label: 'Contradiction !', key: 'C', emoji: '⚡' },
  hesitation: { label: 'Hésitation !', key: 'H', emoji: '😶' },
};

/** Plateau de L'Alibi : le dossier, la barre des accusés et la visio dessous. */
export function AlibiBoard() {
  const phase = useGame((s) => s.room!.phase);
  const a = useGame((s) => s.room!.alibi);
  const panel = useRef<HTMLDivElement>(null);
  useHuisClos(a, phase);
  useObjectionKeys(a, phase);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {a && <Cast a={a} />}
      <div ref={panel} className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' || !a ? (
          <Teaser />
        ) : phase === 'plot' ? (
          <Plot key={a.case} a={a} />
        ) : phase === 'trial' ? (
          <Trial a={a} panel={panel} />
        ) : phase === 'vote' ? (
          <Vote key={a.case} a={a} />
        ) : phase === 'verdict' ? (
          <Verdict key={a.case} a={a} />
        ) : null}
        <Presence>
          {phase === 'lobby' ? (
            <div key="lobby" className="m-veil absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none">
              <div className="m-card w-full max-w-lg text-center">
                <Lobby />
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <CallBar />
    </section>
  );
}

// ---- Outils -------------------------------------------------------------------------

function usePlayer(id: string | undefined): PlayerPublic | undefined {
  return useGame((s) => s.room!.players.find((p) => p.id === id));
}

function useName() {
  const selfId = useGame((s) => s.selfId);
  return (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');
}

function useSeconds(endsAt: number | null): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

/** Écrit `--left` (de 1 à 0) sur l'élément à chaque image : les jauges de temps restent fluides. */
function useTimeLeft(endsAt: number | null, total: number) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !endsAt) return;
    let raf = 0;
    const loop = () => {
      el.style.setProperty('--left', String(Math.max(0, Math.min(1, (endsAt - serverNow()) / (total * 1000)))));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [endsAt, total]);
  return ref;
}

/** L'accusation tapée à la machine, lettre à lettre (d'un coup en mouvement réduit). */
function useTypewriter(text: string, speed = 28) {
  const [n, setN] = useState(() => (reducedMotion() ? text.length : 0));
  useEffect(() => {
    if (reducedMotion()) return setN(text.length);
    setN(0);
    const id = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(id), k) : k + 1)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return text.slice(0, n);
}

/**
 * Huis clos : pendant la concertation, ceux qui ne sont pas complices n'entendent plus les
 * complices dans la visio (leurs pistes audio reçues sont coupées ici, puis rouvertes).
 */
function useHuisClos(a: AlibiState | null, phase: string) {
  const selfId = useGame((s) => s.selfId);
  const { remotes } = useCall();
  const closed = Boolean(a && phase === 'plot' && !a.suspects.includes(selfId ?? ''));
  const pair = a?.suspects.join() ?? '';
  useEffect(() => {
    if (!closed) return;
    const tracks = pair.split(',').flatMap((id) => remotes[id]?.getAudioTracks() ?? []);
    for (const t of tracks) t.enabled = false;
    return () => {
      for (const t of tracks) t.enabled = true;
    };
  }, [closed, pair, remotes]);
}

/** Le juge buzze au clavier : C pour Contradiction, H pour Hésitation. */
function useObjectionKeys(a: AlibiState | null, phase: string) {
  const selfId = useGame((s) => s.selfId);
  const judge = a?.judgeId === selfId;
  useEffect(() => {
    if (!judge || phase !== 'trial') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.repeat || e.ctrlKey || e.metaKey || t.closest('input, textarea, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'c') net.send({ t: 'alibi', object: 'contradiction' });
      else if (k === 'h') net.send({ t: 'alibi', object: 'hesitation' });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [judge, phase]);
}

// ---- Petites pièces ----------------------------------------------------------------

/** La distribution : le juge, les deux complices, le jury ; une pastille par affaire. */
function Cast({ a }: { a: AlibiState }) {
  const judge = usePlayer(a.judgeId);
  const s1 = usePlayer(a.suspects[0]);
  const s2 = usePlayer(a.suspects[1]);
  const name = useName();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span key={a.case} className="m-rise flex flex-wrap items-center justify-center gap-2">
        <Chip tone="judge">⚖️ {name(judge)}</Chip>
        <span className="font-mono text-xs text-muted">juge</span>
        <Chip tone="suspect">
          {avatarOf(s1?.avatar ?? 0)} {name(s1)} & {avatarOf(s2?.avatar ?? 0)} {name(s2)}
        </Chip>
        {a.jury.length > 0 && <span className="font-mono text-xs text-muted">· jury de {a.jury.length}</span>}
      </span>
      <span className="flex items-center gap-1" aria-label={`Affaire ${a.case + 1} sur ${a.cases}`}>
        {Array.from({ length: a.cases }, (_, i) => (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${i < a.case ? 'm-pop bg-accent' : i === a.case ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`}
          />
        ))}
      </span>
    </div>
  );
}

function Chip({ tone, children }: { tone: 'judge' | 'suspect'; children: ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-1 font-medium ${tone === 'judge' ? 'border-edge bg-surface' : 'border-accent/60 bg-accent/15'}`}>{children}</span>;
}

/** Photo d'identité judiciaire : la caméra (ou l'avatar) devant la toise. */
function Mug({ id, label, hot = false, small = false }: { id: string; label: string; hot?: boolean; small?: boolean }) {
  const player = usePlayer(id);
  const selfId = useGame((s) => s.selfId);
  const view = useCall();
  const self = id === selfId;
  const stream = self ? view.local : (view.remotes[id] ?? null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream]);
  const cam = Boolean(player?.cam && stream);
  return (
    <figure className={`al-mug relative m-0 aspect-[4/3] overflow-hidden rounded-xl border-2 ${hot ? 'al-hot border-gold' : 'border-edge'}`}>
      {/* Le son passe déjà par la visio : la vidéo ici reste muette. */}
      <video ref={video} autoPlay playsInline muted className={`relative size-full object-cover ${self ? '-scale-x-100' : ''} ${cam ? '' : 'invisible'}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className={`m-breathe ${small ? 'text-4xl' : 'text-6xl sm:text-7xl'}`}>{avatarOf(player?.avatar ?? 0)}</span>
        </span>
      )}
      <figcaption className="absolute inset-x-2 bottom-2 flex">
        <span className="al-plate truncate rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider">
          {self ? 'Toi' : (player?.name ?? '…')} · {label}
        </span>
      </figcaption>
    </figure>
  );
}

/** Derrière les réglages : le marteau qui attend son heure. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <Gavel className="al-teaser w-48 text-ink/40" />
    </div>
  );
}

export function Gavel({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="40" y="118" width="120" height="16" rx="5" fill="currentColor" fillOpacity=".25" strokeWidth="4" />
      <g className="al-gavel" style={{ transformOrigin: '150px 104px' }}>
        <path d="M150 104 92 46" strokeWidth="9" />
        <rect x="60" y="27" width="56" height="30" rx="7" transform="rotate(-45 88 42)" fill="currentColor" stroke="none" />
      </g>
      <g className="al-sparks stroke-gold" strokeWidth="5">
        <path d="M50 112l-12-4M56 100l-8-10M88 104l8-10" />
      </g>
    </svg>
  );
}

// ---- Concertation --------------------------------------------------------------------

/** Concertation : le dossier tombe, l'accusation se tape ; les complices remplissent leur carnet. */
function Plot({ a }: { a: AlibiState }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const left = useSeconds(endsAt);
  const fuse = useTimeLeft(endsAt, ALIBI_PLOT);
  const suspect = a.suspects.includes(selfId ?? '');
  const judge = a.judgeId === selfId;
  const typed = useTypewriter(a.accusation);

  useEffect(() => {
    if (left > 0 && left <= 5) tick(left <= 3);
  }, [left]);

  return (
    <div className="grid gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <article className="al-folder relative rounded-2xl p-5 pt-7 sm:p-7 sm:pt-9">
          <span className="al-tab absolute -top-3 left-6 rounded-t-lg px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em]">
            Dossier n° {String(a.case + 1).padStart(3, '0')}
          </span>
          <span className="al-stamp-in absolute right-4 top-3 rotate-[-8deg] rounded-md border-[3px] border-bad px-2 py-0.5 font-mono text-xs font-black uppercase tracking-widest text-bad">
            Accusés
          </span>
          <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Les faits</p>
          <p className="mt-2 min-h-[4.5em] text-xl font-semibold leading-snug tracking-[-0.02em] sm:text-2xl" aria-label={a.accusation}>
            <span aria-hidden>{typed}</span>
            <span className="al-caret" aria-hidden />
          </p>
          <p className="mt-3 text-sm opacity-80">Où étiez-vous, et qu'avez-vous fait ? Mettez-vous d'accord avant l'audience.</p>
        </article>
        <div className="flex items-center gap-3">
          <span ref={fuse} className="al-fuse relative h-2.5 flex-1 overflow-hidden rounded-full bg-edge" aria-hidden>
            <i />
          </span>
          <span className={`font-mono text-lg font-bold tabular-nums ${left <= 5 ? 'text-bad' : ''}`} aria-label="Secondes restantes">
            <Ticker value={left} />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {a.suspects.map((id, i) => (
            <div key={id} className={i ? 'al-in-right' : 'al-in-left'}>
              <Mug id={id} label="complice" small />
            </div>
          ))}
        </div>
      </div>
      <aside className="flex flex-col">
        {suspect ? (
          <Notebook a={a} />
        ) : (
          <div className="panel m-rise flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
            <span className="al-whisper flex gap-1.5 text-3xl" aria-hidden>
              <span>🤫</span>
              <span className="m-dots font-mono text-2xl text-muted">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </span>
            <p className="text-lg font-semibold tracking-[-0.02em]">Huis clos.</p>
            <p className="text-sm text-muted">
              Les complices accordent leurs violons : tu ne les entends plus pendant {ALIBI_PLOT} s.
              {judge ? ' Prépare tes objections : C pour Contradiction, H pour Hésitation.' : ' Écoute bien leur version ensuite.'}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Le carnet des complices : lignes manuscrites, que l'autre voit arriver en direct. */
function Notebook({ a }: { a: AlibiState }) {
  const selfId = useGame((s) => s.selfId);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const notes = a.notes ?? [];

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [notes.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    net.send({ t: 'alibi', note: t });
    setText('');
  };

  return (
    <div className="al-notebook flex min-h-64 flex-1 flex-col rounded-xl p-3 pl-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Carnet des complices · secret</p>
      <ol ref={list} className="mt-1 max-h-72 flex-1 overflow-y-auto pr-1 leading-[1.55rem]">
        {notes.length === 0 && <li className="al-hand text-xl text-muted">On était où, déjà ?</li>}
        {notes.map((n, i) => (
          <li key={i} className={`al-note al-hand text-xl leading-[1.55rem] ${n.by === selfId ? '' : 'text-accent'}`} style={{ '--tilt': `${((i * 37) % 5) - 2}deg` } as CSSProperties}>
            {n.text}
          </li>
        ))}
      </ol>
      <form
        className="mt-auto flex gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="input min-w-0 flex-1"
          autoFocus
          maxLength={ALIBI_NOTE_MAX}
          placeholder="On était au cinéma…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary px-3" disabled={!text.trim()}>
          Noter
        </button>
      </form>
    </div>
  );
}

// ---- Audience ----------------------------------------------------------------------

/** La jauge de crédibilité : elle fond à chaque objection, avec la ligne du seuil. */
function Credibility({ value }: { value: number }) {
  const shown = useCountUp(value);
  const tone = value >= 70 ? 'bg-good' : value >= ALIBI_THRESHOLD ? 'bg-warn' : 'bg-bad';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted">Crédibilité</span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-edge">
        <span className={`al-cred absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${value}%` }} />
        <span className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `${ALIBI_THRESHOLD}%` }} title="Seuil" />
      </span>
      <b className="w-12 text-right font-mono tabular-nums">{shown} %</b>
    </div>
  );
}

/** Audience : la pièce tombe sur la table, le complice désigné a 10 s pour l'expliquer. */
function Trial({ a, panel }: { a: AlibiState; panel: RefObject<HTMLDivElement | null> }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const left = useSeconds(endsAt);
  const ring = useTimeLeft(endsAt, ALIBI_EXHIBIT);
  const n = a.exhibits.length - 1;
  const cur = a.exhibits[n];
  const judge = a.judgeId === selfId;
  const name = useName();
  const speaker = usePlayer(cur?.suspectId);
  const other = a.suspects.find((s) => s !== cur?.suspectId)!;
  const [stamp, setStamp] = useState<{ kind: AlibiObjection; at: number } | null>(null);

  useEffect(() => {
    if (left > 0 && left <= 3) tick(left === 1);
  }, [left]);

  // Une objection arrive : tampon géant, coup de marteau, la salle tremble.
  const objection = cur?.objection ?? null;
  useEffect(() => {
    if (!objection) return;
    setStamp({ kind: objection, at: Date.now() });
    play(objection === 'contradiction' ? 'boum' : 'boing');
    shake(panel.current);
    const id = setTimeout(() => setStamp(null), 1400);
    return () => clearTimeout(id);
  }, [objection, n, panel]);

  if (!cur) return null;
  const mine = cur.suspectId === selfId;

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <Credibility value={a.credibility} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="al-table relative grid min-h-44 place-items-center rounded-2xl px-4 pb-6 pt-10">
            <div key={n} className="al-exhibit relative w-full max-w-md">
              <span className="al-string" aria-hidden />
              <div className="al-tag rounded-xl p-4 text-center">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">
                  Pièce à conviction n° {n + 1}/{a.total}
                </p>
                <p className="mt-1.5 text-xl font-semibold leading-snug tracking-[-0.02em] sm:text-2xl">{cur.item}</p>
              </div>
            </div>
            <span ref={ring} className="al-ring absolute right-3 top-3 grid size-12 place-items-center rounded-full" aria-label="Secondes restantes">
              <b className="relative font-mono tabular-nums">
                <Ticker value={left} />
              </b>
            </span>
          </div>
          <p key={`who${n}`} className="m-pop text-center text-lg">
            {mine ? (
              <b className="text-accent">À toi d'expliquer cette pièce !</b>
            ) : (
              <>
                <b>{name(speaker)}</b> doit l'expliquer.
              </>
            )}
          </p>
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Mug id={cur.suspectId} label="à la barre" hot />
            <div className="self-end">
              <Mug id={other} label="complice" small />
            </div>
          </div>
        </div>
        <aside className="flex flex-col gap-3">
          {judge ? <Bench a={a} /> : mine ? <Statement key={n} /> : <Listener a={a} />}
          {cur.statement && !mine && (
            <blockquote key={cur.statement} className="al-quote m-pop rounded-xl border border-edge bg-surface p-3 text-sm">
              <span className="text-muted">{name(speaker)} :</span> « {cur.statement} »
            </blockquote>
          )}
          <Docket a={a} />
        </aside>
      </div>
      {stamp && (
        <div key={stamp.at} className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-live="assertive">
          <span className={`al-objection rounded-2xl border-[6px] px-6 py-2 text-4xl font-black uppercase tracking-[-0.03em] sm:text-6xl ${stamp.kind === 'contradiction' ? 'border-bad text-bad' : 'border-warn text-warn'}`}>
            {OBJECTION[stamp.kind].label}
          </span>
        </div>
      )}
    </div>
  );
}

/** Le pupitre du juge : deux boutons, une objection par pièce. */
function Bench({ a }: { a: AlibiState }) {
  const cur = a.exhibits.at(-1);
  const used = Boolean(cur?.objection);
  return (
    <div className="panel m-rise flex flex-col gap-2 p-3">
      <p className="text-xs font-medium text-muted">Ton pupitre · une objection par pièce</p>
      {(Object.keys(OBJECTION) as AlibiObjection[]).map((kind) => (
        <button
          key={kind}
          disabled={used}
          className={`al-buzz btn w-full justify-between py-3 text-base font-semibold disabled:opacity-40 ${kind === 'contradiction' ? 'bg-bad text-white' : 'bg-warn text-black'}`}
          onClick={(e) => {
            bump(e.currentTarget, 1.05);
            net.send({ t: 'alibi', object: kind });
          }}
        >
          <span>
            {OBJECTION[kind].emoji} {OBJECTION[kind].label}
          </span>
          <span className="flex items-center gap-2 text-xs font-medium opacity-80">
            −{ALIBI_PENALTY[kind]} %<span className="kbd border-current/30 text-current max-sm:hidden">{OBJECTION[kind].key}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Le complice à la barre : il parle en visio, et peut aussi écrire sa déposition. */
function Statement() {
  const [text, setText] = useState('');
  const sent = useRef('');
  // La déposition part toute seule après une courte pause dans la frappe.
  useEffect(() => {
    if (text.trim() === sent.current) return;
    const id = setTimeout(() => {
      sent.current = text.trim();
      net.send({ t: 'alibi', statement: sent.current });
    }, 350);
    return () => clearTimeout(id);
  }, [text]);
  return (
    <div className="panel m-rise flex flex-col gap-2 p-3">
      <p className="text-xs font-medium text-muted">Explique-la à voix haute… ou écris ta déposition</p>
      <textarea
        className="input h-24 resize-none"
        autoFocus
        maxLength={ALIBI_STATEMENT_MAX}
        placeholder="Ça ? C'était pour le gâteau de mamie…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

function Listener({ a }: { a: AlibiState }) {
  const selfId = useGame((s) => s.selfId);
  const suspect = a.suspects.includes(selfId ?? '');
  return (
    <div className="panel m-rise p-3 text-sm text-muted">
      {suspect ? 'Ton complice est à la barre : ne le contredis pas !' : 'Écoute bien : la moindre incohérence, et le juge buzze.'}
    </div>
  );
}

/** Les pièces déjà passées, avec l'objection qu'elles ont prise. */
function Docket({ a }: { a: AlibiState }) {
  const past = a.exhibits.slice(0, -1);
  if (!past.length) return null;
  return (
    <ol className="space-y-1.5">
      {past.map((e, i) => (
        <li key={i} className="m-pop flex items-center gap-2 rounded-lg border border-edge px-2.5 py-1.5 text-xs">
          <span className="font-mono text-muted">#{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">{e.item}</span>
          <span title={e.objection ? OBJECTION[e.objection].label : 'Sans objection'}>{e.objection ? OBJECTION[e.objection].emoji : '✓'}</span>
        </li>
      ))}
    </ol>
  );
}

// ---- Délibération et verdict -----------------------------------------------------------

/** Le jury délibère : acquittés ou coupables ? */
function Vote({ a }: { a: AlibiState }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const left = useSeconds(endsAt);
  const juror = a.jury.includes(selfId ?? '');
  const players = useGame((s) => s.room!.players);

  return (
    <div className="grid min-h-[28rem] place-items-center p-5 text-center">
      <div className="w-full max-w-lg">
        <Gavel className="al-deliberate mx-auto w-28 text-ink/70" />
        <p className="m-pop mt-2 text-3xl font-bold tracking-[-0.04em]">Le jury délibère</p>
        <div className="mx-auto mt-4 max-w-sm">
          <Credibility value={a.credibility} />
        </div>
        {juror ? (
          a.myVote === null ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="al-buzz btn-primary py-4 text-lg" onClick={(e) => (bump(e.currentTarget), net.send({ t: 'alibi', vote: true }))}>
                🕊️ Acquittés
              </button>
              <button className="al-buzz btn bg-bad py-4 text-lg font-semibold text-white" onClick={(e) => (bump(e.currentTarget), net.send({ t: 'alibi', vote: false }))}>
                🔒 Coupables
              </button>
            </div>
          ) : (
            <p className="m-pop mt-5 text-lg">Ton vote : <b>{a.myVote ? 'acquittés' : 'coupables'}</b>. On attend les autres…</p>
          )
        ) : (
          <p className="mt-5 text-muted">Les jurés votent, l'accusation retient son souffle.</p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {a.jury.map((id) => {
            const p = players.find((x) => x.id === id);
            const done = a.voted.includes(id);
            return (
              <span key={id} className={`al-juror flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${done ? 'is-done border-good/50 bg-good/10' : 'border-edge'}`}>
                {avatarOf(p?.avatar ?? 0)} {p?.id === selfId ? 'Toi' : (p?.name ?? '…')} {done ? '✓' : ''}
              </span>
            );
          })}
        </div>
        <p className="mt-4 font-mono text-sm text-muted">
          <Ticker value={left} /> s
        </p>
      </div>
    </div>
  );
}

/** Verdict : tampon « Acquittés » sous les confettis, ou les barreaux qui tombent. Puis le dossier. */
function Verdict({ a }: { a: AlibiState }) {
  const r = a.result;
  const burst = useRef<HTMLCanvasElement>(null);
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const name = useName();
  const by = (id: string) => players.find((p) => p.id === id);

  useEffect(() => {
    if (!r) return;
    if (!r.acquitted) play('boum');
    else {
      play('bravo');
      return confetti(burst.current, 120);
    }
  }, [r]);

  if (!r) return null;
  const gainers = Object.keys(r.gains).filter((id) => by(id));

  return (
    <div className="relative grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative text-center">
        <div className="relative mx-auto grid max-w-md grid-cols-2 gap-3">
          {a.suspects.map((id) => (
            <Mug key={id} id={id} label={r.acquitted ? 'libre' : 'coupable'} small />
          ))}
          {!r.acquitted && (
            <span className="al-bars pointer-events-none absolute inset-0 flex justify-around" aria-hidden>
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${i * 45}ms` }} />
              ))}
            </span>
          )}
        </div>
        <p
          className={`al-verdict mt-5 inline-block rounded-xl border-4 px-5 py-1 text-5xl font-black uppercase tracking-[-0.03em] sm:text-6xl ${
            r.acquitted ? 'border-gold text-accent' : 'border-bad text-bad'
          }`}
        >
          {r.acquitted ? 'Acquittés' : 'Coupables'}
        </p>
        <p className="m-rise mt-3 text-base" style={{ animationDelay: '250ms' }}>
          Crédibilité finale <b>{r.credibility} %</b>
          {r.votes ? (
            <>
              {' '}
              · jury : <b>{r.votes.acquit}</b> pour l'acquittement, <b>{r.votes.guilty}</b> contre
            </>
          ) : null}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {gainers.map((id, i) => (
            <Gain key={id} label={name(by(id))} avatar={by(id)!.avatar} gain={r.gains[id] ?? 0} delay={400 + i * 100} self={id === selfId} />
          ))}
        </div>
      </div>
      <aside className="relative flex flex-col gap-3 text-left">
        {a.notes && a.notes.length > 0 && (
          <div className="al-notebook al-reveal rounded-xl p-3 pl-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Le carnet secret</p>
            <ol className="mt-1 space-y-0.5">
              {a.notes.slice(-6).map((n, i) => (
                <li key={i} className="al-hand text-lg leading-tight">
                  {n.text}
                </li>
              ))}
            </ol>
          </div>
        )}
        <ol className="space-y-1.5">
          {a.exhibits.map((e, i) => (
            <li key={i} className="m-pop rounded-lg border border-edge px-2.5 py-1.5 text-xs" style={{ animationDelay: `${600 + i * 90}ms` }}>
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{e.item}</span>
                <span>{e.objection ? OBJECTION[e.objection].emoji : '✓'}</span>
              </span>
              {e.statement && <span className="mt-0.5 block text-muted">« {e.statement} »</span>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function Gain({ label, avatar, gain, delay, self }: { label: string; avatar: number; gain: number; delay: number; self: boolean }) {
  const shown = useCountUp(gain);
  return (
    <span style={{ animationDelay: `${delay}ms` }} className={`m-pop flex items-center gap-2 rounded-full border px-3 py-1.5 ${gain ? 'border-good/50 bg-good/10' : 'border-edge'} ${self ? 'ring-2 ring-accent/40' : ''}`}>
      <span>{avatarOf(avatar)}</span>
      <span className="text-sm">{label}</span>
      <b className={`font-mono tabular-nums ${gain ? 'text-good' : 'text-muted'}`}>+{shown}</b>
    </span>
  );
}
