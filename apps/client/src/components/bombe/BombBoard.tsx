import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BOMB_LETTERS, BOMB_REJECT_TEXT, BOMB_WORD_MAX, foldWord, type BombEvent, type BombState, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { serverNow, useGame } from '../../lib/store';
import { clock, play, tick } from '../../lib/sounds';
import { bump, confetti, Presence, shake } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { BombGlyph } from './BombGlyph';
import './bombe.css';

type Flash = BombEvent & { seq: number };

/** Plateau de la Bombe à mots : la table, la bombe au milieu, et la saisie de celui qui la tient. */
export function BombBoard() {
  const phase = useGame((s) => s.room!.phase);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="panel relative min-h-[32rem] overflow-hidden">
        <Arena />
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

/** Horloge serveur rafraîchie plusieurs fois par seconde (compte à rebours, battement de la bombe). */
function useNow(ms = 200) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Le dernier événement, tant qu'il est « frais » : sert aux éclats, secousses et bulles. */
function useFresh(event: Flash | null, ms: number): Flash | null {
  const [fresh, setFresh] = useState<Flash | null>(null);
  useEffect(() => {
    if (!event) return;
    setFresh(event);
    const t = setTimeout(() => setFresh((f) => (f?.seq === event.seq ? null : f)), ms);
    return () => clearTimeout(t);
  }, [event?.seq]);
  return fresh;
}

function Arena() {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const event = useGame((s) => s.bombEvent);
  const bomb = room.bomb;
  const stage = useRef<HTMLDivElement>(null);
  const boom = useFresh(event?.kind === 'boom' ? event : null, 2400);

  // L'explosion secoue toute la table.
  useEffect(() => {
    if (event?.kind === 'boom') shake(stage.current);
  }, [event?.seq]);

  const present = new Map(room.players.map((p) => [p.id, p]));
  const seats = (bomb?.order ?? room.players.map((p) => p.id)).flatMap((id) => present.get(id) ?? []);
  const holderIndex = seats.findIndex((p) => p.id === bomb?.holder);
  const fuse = useFuseClock(room.phase === 'bomb' ? bomb?.litAt ?? null : null);

  return (
    <div ref={stage} className="flex flex-col items-center gap-4 px-3 pb-5 pt-4 sm:px-6">
      <div className="bomb-table relative mx-auto aspect-square w-full max-w-[30rem]">
        <span className="bomb-ring" style={{ '--heat': fuse.heat } as CSSProperties} aria-hidden />
        {fuse.n > 0 && <span key={fuse.n} className="bomb-shock" style={{ '--heat': fuse.heat } as CSSProperties} aria-hidden />}
        {holderIndex >= 0 && <Pointer index={holderIndex} count={seats.length} />}
        <Center bomb={bomb} boom={boom} names={present} fuse={fuse} />
        {seats.map((p, i) => (
          <Seat key={p.id} player={p} index={i} count={seats.length} bomb={bomb} self={p.id === selfId} />
        ))}
      </div>
      {bomb && room.phase === 'bomb' && <Controls bomb={bomb} selfId={selfId} names={present} />}
    </div>
  );
}

/** Angle d'une place autour de la table : la première en haut, puis dans le sens des aiguilles. */
const seatAngle = (i: number, n: number) => -90 + (360 * i) / Math.max(1, n);

/** La flèche part de la bombe vers celui qui la tient, toujours par le plus court chemin. */
function Pointer({ index, count }: { index: number; count: number }) {
  const angle = useRef<number | null>(null);
  const target = seatAngle(index, count);
  if (angle.current === null) angle.current = target;
  else {
    const delta = ((((target - angle.current) % 360) + 540) % 360) - 180;
    angle.current += delta;
  }
  return (
    <span className="bomb-pointer" style={{ transform: `rotate(${angle.current}deg)` }} aria-hidden>
      <span />
    </span>
  );
}

/** Battement de la bombe (s) après `elapsed` secondes de mèche : de 1,15 s à 0,34 s en ~18 s. */
const beatAt = (elapsed: number) => Math.max(BEAT_MIN, 1.15 - Math.floor(elapsed) * 0.045);
const BEAT_MIN = 0.34;
/** Mèche « chaude » (0 à 1) : suit l'accélération du battement, sans rien dire de l'explosion. */
const heatAt = (elapsed: number) => Math.min(1, elapsed / 18);

/**
 * Le tic-tac de la mèche : un coup à chaque battement, de plus en plus serré. Chaque coup est
 * programmé d'après l'horloge serveur, donc tout le salon entend la même accélération.
 */
function useFuseClock(litAt: number | null) {
  const [tock, setTock] = useState({ n: 0, heat: 0, beat: 0 });
  useEffect(() => {
    setTock({ n: 0, heat: 0, beat: litAt === null ? 0 : beatAt(0) });
    if (litAt === null) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const strike = () => {
      const elapsed = Math.max(0, (serverNow() - litAt) / 1000);
      const beat = beatAt(elapsed);
      const heat = heatAt(elapsed);
      n += 1;
      clock(n % 2 === 0, heat);
      setTock({ n, heat, beat });
      timer = setTimeout(strike, beat * 1000);
    };
    strike();
    return () => clearTimeout(timer);
  }, [litAt]);
  return tock;
}

type Fuse = ReturnType<typeof useFuseClock>;

function Center({ bomb, boom, names, fuse }: { bomb: BombState | null; boom: Flash | null; names: Map<string, PlayerPublic>; fuse: Fuse }) {
  const now = useNow();
  const lit = bomb?.litAt != null;
  const countdown = bomb && !lit && now < bomb.startsAt ? Math.ceil((bomb.startsAt - now) / 1000) : 0;
  // Plus la mèche brûle, plus la bombe bat vite (sans jamais dire quand elle saute).
  const { n, heat, beat } = fuse;
  const victim = boom?.kind === 'boom' ? names.get(boom.by) : undefined;

  // 3, 2, 1 : un clic par chiffre, le dernier plus pressant.
  useEffect(() => {
    if (countdown > 0) tick(countdown === 1);
  }, [countdown]);
  useEffect(() => {
    if (boom) play('boum');
  }, [boom?.seq]);

  return (
    <div className="absolute left-1/2 top-[47%] flex w-[42%] -translate-x-1/2 -translate-y-1/2 flex-col items-center sm:top-1/2">
      <div key={boom ? `boom${boom.seq}` : 'calm'} className={`relative w-full ${boom ? 'bomb-blast' : ''}`}>
        <BombGlyph lit={lit} beat={beat} pulse={n} heat={heat} className="w-full" />
        {lit && n > 0 && (
          <span key={n} className={`bomb-tic ${n % 2 ? 'is-tic' : 'is-tac'}`} style={{ '--heat': heat } as CSSProperties} aria-hidden>
            {n % 2 ? 'tic' : 'tac'}
          </span>
        )}
        {bomb && (
          <span
            key={bomb.syllable}
            className="bomb-syllable absolute left-1/2 top-[61%] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface px-2.5 py-0.5 font-mono text-2xl font-bold uppercase tracking-[0.08em] text-ink shadow-[0_8px_20px_-8px_rgb(0_0_0/0.5)] sm:text-3xl"
            aria-label={`Syllabe : ${bomb.syllable}`}
          >
            {bomb.syllable}
          </span>
        )}
        {boom && (
          <span className="bomb-burst" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 30}deg` } as CSSProperties} />
            ))}
          </span>
        )}
        {countdown > 0 && (
          <span key={countdown} className="bomb-count absolute inset-0 grid place-items-center font-mono text-6xl font-bold text-accent" role="status">
            {countdown}
          </span>
        )}
      </div>
      <p className="mt-1 min-h-10 text-center text-[11px] leading-tight text-muted sm:text-sm" aria-live="polite">
        {victim && boom?.kind === 'boom' ? (
          <span className="m-rise block">
            <b className="text-bad">💥 {victim.name}</b> {boom.lives ? 'perd une vie' : 'est éliminé'}
            {boom.example && (
              <span className="block">
                il fallait dire <b className="text-ink">« {boom.example} »</b>
              </span>
            )}
          </span>
        ) : bomb?.last ? (
          <span key={bomb.last.word} className="m-rise block">
            dernier mot : <b className="text-ink">{bomb.last.word}</b>
          </span>
        ) : null}
      </p>
    </div>
  );
}

function Seat({ player, index, count, bomb, self }: { player: PlayerPublic; index: number; count: number; bomb: BombState | null; self: boolean }) {
  const event = useGame((s) => s.bombEvent);
  const typing = useGame((s) => (s.bombTyping?.by === player.id ? s.bombTyping.text : null));
  const mine = event && event.by === player.id ? event : null;
  const flash = useFresh(mine, 1400);
  const card = useRef<HTMLDivElement>(null);
  const holder = bomb?.holder === player.id;
  const lives = bomb?.lives[player.id] ?? bomb?.maxLives ?? 0;
  const out = bomb != null && lives === 0;

  useEffect(() => {
    if (mine?.kind === 'bad') shake(card.current);
    if (mine?.kind === 'ok' || mine?.kind === 'life') bump(card.current, 1.08);
  }, [mine?.seq]);

  const a = (seatAngle(index, count) * Math.PI) / 180;
  const style = { left: `${50 + 40 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%` };
  const bubble = holder && !self ? typing : null;

  return (
    <div className="absolute w-24 -translate-x-1/2 -translate-y-1/2 sm:w-28" style={style}>
      <div ref={card} className={`bomb-seat flex flex-col items-center gap-0.5 text-center ${holder ? 'is-holder' : ''} ${out ? 'is-out' : ''}`}>
        <span
          className={`relative grid size-11 place-items-center rounded-full border-2 bg-surface text-2xl transition-[border-color,box-shadow] duration-300 sm:size-13 sm:text-3xl ${
            holder ? 'border-accent shadow-[0_0_0_5px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]' : 'border-edge'
          } ${flash?.kind === 'ok' ? 'bomb-ok' : ''}`}
          aria-hidden
        >
          {out ? '💀' : avatarOf(player.avatar)}
        </span>
        <span className={`max-w-full truncate text-xs sm:text-sm ${self ? 'font-semibold' : ''}`}>{self ? 'Toi' : player.name}</span>
        {bomb && <Hearts lives={lives} max={bomb.maxLives} />}
        <span className="relative h-5 w-full">
          {flash?.kind === 'ok' ? (
            <span key={flash.seq} className="bomb-word-up absolute inset-x-0 truncate font-mono text-xs font-semibold text-good">
              <Marked text={flash.word} syllable={flash.syllable} />
            </span>
          ) : flash?.kind === 'bad' ? (
            <span key={flash.seq} className="m-rise absolute inset-x-0 truncate text-[11px] font-medium text-bad">
              {BOMB_REJECT_TEXT[flash.reason]}
            </span>
          ) : bubble ? (
            <span className="absolute inset-x-0 truncate font-mono text-xs">
              <Marked text={bubble} syllable={bomb?.syllable ?? ''} />
              <span className="bomb-caret" />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Hearts({ lives, max }: { lives: number; max: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${lives} vie${lives > 1 ? 's' : ''}`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={`${i}-${i < lives}`} viewBox="0 0 24 24" className={`size-3.5 ${i < lives ? 'bomb-heart text-bad' : 'bomb-heart-lost text-edge'}`} aria-hidden>
          <path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" />
        </svg>
      ))}
    </span>
  );
}

