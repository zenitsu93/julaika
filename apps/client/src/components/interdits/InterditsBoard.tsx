import { useEffect, useRef, useState, type ReactNode } from 'react';
import { INTERDITS_SKIPS, type InterditsCard, type InterditsPlay, type InterditsState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { call, useCall } from '../../lib/call';
import { net } from '../../lib/net';
import { buzzerLong, play, tick } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, shake, Ticker, useCountUp } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { GuessBox } from '../GuessBox';
import { SoundBoard } from '../SoundBoard';
import { ecouteSupported, useEcoute } from './ecoute';
import './interdits.css';

/** Plateau de Mots interdits : la caméra de celui qui fait deviner en grand, la carte à côté. */
export function InterditsBoard() {
  const phase = useGame((s) => s.room!.phase);
  const s = useGame((st) => st.room!.interdits);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {s && <Turns s={s} />}
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' || !s ? <Teaser /> : phase === 'faceoff' ? <Intro key={s.turn} s={s} /> : phase === 'verdict' ? <Recap key={s.turn} s={s} /> : <Explain key={s.turn} s={s} />}
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

type Role = 'explain' | 'guard' | 'guess';

function useRole(s: InterditsState): Role {
  const selfId = useGame((st) => st.selfId);
  return selfId === s.explainerId ? 'explain' : selfId === s.guardId ? 'guard' : 'guess';
}

function usePlayer(id: string | null | undefined): PlayerPublic | undefined {
  return useGame((s) => s.room!.players.find((p) => p.id === id));
}

function useName() {
  const selfId = useGame((st) => st.selfId);
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

/** Derrière les réglages : une carte qui se fait barrer ses mots, encore et encore. */
function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="ti-teaser">
        <CardFace card={{ word: 'Sourire', ban: ['bouche', 'dents', 'rire', 'heureux'] }} demo />
      </div>
    </div>
  );
}

/** Qui fait deviner, qui garde la carte, et une pastille par tour. */
function Turns({ s }: { s: InterditsState }) {
  const explainer = usePlayer(s.explainerId);
  const guard = usePlayer(s.guardId);
  const name = useName();
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span key={s.turn} className="m-rise flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full border border-accent/60 bg-accent/15 px-2.5 py-1 font-medium">
          {avatarOf(explainer?.avatar ?? 0)} {name(explainer)}
        </span>
        <span className="font-mono text-xs text-muted">fait deviner</span>
        {guard && (
          <>
            <span className="font-mono text-xs text-muted">·</span>
            <span className="rounded-full border border-bad/40 bg-bad/10 px-2.5 py-1 font-medium">
              🛎️ {name(guard)} <span className="text-muted">garde</span>
            </span>
          </>
        )}
      </span>
      <span className="flex items-center gap-1" aria-label={`Tour ${s.turn + 1} sur ${s.turns}`}>
        {Array.from({ length: s.turns }, (_, i) => (
          <span key={i} className={`size-2.5 rounded-full transition-all duration-500 ${i < s.turn ? 'm-pop bg-accent' : i === s.turn ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`} />
        ))}
      </span>
    </div>
  );
}

/** Présentation du tour : la caméra arrive, le rôle de chacun, puis 3, 2, 1. */
function Intro({ s }: { s: InterditsState }) {
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const role = useRole(s);
  const explainer = usePlayer(s.explainerId);
  useEffect(() => {
    if (left > 0 && left <= 3) tick(left === 1);
  }, [left]);
  const line =
    role === 'explain'
      ? 'À toi de faire deviner : parle, mais pas les mots interdits !'
      : role === 'guard'
        ? 'Tu gardes la carte : buzze au moindre mot interdit.'
        : `Écoute ${explainer?.name ?? '…'} et crie tes réponses !`;

  return (
    <div className="grid min-h-[28rem] place-items-center p-4 sm:p-6">
      <div className="grid w-full max-w-2xl grid-cols-[1fr_auto] items-center gap-4 sm:gap-8">
        <div className="s-in-left">
          <Face id={s.explainerId} />
        </div>
        <span key={left} className="s-count font-mono text-6xl font-bold tabular-nums sm:text-8xl" aria-live="assertive">
          {left > 3 ? '🤐' : left || 'Go'}
        </span>
      </div>
      <p className="m-rise mt-4 text-center text-lg font-semibold tracking-[-0.02em]" style={{ animationDelay: '300ms' }}>
        {line}
      </p>
    </div>
  );
}

