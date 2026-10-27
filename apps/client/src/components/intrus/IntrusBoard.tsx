import { useEffect, useRef, useState } from 'react';
import { INTRUS_CLUE_MAX, type IntrusClue, type IntrusResult, type IntrusState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { buzzer } from '../../lib/sounds';
import { serverNow, store, useGame } from '../../lib/store';
import { bump, confetti, shake, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Overlay } from '../Overlay';
import { PlayerStrip } from '../PlayerStrip';
import './intrus.css';

/** Plateau de L'Intrus : ton mot secret, les sièges dans l'ordre de parole, puis le vote. */
export function IntrusBoard() {
  const intrus = useGame((s) => s.room!.intrus);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <PlayerStrip />
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {intrus ? <Stage intrus={intrus} /> : <Teaser />}
        <Overlay />
      </div>
      <CallBar />
    </section>
  );
}

/** Derrière les réglages : quatre cartes, dont une pas comme les autres. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="flex gap-3 opacity-40">
        {['🙂', '🙂', '🙂', '🫣'].map((face, i) => (
          <span key={i} className={`grid h-24 w-16 place-items-center rounded-xl border border-edge bg-surface text-3xl ${i === 3 ? 'soon-bob border-accent' : ''}`}>
            {face}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stage({ intrus }: { intrus: IntrusState }) {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const phase = room.phase;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  // Ceux qui sont partis gardent leur siège, grisé, jusqu'à la manche suivante.
  const seats = intrus.order.map((id) => ({ id, player: byId.get(id) ?? null }));
  const playing = intrus.order.includes(selfId ?? '');
  const result = phase === 'reveal' ? intrus.result : null;

  const box = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLCanvasElement>(null);
  const grid = useRef<HTMLOListElement>(null);
  useFlip(grid, [intrus.manche]);

  // Révélation : confettis pour les gagnants de la manche, petite secousse pour les autres.
  useEffect(() => {
    if (!result || !selfId) return;
    const won = (result.gains[selfId] ?? 0) > 0;
    let stop = () => {};
    const t = setTimeout(() => {
      if (won) stop = confetti(sparks.current, 120);
      else if (playing) shake(box.current);
    }, 700);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [result?.intrusId, intrus.manche]);

  // « Hésitation ! » : le buzzer retentit chez tout le monde et la table encaisse le choc.
  useEffect(() => {
    if (!intrus.hesitationBy) return;
    buzzer();
    shake(grid.current);
  }, [intrus.hesitationBy]);

  return (
    <div ref={box} className="relative flex min-h-[28rem] flex-col gap-5 px-4 pb-5 pt-5 sm:px-6">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 z-[5] size-full" aria-hidden />
      {intrus.hesitationBy && <Slam key={`${intrus.manche}-${intrus.clues.length}`} by={byId.get(intrus.hesitationBy) ?? null} />}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
        <WordCard key={intrus.manche} word={intrus.word} />
        <Headline intrus={intrus} phase={phase} names={byId} selfId={selfId} />
      </div>
      <ol ref={grid} className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3" aria-label="Joueurs, dans l'ordre de parole">
        {seats.map(({ id, player }, i) => (
          <Seat
            key={`${intrus.manche}-${id}`}
            index={i}
            id={id}
            player={player}
            self={id === selfId}
            intrus={intrus}
            phase={phase}
            clues={intrus.clues.filter((c) => c.by === id)}
            canVote={phase === 'vote' && playing && id !== selfId && !!player}
            result={result}
            names={byId}
            endsAt={room.endsAt}
          />
        ))}
      </ol>
      <div className="mt-auto">
        <Actions intrus={intrus} phase={phase} selfId={selfId} names={byId} />
      </div>
    </div>
  );
}

/** Ton mot, sur une carte distribuée face cachée qui se retourne. Un clic la recache (visio, écran partagé…). */
function WordCard({ word }: { word: string | null }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHidden(false), 650);
    return () => clearTimeout(t);
  }, []);
  if (!word)
    return (
      <div className="i-deal grid h-28 w-48 shrink-0 place-items-center rounded-2xl border border-dashed border-edge text-center text-sm text-muted">
        Tu regardes cette manche.
        <br />
        Tu joueras à la suivante.
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => setHidden((h) => !h)}
      data-hidden={hidden}
      aria-label={hidden ? 'Montrer mon mot' : `Ton mot : ${word}. Cliquer pour le cacher`}
      className="i-card i-deal group h-28 w-48 shrink-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
    >
      <span className="i-card-inner relative block size-full">
        <span className="i-face absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border border-edge bg-surface shadow-[0_14px_32px_-18px_rgb(0_0_0/0.45)]">
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Ton mot</span>
          <span className="max-w-full truncate px-3 text-2xl font-semibold tracking-[-0.03em]">{word}</span>
          <span className="text-[11px] text-muted opacity-0 transition group-hover:opacity-100">cliquer pour cacher</span>
        </span>
        <span className="i-face i-back absolute inset-0 grid place-items-center overflow-hidden rounded-2xl bg-primary text-on-primary">
          <span className="absolute inset-2 rounded-xl border border-on-primary/15 [background:repeating-linear-gradient(45deg,transparent_0_8px,rgb(245_183_0/0.12)_8px_9px)]" />
          <span className="relative text-sm font-medium">Toucher pour voir</span>
        </span>
      </span>
    </button>
  );
}