/** Le mot avec sa syllabe surlignée (comparée sans accents). */
function Marked({ text, syllable }: { text: string; syllable: string }) {
  const chars = [...text];
  let folded = '';
  const owner: number[] = [];
  chars.forEach((c, i) => {
    for (const f of foldWord(c)) {
      folded += f;
      owner.push(i);
    }
  });
  const at = syllable ? folded.indexOf(syllable) : -1;
  if (at < 0) return <>{text}</>;
  const start = owner[at]!;
  const end = owner[at + syllable.length - 1]! + 1;
  return (
    <>
      {chars.slice(0, start).join('')}
      <mark className="rounded-sm bg-accent px-px text-[#18181b]">{chars.slice(start, end).join('')}</mark>
      {chars.slice(end).join('')}
    </>
  );
}

/** Saisie de celui qui tient la bombe ; les autres le regardent chercher. */
function Controls({ bomb, selfId, names }: { bomb: BombState; selfId: string | null; names: Map<string, PlayerPublic> }) {
  const event = useGame((s) => s.bombEvent);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const mine = bomb.holder === selfId;
  const lit = bomb.litAt !== null;
  const playing = selfId !== null && (bomb.lives[selfId] ?? 0) > 0;
  const holderName = bomb.holder ? names.get(bomb.holder)?.name ?? '…' : '…';

  // La bombe arrive : champ vidé et curseur dedans.
  useEffect(() => {
    setText('');
    if (mine) field.current?.focus({ preventScroll: true });
  }, [bomb.turn, mine, lit]);

  // Mot refusé : le champ tremble et le texte est sélectionné pour être retapé.
  useEffect(() => {
    if (event?.kind === 'bad' && event.by === selfId) {
      shake(field.current);
      field.current?.select();
    }
  }, [event?.seq]);

  const type = (value: string) => {
    const v = value.slice(0, BOMB_WORD_MAX);
    setText(v);
    net.send({ t: 'bomb', typing: v });
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      {mine ? (
        <form
          className="m-rise flex w-full flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return shake(field.current);
            net.send({ t: 'bomb', word: text });
          }}
        >
          <p className="text-center text-sm">
            <b>À toi !</b> <span className="text-muted">Un mot qui contient</span>{' '}
            <b className="rounded bg-accent px-1.5 font-mono uppercase text-[#18181b]">{bomb.syllable}</b>
          </p>
          <div className="flex gap-2">
            <input
              ref={field}
              aria-label="Ton mot"
              className="input font-mono text-lg tracking-wide"
              maxLength={BOMB_WORD_MAX}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              placeholder={lit ? 'Tape vite…' : 'Prépare-toi…'}
              value={text}
              onChange={(e) => type(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={!lit}>
              Valider
            </button>
          </div>
        </form>
      ) : (
        <p className="text-center text-sm text-muted">
          <b className="text-ink">{holderName}</b> cherche un mot avec <b className="font-mono uppercase text-ink">{bomb.syllable}</b>
          <span className="m-dots" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      )}
      {playing ? (
        <Letters have={bomb.letters[selfId!] ?? ''} />
      ) : (
        selfId && bomb.order.includes(selfId) && <p className="text-center text-sm text-muted">Tu es éliminé : encourage les autres !</p>
      )}
    </div>
  );
}

