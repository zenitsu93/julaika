import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CANVAS_H, CANVAS_W, TEL_PROMPTS, TEL_TEXT_MAX, type DrawPacket, type TelChain, type TelEntry, type TelKind, type TelState } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { BoardCanvas, Pen, replay } from '../../lib/board';
import { net } from '../../lib/net';
import { serverNow, useGame } from '../../lib/store';
import { attachWipe, bump, confetti, Presence, reducedMotion, shake, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Toolbar } from '../Toolbar';

const KIND_ICON: Record<TelKind, string> = { write: '✍️', draw: '✏️', describe: '🔍' };

/** Plateau du Téléphone dessiné : qui a fini, l'étape en cours, puis l'album. Visio dessous. */
export function TelBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <TelBar />
      <div className="panel relative min-h-[26rem] overflow-hidden">
        {phase === 'album' ? <Album /> : phase === 'lobby' ? <Teaser /> : <Stage />}
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
  return (
    <div className="m-veil absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none">
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Derrière les réglages : la chaîne qui se déroule, pour donner l'idée du jeu. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[26rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="flex items-center gap-3 text-4xl opacity-40">
        <span className="tel-art">💬</span>
        <span className="tel-art" style={{ animationDelay: '500ms' }}>
          🖍️
        </span>
        <span className="tel-art" style={{ animationDelay: '1000ms' }}>
          ❓
        </span>
      </div>
    </div>
  );
}

