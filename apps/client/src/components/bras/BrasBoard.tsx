import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BRAS_DUEL, BRAS_LIMIT, brasPower, type BrasState, type BrasTarget, type PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { shout, SHOUT_THRESHOLD, useShout } from '../../lib/shout';
import { play, tick } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { bump, confetti, Presence, reducedMotion, Ticker, useCountUp, useSpring } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { SoundBoard } from '../SoundBoard';
import { BrasGlyph } from './BrasGlyph';
import './bras.css';

/** Plateau du Bras de fer : la jauge en haut, les cibles à tapoter dessous, la visio en bas. */
export function BrasBoard() {
  const phase = useGame((s) => s.room!.phase);
  const b = useGame((st) => st.room!.bras);
  // Le micro reste ouvert d'un duel à l'autre, et se coupe à la fin de la partie.
  const playing = phase === 'faceoff' || phase === 'duel' || phase === 'verdict';
  useEffect(() => {
    if (!playing) shout.stop();
  }, [playing]);
  useEffect(() => () => shout.stop(), []);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {b && <Duels b={b} />}
      <div className="panel relative min-h-[28rem] overflow-hidden">
        {phase === 'lobby' || !b ? <Teaser /> : phase === 'faceoff' ? <Faceoff key={b.turn} b={b} /> : phase === 'verdict' ? <Verdict key={b.turn} b={b} /> : <Arena key={b.turn} b={b} />}
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

function usePlayer(id: string | undefined): PlayerPublic | undefined {
  return useGame((s) => s.room!.players.find((p) => p.id === id));
}

/**
 * Qui est à gauche à l'écran : le joueur lui-même s'il est duelliste (il pousse toujours vers
 * la droite), sinon le joueur de gauche du serveur. `sign` convertit la jauge du serveur.
 */
function useSides(b: BrasState) {
  const selfId = useGame((s) => s.selfId);
  const flip = selfId === b.rightId;
  return { me: flip ? b.rightId : b.leftId, them: flip ? b.leftId : b.rightId, sign: flip ? -1 : 1, selfId, duelist: selfId === b.leftId || selfId === b.rightId };
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

function Teaser() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center p-6 max-sm:hidden" aria-hidden>
      <BrasGlyph className="bf-teaser w-64 text-ink/50" />
    </div>
  );
}

/** Les deux duellistes et une pastille par duel. */
function Duels({ b }: { b: BrasState }) {
  const { me, them, selfId } = useSides(b);
  const left = usePlayer(me);
  const right = usePlayer(them);
  const name = (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
      <span key={b.turn} className="m-rise flex items-center gap-2">
        <span className="rounded-full border border-cacao-2/50 bg-cacao-2/15 px-2.5 py-1 font-medium">{`${avatarOf(left?.avatar ?? 0)} ${name(left)}`}</span>
        <span className="font-mono text-xs text-muted">contre</span>
        <span className="rounded-full border border-gold/60 bg-gold/15 px-2.5 py-1 font-medium">{`${avatarOf(right?.avatar ?? 0)} ${name(right)}`}</span>
      </span>
      <span className="flex items-center gap-1" aria-label={`Duel ${b.turn + 1} sur ${b.turns}`}>
        {Array.from({ length: b.turns }, (_, i) => (
          <span key={i} className={`size-2.5 rounded-full transition-all duration-500 ${i < b.turn ? 'm-pop bg-accent' : i === b.turn ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`} />
        ))}
      </span>
    </div>
  );
}

/** Face-à-face : les deux poings arrivent de chaque côté et se cognent, puis 3, 2, 1. */
function Faceoff({ b }: { b: BrasState }) {
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const { me, them, duelist } = useSides(b);
  const a = usePlayer(me);
  const c = usePlayer(them);
  const view = useShout();
  useEffect(() => {
    if (left > 0 && left <= 3) tick(left === 1);
  }, [left]);

  return (
    <div className="grid min-h-[28rem] place-items-center gap-4 p-6 text-center">
      <div className="flex items-center gap-4 sm:gap-10">
        <Fighter player={a} className="bf-charge-l" tone="cacao" />
        <span key={left} className="bf-count w-24 font-mono text-6xl font-bold tabular-nums sm:text-8xl" aria-live="assertive">
          {left > 3 ? 'VS' : left || 'Go'}
        </span>
        <Fighter player={c} className="bf-charge-r" tone="gold" />
      </div>
      <p className="m-rise text-lg font-semibold tracking-[-0.02em]" style={{ animationDelay: '300ms' }}>
        {duelist ? 'Tapote les cibles et crie pour pousser deux fois plus fort !' : 'Encourage-les… ou déconcentre-les avec la boîte à sons.'}
      </p>
      {duelist && !view.on && <MicButton />}
    </div>
  );
}

