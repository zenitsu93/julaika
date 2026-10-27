import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ARCADE_COOP, ARCADE_H, ARCADE_W, Key, type ArcadeEvent, type ArcadeKind, type ArcadeState, type PlayerPublic } from '@julaika/shared';
import { arcadeFrames, mix, onArcadeEvents, startArcadeInput } from '../../lib/arcade';
import { avatarOf } from '../../lib/avatars';
import { net } from '../../lib/net';
import { play, pop, thump, tick, whoosh } from '../../lib/sounds';
import { serverNow, useGame } from '../../lib/store';
import { confetti, Presence, reducedMotion, Ticker, useCountUp } from '../../motion';
import { CallBar } from '../CallBar';
import { Lobby } from '../Lobby';
import { ArcadeGlyph } from './ArcadeGlyphs';
import { Fx } from './fx';
import { readPaint, render, sideColor, type Paint } from './render';
import './arcade.css';

const TITLE: Record<ArcadeKind, string> = { foot: 'Tête-à-tête', oreillers: 'Bataille d’oreillers', drap: 'Le Drap tendu' };

const HOWTO: Record<ArcadeKind, { keys: string; touch: string; goal: string }> = {
  foot: {
    goal: 'Marque dans la cage d’en face. Premier à 5 buts !',
    keys: '← → courir · ↑ sauter · Espace frapper · C frappe bisou (jauge pleine)',
    touch: 'Flèches pour courir et sauter, ⚽ pour frapper, 💋 pour la frappe bisou.',
  },
  oreillers: {
    goal: 'Fais tomber l’autre du lit. Plus il a pris de coups, plus il vole loin !',
    keys: '← → marcher · ↑ sauter · Espace coup d’oreiller',
    touch: 'Flèches pour marcher et sauter, 🪶 pour le coup d’oreiller.',
  },
  drap: {
    goal: 'Attrapez les cœurs dans le drap, laissez passer les orages.',
    keys: '← → bouger ta main · Espace en même temps que l’autre : bisou qui chasse les orages',
    touch: 'Flèches pour bouger ta main, 💋 en même temps que l’autre pour chasser les orages.',
  },
};

/** Plateau des jeux d'action : le score en haut, le monde au canvas, les commandes, la visio. */
export function ArcadeBoard() {
  const phase = useGame((s) => s.room!.phase);
  const game = useGame((s) => s.room!.game) as ArcadeKind;
  const a = useGame((s) => s.room!.arcade);
  const selfId = useGame((s) => s.selfId);
  const side = a ? (selfId === a.leftId ? 0 : selfId === a.rightId ? 1 : null) : null;
  const live = phase === 'faceoff' || phase === 'duel';
  const mirror = !!a && !ARCADE_COOP[a.kind] && side === 1;
  const press = useInput(live && side !== null, mirror);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {a && phase !== 'lobby' && <Header a={a} />}
      <div className="panel relative overflow-hidden p-2 sm:p-3">
        {phase === 'lobby' || !a ? <Teaser kind={game} /> : <Stage a={a} side={side} mirror={mirror} />}
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
      {a && live && side !== null && <Pad kind={a.kind} press={press} />}
      <CallBar />
    </section>
  );
}

/** Clavier et boutons tactiles, branchés seulement pour les deux joueurs en piste. */
function useInput(active: boolean, mirror: boolean) {
  const ref = useRef<ReturnType<typeof startArcadeInput> | null>(null);
  useEffect(() => {
    if (!active) return;
    const input = startArcadeInput((k) => net.send({ t: 'arcade', k }), mirror);
    ref.current = input;
    return () => {
      input.stop();
      ref.current = null;
    };
  }, [active, mirror]);
  return (bit: number, down: boolean) => ref.current?.press(bit, down);
}