/** Joueurs de la partie : une coche tombe sur ceux qui ont rendu leur page. */
function TelBar() {
  const players = useGame((s) => s.room!.players);
  const tel = useGame((s) => s.room!.tel);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const done = new Set(tel?.done ?? []);
  const writing = tel && tel.album === null;
  // Ceux qui ont fini passent devant, la rangée glisse.
  const ordered = [...players].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const finished = done.has(p.id);
          const playing = writing && tel.players.includes(p.id);
          return (
            <li
              key={p.id}
              data-flip={p.id}
              className={`m-pop flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${
                finished ? 'border-good/50 bg-good/10 text-good' : 'border-edge bg-surface'
              }`}
            >
              <span aria-hidden>{avatarOf(p.avatar)}</span>
              <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.id === selfId ? 'Toi' : p.name}</span>
              {finished ? (
                <span key="ok" className="m-pop" title="A fini">
                  ✓
                </span>
              ) : playing ? (
                <span className="m-wobble text-xs" title="En train de jouer">
                  {KIND_ICON[tel.kind]}
                </span>
              ) : null}
              {p.isHost && (
                <span title="Hôte" className="text-xs">
                  👑
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {tel && <Steps tel={tel} />}
    </div>
  );
}

/** Une pastille par étape : faites, en cours (elle respire), à venir. */
function Steps({ tel }: { tel: TelState }) {
  const album = tel.album !== null;
  return (
    <span className="flex items-center gap-1" aria-label={album ? 'Album' : `Étape ${tel.step + 1} sur ${tel.steps}`}>
      {Array.from({ length: tel.steps }, (_, i) => {
        const past = album || i < tel.step;
        const current = !album && i === tel.step;
        return (
          <span
            key={i}
            className={`size-2.5 rounded-full transition-all duration-500 ${past ? 'm-pop bg-[#7c3aed]' : current ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`}
          />
        );
      })}
    </span>
  );
}

/** L'étape en cours, selon ce que tu as à faire. */
function Stage() {
  const tel = useGame((s) => s.room!.tel);
  const selfId = useGame((s) => s.selfId);
  const prompt = useGame((s) => s.telPrompt);
  if (!tel) return null;
  if (!tel.players.includes(selfId ?? ''))
    return (
      <Center>
        <p className="text-4xl">🍿</p>
        <p className="mt-2 text-lg font-semibold">Une partie est en cours</p>
        <p className="text-muted">
          Tu rejoindras la prochaine ; en attendant, l'album arrive bientôt
          <Dots />
        </p>
      </Center>
    );
  const received = prompt?.step === tel.step ? prompt.prompt : null;
  const done = tel.done.includes(selfId!);
  // Une clé par étape : chaque étape arrive avec sa propre animation et un état neuf.
  if (tel.kind === 'draw') return <DrawStep key={tel.step} prompt={received} done={done} />;
  return <WriteStep key={tel.step} kind={tel.kind} prompt={received} done={done} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="m-rise grid min-h-[26rem] place-items-center p-6 text-center">{<div>{children}</div>}</div>;
}

const Dots = () => (
  <span className="m-dots" aria-hidden>
    <span>.</span>
    <span>.</span>
    <span>.</span>
  </span>
);

/** Phrase de départ, ou description du dessin reçu. Le brouillon part tout seul si le temps file. */
function WriteStep({ kind, prompt, done }: { kind: TelKind; prompt: TelEntry | null; done: boolean }) {
  const [text, setText] = useState('');
  const [placeholder] = useState(() => TEL_PROMPTS[Math.floor(Math.random() * TEL_PROMPTS.length)]!);
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const endsAt = useGame((s) => s.room!.endsAt);
  const describe = kind === 'describe';

  useEffect(() => {
    if (!done) field.current?.focus({ preventScroll: true });
  }, [done]);

  // Juste avant la fin, on rend ce qui est écrit plutôt que de le perdre.
  const draft = useRef(text);
  draft.current = text;
  useEffect(() => {
    if (!endsAt || done) return;
    const t = setTimeout(() => draft.current.trim() && net.send({ t: 'tel', text: draft.current }), endsAt - serverNow() - 400);
    return () => clearTimeout(t);
  }, [endsAt, done]);

  if (done) return <Waiting what={describe ? 'Ta réponse est partie.' : 'Ta phrase est partie chez ton voisin.'} />;

  return (
    <div className="flex min-h-[26rem] flex-col items-center justify-center gap-5 p-4 sm:p-8">
      {describe ? (
        <>
          <Heading eyebrow={prompt ? `Dessin de ${prompt.name}` : 'Dessin reçu'} title="Qu'est-ce que c'est ?" />
          {prompt?.kind === 'drawing' ? (
            <div className="tel-card w-full max-w-md overflow-hidden rounded-lg border border-edge shadow-[0_18px_40px_-24px_rgb(0_0_0/0.5)]">
              <Sketch strokes={prompt.strokes} ms={1600} />
            </div>
          ) : (
            <p className="text-muted">Le dessin arrive…</p>
          )}
        </>
      ) : (
        <Heading eyebrow="Étape 1 · en secret" title="Écris une phrase de départ" line="Farfelue, c'est mieux : ton voisin va devoir la dessiner." />
      )}
      <form
        ref={form}
        className="m-rise flex w-full max-w-md flex-col gap-2"
        style={{ animationDelay: '120ms' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return shake(field.current);
          bump(form.current, 1.02);
          net.send({ t: 'tel', text });
        }}
      >
        <div className="flex gap-2">
          <input
            ref={field}
            className="input"
            maxLength={TEL_TEXT_MAX}
            placeholder={describe ? 'Je crois que c’est…' : placeholder}
            enterKeyHint="send"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary shrink-0">Valider</button>
        </div>
        {!describe && (
          <button
            type="button"
            className="btn mx-auto text-muted hover:text-ink"
            onClick={(e) => {
              bump(e.currentTarget);
              setText(TEL_PROMPTS[Math.floor(Math.random() * TEL_PROMPTS.length)]!);
              field.current?.focus();
            }}
          >
            🎲 Inspire-moi
          </button>
        )}
      </form>
    </div>
  );
}

function Heading({ eyebrow, title, line }: { eyebrow: string; title: ReactNode; line?: string }) {
  return (
    <div className="text-center">
      <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
      <h2 className="m-pop mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl" style={{ animationDelay: '60ms' }}>
        {title}
      </h2>
      {line && (
        <p className="m-rise mt-1 text-muted" style={{ animationDelay: '100ms' }}>
          {line}
        </p>
      )}
    </div>
  );
}

/** Le dessin : ton propre tableau, que personne ne voit avant l'album. */
function DrawStep({ prompt, done }: { prompt: TelEntry | null; done: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wipe = useRef<HTMLCanvasElement>(null);
  const [sheet] = useState(() => new BoardCanvas());
  const [pen] = useState(() => new Pen((buf) => net.sendBinary(buf), sheet));
  const others = useGame((s) => {
    const tel = s.room!.tel!;
    const present = new Set(s.room!.players.map((p) => p.id));
    return tel.players.filter((id) => present.has(id) && !tel.done.includes(id)).length;
  });

  useEffect(() => {
    sheet.attach(canvas.current);
    attachWipe(canvas.current, wipe.current);
    return () => {
      sheet.attach(null);
      attachWipe(null, null);
    };
  }, [sheet]);

  useEffect(() => {
    if (done) pen.end();
  }, [done, pen]);

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H] as const;
  };
  const text = prompt?.kind === 'text' ? prompt.text : '…';

  return (
    <div className="flex flex-col items-center gap-3 p-3 sm:p-4">
      <div className="text-center">
        <p className="m-rise text-xs uppercase tracking-[0.18em] text-muted">{prompt ? `${prompt.name} a écrit` : 'À dessiner'}</p>
        <p className="mt-0.5 text-xl font-semibold tracking-[-0.02em] sm:text-2xl" aria-live="polite">
          {text.split(' ').map((w, i) => (
            <span key={i} className="w-word" style={{ animationDelay: `${i * 60}ms` }}>
              {w}&nbsp;
            </span>
          ))}
        </p>
      </div>
      <div className="tel-sheet relative w-full max-w-[max(20rem,calc((100dvh-24rem)*4/3))] overflow-hidden rounded-lg border border-edge">
        <canvas
          ref={canvas}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`block aspect-[4/3] w-full touch-none bg-white ${done ? '' : 'cursor-crosshair'}`}
          onPointerDown={(e) => {
            if (done || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pen.start(...toCanvas(e));
          }}
          onPointerMove={(e) => {
            if (done) return;
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            pen.move(events.flatMap((ev) => toCanvas(ev)));
          }}
          onPointerUp={() => pen.end()}
          onPointerCancel={() => pen.end()}
        />
        <canvas ref={wipe} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        <Presence>
          {done ? (
            <div key="sent" className="m-veil absolute inset-0 grid place-items-center bg-page/70 backdrop-blur-[1px]">
              <div className="m-card text-center">
                <Check />
                <p className="mt-2 font-semibold">Dessin envoyé !</p>
                <p className="text-sm text-muted">
                  {others ? `Encore ${others} ${others > 1 ? 'artistes' : 'artiste'} au travail` : 'On passe à la suite'}
                  <Dots />
                </p>
                <button className="btn-ghost mt-3" onClick={() => net.send({ t: 'tel', edit: true })}>
                  Retoucher
                </button>
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <Presence>
        {done ? null : (
          <div className="flex w-full flex-col items-center gap-2">
            <Toolbar pen={pen} />
            <button
              className="btn-primary px-6 py-2.5 text-base"
              onClick={(e) => {
                bump(e.currentTarget);
                pen.end();
                net.send({ t: 'tel', done: true });
              }}
            >
              J'ai fini !
            </button>
          </div>
        )}
      </Presence>
    </div>
  );
}

/** Coche qui se dessine. */
const Check = () => (
  <svg viewBox="0 0 48 48" className="tel-check mx-auto size-14" aria-hidden>
    <circle cx="24" cy="24" r="21" fill="var(--color-good)" opacity=".15" />
    <path pathLength={1} d="M14 25l7 7 13-15" fill="none" stroke="var(--color-good)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Waiting({ what }: { what: string }) {
  const room = useGame((s) => s.room!);
  const tel = room.tel!;
  const waiting = room.players.filter((p) => tel.players.includes(p.id) && !tel.done.includes(p.id));
  return (
    <Center>
      <Check />
      <p className="mt-3 text-lg font-semibold">{what}</p>
      <p className="text-muted">
        {waiting.length ? 'On attend encore' : 'On passe à la suite'}
        <Dots />
      </p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {waiting.map((p) => (
          <li key={p.id} className="m-pop m-breathe text-2xl" title={p.name}>
            {avatarOf(p.avatar)}
          </li>
        ))}
      </ul>
      <button className="btn-ghost mt-4" onClick={() => net.send({ t: 'tel', edit: true })}>
        Modifier
      </button>
    </Center>
  );
}

/** Un dessin rejoué trait par trait (ou affiché d'un coup s'il a déjà été vu). */
function Sketch({ strokes, ms, instant = false }: { strokes: DrawPacket[]; ms: number; instant?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sheet] = useState(() => new BoardCanvas());
  useEffect(() => {
    sheet.attach(canvas.current);
    const stop = replay(sheet, strokes, ms, instant || reducedMotion());
    return () => {
      stop();
      sheet.attach(null);
    };
  }, [sheet, strokes, ms, instant]);
  return <canvas ref={canvas} width={CANVAS_W} height={CANVAS_H} className="block aspect-[4/3] w-full bg-white" />;
}

/** L'album : l'hôte tourne les pages, chaque étape arrive à son tour et les dessins se refont sous nos yeux. */
function Album() {
  const chains = useGame((s) => s.album);
  const tel = useGame((s) => s.room!.tel);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const hostName = useGame((s) => s.room!.players.find((p) => p.isHost)?.name ?? "l'hôte");
  const page = tel?.album;
  const chain = page && chains?.[page.chain];
  const scroller = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const last = chain ? page.entry === chain.entries.length - 1 : false;
  const lastChain = chains && page ? page.chain === chains.length - 1 : false;

  // La nouvelle page glisse dans le champ ; en fin de chaîne, une pluie de confettis.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (!last) return;
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(sparks.current, 70)), 900);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [page?.chain, page?.entry]);

  const next = () => isHost && net.send({ t: 'tel', next: true });
  useEffect(() => {
    if (!isHost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [isHost]);

  if (!chains || !page || !chain) return <Center>L'album arrive<Dots /></Center>;

  return (
    <div className="relative flex h-[min(70dvh,44rem)] min-h-[26rem] flex-col">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      <header key={page.chain} className="m-rise flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {avatarOf(chain.avatar)}
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Album {page.chain + 1}/{chains.length}
            </p>
            <h2 className="truncate font-semibold">La chaîne de {chain.name}</h2>
          </div>
        </div>
        <span className="flex gap-1" aria-hidden>
          {chains.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === page.chain ? 'w-5 bg-[#7c3aed]' : i < page.chain ? 'w-1.5 bg-[#7c3aed]/50' : 'w-1.5 bg-edge'}`} />
          ))}
        </span>
      </header>
      <div ref={scroller} key={`c${page.chain}`} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {chain.entries.slice(0, page.entry + 1).map((entry, i) => (
          <Page key={i} entry={entry} index={i} fresh={i === page.entry} />
        ))}
        {last && <Verdict chain={chain} />}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-edge px-4 py-3">
        <span className="text-sm text-muted">
          Page {page.entry + 1}/{chain.entries.length}
        </span>
        {isHost ? (
          <button className="btn-primary px-5" onClick={(e) => (bump(e.currentTarget), next())}>
            {!last ? 'Suivant →' : lastChain ? 'Terminer' : 'Album suivant →'}
            <kbd className="kbd border-on-primary/30 text-on-primary/70 max-sm:hidden">→</kbd>
          </button>
        ) : (
          <span className="text-sm text-muted">
            {hostName} tourne les pages
            <Dots />
          </span>
        )}
      </footer>
    </div>
  );
}

/** Une page de l'album : bulle de texte, ou dessin qui se refait. Les pages paires à gauche, impaires à droite. */
function Page({ entry, index, fresh }: { entry: TelEntry; index: number; fresh: boolean }) {
  const right = index % 2 === 1;
  const who = (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden className="text-base">
        {avatarOf(entry.avatar)}
      </span>
      {entry.name} {entry.kind === 'drawing' ? 'a dessiné' : index === 0 ? 'a écrit' : 'a vu'}
    </span>
  );
  return (
    <article className={`flex flex-col gap-1.5 ${right ? 'items-end tel-from-right' : 'items-start tel-from-left'} ${fresh ? '' : 'tel-seen'}`}>
      {who}
      {entry.kind === 'text' ? (
        <p className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-lg font-medium ${right ? 'rounded-tr-sm bg-[#7c3aed] text-white' : 'rounded-tl-sm bg-edge/60'}`}>
          {fresh
            ? entry.text.split(' ').map((w, i) => (
                <span key={i} className="w-word" style={{ animationDelay: `${200 + i * 70}ms` }}>
                  {w}&nbsp;
                </span>
              ))
            : entry.text}
        </p>
      ) : (
        <div className="w-full max-w-sm overflow-hidden rounded-xl border border-edge shadow-[0_18px_40px_-24px_rgb(0_0_0/0.5)]">
          <Sketch strokes={entry.strokes} ms={2600} instant={!fresh} />
        </div>
      )}
    </article>
  );
}

/** Fin de chaîne : la phrase de départ face à l'arrivée. */
function Verdict({ chain }: { chain: TelChain }) {
  const first = chain.entries[0];
  const end = chain.entries.at(-1);
  if (first?.kind !== 'text' || end?.kind !== 'text' || chain.entries.length < 3) return null;
  return (
    <div className="flex justify-center pt-2">
      <p className="w-stamp max-w-md rounded-2xl bg-surface px-4 py-2.5 text-center text-sm shadow-lg ring-1 ring-edge" style={{ animationDelay: '1100ms' }} role="status">
        De <b>« {first.text} »</b> à <b>« {end.text} »</b> 😂
      </p>
    </div>
  );
}
