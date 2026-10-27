import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PHOTO_COUNTDOWN, PHOTO_MAX_STARS, PHOTO_STAR_POINTS, type PhotoState } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { call, useCall } from '../../lib/call';
import { net } from '../../lib/net';
import { snapshot } from '../../lib/polaroid';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, useCountUp, useFlip } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { Polaroid, SaveButton } from '../Polaroid';
import './photo.css';

/** Inclinaison d'un tirage posé sur la table : stable pour un joueur, variée d'un joueur à l'autre. */
const tiltOf = (id: string, round = 0) => {
  let h = round * 31;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) % 997;
  return ((h % 9) - 4) * 1.1;
};

/** Plateau du Photomaton : qui a posé ou noté, la cabine photo, puis la table des polaroids. */
export function PhotoBoard() {
  const phase = useGame((s) => s.room!.phase);
  const paused = useGame((s) => !!s.room!.photo?.paused) && (phase === 'pose' || phase === 'vote' || phase === 'reveal');
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <PhotoBar />
      <div className="panel relative min-h-[30rem] overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,color-mix(in_oklab,var(--color-accent)_9%,transparent),transparent_70%)]">
        {phase === 'pose' ? <Booth /> : phase === 'vote' || phase === 'reveal' ? <Table /> : <Teaser />}
        <Presence>
          {phase === 'lobby' ? (
            <Veil key="lobby" flow>
              <Lobby />
            </Veil>
          ) : phase === 'gameEnd' ? (
            <Veil key="end">
              <Finale />
            </Veil>
          ) : paused ? (
            <PauseVeil key="pause" />
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

/** Derrière les réglages : trois polaroids en éventail, pour donner le ton. */
function Teaser() {
  const shots = [
    { r: -9, label: 'Surpris !', a: 3 },
    { r: 2, label: 'Star de ciné', a: 11 },
    { r: 11, label: 'Citron acide', a: 24 },
  ];
  return (
    <div className="grid h-full min-h-[30rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <div className="flex -space-x-10 opacity-60">
        {shots.map((s, i) => (
          <div key={i} className="pm-fan w-36" style={{ '--r': `${s.r}deg`, animationDelay: `${i * -1.4}s` } as CSSProperties}>
            <Polaroid image={null} avatar={s.a} caption={s.label} enter="toss" delay={i * 140} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Joueurs de la partie : une coche sur ceux qui ont posé (ou fini de noter), et les manches. */
function PhotoBar() {
  const players = useGame((s) => s.room!.players);
  const photo = useGame((s) => s.room!.photo);
  const phase = useGame((s) => s.room!.phase);
  const selfId = useGame((s) => s.selfId);
  const list = useRef<HTMLOListElement>(null);
  const done = new Set(photo?.done ?? []);
  const live = phase === 'pose' || phase === 'vote';
  const ordered = [...players].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));
  useFlip(list, [ordered.map((p) => p.id).join()]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <ol ref={list} className="flex flex-wrap justify-center gap-1.5" aria-label="Joueurs">
        {ordered.map((p) => {
          const finished = live && done.has(p.id);
          const playing = live && photo?.players.includes(p.id);
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
              <span className="font-mono text-xs tabular-nums text-muted">{p.score}</span>
              {finished ? (
                <span key="ok" className="m-pop" title={phase === 'pose' ? 'Photo envoyée' : 'A noté'}>
                  ✓
                </span>
              ) : playing ? (
                <span className="m-wobble text-xs" title={phase === 'pose' ? 'Prend la pose' : 'Note les photos'}>
                  {phase === 'pose' ? '📸' : '⭐'}
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
      {photo && <Rounds photo={photo} />}
      {photo && (phase === 'pose' || phase === 'vote' || phase === 'reveal') && <PauseButton paused={photo.paused} />}
    </div>
  );
}

/** Chez l'hôte : mettre la partie en pause, ou la relancer. L'icône passe de ⏸ à ▶ en se tordant. */
function PauseButton({ paused }: { paused: boolean }) {
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!isHost) return null;
  return (
    <button
      ref={btn}
      type="button"
      onClick={() => {
        bump(btn.current, 0.92);
        net.send({ t: 'photo', pause: !paused });
      }}
      aria-pressed={paused}
      className={`pm-pausebtn flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-info ${
        paused ? 'border-accent bg-accent text-[#2a1a12]' : 'border-edge bg-surface hover:bg-edge/40'
      }`}
    >
      <svg key={paused ? 'play' : 'pause'} viewBox="0 0 24 24" className="pm-pauseicon size-4" fill="currentColor" aria-hidden>
        {paused ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
      </svg>
      {paused ? 'Reprendre' : 'Pause'}
    </button>
  );
}

/** La partie est figée : un voile, deux barres qui respirent, et le temps qui restait. */
function PauseVeil() {
  const photo = useGame((s) => s.room!.photo);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const left = photo?.pausedLeft ? Math.ceil(photo.pausedLeft / 1000) : null;
  return (
    <div className="m-veil absolute inset-0 z-30 grid place-items-center bg-page/80 p-4 backdrop-blur-[6px]">
      <div className="m-card text-center">
        <div className="pm-pausemark mx-auto flex h-16 items-center justify-center gap-2.5" aria-hidden>
          <span className="h-full w-4 rounded-md bg-accent" />
          <span className="h-full w-4 rounded-md bg-accent" style={{ animationDelay: '180ms' }} />
        </div>
        <p className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Pause</p>
        <p className="mt-1 text-muted">{isHost ? 'Tout est figé. Relance quand vous êtes prêts.' : 'L’hôte a mis la partie en pause.'}</p>
        {left !== null && <p className="mt-2 font-mono text-xs text-muted tabular-nums">Il restera {left} s à la reprise</p>}
        {isHost && (
          <button type="button" className="btn btn-primary mt-4" onClick={() => net.send({ t: 'photo', pause: false })}>
            ▶ Reprendre
          </button>
        )}
      </div>
    </div>
  );
}

/** Une pellicule : une case par manche, la case en cours respire. */
function Rounds({ photo }: { photo: PhotoState }) {
  return (
    <span className="flex items-center gap-1 rounded-md bg-[#2a1a12] px-1.5 py-1" aria-label={`Manche ${photo.round} sur ${photo.rounds}`}>
      {Array.from({ length: photo.rounds }, (_, i) => {
        const past = i + 1 < photo.round;
        const current = i + 1 === photo.round;
        return (
          <span
            key={i}
            className={`h-3 w-4 rounded-[2px] transition-all duration-500 ${past ? 'm-pop bg-accent' : current ? 'm-breathe bg-[#fbf8f1]' : 'bg-white/15'}`}
          />
        );
      })}
    </span>
  );
}

// ---- La cabine ----------------------------------------------------------------------

/** Millisecondes avant le flash, rafraîchies à chaque image. */
function useLeft(endsAt: number | null) {
  const [left, setLeft] = useState(() => (endsAt ? endsAt - serverNow() : 0));
  useEffect(() => {
    if (!endsAt) return;
    let raf = 0;
    const tick = () => {
      const l = endsAt - serverNow();
      setLeft(l);
      if (l > -1500) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  return left;
}

/** La consigne, la caméra en grand dans un viseur, le décompte, le flash, puis le tirage qui sort. */
function Booth() {
  const photo = useGame((s) => s.room!.photo);
  const selfId = useGame((s) => s.selfId);
  if (!photo) return null;
  if (!photo.players.includes(selfId ?? ''))
    return (
      <div className="m-rise grid min-h-[30rem] place-items-center p-6 text-center">
        <div>
          <p className="text-4xl">🍿</p>
          <p className="mt-2 text-lg font-semibold">Séance photo en cours</p>
          <p className="text-muted">Tu poseras à la prochaine partie ; les tirages arrivent bientôt.</p>
        </div>
      </div>
    );
  // Une clé par manche : nouvelle consigne, nouveau viseur, nouvelle animation.
  return <Shoot key={photo.round} photo={photo} />;
}

function Shoot({ photo }: { photo: PhotoState }) {
  const endsAt = useGame((s) => s.room!.endsAt);
  const self = useGame((s) => s.room!.players.find((p) => p.id === s.selfId));
  const view = useCall();
  const video = useRef<HTMLVideoElement>(null);
  const [shot, setShot] = useState<{ image: string | null } | null>(null);
  const [flash, setFlash] = useState(false);
  const sent = useRef(false);
  const left = useLeft(endsAt);
  const COUNT = PHOTO_COUNTDOWN * 1000;
  const counting = !shot && !!endsAt && left > 0 && left <= COUNT;
  const n = Math.ceil(left / 1000);

  useEffect(() => {
    if (video.current && video.current.srcObject !== view.local) video.current.srcObject = view.local;
  }, [view.local]);

  // Le flash tombe à l'heure du serveur : même instant pour tout le monde.
  useEffect(() => {
    // En pause, endsAt disparaît : le flash attend la reprise. Il ne part qu'une fois par manche.
    if (!endsAt || sent.current) return;
    const t = setTimeout(() => {
      sent.current = true;
      const image = snapshot(video.current);
      net.send({ t: 'photo', image });
      setShot({ image });
      if (!reducedMotion()) setFlash(true);
    }, Math.max(0, endsAt - serverNow()));
    return () => clearTimeout(t);
  }, [endsAt]);

  const words = photo.prompt.split(' ');
  return (
    <div className="flex min-h-[30rem] flex-col items-center gap-5 p-4 sm:p-6">
      <header className="max-w-2xl text-center">
        <p className="m-rise text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Manche {photo.round}/{photo.rounds} · Ta meilleure tête pour…
        </p>
        <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.03em] text-balance sm:text-4xl">
          {words.map((w, i) => (
            <span key={i} className="pm-word" style={{ animationDelay: `${120 + i * 70}ms` }}>
              {w}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </h2>
      </header>

      <div className="relative w-full max-w-[min(26rem,calc(100dvh-20rem))] min-w-[15rem]">
        {shot ? (
          <div className="mx-auto w-[86%]">
            <Polaroid image={shot.image} caption={photo.prompt} name="Toi" avatar={self?.avatar} tilt={-2} enter="eject" develop download />
            {shot.image && (
              <div className="m-rise mt-4 flex justify-center" style={{ animationDelay: '1400ms' }}>
                <SaveButton image={shot.image} caption={photo.prompt} name={self?.name} />
              </div>
            )}
          </div>
        ) : (
          <div className={`relative aspect-square overflow-hidden rounded-2xl bg-[#1c110c] shadow-[0_30px_60px_-30px_rgb(40_20_10/0.7)] ring-1 ring-black/10 ${counting ? 'pm-focus' : ''}`}>
            <video ref={video} autoPlay playsInline muted className={`size-full -scale-x-100 object-cover ${view.cam ? '' : 'invisible'}`} />
            {!view.cam && <NoCamera joined={view.joined} avatar={self?.avatar ?? 0} counting={counting} />}
            <span className="pm-corner tl" />
            <span className="pm-corner tr" />
            <span className="pm-corner bl" />
            <span className="pm-corner br" />
            <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur-md">
              <span className="pm-rec size-2 rounded-full bg-bad" />
              {counting ? 'Souris !' : 'Prends la pose'}
            </span>
            {counting && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <svg viewBox="0 0 100 100" className="absolute size-40 -rotate-90 sm:size-48" aria-hidden>
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / .18)" strokeWidth="4" />
                  <circle
                    className="pm-ring"
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1"
                    style={{ animationDuration: `${COUNT}ms`, animationDelay: `${left - COUNT}ms` }}
                  />
                </svg>
                <span key={n} className="pm-count text-8xl font-extrabold tabular-nums text-white sm:text-9xl" aria-live="assertive">
                  {n}
                </span>
              </div>
            )}
            {!counting && endsAt && left > COUNT && (
              <span className="absolute inset-x-0 bottom-4 text-center">
                <span className="m-rise inline-block rounded-full bg-black/45 px-3 py-1 font-mono text-xs text-white backdrop-blur-md">
                  Flash dans {Math.ceil(left / 1000)} s
                </span>
              </span>
            )}
          </div>
        )}
        {flash && (
          <>
            <span className="pm-shutter pointer-events-none absolute inset-x-0 top-0 h-1/2 origin-top bg-black" onAnimationEnd={(e) => (e.currentTarget.hidden = true)} />
            <span className="pm-shutter pointer-events-none absolute inset-x-0 bottom-0 h-1/2 origin-bottom bg-black" onAnimationEnd={(e) => (e.currentTarget.hidden = true)} />
          </>
        )}
      </div>
      {flash && <span className="pm-flash fixed inset-0 z-50 bg-white" onAnimationEnd={() => setFlash(false)} aria-hidden />}
      {shot && <Waiting photo={photo} />}
    </div>
  );
}

/** Caméra éteinte : on propose de l'allumer, sinon le tirage portera l'avatar. */
function NoCamera({ joined, avatar, counting }: { joined: boolean; avatar: number; counting: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => void bump(btn.current, 1.06), []);
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center text-[#f4ead2]">
      <div>
        <span className="m-breathe inline-block text-5xl">{avatarOf(avatar)}</span>
        {/* Pendant le décompte, la phrase s'efface : le gros chiffre ne se pose plus dessus. */}
        <p className={`mt-2 text-sm transition-[opacity,filter] duration-300 ${counting ? 'opacity-0 blur-sm' : 'opacity-80'}`}>Sans caméra, ton polaroid restera dans le noir.</p>
        <button ref={btn} type="button" className="btn mt-3 bg-[#fbf8f1] text-[#2a1a12]" onClick={() => void (joined ? call.toggle('video') : call.join(true, false))}>
          📷 Allumer ma caméra
        </button>
      </div>
    </div>
  );
}

function Waiting({ photo }: { photo: PhotoState }) {
  const players = useGame((s) => s.room!.players);
  const waiting = players.filter((p) => photo.players.includes(p.id) && !photo.done.includes(p.id));
  return (
    <div className="m-rise text-center" style={{ animationDelay: '900ms' }}>
      <p className="text-muted">{waiting.length ? 'Les autres tirages se développent…' : 'Tout le monde a posé !'}</p>
      <ul className="mt-2 flex justify-center gap-2">
        {waiting.map((p) => (
          <li key={p.id} className="m-pop m-breathe text-2xl" title={p.name}>
            {avatarOf(p.avatar)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- La table des polaroids --------------------------------------------------------

/** Vote : les tirages tombent côte à côte et chacun note ceux des autres. Révélation : les étoiles, puis le classement. */
function Table() {
  const photo = useGame((s) => s.room!.photo);
  const phase = useGame((s) => s.room!.phase);
  const photos = useGame((s) => s.photos);
  const selfId = useGame((s) => s.selfId);
  const grid = useRef<HTMLDivElement>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const reveal = phase === 'reveal';
  const confettiRef = useRef<HTMLCanvasElement>(null);

  // Nouvelle manche : les notes repartent de zéro.
  const round = photos?.round ?? 0;
  useEffect(() => setVotes({}), [round]);

  const shots = photos?.shots ?? [];
  const stars = photo?.stars ?? {};
  const best = reveal ? Math.max(0, ...shots.map((s) => stars[s.by]?.total ?? 0)) : 0;
  const ordered = reveal ? [...shots].sort((a, b) => (stars[b.by]?.total ?? 0) - (stars[a.by]?.total ?? 0)) : shots;
  useFlip(grid, [ordered.map((s) => s.by).join(), reveal]);

  useEffect(() => {
    if (!reveal || !best) return;
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(confettiRef.current, 70)), 1000);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, [reveal, best]);

  if (!photo || !photos) return <Developing />;
  const toRate = shots.filter((s) => s.by !== selfId && s.image);
  const rated = toRate.filter((s) => votes[s.by]).length;
  const playing = photo.players.includes(selfId ?? '');
  const validated = photo.done.includes(selfId ?? '');
  const canRate = !reveal && playing && !validated && !!photo.opensAt && !photo.paused;

  return (
    <div className="relative flex min-h-[30rem] flex-col items-center gap-4 p-4 sm:p-6">
      <canvas ref={confettiRef} className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden />
      {!reveal && photo.opensAt && <VoteIntro key={photo.round} opensAt={photo.opensAt} prompt={photo.prompt} paused={photo.paused} />}
      <header className="text-center">
        <p className="m-rise text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Manche {photo.round}/{photo.rounds} · {reveal ? 'Les résultats' : playing && toRate.length ? `Note les photos (${rated}/${toRate.length})` : 'Les autres notent…'}
        </p>
        <h2 key={reveal ? 'r' : 'v'} className="m-pop mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
          {reveal ? (best ? 'Et la photo de la manche est…' : 'Personne n’a noté cette fois !') : 'Qui a le mieux joué la consigne ?'}
        </h2>
      </header>
      <div ref={grid} className="flex w-full flex-wrap items-start justify-center gap-x-5 gap-y-7 pt-3">
        {ordered.map((s, i) => {
          const score = stars[s.by];
          const top = reveal && best > 0 && score?.total === best;
          return (
            <div key={s.by} data-flip={s.by} className={`relative w-[clamp(9.5rem,26vw,13.5rem)] transition-[opacity,filter] duration-700 ${reveal && !top ? 'opacity-85 saturate-[.85]' : ''}`}>
              {top && <span className="pm-halo pointer-events-none absolute -inset-4 -z-10 rounded-full" aria-hidden />}
              <Polaroid
                image={s.image}
                caption={photo.prompt}
                name={s.by === selfId ? 'Toi' : s.name}
                avatar={s.avatar}
                tilt={tiltOf(s.by, photo.round)}
                delay={i * 110}
                develop
                download
              />
              {top && (
                <span className="pm-crown absolute -top-4 left-1/2 z-10 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-bold text-[#2a1a12] shadow-lg">
                  👑 Photo de la manche
                </span>
              )}
              <div className="mt-3 flex justify-center">
                {reveal ? (
                  <Result score={score} index={i} />
                ) : s.by === selfId ? (
                  s.image ? (
                    <SaveButton image={s.image} caption={photo.prompt} name={s.name} small />
                  ) : (
                    <span className="rounded-full border border-dashed border-edge px-2.5 py-1 text-xs text-muted">Ta photo</span>
                  )
                ) : s.image && playing ? (
                  <Stars
                    value={votes[s.by] ?? 0}
                    disabled={!canRate}
                    onRate={(n) => {
                      setVotes((v) => ({ ...v, [s.by]: n }));
                      net.send({ t: 'photo', vote: s.by, stars: n });
                    }}
                  />
                ) : !s.image ? (
                  <span className="text-xs text-muted">Pas de photo</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {!reveal && playing && toRate.length > 0 && <Validate rated={rated} total={toRate.length} validated={validated} disabled={!canRate && !validated} />}
    </div>
  );
}

/**
 * Avant les étoiles : un bandeau qui annonce la notation, rappelle la consigne et compte
 * jusqu'à l'ouverture. Il glisse ensuite hors de la table.
 */
function VoteIntro({ opensAt, prompt, paused }: { opensAt: number; prompt: string; paused: boolean }) {
  const left = useLeft(paused ? null : opensAt);
  const [gone, setGone] = useState(false);
  const open = !paused && left <= 0;
  if (gone) return null;
  const n = Math.max(1, Math.ceil(left / 1000));
  return (
    <div
      className={`pm-intro absolute inset-0 z-20 grid place-items-center bg-page/70 p-4 backdrop-blur-[3px] ${open ? 'pm-intro-out' : ''}`}
      onAnimationEnd={(e) => e.animationName === 'pm-intro-out' && setGone(true)}
      aria-live="polite"
    >
      <div className="m-card max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Place à la notation</p>
        <p className="mt-2 font-[Caveat,'Segoe_Print',cursive] text-3xl font-bold leading-tight text-balance sm:text-4xl">« {prompt} »</p>
        <p className="mt-2 text-sm text-muted">Regardez bien les tirages : qui a le mieux joué la consigne ?</p>
        <div className="relative mx-auto mt-4 grid size-16 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-edge)" strokeWidth="6" />
            <circle
              className="pm-ring"
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              style={{ animationDuration: '5000ms', animationDelay: `${left - 5000}ms`, animationPlayState: paused ? 'paused' : 'running' }}
            />
          </svg>
          <span key={n} className="pm-count text-3xl font-extrabold tabular-nums">
            {open ? '★' : n}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">{paused ? 'En pause' : open ? 'À vos étoiles !' : 'Les étoiles s’ouvrent dans un instant'}</p>
      </div>
    </div>
  );
}

/** En bas de la table : où on en est, puis « J'ai fini de noter ». Une fois validé, on attend les autres. */
function Validate({ rated, total, validated, disabled }: { rated: number; total: number; validated: boolean; disabled: boolean }) {
  const photo = useGame((s) => s.room!.photo);
  const players = useGame((s) => s.room!.players);
  const selfId = useGame((s) => s.selfId);
  const btn = useRef<HTMLButtonElement>(null);
  const complete = rated === total;
  useEffect(() => {
    if (complete && !validated) bump(btn.current, 1.08);
  }, [complete, validated]);
  const waiting = players.filter((p) => p.id !== selfId && photo?.players.includes(p.id) && !photo.done.includes(p.id));
  return (
    <div className="sticky bottom-3 z-10 mt-2 flex w-full max-w-md flex-col items-center gap-2">
      {validated ? (
        <div key="done" className="m-pop flex items-center gap-2 rounded-full border border-good/40 bg-surface px-4 py-2 text-sm shadow-lg">
          <span className="text-good">✓ Notes envoyées</span>
          {waiting.length > 0 && (
            <>
              <span className="text-muted">· on attend</span>
              <span className="flex gap-1">
                {waiting.map((p) => (
                  <span key={p.id} className="m-breathe" title={p.name}>
                    {avatarOf(p.avatar)}
                  </span>
                ))}
              </span>
            </>
          )}
        </div>
      ) : (
        <button
          ref={btn}
          key="go"
          type="button"
          disabled={disabled || rated === 0}
          onClick={() => net.send({ t: 'photo', ready: true })}
          className={`pm-validate btn btn-primary relative overflow-hidden px-5 py-2.5 shadow-lg disabled:opacity-60 ${complete ? 'pm-validate-ready' : ''}`}
        >
          <span className="relative z-10">{complete ? 'J’ai fini de noter ✓' : `Valider mes notes (${rated}/${total})`}</span>
          <span className="pm-validate-fill absolute inset-y-0 left-0 bg-accent/35" style={{ width: `${(rated / total) * 100}%` }} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Le temps que les tirages arrivent : un appareil qui clignote. */
function Developing() {
  return (
    <div className="grid min-h-[30rem] place-items-center p-6 text-center">
      <div>
        <span className="m-breathe inline-block text-5xl">📸</span>
        <p className="mt-2 text-muted">Les tirages se développent…</p>
      </div>
    </div>
  );
}

/** Cinq étoiles : survol qui prévisualise, clic qui claque et lance des étincelles. */
export function Stars({ value, onRate, disabled = false }: { value: number; onRate: (n: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  const [burst, setBurst] = useState<{ n: number; key: number } | null>(null);
  const shown = (!disabled && hover) || value;
  return (
    <div className={`pm-stars flex items-center gap-0.5 transition-opacity duration-300 ${disabled ? 'opacity-55' : ''}`} role="radiogroup" aria-label="Note" aria-disabled={disabled} onPointerLeave={() => setHover(0)}>
      {Array.from({ length: PHOTO_MAX_STARS }, (_, i) => {
        const n = i + 1;
        const on = n <= shown;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
            disabled={disabled}
            onPointerEnter={() => setHover(n)}
            onClick={() => {
              onRate(n);
              setBurst({ n, key: Date.now() });
            }}
            className="relative grid size-8 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-info"
          >
            <svg
              key={on && n <= value ? `on-${value}` : 'off'}
              viewBox="0 0 24 24"
              className={`pm-star size-6 ${on ? 'text-accent' : 'text-edge'} ${on && n <= value ? 'pm-star-on' : ''}`}
              style={{ animationDelay: `${i * 40}ms` }}
              aria-hidden
            >
              <path
                fill="currentColor"
                stroke={on ? 'none' : 'var(--color-muted)'}
                strokeOpacity=".5"
                d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
              />
            </svg>
            {burst?.n === n &&
              Array.from({ length: 6 }, (_, k) => <span key={`${burst.key}-${k}`} className="pm-spark" style={{ '--a': `${k * 60}deg` } as CSSProperties} />)}
          </button>
        );
      })}
    </div>
  );
}

/** Sous chaque tirage : la moyenne qui compte, puis les points gagnés. */
function Result({ score, index }: { score?: { total: number; votes: number }; index: number }) {
  const avg = score?.votes ? score.total / score.votes : 0;
  const shown = useCountUp(Math.round(avg * 10), { from: 0, delay: 300 + index * 90 });
  const points = useCountUp((score?.total ?? 0) * PHOTO_STAR_POINTS, { from: 0, delay: 500 + index * 90 });
  if (!score?.votes) return <span className="text-xs text-muted">Aucune note</span>;
  return (
    <span className="m-rise flex items-center gap-2 text-sm" style={{ animationDelay: `${250 + index * 90}ms` }}>
      <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-semibold">
        <span className="text-accent">★</span>
        <span className="font-mono tabular-nums">{(shown / 10).toFixed(1)}</span>
      </span>
      <span className="font-mono text-good tabular-nums">+{points}</span>
    </span>
  );
}

// ---- Fin de partie ---------------------------------------------------------------

/** Le classement, puis la planche des meilleurs clichés, tirage après tirage. */
function Finale() {
  const ranking = useGame((s) => s.ranking);
  const reel = useGame((s) => s.reel);
  const selfId = useGame((s) => s.selfId);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 500);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  return (
    <div className="panel relative overflow-hidden p-5 shadow-sm">
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <h2 className="text-2xl font-semibold tracking-[-0.03em]">Fin de la séance photo</h2>
      {ranking && (
        <ol className="mx-auto mt-4 max-w-xs space-y-1.5 text-left">
          {ranking.map((p, i) => (
            <Rank key={p.id} name={p.id === selfId ? 'Toi' : p.name} avatar={p.avatar} score={p.score} index={i} />
          ))}
        </ol>
      )}
      {reel.length > 0 && (
        <>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-muted">Les meilleurs clichés</p>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {reel.map((r, i) => (
              <div key={r.round} className="w-28">
                <Polaroid image={r.shot.image} caption={r.prompt} name={r.shot.name} avatar={r.shot.avatar} tilt={i % 2 ? 4 : -4} delay={600 + i * 160} download />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Rank({ name, avatar, score, index }: { name: string; avatar: number; score: number; index: number }) {
  const shown = useCountUp(score, { from: 0, delay: 200 + index * 120 });
  const medal = ['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`;
  return (
    <li className="m-rise flex items-center justify-between rounded-md border border-edge bg-surface px-3 py-2" style={{ animationDelay: `${150 + index * 120}ms` }}>
      <span className="flex items-center gap-2">
        <span className="w-6 text-center">{medal}</span>
        <span>{avatarOf(avatar)}</span>
        <span className="font-medium">{name}</span>
      </span>
      <span className="font-mono tabular-nums">{shown}</span>
    </li>
  );
}