function usePlayer(id: string | undefined): PlayerPublic | undefined {
  return useGame((s) => s.room!.players.find((p) => p.id === id));
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

function Teaser({ kind }: { kind: ArcadeKind }) {
  return (
    <div className="grid aspect-[16/9] w-full place-items-center p-6 max-sm:hidden" aria-hidden>
      <ArcadeGlyph kind={kind} className="ar-teaser w-72 max-w-full" />
    </div>
  );
}

/** Les deux joueurs, le score qui saute à chaque point, le temps au milieu. */
function Header({ a }: { a: ArcadeState }) {
  const selfId = useGame((s) => s.selfId);
  const endsAt = useGame((s) => s.room!.endsAt);
  const phase = useGame((s) => s.room!.phase);
  const left = useSeconds(endsAt);
  const coop = ARCADE_COOP[a.kind];
  // Le joueur se voit toujours à gauche en duel.
  const flip = !coop && selfId === a.rightId;
  const [l, r] = flip ? [1, 0] : [0, 1];
  const pl = usePlayer(l === 0 ? a.leftId : a.rightId);
  const pr = usePlayer(r === 0 ? a.leftId : a.rightId);
  const name = (p?: PlayerPublic) => (p ? (p.id === selfId ? 'Toi' : p.name) : '…');
  useEffect(() => {
    if (phase === 'duel' && left > 0 && left <= 5) tick(left <= 3);
  }, [left, phase]);

  return (
    <div className="m-rise flex items-center justify-between gap-2">
      <Side player={pl} label={name(pl)} side={l} score={coop ? null : a.score[l]!} />
      <div className="flex shrink-0 flex-col items-center gap-1">
        {coop && (
          <span className="flex items-baseline gap-1.5 font-mono">
            <b className="text-3xl tabular-nums">
              <Ticker value={a.score[0]} />
            </b>
            <span className="text-xs text-muted">record {a.best}</span>
          </span>
        )}
        <span className={`grid size-12 place-items-center rounded-full font-mono text-lg font-bold tabular-nums ${phase === 'duel' && left <= 10 ? 's-urgent bg-bad text-white' : 'bg-primary text-on-primary'}`} aria-label="Secondes restantes">
          {phase === 'duel' ? <Ticker value={left} /> : '•'}
        </span>
        <span className="flex items-center gap-1" aria-label={`Partie ${a.turn + 1} sur ${a.turns}`}>
          {Array.from({ length: Math.min(a.turns, 12) }, (_, i) => (
            <span key={i} className={`size-2 rounded-full transition-all duration-500 ${i < a.turn ? 'm-pop bg-accent' : i === a.turn ? 'm-breathe scale-125 bg-ink' : 'bg-edge'}`} />
          ))}
        </span>
      </div>
      <Side player={pr} label={name(pr)} side={r} score={coop ? null : a.score[r]!} right />
    </div>
  );
}

function Side({ player, label, side, score, right }: { player?: PlayerPublic; label: string; side: number; score: number | null; right?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !score || reducedMotion()) return;
    el.classList.remove('ar-score-pop');
    void el.offsetWidth;
    el.classList.add('ar-score-pop');
  }, [score]);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <span className={`grid size-11 shrink-0 place-items-center rounded-full border-2 text-2xl ${side === 0 ? 'border-cacao-2 bg-cacao-2/15' : 'border-gold bg-gold/15'}`}>{avatarOf(player?.avatar ?? 0)}</span>
      <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
      {score !== null && (
        <span ref={box} className="inline-block font-mono text-4xl font-black tabular-nums tracking-[-0.04em]">
          {score}
        </span>
      )}
    </div>
  );
}