/** Lettres bonus : toutes placées, une vie de plus. */
function Letters({ have }: { have: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap justify-center gap-1" aria-label={`Lettres placées : ${have.length} sur ${BOMB_LETTERS.length}`}>
        {[...BOMB_LETTERS].map((c) => {
          const on = have.includes(c);
          return (
            <span
              key={`${c}${on}`}
              className={`grid size-6 place-items-center rounded font-mono text-xs font-semibold uppercase transition-colors ${on ? 'm-pop bg-accent text-[#18181b]' : 'border border-edge text-muted'}`}
            >
              {c}
            </span>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">Place toutes les lettres pour gagner une vie</p>
    </div>
  );
}

/** Fin de partie : le dernier debout, puis le classement avec les mots trouvés. */
function Finale() {
  const ranking = useGame((s) => s.ranking);
  const bomb = useGame((s) => s.room!.bomb);
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
      <p className="text-sm text-muted">Dernier debout</p>
      <p className="m-pop mt-1 text-6xl" style={{ animationDelay: '100ms' }} aria-hidden>
        {winner ? avatarOf(winner.avatar) : '💣'}
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
            <span className="text-xs text-muted">{bomb?.words[p.id] ?? 0} mots</span>
            <span className="w-12 text-right font-mono tabular-nums">{p.score}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