function Headline({ intrus, phase, names, selfId }: { intrus: IntrusState; phase: string; names: Map<string, PlayerPublic>; selfId: string | null }) {
  const speaker = intrus.speakerId ? names.get(intrus.speakerId) : null;
  const accused = intrus.accusedId ? names.get(intrus.accusedId) : null;
  const title =
    phase === 'clue'
      ? intrus.speakerId === selfId
        ? 'À toi de donner un indice'
        : `${speaker?.name ?? '…'} cherche un indice`
      : phase === 'vote'
        ? "Qui est l'intrus ?"
        : phase === 'steal'
          ? intrus.accusedId === selfId
            ? 'On t’a trouvé !'
            : `${accused?.name ?? '…'}, c'est l'intrus !`
          : 'Révélation';
  const line =
    phase === 'clue'
      ? `Tour d'indices ${intrus.clueRound + 1} sur ${intrus.clueRounds}. Assez précis pour les tiens, assez flou pour l'intrus.`
      : phase === 'vote'
        ? `${intrus.voted.length} vote${intrus.voted.length > 1 ? 's' : ''} sur ${intrus.order.length}. Discutez en visio, puis touchez un joueur.`
        : phase === 'steal'
          ? "Dernière chance : s'il devine votre mot, il vole la manche."
          : '';
  return (
    <div className="min-w-0 flex-1 text-center sm:text-right" aria-live="polite">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">
        Manche {intrus.manche} / {intrus.manches}
      </p>
      <h2 key={title} className="m-rise text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        {title}
        {phase === 'clue' && intrus.speakerId !== selfId && (
          <span className="m-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
      </h2>
      {line && (
        <p key={`${phase}-${intrus.clueRound}`} className="m-fade mt-1 text-sm text-muted">
          {line}
        </p>
      )}
    </div>
  );
}

interface SeatProps {
  index: number;
  id: string;
  player: PlayerPublic | null;
  self: boolean;
  intrus: IntrusState;
  phase: string;
  clues: IntrusClue[];
  canVote: boolean;
  result: IntrusResult | null;
  names: Map<string, PlayerPublic>;
  endsAt: number | null;
}

/** Un siège : le joueur, ses indices, puis au dépouillement son mot et qui l'a désigné. */
function Seat({ index, id, player, self, intrus, phase, clues, canVote, result, names, endsAt }: SeatProps) {
  const speaking = phase === 'clue' && intrus.speakerId === id;
  const pressed = speaking && intrus.hesitationBy !== null;
  const voted = phase === 'vote' && intrus.voted.includes(id);
  const mine = intrus.myVote === id;
  const accused = phase === 'steal' && intrus.accusedId === id;
  const isIntrus = result?.intrusId === id;
  const voters = result ? Object.entries(result.votes).filter(([, target]) => target === id).map(([voter]) => voter) : [];
  const gain = useCountUp(result?.gains[id] ?? 0, { from: 0, delay: 900 + index * 80 });

  const tone = isIntrus
    ? 'border-accent bg-accent/15'
    : accused
      ? 'border-bad bg-bad/5'
      : mine && phase === 'vote'
        ? 'border-ink bg-ink/[0.04]'
        : 'border-edge bg-surface';

  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full bg-page text-xl ${speaking ? 'm-breathe' : ''}`} aria-hidden>
          {player ? avatarOf(player.avatar) : '👋'}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${self ? 'font-semibold' : 'font-medium'}`}>{self ? 'Toi' : (player?.name ?? 'Parti')}</span>
          <span className="block font-mono text-[11px] text-muted">n° {index + 1}</span>
        </span>
        {voted && (
          <span className="i-ballot rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-on-primary" title="A voté">
            a voté
          </span>
        )}
        {mine && phase === 'vote' && (
          <svg viewBox="0 0 14 14" className="m-logo size-4 shrink-0" aria-label="Ton vote">
            <path className="m-stroke" pathLength={1} d="M2 7.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="mt-2.5 flex min-h-7 flex-wrap gap-1">
        {clues.map((c) =>
          c.hesitated ? (
            <span key={`${c.round}-${c.text}`} className="i-shaky max-w-full truncate rounded-full border border-dashed border-bad/60 bg-bad/5 px-2 py-0.5 text-[13px]" title="Indice arraché après un « Hésitation ! »">
              <span aria-hidden>🫨 </span>
              {c.text}
            </span>
          ) : (
            <span key={`${c.round}-${c.text}`} className="m-pop max-w-full truncate rounded-full border border-edge bg-page px-2 py-0.5 text-[13px]">
              {c.text}
            </span>
          ),
        )}
        {speaking && (
          <span className="rounded-full border border-dashed border-accent px-2 py-0.5 text-[13px] text-muted">
            <span className="m-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
        )}
      </span>
      {pressed && endsAt && <Fuse endsAt={endsAt} />}
      {result && (
        <span className="i-turn mt-2.5 flex items-center justify-between gap-2 border-t border-edge pt-2" style={{ animationDelay: `${300 + index * 80}ms` }}>
          <span className="min-w-0 truncate text-sm font-semibold">{isIntrus ? result.intrus : result.civil}</span>
          {(result.gains[id] ?? 0) > 0 && <span className="font-mono text-xs font-semibold text-good tabular-nums">+{gain}</span>}
        </span>
      )}
      {result && voters.length > 0 && (
        <span className="mt-1.5 flex flex-wrap items-center gap-0.5" aria-label={`Désigné par ${voters.map((v) => names.get(v)?.name ?? '?').join(', ')}`}>
          {voters.map((v, i) => (
            <span key={v} className="i-ballot text-sm" style={{ animationDelay: `${600 + i * 90}ms` }} title={names.get(v)?.name}>
              {avatarOf(names.get(v)?.avatar ?? 0)}
            </span>
          ))}
          <span className="ml-1 text-[11px] text-muted">{voters.length > 1 ? "l'ont désigné" : "l'a désigné"}</span>
        </span>
      )}
      {isIntrus && (
        <span className="w-stamp absolute -right-2 -top-2.5 rotate-6 rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#18181b] shadow" style={{ animationDelay: '800ms' }}>
          Intrus
        </span>
      )}
    </>
  );

  const base = `relative block w-full rounded-xl border p-3 text-left transition-[border-color,background-color,transform,box-shadow] duration-300 ${tone} ${pressed ? 'i-hesit' : speaking ? 'i-spot' : ''} ${player ? '' : 'opacity-50'}`;
  return (
    <li data-flip={id} className="m-rise" style={{ animationDelay: `${index * 50}ms` }}>
      {canVote ? (
        <button
          type="button"
          className={`${base} cursor-pointer outline-none hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-16px_rgb(0_0_0/0.5)] focus-visible:ring-2 focus-visible:ring-info active:scale-[.98]`}
          aria-pressed={mine}
          aria-label={`Voter contre ${player?.name}`}
          onClick={() => net.send({ t: 'intrus', vote: id })}
        >
          {body}
        </button>
      ) : (
        <div className={`${base} ${accused ? 'm-wiggle' : ''}`}>{body}</div>
      )}
    </li>
  );
}

/** Ce que tu as à faire maintenant : ton indice, ton vote, ou ta dernière chance. */
function Actions({ intrus, phase, selfId, names }: { intrus: IntrusState; phase: string; selfId: string | null; names: Map<string, PlayerPublic> }) {
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const error = useGame((s) => s.error);
  const speaking = phase === 'clue' && intrus.speakerId === selfId;
  const stealing = phase === 'steal' && intrus.accusedId === selfId;

  useEffect(() => {
    setText('');
    store.set({ error: null });
    if (speaking || stealing) field.current?.focus({ preventScroll: true });
  }, [speaking, stealing, intrus.clues.length]);

  // Le serveur a refusé l'indice (ton propre mot) : le champ tremble.
  useEffect(() => {
    if (error && speaking) shake(field.current);
  }, [error]);

  if (speaking || stealing)
    return (
      <form
        className="m-rise mx-auto flex w-full max-w-md flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return shake(field.current);
          store.set({ error: null });
          net.send(speaking ? { t: 'intrus', clue: text } : { t: 'intrus', steal: text });
        }}
      >
        <p className="text-center text-sm text-muted">
          {speaking ? 'Un mot ou deux qui collent à ton mot, sans le dire.' : 'Dernière chance : quel est le mot des autres ?'}
        </p>
        <div className="flex gap-2">
          <input
            ref={field}
            className="input"
            maxLength={INTRUS_CLUE_MAX}
            placeholder={speaking ? 'Ton indice' : 'Leur mot'}
            enterKeyHint="send"
            aria-invalid={!!error}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn-primary shrink-0">{speaking ? 'Donner' : 'Tenter'}</button>
        </div>
        {error && (
          <p key={error} className="m-rise text-center text-sm text-bad">
            {error}
          </p>
        )}
      </form>
    );

  if (phase === 'clue' && intrus.order.includes(selfId ?? '')) return <Hesitate intrus={intrus} names={names} selfId={selfId} />;

  if (phase === 'steal')
    return (
      <p className="m-rise text-center text-sm text-muted">
        <b className="text-ink">{names.get(intrus.accusedId ?? '')?.name}</b> cherche votre mot
        <span className="m-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </p>
    );

  if (phase === 'reveal' && intrus.result) return <Verdict result={intrus.result} names={names} selfId={selfId} />;
  return null;
}