/** Le monde : canvas redessiné à chaque image d'écran, effets et sons au fil des événements. */
function Stage({ a, side, mirror }: { a: ArcadeState; side: 0 | 1 | null; mirror: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useGame((s) => s.room!.phase);
  const pl = usePlayer(a.leftId);
  const pr = usePlayer(a.rightId);
  const faces: [string, string] = [avatarOf(pl?.avatar ?? 0), avatarOf(pr?.avatar ?? 1)];
  const facesRef = useRef(faces);
  facesRef.current = faces;
  const fx = useRef(new Fx()).current;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    let paint: Paint = readPaint();
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = el.clientWidth;
      el.width = Math.round(w * dpr);
      el.height = Math.round(((w * ARCADE_H) / ARCADE_W) * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (++frames % 60 === 0) paint = readPaint();
      const s = arcadeFrames.sample();
      if (!s) return;
      const scale = el.width / ARCADE_W;
      const shake = reducedMotion() ? 0 : fx.shake;
      ctx.setTransform(scale, 0, 0, scale, (Math.random() - 0.5) * shake * scale, (Math.random() - 0.5) * shake * scale);
      ctx.clearRect(-20, -20, ARCADE_W + 40, ARCADE_H + 40);
      const v = a.kind === 'drap' ? mixDrap(s) : mix(s);
      render(a.kind, { ctx, v, paint, mirror, faces: facesRef.current, self: side, t: now / 1000, dt, fx });
      fx.draw(ctx, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [a.kind, mirror, side, fx]);

  useEffect(() => onArcadeEvents((ev) => effects(ev, a.kind, fx, mirror, side, readPaint())), [a.kind, fx, mirror, side]);
  useEffect(() => () => fx.clear(), [a.turn, fx]);

  return (
    <div className="relative">
      <canvas ref={canvas} className="ar-canvas block aspect-[16/9] w-full rounded-xl" aria-label={`${TITLE[a.kind]} : terrain de jeu`} />
      <Presence>
        {phase === 'faceoff' ? <Faceoff key={`f${a.turn}`} a={a} side={side} /> : null}
        {phase === 'verdict' ? <Verdict key={`v${a.turn}`} a={a} side={side} /> : null}
      </Presence>
    </div>
  );
}

/** Drap : les objets changent d'ordre d'une image à l'autre ; on n'interpole que ceux retrouvés. */
function mixDrap(s: { a: Float32Array; b: Float32Array; k: number }): Float32Array {
  const { a, b, k } = s;
  const out = new Float32Array(b);
  if (a === b || k <= 0) return out;
  out[0] = a[0]! + (b[0]! - a[0]!) * k;
  out[1] = a[1]! + (b[1]! - a[1]!) * k;
  const pos = new Map<number, number>();
  for (let i = 0; i < (a[6]! | 0); i++) pos.set(a[7 + i * 4]!, 7 + i * 4);
  for (let i = 0; i < (b[6]! | 0); i++) {
    const o = 7 + i * 4;
    const j = pos.get(b[o]!);
    if (j === undefined) continue;
    out[o + 1] = a[j + 1]! + (b[o + 1]! - a[j + 1]!) * k;
    out[o + 2] = a[j + 2]! + (b[o + 2]! - a[j + 2]!) * k;
  }
  return out;
}

/** Ce que chaque événement du serveur donne à voir et à entendre. */
function effects(ev: ArcadeEvent[], kind: ArcadeKind, fx: Fx, mirror: boolean, self: 0 | 1 | null, p: Paint) {
  const X = (x = ARCADE_W / 2) => (mirror ? ARCADE_W - x : x);
  for (const e of ev) {
    const x = X(e.x);
    const y = e.y ?? ARCADE_H / 2;
    switch (e.e) {
      case 'kick':
        thump(0.4);
        fx.burst('spark', x, y, 6, [p.butter, p.gold], 220, 6, 0.3);
        break;
      case 'super':
        whoosh(true);
        fx.burst('heart', x, y, 12, p.rose, 200, 9, 0.9);
        fx.text(x, y - 40, 'Frappe bisou !', p.rose, 24);
        break;
      case 'post':
        play('ding');
        fx.burst('spark', x, y, 8, p.butter, 160, 5, 0.4);
        break;
      case 'goal':
        if (kind === 'foot') {
          play('sifflet');
          fx.shake = 12;
          fx.burst('confetti', x, y, 50, [p.gold, p.cacao2, p.butter, p.rose], 420, 9, 1.4);
          fx.text(ARCADE_W / 2, 150, e.v ? 'BUT BISOU !' : 'BUT !', sideColor(p, e.side ?? 0), 64, 1.5);
        } else {
          fx.text(ARCADE_W / 2, 120, 'Au tapis !', sideColor(p, e.side ?? 0), 52, 1.4);
        }
        if (e.side === self) setTimeout(() => play('bravo'), 250);
        break;
      case 'hit': {
        const power = Math.min(1, (e.v ?? 0) / 120);
        thump(power);
        fx.shake = 3 + power * 9;
        fx.burst('feather', x, y, 8 + Math.round(power * 14), ['#fffaf0', p.butter, '#ffffff'], 160 + power * 140, 7, 1.6);
        fx.add('ring', x, y, { size: 18, color: p.gold, max: 0.35 });
        break;
      }
      case 'fall':
        whoosh(false);
        setTimeout(() => play('boum'), 180);
        fx.burst('feather', x, y, 18, ['#fffaf0', p.butter], 220, 8, 1.8);
        break;
      case 'hug':
        play('rires');
        fx.burst('heart', x, y - 20, 22, p.rose, 220, 11, 1.4);
        fx.text(ARCADE_W / 2, 120, 'Câlin forcé !', p.rose, 50, 1.6);
        break;
      case 'catch':
        pop(e.v ?? 1);
        fx.burst('heart', x, y, 5, p.rose, 140, 6, 0.6);
        fx.text(x, y - 26, `+${e.v}`, p.accent, 22, 0.8);
        break;
      case 'storm':
        play('pouet');
        fx.shake = 8;
        fx.burst('spark', x, y, 10, '#f6d27a', 200, 7, 0.5);
        fx.text(x, y - 30, '−1 ♥', p.bad, 24, 1);
        break;
      case 'kiss':
        whoosh(true);
        fx.burst('heart', x, y, 18, p.rose, 260, 10, 1.2);
        fx.text(x, y - 40, e.v ? `Bisou ! ${e.v} orage${e.v > 1 ? 's' : ''} chassé${e.v > 1 ? 's' : ''}` : 'Bisou !', p.rose, 26, 1.2);
        break;
      case 'combo':
        play('ding');
        fx.text(ARCADE_W / 2, 70, `Série ×${e.v} !`, p.accent, 40, 1.2);
        break;
    }
  }
}

/** Face-à-face : le titre, ce qu'il faut faire, et 3, 2, 1 par-dessus le terrain. */
function Faceoff({ a, side }: { a: ArcadeState; side: 0 | 1 | null }) {
  const endsAt = useGame((s) => s.room!.endsAt);
  const left = useSeconds(endsAt);
  const coarse = useCoarse();
  useEffect(() => {
    if (left > 0 && left <= 3) tick(left === 1);
  }, [left]);
  const how = HOWTO[a.kind];
  return (
    <div className="m-veil absolute inset-0 grid place-items-center rounded-xl bg-page/70 p-4 text-center backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-2">
        <p className="accroche text-3xl text-accent sm:text-4xl">{TITLE[a.kind]}</p>
        <span key={left} className="ar-count font-mono text-6xl font-bold tabular-nums sm:text-8xl" aria-live="assertive">
          {left > 3 ? (ARCADE_COOP[a.kind] ? '♥' : 'VS') : left || 'Go'}
        </span>
        <p className="m-rise max-w-md text-base font-semibold tracking-[-0.02em]">{side === null ? 'Tu regardes cette partie : encourage-les !' : how.goal}</p>
        {side !== null && <p className="m-rise max-w-md text-xs text-muted" style={{ animationDelay: '150ms' }}>{coarse ? how.touch : how.keys}</p>}
      </div>
    </div>
  );
}

function useCoarse(): boolean {
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches || innerWidth < 640);
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches || innerWidth < 640);
    mq.addEventListener('change', on);
    addEventListener('resize', on);
    return () => {
      mq.removeEventListener('change', on);
      removeEventListener('resize', on);
    };
  }, []);
  return coarse;
}