function Fighter({ player, className, tone }: { player?: PlayerPublic; className: string; tone: 'cacao' | 'gold' }) {
  const selfId = useGame((s) => s.selfId);
  return (
    <div className={`${className} flex flex-col items-center gap-2`}>
      <span className={`grid size-20 place-items-center rounded-full border-4 text-5xl sm:size-28 sm:text-6xl ${tone === 'cacao' ? 'border-cacao-2 bg-cacao-2/15' : 'border-gold bg-gold/15'}`}>
        {avatarOf(player?.avatar ?? 0)}
      </span>
      <span className="max-w-28 truncate text-sm font-medium">{player ? (player.id === selfId ? 'Toi' : player.name) : '…'}</span>
    </div>
  );
}

/** Le duel : la jauge, puis la zone de cibles (duellistes) ou les encouragements (spectateurs). */
function Arena({ b }: { b: BrasState }) {
  const endsAt = useGame((st) => st.room!.endsAt);
  const left = useSeconds(endsAt);
  const { duelist } = useSides(b);
  useEffect(() => {
    if (left > 0 && left <= 5) tick(left <= 3);
  }, [left]);
  useVoiceSync(duelist);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <Gauge b={b} left={left} />
      {duelist ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <TapZone b={b} />
          <MicPanel />
        </div>
      ) : (
        <Spectator b={b} />
      )}
    </div>
  );
}

/** La jauge : ressort vers la position du serveur, le camp menacé tremble, le temps au-dessus. */
function Gauge({ b, left }: { b: BrasState; left: number }) {
  const { me, them, sign, selfId } = useSides(b);
  const a = usePlayer(me);
  const c = usePlayer(them);
  const knot = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLSpanElement>(null);
  const [floats, setFloats] = useState<{ key: number; text: string; mine: boolean; at: number }[]>([]);
  const pos = (b.pos * sign) / BRAS_LIMIT; // -1 (mon camp) … +1 (camp adverse)

  useSpring(pos, (v) => {
    const pct = 50 + v * 50;
    if (knot.current) knot.current.style.left = `${pct}%`;
    if (fill.current) {
      fill.current.style.left = `${Math.min(50, pct)}%`;
      fill.current.style.width = `${Math.abs(pct - 50)}%`;
      fill.current.style.backgroundColor = v >= 0 ? 'var(--color-cacao-2)' : 'var(--color-gold)';
    }
  }, { stiffness: 240, damping: 20 });

  // Chaque coup : la prise s'écrase, un « +N » s'envole du côté de celui qui a poussé.
  const seq = b.push?.seq ?? 0;
  useEffect(() => {
    if (!b.push) return;
    const el = grip.current;
    if (el && !reducedMotion()) {
      el.classList.remove('bf-squash');
      void el.offsetWidth;
      el.classList.add('bf-squash');
    }
    const mine = b.push.by === me;
    const key = seq;
    setFloats((f) => [...f.slice(-6), { key, text: `+${b.push!.power}`, mine, at: 50 + pos * 50 }]);
    const id = setTimeout(() => setFloats((f) => f.filter((x) => x.key !== key)), 850);
    return () => clearTimeout(id);
    // Rejoue à chaque nouveau coup seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const danger = Math.abs(pos) > 0.7;
  const name = (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');
  return (
    <div className="m-rise">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Side player={a} label={name(a)} boost={b.voice[me] ?? false} hits={b.hits[me] ?? 0} danger={danger && pos < 0} tone="cacao" />
        <span className={`grid size-14 shrink-0 place-items-center rounded-full font-mono text-xl font-bold tabular-nums ${left <= 5 ? 's-urgent bg-bad text-white' : 'bg-primary text-on-primary'}`} aria-label="Secondes restantes">
          <Ticker value={left} />
        </span>
        <Side player={c} label={name(c)} boost={b.voice[them] ?? false} hits={b.hits[them] ?? 0} danger={danger && pos > 0} tone="gold" right />
      </div>
      <div className="bf-track relative h-7 rounded-full" role="meter" aria-valuemin={-BRAS_LIMIT} aria-valuemax={BRAS_LIMIT} aria-valuenow={b.pos * sign} aria-label="Jauge du bras de fer">
        <div ref={fill} className="bf-fill absolute inset-y-1 rounded-full opacity-70" />
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-ink/30" />
        <div ref={knot} className="bf-knot-pos absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: '50%' }}>
          <span ref={grip} className="grid size-11 place-items-center rounded-full border-2 border-butter bg-cacao text-xl shadow-lg">
            🤜
          </span>
        </div>
        {floats.map((f) => (
          <span key={f.key} className={`bf-float top-0 font-mono text-sm font-bold ${f.mine ? 'text-cacao-2' : 'text-accent'}`} style={{ left: `${f.at}%` }}>
            {f.text}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span>Ton camp</span>
        <span>Camp adverse</span>
      </div>
    </div>
  );
}

function Side({ player, label, boost, hits, danger, tone, right }: { player?: PlayerPublic; label: string; boost: boolean; hits: number; danger: boolean; tone: 'cacao' | 'gold'; right?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-full border-2 text-2xl ${tone === 'cacao' ? 'border-cacao-2' : 'border-gold'} ${danger ? 'bf-danger' : ''}`}>
        {avatarOf(player?.avatar ?? 0)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted" style={{ justifyContent: right ? 'flex-end' : undefined }}>
          <span className="font-mono tabular-nums">{hits} coups</span>
          {boost && (
            <span className="bf-boost rounded-full bg-gold px-1.5 font-semibold text-cacao">
              <span>🔥</span> ×2
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

/** Les cibles : un appui (pas un clic, plus rapide au doigt) envoie le coup et fait éclater la cible. */
function TapZone({ b }: { b: BrasState }) {
  const zone = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState<Set<number>>(() => new Set());
  const { loud } = useShout();
  // Les cibles reçues du serveur remplacent celles qu'on a fait disparaître localement.
  useEffect(() => setGone((g) => new Set([...g].filter((id) => b.targets.some((t) => t.id === id)))), [b.targets]);

  const hit = (t: BrasTarget, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (gone.has(t.id)) return;
    net.send({ t: 'bras', hit: t.id });
    setGone((g) => new Set(g).add(t.id));
    burst(zone.current, t, brasPower(t.gold, loud));
  };

  return (
    <div ref={zone} className="bf-zone relative h-64 overflow-hidden rounded-xl border border-edge bg-surface sm:h-72" aria-label="Cibles à tapoter">
      {b.targets
        .filter((t) => !gone.has(t.id))
        .map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bf-target grid size-16 place-items-center rounded-full text-2xl font-bold shadow-md sm:size-[4.5rem] ${t.gold ? 'bf-gold bg-gold text-cacao' : 'bg-cacao text-butter'}`}
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
            onPointerDown={(e) => hit(t, e)}
            aria-label={t.gold ? 'Cible dorée' : 'Cible'}
          >
            {t.gold ? '★' : '✊'}
          </button>
        ))}
      <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-muted">Tapote vite, les dorées poussent ×2</p>
    </div>
  );
}

/** Éclats et « +N » à l'endroit tapé, ajoutés hors React et retirés à la fin de leur animation. */
function burst(zone: HTMLElement | null, t: BrasTarget, power: number) {
  if (!zone || reducedMotion()) return;
  const add = (el: HTMLElement) => {
    el.style.left = `${t.x * 100}%`;
    el.style.top = `${t.y * 100}%`;
    zone.appendChild(el);
    const done = () => el.remove();
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1000);
  };
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span');
    s.className = 'bf-shard';
    s.style.setProperty('--a', `${i * 45 + Math.random() * 20}deg`);
    s.style.background = t.gold ? 'var(--color-gold)' : i % 2 ? 'var(--color-cacao-2)' : 'var(--color-butter)';
    add(s);
  }
  const n = document.createElement('span');
  n.className = 'bf-float font-mono text-lg font-black text-accent';
  n.textContent = `+${power}`;
  add(n);
}