/** Le grand tampon « Hésitation ! » qui s'abat sur la table, signé par celui qui a crié. */
function Slam({ by }: { by: PlayerPublic | null }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 1700);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[6] grid place-items-center" role="status">
      <span className="i-slam-flash absolute inset-0" aria-hidden />
      <span className="i-slam flex flex-col items-center gap-1 rounded-2xl border-4 border-bad bg-surface px-6 py-3 text-bad shadow-2xl">
        <span className="text-3xl font-extrabold uppercase tracking-[-0.02em] sm:text-4xl">Hésitation !</span>
        {by && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <span aria-hidden>{avatarOf(by.avatar)}</span>
            {by.name} a buzzé
          </span>
        )}
      </span>
    </div>
  );
}

/** Mèche sous l'orateur pris en flagrant délit d'hésitation : elle se consume jusqu'à la fin de son temps. */
function Fuse({ endsAt }: { endsAt: number }) {
  const left = Math.max(0, endsAt - serverNow());
  return (
    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-bad/15" aria-hidden>
      <span key={endsAt} className="i-fuse block h-full rounded-full bg-bad" style={{ animationDuration: `${left}ms` }} />
    </span>
  );
}

/**
 * Le bouton des auditeurs : « Hésitation ! » quand l'orateur cherche trop longtemps. Il se
 * charge pendant le délai de grâce, puis s'allume ; une seule fois par manche.
 */