/** Verdict : la couronne pour le vainqueur, ou le score commun et le record en coopératif. */
function Verdict({ a, side }: { a: ArcadeState; side: 0 | 1 | null }) {
  const r = a.result;
  const selfId = useGame((s) => s.selfId);
  const winner = usePlayer(r?.winner ?? undefined);
  const pl = usePlayer(a.leftId);
  const pr = usePlayer(a.rightId);
  const sparks = useRef<HTMLCanvasElement>(null);
  const coop = ARCADE_COOP[a.kind];

  useEffect(() => {
    if (!r) return;
    if ((coop && r.record) || (!coop && r.winner === selfId)) {
      play('bravo');
      return confetti(sparks.current, 140);
    }
    if (!coop && r.winner && side !== null) play('trombone');
    else play('ding');
  }, [r, selfId, side, coop]);

  if (!r) return null;
  return (
    <div className="m-veil absolute inset-0 grid place-items-center overflow-hidden rounded-xl bg-page/80 p-4 text-center backdrop-blur-[2px]">
      <canvas ref={sparks} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <div className="relative flex flex-col items-center gap-2">
        {coop ? (
          <>
            <p className="ar-stamp inline-block rounded-xl border-4 border-accent px-4 py-1 text-4xl font-black uppercase tracking-[-0.03em] text-accent sm:text-6xl">{r.team ?? 0} points</p>
            <p className="m-rise text-lg">
              {r.record ? 'Nouveau record à deux !' : `Record du salon : ${a.best}`}
              {r.ko ? ' (plus de vies)' : ''}
            </p>
          </>
        ) : (
          <>
            <p className={`ar-stamp inline-block rounded-xl border-4 px-4 py-1 text-4xl font-black uppercase tracking-[-0.03em] sm:text-6xl ${r.winner ? 'border-accent text-accent' : 'border-edge text-muted'}`}>
              {a.score[0]} – {a.score[1]}
            </p>
            {winner ? (
              <div className="flex flex-col items-center">
                <span className="ar-crown text-3xl">👑</span>
                <span className="m-pop grid size-20 place-items-center rounded-full border-4 border-gold bg-gold/15 text-5xl">{avatarOf(winner.avatar)}</span>
                <p className="m-rise mt-1 text-lg" style={{ animationDelay: '250ms' }}>
                  <b>{winner.id === selfId ? 'Tu gagnes' : `${winner.name} gagne`}</b>
                  {r.ko ? ' avant la sonnerie !' : ' !'}
                </p>
              </div>
            ) : (
              <p className="m-rise text-lg">Égalité parfaite.</p>
            )}
          </>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {[pl, pr].map((p, i) => (p ? <Gain key={p.id} player={p} self={p.id === selfId} gain={r.gains[p.id] ?? 0} delay={400 + i * 120} /> : null))}
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

const ACTION: Record<ArcadeKind, { icon: string; label: string }> = {
  foot: { icon: '⚽', label: 'Frapper' },
  oreillers: { icon: '🪶', label: 'Coup d’oreiller' },
  drap: { icon: '💋', label: 'Bisou (ensemble)' },
};

/** Manette tactile : flèches à gauche, actions à droite ; plusieurs doigts à la fois. */
function Pad({ kind, press }: { kind: ArcadeKind; press: (bit: number, down: boolean) => void }) {
  const coarse = useCoarse();
  const [portrait, setPortrait] = useState(() => matchMedia('(orientation: portrait)').matches);
  useEffect(() => {
    const mq = matchMedia('(orientation: portrait)');
    const on = () => setPortrait(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (!coarse) return null;
  return (
    <div className="flex flex-col gap-2">
      {portrait && <p className="text-center text-xs text-muted">Astuce : tourne ton téléphone pour un terrain plus grand.</p>}
      <Keys kind={kind} press={press} />
    </div>
  );
}

function Keys({ kind, press }: { kind: ArcadeKind; press: (bit: number, down: boolean) => void }) {
  return (
    <div className="ar-pad m-rise flex select-none items-center justify-between gap-3" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex gap-2">
        <PadButton bit={Key.Left} press={press} label="Gauche">
          ◀
        </PadButton>
        <PadButton bit={Key.Right} press={press} label="Droite">
          ▶
        </PadButton>
      </div>
      <div className="flex gap-2">
        {kind !== 'drap' && (
          <PadButton bit={Key.Up} press={press} label="Sauter">
            ▲
          </PadButton>
        )}
        {kind === 'foot' && (
          <PadButton bit={Key.Super} press={press} label="Frappe bisou" tone="rose">
            💋
          </PadButton>
        )}
        <PadButton bit={Key.Action} press={press} label={ACTION[kind].label} tone="gold" big>
          {ACTION[kind].icon}
        </PadButton>
      </div>
    </div>
  );
}

function PadButton({ bit, press, label, children, tone, big }: { bit: number; press: (bit: number, down: boolean) => void; label: string; children: React.ReactNode; tone?: 'gold' | 'rose'; big?: boolean }) {
  const down = useRef(0);
  const set = (on: boolean, el: HTMLElement) => {
    down.current = Math.max(0, down.current + (on ? 1 : -1));
    const pressed = down.current > 0;
    el.dataset.down = pressed ? '1' : '';
    press(bit, pressed);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`ar-key grid place-items-center rounded-2xl text-2xl font-bold shadow-md ${big ? 'size-20' : 'size-16'} ${tone === 'gold' ? 'bg-gold text-cacao' : tone === 'rose' ? 'bg-butter text-cacao' : 'bg-cacao text-butter'}`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true, e.currentTarget);
      }}
      onPointerUp={(e) => set(false, e.currentTarget)}
      onPointerCancel={(e) => set(false, e.currentTarget)}
    >
      {children}
    </button>
  );
}