/** La caméra d'un joueur (muette : le son passe par la visio), sinon son avatar qui respire. */
function Face({ id, big = false, children }: { id: string; big?: boolean; children?: ReactNode }) {
  const player = usePlayer(id);
  const selfId = useGame((s) => s.selfId);
  const view = useCall();
  const self = id === selfId;
  const stream = self ? view.local : (view.remotes[id] ?? null);
  const video = useRef<HTMLVideoElement>(null);
  const cam = Boolean(player?.cam && stream);
  useEffect(() => {
    if (video.current && video.current.srcObject !== stream) video.current.srcObject = stream;
  }, [stream, cam]);

  return (
    <figure className={`ti-face relative m-0 overflow-hidden rounded-xl bg-[#1d130e] text-white ${big ? 'aspect-[4/3] sm:aspect-video' : 'aspect-[4/3]'}`}>
      <video ref={video} autoPlay playsInline muted className={`size-full object-cover ${self ? '-scale-x-100' : ''} ${cam ? '' : 'invisible'}`} />
      {!cam && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="m-breathe text-6xl sm:text-7xl">{avatarOf(player?.avatar ?? 0)}</span>
        </span>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-4 ring-inset ring-accent" aria-hidden />
      <figcaption className="absolute inset-x-2 bottom-2 flex items-center gap-2">
        <span className="truncate rounded-full bg-black/55 px-2.5 py-0.5 text-xs backdrop-blur-md">
          🗣️ {self ? 'Tu fais deviner' : `${player?.name ?? '…'} fait deviner`}
        </span>
        {!player?.mic && <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-md">micro coupé</span>}
      </figcaption>
      {children}
    </figure>
  );
}

/** Le tour : la scène, la carte (ou les bruitages), les effets de chaque carte tranchée. */
function Explain({ s }: { s: InterditsState }) {
  const role = useRole(s);
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const stage = useRef<HTMLDivElement>(null);
  const burst = useRef<HTMLCanvasElement>(null);
  const [flash, setFlash] = useState<InterditsPlay | null>(null);
  const seen = useRef(s.played.length);

  useEffect(() => {
    if (left > 0 && left <= 5) tick(left <= 3);
  }, [left]);

  // Chaque carte tranchée a son effet : buzzer et secousse, ding et confettis, ou un boing.
  useEffect(() => {
    if (s.played.length <= seen.current) return;
    seen.current = s.played.length;
    const last = s.played.at(-1)!;
    setFlash(last);
    if (last.outcome === 'buzz') {
      buzzerLong();
      shake(stage.current);
    } else if (last.outcome === 'found') {
      play('ding');
      const stop = confetti(burst.current, 40);
      const t = setTimeout(() => setFlash(null), 1100);
      return () => {
        clearTimeout(t);
        stop?.();
      };
    } else play('boing');
    const t = setTimeout(() => setFlash(null), 1100);
    return () => clearTimeout(t);
  }, [s.played]);

  const found = s.played.filter((p) => p.outcome === 'found').length;

  return (
    <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div ref={stage} className="relative flex min-w-0 flex-col gap-3">
        <div className="m-rise relative">
          <Face id={s.explainerId} big>
            <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 font-mono text-sm font-bold backdrop-blur-md" aria-label={`${found} mots trouvés`}>
              ✓ <Ticker value={found} />
            </span>
            <Ring endsAt={endsAt} left={left} />
            {flash && <Flash key={s.played.length} play={flash} />}
          </Face>
        </div>
        <Pile played={s.played} />
      </div>
      <aside className="flex flex-col gap-3">{role === 'guess' ? <Guesser s={s} /> : <Holder s={s} role={role} />}</aside>
    </div>
  );
}

/** Anneau du temps sur la caméra : il se vide et rougit sur la fin. */
function Ring({ endsAt, left }: { endsAt: number | null; left: number }) {
  const circle = useRef<SVGCircleElement>(null);
  const total = useRef(0);
  useEffect(() => {
    const el = circle.current;
    if (!el || !endsAt) return;
    total.current = Math.max(1, endsAt - serverNow());
    let raf = 0;
    const loop = () => {
      el.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, (endsAt - serverNow()) / total.current)));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  const urgent = left <= 10;
  return (
    <div className={`absolute bottom-3 right-3 grid size-16 place-items-center rounded-full bg-black/55 backdrop-blur-md sm:size-20 ${urgent ? 's-urgent' : ''}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r="19" fill="none" stroke="white" strokeOpacity=".2" strokeWidth="3" />
        <circle ref={circle} cx="22" cy="22" r="19" fill="none" pathLength={1} strokeDasharray="1" stroke={urgent ? 'var(--color-bad)' : 'var(--color-gold)'} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="relative font-mono text-xl font-bold tabular-nums sm:text-2xl" aria-label="Secondes restantes">
        <Ticker value={left} />
      </span>
    </div>
  );
}

/** Le tampon qui s'abat sur la scène : BZZZ rouge, Trouvé doré, ou Passée. */
function Flash({ play: p }: { play: InterditsPlay }) {
  const by = usePlayer(p.by);
  const label = p.outcome === 'buzz' ? 'Bzzz !' : p.outcome === 'found' ? 'Trouvé !' : 'Passée';
  const tone = p.outcome === 'buzz' ? 'border-bad text-bad bg-white/90' : p.outcome === 'found' ? 'border-gold text-cacao bg-butter/95' : 'border-white/70 text-white bg-black/40';
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-live="assertive">
      {p.outcome === 'buzz' && <span className="ti-redout absolute inset-0" />}
      {p.outcome === 'found' && <span className="ti-halo absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-gold" />}
      <div className="text-center">
        <p className={`s-stamp inline-block rounded-xl border-4 px-5 py-1 text-4xl font-black uppercase tracking-[-0.03em] sm:text-6xl ${tone}`}>{label}</p>
        <p className="m-rise mt-2 text-sm font-medium" style={{ animationDelay: '200ms' }}>
          <span className="rounded-full bg-black/60 px-3 py-1 backdrop-blur-md">
            {p.word}
            {p.outcome === 'buzz' && p.heard ? ` · « ${p.heard} » entendu` : p.outcome === 'found' && by ? ` · par ${by.name}` : ''}
          </span>
        </p>
      </div>
    </div>
  );
}

/** Les cartes déjà jouées, empilées sous la scène comme des tickets. */
function Pile({ played }: { played: InterditsPlay[] }) {
  if (!played.length) return <p className="text-center text-sm text-muted">Les cartes jouées s’empilent ici.</p>;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Cartes jouées">
      {played.map((p, i) => (
        <li
          key={i}
          className={`ti-chip rounded-full border px-2.5 py-0.5 text-sm ${
            p.outcome === 'found' ? 'border-good/50 bg-good/10' : p.outcome === 'buzz' ? 'border-bad/50 bg-bad/10 line-through decoration-bad decoration-2' : 'border-edge text-muted'
          }`}
        >
          {p.outcome === 'found' ? '✓' : p.outcome === 'buzz' ? '🛎️' : '↷'} {p.word}
        </li>
      ))}
    </ul>
  );
}

/** La carte, recto : le mot en grand, les mots interdits barrés de rouge. */
function CardFace({ card, demo = false }: { card: InterditsCard; demo?: boolean }) {
  return (
    <div className={`ti-card relative overflow-hidden rounded-2xl bg-cacao p-4 text-butter shadow-lg ${demo ? 'w-64' : ''}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-butter/60">Fais deviner</p>
      <p className="ti-word mt-0.5 text-3xl font-bold tracking-[-0.03em] text-gold">{card.word}</p>
      <div className="my-3 h-px bg-butter/15" />
      <p className="text-[11px] uppercase tracking-[0.18em] text-butter/60">Sans dire</p>
      <ul className="mt-1.5 space-y-1">
        {card.ban.map((w, i) => (
          <li key={w} className="ti-ban flex items-center gap-2 text-lg font-medium" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-bad text-[11px] font-black text-white" aria-hidden>
              ✕
            </span>
            <span className="relative">
              {w}
              <span className="ti-strike absolute inset-x-0 top-1/2 h-0.5 rounded bg-bad" style={{ animationDelay: `${demo ? 600 + i * 900 : 380 + i * 70}ms` }} aria-hidden />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Celui qui fait deviner et le gardien : la carte, et leurs boutons. */
function Holder({ s, role }: { s: InterditsState; role: 'explain' | 'guard' }) {
  const view = useCall();
  const card = s.card;
  const send = (msg: { found: number } | { skip: number } | { buzz: number; heard?: string }) => net.send({ t: 'interdits', ...msg });
  const solo = !s.guardId;
  // À deux, l'oreille de l'arbitre est ouverte d'office ; à trois et plus, le gardien suffit.
  const [ear, setEar] = useState(solo && ecouteSupported());
  const listen = useEcoute(card, s.cardNo, role === 'explain' && ear && view.joined && view.mic, (word) => send({ buzz: s.cardNo, heard: word }));
  useHolderKeys(s, role);

  return (
    <>
      {card ? (
        <div key={s.cardNo} className="ti-deal">
          <CardFace card={card} />
        </div>
      ) : (
        <div className="panel grid h-48 place-items-center text-muted">…</div>
      )}

      {role === 'explain' ? (
        <>
          {!view.joined || !view.mic ? (
            <button className="btn-primary m-pop w-full" onClick={() => (view.joined ? void call.toggle('audio') : void call.join(true, true))}>
              🎙️ Ouvre ton micro pour faire deviner
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              className="ti-found btn col-span-2 bg-good py-3 text-base font-semibold text-white"
              onClick={(e) => {
                bump(e.currentTarget, 1.04);
                send({ found: s.cardNo });
              }}
            >
              ✓ Trouvé ! <span className="kbd border-white/30 text-white/80 max-sm:hidden">Entrée</span>
            </button>
            <button
              className="btn border border-edge bg-surface py-2 text-sm disabled:opacity-40"
              disabled={s.skips <= 0}
              onClick={(e) => {
                bump(e.currentTarget);
                send({ skip: s.cardNo });
              }}
            >
              ↷ Passer ({s.skips}/{INTERDITS_SKIPS})
            </button>
            <button
              className="btn border border-bad/40 py-2 text-sm text-bad hover:bg-bad/10"
              onClick={(e) => {
                bump(e.currentTarget);
                send({ buzz: s.cardNo });
              }}
            >
              🙊 Oups, dit !
            </button>
          </div>
          {ecouteSupported() && (
            <div className="panel p-3 text-sm">
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className={listen.listening ? 'ti-ear' : ''}>👂</span>
                  Oreille de l’arbitre
                </span>
                <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={ear} onChange={(e) => setEar(e.target.checked)} />
              </label>
              <p className="mt-1 text-xs text-muted">
                {listen.denied
                  ? 'Micro refusé à la reconnaissance vocale.'
                  : listen.listening
                    ? 'J’écoute : un mot interdit et ça buzze tout seul.'
                    : 'Le navigateur peut buzzer tout seul s’il t’entend dire un mot interdit.'}
              </p>
              {listen.listening && listen.heard && (
                <p key={listen.heard.split(' ').length} className="m-fade mt-2 truncate rounded-md bg-edge/50 px-2 py-1 font-mono text-xs">
                  « {listen.heard} »
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <button
            className="ti-buzz btn w-full bg-bad py-5 text-2xl font-black uppercase tracking-[-0.02em] text-white"
            onClick={(e) => {
              bump(e.currentTarget, 1.06);
              send({ buzz: s.cardNo });
            }}
          >
            🛎️ Buzz ! <span className="kbd border-white/30 text-sm text-white/80 max-sm:hidden">Espace</span>
          </button>
          <p className="text-center text-sm text-muted">Un mot interdit, le mot lui-même, ou un geste qui l’épelle : buzze !</p>
        </>
      )}
    </>
  );
}

/** Raccourcis : Entrée (trouvé) et P (passer) pour celui qui fait deviner, Espace pour le gardien. */
function useHolderKeys(s: InterditsState, role: 'explain' | 'guard') {
  const cardNo = s.cardNo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.repeat || t.closest('input, textarea, [contenteditable]')) return;
      if (role === 'guard' && e.code === 'Space') {
        e.preventDefault();
        net.send({ t: 'interdits', buzz: cardNo });
      } else if (role === 'explain' && e.key === 'Enter' && !t.closest('button')) {
        e.preventDefault();
        net.send({ t: 'interdits', found: cardNo });
      } else if (role === 'explain' && e.key.toLowerCase() === 'p') {
        net.send({ t: 'interdits', skip: cardNo });
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [cardNo, role]);
}

/** Les devineurs : crier, taper, et mettre l'ambiance aux bruitages. */
function Guesser({ s }: { s: InterditsState }) {
  const explainer = usePlayer(s.explainerId);
  return (
    <>
      <div className="relative overflow-hidden rounded-2xl bg-cacao p-4 text-butter">
        <p className="pr-12 text-[11px] uppercase tracking-[0.18em] text-butter/60">Carte n° {s.cardNo}</p>
        <p className="mt-1 pr-12 text-lg font-semibold leading-snug tracking-[-0.02em]">
          Écoute {explainer?.name ?? '…'} et crie tes idées, ou tape-les.
        </p>
        <p className="mt-2 text-sm text-butter/70">Une réponse tapée juste rapporte 100 points ; dite à voix haute, 50 à chaque devineur.</p>
        <span className="ti-card-back pointer-events-none absolute -right-7 -top-7 grid size-20 rotate-12 place-items-center rounded-2xl border-2 border-dashed border-gold/50 text-4xl" aria-hidden>
          🤐
        </span>
      </div>
      {/* Téléphone : la réponse se tape ici, sous la carte, plutôt que tout en bas dans le chat. */}
      <div className="lg:hidden">
        <GuessBox variant="bar" />
      </div>
      <div className="panel p-3">
        <p className="mb-2 text-xs font-medium text-muted">Bruitages</p>
        <SoundBoard compact />
      </div>
    </>
  );
}

/** Bilan du tour : les cartes retournées (avec leurs mots interdits), puis les points. */
function Recap({ s }: { s: InterditsState }) {
  const players = useGame((st) => st.room!.players);
  const selfId = useGame((st) => st.selfId);
  const explainer = usePlayer(s.explainerId);
  const name = useName();
  const found = s.played.filter((p) => p.outcome === 'found').length;
  const burst = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (found >= 3) {
      play('bravo');
      return confetti(burst.current, 80);
    }
    play(found ? 'ding' : 'trombone');
  }, [found]);

  return (
    <div className="relative min-h-[28rem] p-4 sm:p-6">
      <canvas ref={burst} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative text-center">
        <p className="m-pop text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
          {found} mot{found > 1 ? 's' : ''} trouvé{found > 1 ? 's' : ''}
        </p>
        <p className="m-rise mt-1 text-muted" style={{ animationDelay: '150ms' }}>
          {name(explainer)} {explainer?.id === selfId ? 'as' : 'a'} fait deviner
        </p>
      </div>
      <ul className="relative mx-auto mt-5 grid max-w-3xl gap-2 sm:grid-cols-2">
        {s.played.map((p, i) => (
          <li key={i} className="ti-flip panel flex items-start gap-3 p-3" style={{ animationDelay: `${250 + i * 90}ms` }}>
            <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${p.outcome === 'found' ? 'bg-good text-white' : p.outcome === 'buzz' ? 'bg-bad text-white' : 'bg-edge text-muted'}`}>
              {p.outcome === 'found' ? '✓' : p.outcome === 'buzz' ? '🛎️' : '↷'}
            </span>
            <span className="min-w-0 text-left">
              <b className="block">{p.word}</b>
              <span className="block truncate text-xs text-muted">
                {p.ban.map((w) => (
                  <span key={w} className={`mr-1.5 ${p.heard === w ? 'font-semibold text-bad line-through' : ''}`}>
                    {w}
                  </span>
                ))}
              </span>
            </span>
          </li>
        ))}
        {!s.played.length && <li className="text-center text-muted sm:col-span-2">Aucune carte jouée… le silence est d’or ?</li>}
      </ul>
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        {Object.entries(s.gains ?? {})
          .sort((a, b) => b[1] - a[1])
          .map(([id, gain], i) => {
            const p = players.find((x) => x.id === id);
            return p ? <Gain key={id} player={p} self={id === selfId} gain={gain} delay={500 + i * 120} /> : null;
          })}
      </div>
    </div>
  );
}

function Gain({ player, self, gain, delay }: { player: PlayerPublic; self: boolean; gain: number; delay: number }) {
  const shown = useCountUp(Math.abs(gain), { delay });
  const tone = gain > 0 ? 'border-good/50 bg-good/10 text-good' : gain < 0 ? 'border-bad/50 bg-bad/10 text-bad' : 'border-edge text-muted';
  return (
    <span style={{ animationDelay: `${delay}ms` }} className={`m-pop flex items-center gap-2 rounded-full border px-3 py-1.5 ${tone}`}>
      <span>{avatarOf(player.avatar)}</span>
      <span className="text-sm text-ink">{self ? 'Toi' : player.name}</span>
      <b className="font-mono tabular-nums">
        {gain < 0 ? '−' : '+'}
        {shown}
      </b>
    </span>
  );
}