function Hesitate({ intrus, names, selfId }: { intrus: IntrusState; names: Map<string, PlayerPublic>; selfId: string | null }) {
  const btn = useRef<HTMLButtonElement>(null);
  const from = intrus.hesitateFrom;
  const [ready, setReady] = useState(() => from !== null && serverNow() >= from);
  const speaker = names.get(intrus.speakerId ?? '');
  const mine = intrus.speakerId === selfId;

  useEffect(() => {
    if (from === null) return setReady(false);
    const wait = from - serverNow();
    setReady(wait <= 0);
    if (wait <= 0) return;
    const t = setTimeout(() => setReady(true), wait);
    return () => clearTimeout(t);
  }, [from, intrus.speakerId]);

  const fire = () => {
    if (!ready || !intrus.canHesitate || intrus.hesitationBy) return shake(btn.current);
    bump(btn.current, 1.1);
    net.send({ t: 'intrus', hesitate: true });
  };

  // Touche H pour buzzer sans quitter la visio des yeux.
  useEffect(() => {
    if (mine) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target instanceof HTMLElement && e.target.closest('input, textarea')) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key.toLowerCase() === 'h') fire();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  if (mine) return null;
  if (intrus.hesitationBy)
    return (
      <p key="pressed" className="m-rise text-center text-sm text-muted">
        <b className="text-bad">{names.get(intrus.hesitationBy)?.name ?? '…'}</b> a crié « Hésitation ! » : {speaker?.name ?? '…'} doit se décider, vite.
      </p>
    );
  if (!intrus.canHesitate)
    return (
      <p key="used" className="m-fade text-center text-sm text-muted">
        Tu as déjà buzzé cette manche. Écoute bien {speaker?.name ?? 'l’orateur'}…
      </p>
    );

  return (
    <div key={intrus.speakerId} className="m-rise flex flex-col items-center gap-1.5">
      <button
        ref={btn}
        type="button"
        onClick={fire}
        aria-disabled={!ready}
        className={`i-hesitate relative overflow-hidden rounded-full border-2 px-6 py-2.5 text-base font-bold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-info ${
          ready ? 'is-ready border-bad bg-bad text-white' : 'border-edge bg-surface text-muted'
        }`}
      >
        {!ready && from !== null && <span key={from} className="i-charge absolute inset-y-0 left-0 bg-bad/15" style={{ animationDuration: `${Math.max(0, from - serverNow())}ms` }} aria-hidden />}
        <span className="relative">✋ Hésitation !</span>
      </button>
      <p className="text-xs text-muted">
        {speaker?.name ?? 'L’orateur'} cherche trop longtemps ? Buzze une fois par manche<span className="max-sm:hidden"> (touche H)</span>.
      </p>
    </div>
  );
}