/** Le micro : un bouton pour l'ouvrir, puis un vumètre avec le seuil du cri. */
function MicPanel() {
  const view = useShout();
  const bar = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => shout.onLevel((l) => bar.current && (bar.current.style.transform = `scaleX(${l})`)), [view.on]);
  useEffect(() => {
    if (view.loud) bump(box.current, 1.04);
  }, [view.loud]);

  return (
    <aside ref={box} className="panel m-rise flex flex-col gap-3 p-4" style={{ animationDelay: '120ms' }}>
      <p className="text-sm font-semibold">🎙️ Crie pour doubler ta force</p>
      {view.on ? (
        <>
          <div className="bf-meter relative h-5 overflow-hidden rounded-full bg-ink/10" data-loud={view.loud || undefined}>
            <div ref={bar} className={`bf-meter-fill absolute inset-0 rounded-full transition-colors duration-150 ${view.loud ? 'bg-gold' : 'bg-cacao-2'}`} style={{ transform: 'scaleX(0)' }} />
            <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${SHOUT_THRESHOLD * 100}%` }} title="Seuil du cri" />
          </div>
          <p className={`text-center text-2xl font-black tracking-[-0.03em] transition-colors ${view.loud ? 'text-accent' : 'text-muted'}`}>
            {view.loud ? (
              <span key="on" className="bf-boost inline-block">
                <span>🔥</span> Force ×2
              </span>
            ) : (
              'Plus fort !'
            )}
          </p>
          <button className="btn-ghost text-xs" onClick={() => shout.stop()}>
            Couper le micro
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Commente, encourage-toi, rugis : tant que le vumètre dépasse le trait, chaque coup pousse deux fois plus.</p>
          <MicButton />
        </>
      )}
      {view.error && <p className="text-xs text-bad">{view.error}</p>}
    </aside>
  );
}

function MicButton() {
  return (
    <button className="bf-mic-cta btn-primary mx-auto" onClick={(e) => (bump(e.currentTarget), void shout.start())}>
      🎙️ Activer le micro
    </button>
  );
}

/** Pendant le duel, dit au serveur si l'on crie : au début, puis toutes les 400 ms tant que ça dure. */
function useVoiceSync(duelist: boolean) {
  const { loud } = useShout();
  useEffect(() => {
    if (!duelist) return;
    net.send({ t: 'bras', voice: loud });
    if (!loud) return;
    const id = setInterval(() => net.send({ t: 'bras', voice: true }), 400);
    return () => clearInterval(id);
  }, [loud, duelist]);
}

function Spectator({ b }: { b: BrasState }) {
  const total = (b.hits[b.leftId] ?? 0) + (b.hits[b.rightId] ?? 0);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="panel m-rise grid place-items-center gap-2 p-5 text-center">
        <BrasGlyph className="w-44 text-ink/60" />
        <p className="text-lg font-semibold tracking-[-0.02em]">
          <Ticker value={total} /> coups échangés
        </p>
        <p className="text-sm text-muted">Les cibles sont chez les duellistes. Toi, fais du bruit !</p>
      </div>
      <div className="panel m-rise p-3" style={{ animationDelay: '100ms' }}>
        <p className="mb-2 text-xs font-medium text-muted">Bruitages</p>
        <SoundBoard compact />
      </div>
    </div>
  );
}

/** Verdict : « K.O. ! » tamponné ou victoire aux points, la couronne tombe sur le gagnant. */
function Verdict({ b }: { b: BrasState }) {
  const r = b.result;
  const { me, them, selfId } = useSides(b);
  const winner = usePlayer(r?.winner ?? undefined);
  const a = usePlayer(me);
  const c = usePlayer(them);
  const canvas = useRef<HTMLCanvasElement>(null);
  const name = (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');

  useEffect(() => {
    if (!r) return;
    if (r.winner === selfId) {
      play('bravo');
      return confetti(canvas.current, 140);
    }
    const lost = r.winner !== null && (selfId === b.leftId || selfId === b.rightId);
    play(lost ? 'trombone' : r.ko ? 'boum' : 'ding');
  }, [r, selfId, b.leftId, b.rightId]);

  if (!r) return null;
  return (
    <div className="relative grid min-h-[28rem] place-items-center p-6 text-center">
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative">
        <p className={`bf-stamp inline-block rounded-xl border-4 px-5 py-1 text-5xl font-black uppercase tracking-[-0.03em] sm:text-7xl ${r.ko ? 'border-bad text-bad' : 'border-accent text-accent'}`}>
          {r.winner ? (r.ko ? 'K.O. !' : 'Aux points') : 'Égalité'}
        </p>
        {winner ? (
          <div className="mt-5 flex flex-col items-center gap-1">
            <span className="bf-crown text-4xl">👑</span>
            <span className="m-pop grid size-24 place-items-center rounded-full border-4 border-gold bg-gold/15 text-6xl">{avatarOf(winner.avatar)}</span>
            <p className="m-rise mt-2 text-lg" style={{ animationDelay: '250ms' }}>
              <b>{winner.id === selfId ? 'Tu' : winner.name}</b> {winner.id === selfId ? 'remportes' : 'remporte'} le bras de fer{r.ko ? ' en plaquant la jauge au bout' : ''}.
            </p>
          </div>
        ) : (
          <p className="m-rise mt-4 text-lg">La jauge est restée pile au milieu après {BRAS_DUEL} s !</p>
        )}
        <div className="mt-5 flex justify-center gap-3">
          {[a, c].map((p, i) => (p ? <Gain key={p.id} player={p} self={p.id === selfId} gain={r.gains[p.id] ?? 0} delay={450 + i * 120} /> : null))}
        </div>
      </div>
    </div>
  );
}

function Gain({ player, self, gain, delay }: { player: PlayerPublic; self: boolean; gain: number; delay: number }) {
  const shown = useCountUp(gain);
  return (
    <span style={{ animationDelay: `${delay}ms` } as CSSProperties} className={`m-pop flex items-center gap-2 rounded-full border px-3 py-1.5 ${gain ? 'border-good/50 bg-good/10' : 'border-edge'}`}>
      <span>{avatarOf(player.avatar)}</span>
      <span className="text-sm">{self ? 'Toi' : player.name}</span>
      <b className={`font-mono tabular-nums ${gain ? 'text-good' : 'text-muted'}`}>+{shown}</b>
    </span>
  );
}