function Verdict({ result, names, selfId }: { result: IntrusResult; names: Map<string, PlayerPublic>; selfId: string | null }) {
  const name = (id: string | null) => (id === selfId ? 'toi' : (names.get(id ?? '')?.name ?? '?'));
  const intrusName = result.intrusId === selfId ? 'Tu étais' : `${name(result.intrusId)} était`;
  const me = result.intrusId === selfId;
  const accused = result.accusedId === selfId ? 'L’équipe s’est trompée sur toi.' : `Vous avez accusé ${name(result.accusedId)}.`;
  // Le titre se lit du point de vue de chacun : l'intrus qui s'échappe a gagné, lui.
  const [title, line] = result.stolen
    ? ['Volé !', `${intrusName} l'intrus, et a deviné « ${result.civil} ».`]
    : result.caught
      ? [me ? 'Démasqué…' : 'Démasqué !', `${intrusName} l'intrus. Bien joué l'équipe.`]
      : result.accusedId
        ? [me ? 'Bien caché !' : 'Raté…', `${accused} ${intrusName} l'intrus.`]
        : [me ? 'Bien caché !' : 'Égalité', `Personne n'est éliminé. ${intrusName} l'intrus et s'échappe.`];
  return (
    <div className="flex flex-col items-center gap-2 text-center" role="status">
      <span className="w-stamp rounded-full bg-surface px-4 py-2 text-lg font-semibold shadow-lg ring-1 ring-edge" style={{ animationDelay: '500ms' }}>
        {title}
      </span>
      <p className="m-fade text-sm text-muted" style={{ animationDelay: '700ms' }}>
        {line}
        {result.steal && !result.stolen && ` Sa tentative : « ${result.steal} ».`}
      </p>
      <p className="m-fade flex flex-wrap justify-center gap-2 text-sm" style={{ animationDelay: '850ms' }}>
        <span className="rounded-full border border-edge px-2.5 py-0.5">
          Les autres : <b>{result.civil}</b>
        </span>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[#18181b]">
          L'intrus : <b>{result.intrus}</b>
        </span>
      </p>
    </div>
  );
}
