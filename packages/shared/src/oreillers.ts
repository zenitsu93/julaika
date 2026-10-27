// Bataille d'oreillers : deux pantins mous sur un lit, un oreiller chacun. On fait tomber
// l'autre du matelas. Chaque pantin = 9 points reliés par des bâtons (intégration de Verlet),
// tenus debout par des « muscles » qui les ramènent vers la pose ; un coup les rend tout mous.

import { ARCADE_DT, ARCADE_W, Key, clamp, type ArcadeEvent, type ArcadeSim } from './arcadeBase';

export const BED_LEFT = 150;
export const BED_RIGHT = 650;
export const BED_TOP = 330;
export const ROOM_FLOOR = 432;
/** Premier à 3 chutes de l'autre. */
export const PILLOW_WIN = 3;
/** Points d'un pantin : tête, cou, bassin, main arrière, main à l'oreiller, genou, pied, genou, pied. */
export const RAG_POINTS = 9;
export const RAG_BONES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [5, 6],
  [2, 7],
  [7, 8],
];

/** Pose debout, face à droite, par rapport au bassin. */
const POSE: readonly (readonly [number, number])[] = [
  [0, -60],
  [0, -40],
  [0, 0],
  [-15, -20],
  [17, -24],
  [-7, 21],
  [-9, 42],
  [7, 21],
  [9, 42],
];
/** Raideur des muscles par point (fraction de l'écart corrigée à chaque pas). */
const MUSCLE = [0.09, 0.08, 0, 0.05, 0.06, 0.05, 0.05, 0.05, 0.05];
/** Bâtons rigides en plus des os : tête-bassin pour que le buste ne se plie pas en deux. */
const STRUTS: readonly (readonly [number, number])[] = [[0, 2]];

const GRAVITY = 1500 * ARCADE_DT * ARCADE_DT;
const WALK = 3.1;
const JUMP = 8.2;
const SWING_TIME = 0.3;
const SWING_COOLDOWN = 0.42;
const ARM = 32;
const PILLOW_REACH = 30;
/** Deux chutes à moins de 0,4 s : câlin forcé, manche nulle. */
const HUG_WINDOW = 0.4;
const FALL_PAUSE = 1.7;

interface Pt {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Rag {
  pts: Pt[];
  facing: 1 | -1;
  swing: number;
  cooldown: number;
  hitDone: boolean;
  /** Dégâts accumulés : plus ils montent, plus les coups reçus envoient loin. */
  dmg: number;
  stun: number;
  walk: number;
  prev: number;
  fell: number;
}

export interface PillowView {
  rags: [RagView, RagView];
  pause: number;
}
export interface RagView {
  pts: { x: number; y: number }[];
  facing: number;
  swing: number;
  dmg: number;
  stun: number;
}

const RAG_FRAME = RAG_POINTS * 2 + 4;

export function pillowView(v: ArrayLike<number>): PillowView {
  const rag = (o: number): RagView => ({
    pts: Array.from({ length: RAG_POINTS }, (_, i) => ({ x: v[o + i * 2]!, y: v[o + i * 2 + 1]! })),
    facing: v[o + RAG_POINTS * 2]!,
    swing: v[o + RAG_POINTS * 2 + 1]!,
    dmg: v[o + RAG_POINTS * 2 + 2]!,
    stun: v[o + RAG_POINTS * 2 + 3]!,
  });
  return { rags: [rag(0), rag(RAG_FRAME)], pause: v[RAG_FRAME * 2]! };
}

/** Centre de l'oreiller : au bout de la main avant, un peu plus loin dans le sens du regard. */
export function pillowAt(hand: { x: number; y: number }, neck: { x: number; y: number }): { x: number; y: number; angle: number } {
  const a = Math.atan2(hand.y - neck.y, hand.x - neck.x);
  return { x: hand.x + Math.cos(a) * 14, y: hand.y + Math.sin(a) * 14, angle: a };
}

export function createOreillers(random: () => number): ArcadeSim & { rags: Rag[] } {
  const rags: Rag[] = [0, 1].map((side) => ({
    pts: [],
    facing: side === 0 ? 1 : -1,
    swing: 0,
    cooldown: 0,
    hitDone: false,
    dmg: 0,
    stun: 0,
    walk: 0,
    prev: 0,
    fell: -1,
  }));
  const score: [number, number] = [0, 0];
  let pause = 0;
  let over = false;
  let clock = 0;

  const place = () => {
    rags.forEach((r, side) => {
      const cx = side === 0 ? 290 : ARCADE_W - 290;
      const cy = BED_TOP - 44;
      r.facing = side === 0 ? 1 : -1;
      r.pts = POSE.map(([dx, dy]) => ({ x: cx + dx * r.facing, y: cy + dy, px: cx + dx * r.facing, py: cy + dy }));
      r.swing = 0;
      r.cooldown = 0;
      r.dmg = 0;
      r.stun = 0;
      r.fell = -1;
    });
  };
  place();

  const lengths = [...RAG_BONES, ...STRUTS].map(([a, b]) => Math.hypot(POSE[a]![0] - POSE[b]![0], POSE[a]![1] - POSE[b]![1]));
  const sticks = [...RAG_BONES, ...STRUTS];

  const surfaceUnder = (x: number) => (x >= BED_LEFT && x <= BED_RIGHT ? BED_TOP : ROOM_FLOOR);
  const grounded = (r: Rag) => [6, 8].some((i) => r.pts[i]!.y >= surfaceUnder(r.pts[i]!.x) - 1.5);

  function step(keys: readonly [number, number]): ArcadeEvent[] {
    const ev: ArcadeEvent[] = [];
    if (over) return ev;
    const dt = ARCADE_DT;
    clock += dt;
    if (pause > 0) {
      pause -= dt;
      // Le monde continue de bouger pendant la pause : on voit le pantin finir sa chute.
      for (const r of rags) integrate(r, 0, true);
      if (pause <= 0 && !over) place();
      return ev;
    }

    rags.forEach((r, side) => {
      const k = keys[side]! | 0;
      const pressed = k & ~r.prev;
      r.prev = k;
      const other = rags[1 - side]!;
      if (r.swing <= 0) r.facing = other.pts[2]!.x >= r.pts[2]!.x ? 1 : -1;
      r.cooldown = Math.max(0, r.cooldown - dt);
      r.stun = Math.max(0, r.stun - dt);
      if (pressed & Key.Action && r.cooldown <= 0 && r.stun <= 0) {
        r.swing = SWING_TIME;
        r.cooldown = SWING_COOLDOWN;
        r.hitDone = false;
      }
      const want = (k & Key.Right ? 1 : 0) - (k & Key.Left ? 1 : 0);
      if (pressed & Key.Up && grounded(r) && r.stun <= 0) for (const p of r.pts) p.py = p.y + JUMP;
      integrate(r, r.stun > 0 ? 0 : want, false);
    });

    // Coups d'oreiller : une seule touche par élan, pendant la partie descendante du geste.
    rags.forEach((r, side) => {
      if (r.swing <= 0) return;
      const t = 1 - r.swing / SWING_TIME;
      r.swing = Math.max(0, r.swing - dt);
      if (r.hitDone || t < 0.25 || t > 0.9) return;
      const pillow = pillowAt(r.pts[4]!, r.pts[1]!);
      const foe = rags[1 - side]!;
      const touched = [0, 1, 2, 3].some((i) => Math.hypot(foe.pts[i]!.x - pillow.x, foe.pts[i]!.y - pillow.y) < PILLOW_REACH);
      if (!touched) return;
      r.hitDone = true;
      const kb = (240 + foe.dmg * 4.2) * dt;
      for (const p of foe.pts) {
        p.px -= r.facing * kb;
        p.py += kb * 0.5;
      }
      foe.dmg = Math.min(200, foe.dmg + 10 + random() * 5);
      foe.stun = 0.3 + foe.dmg / 260;
      ev.push({ e: 'hit', side: side as 0 | 1, x: pillow.x, y: pillow.y, v: foe.dmg });
    });

    // Les deux pantins se bousculent sans se traverser.
    const [a, b] = rags as [Rag, Rag];
    for (const i of [0, 1, 2]) {
      for (const j of [0, 1, 2]) {
        const p = a.pts[i]!;
        const q = b.pts[j]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 20 && d > 0) {
          const f = (20 - d) / d / 2;
          p.x -= dx * f;
          p.y -= dy * f;
          q.x += dx * f;
          q.y += dy * f;
        }
      }
    }

    // Chute : le bassin passe sous le matelas, donc au sol de la chambre.
    rags.forEach((r, side) => {
      if (r.fell < 0 && r.pts[2]!.y > BED_TOP + 36) {
        r.fell = clock;
        ev.push({ e: 'fall', side: side as 0 | 1, x: r.pts[2]!.x, y: r.pts[2]!.y });
      }
    });
    const [f0, f1] = [a.fell, b.fell];
    const first = f0 >= 0 && (f1 < 0 || f0 <= f1) ? 0 : f1 >= 0 ? 1 : -1;
    if (first >= 0 && clock - rags[first]!.fell >= HUG_WINDOW) {
      if (f0 >= 0 && f1 >= 0) ev.push({ e: 'hug', x: (a.pts[2]!.x + b.pts[2]!.x) / 2, y: ROOM_FLOOR - 20 });
      else {
        const winner = (1 - first) as 0 | 1;
        score[winner]++;
        ev.push({ e: 'goal', side: winner });
        if (score[winner] >= PILLOW_WIN) over = true;
      }
      pause = FALL_PAUSE;
    }
    return ev;
  }

  function integrate(r: Rag, want: number, limp: boolean) {
    const pts = r.pts;
    const stunned = limp || r.stun > 0;
    // Verlet : la vitesse est l'écart avec la position précédente.
    for (const p of pts) {
      const vx = (p.x - p.px) * 0.993;
      const vy = (p.y - p.py) * 0.993;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY;
    }
    const pelvis = pts[2]!;
    const onGround = grounded(r);
    if (!stunned) {
      if (onGround) {
        // Marche : la vitesse horizontale du bassin rejoint celle voulue.
        const vx = pelvis.x - pelvis.px;
        const nvx = vx + (want * WALK - vx) * 0.3;
        pelvis.px = pelvis.x - nvx;
        // Les jambes tiennent le bassin à hauteur.
        const floor = Math.min(surfaceUnder(pts[6]!.x), surfaceUnder(pts[8]!.x));
        const target = floor - 42;
        if (pelvis.y > target) pelvis.y += (target - pelvis.y) * 0.35;
      } else if (want) {
        pelvis.px -= want * 0.06;
      }
      if (want) r.walk += 0.22;
      // Muscles : chaque point revient vers sa place dans la pose.
      const swingT = r.swing > 0 ? 1 - r.swing / SWING_TIME : -1;
      for (let i = 0; i < RAG_POINTS; i++) {
        if (i === 2) continue;
        let [dx, dy] = POSE[i]!;
        let k = MUSCLE[i]!;
        if ((i === 6 || i === 8) && want && onGround) dx += Math.sin(r.walk + (i === 6 ? 0 : Math.PI)) * 9;
        if (i === 4 && swingT >= 0) {
          // L'élan : l'oreiller part de derrière la tête et s'abat devant.
          const ang = -2.3 + swingT * 2.9;
          dx = Math.cos(ang) * ARM;
          dy = POSE[1]![1] + Math.sin(ang) * ARM;
          k = 0.55;
        }
        const tx = pelvis.x + dx * r.facing;
        const ty = pelvis.y + dy;
        const p = pts[i]!;
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
      }
    }
    for (let it = 0; it < 4; it++) {
      for (let s = 0; s < sticks.length; s++) {
        const [ia, ib] = sticks[s]!;
        const a = pts[ia]!;
        const b = pts[ib]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = (d - lengths[s]!) / d / 2;
        a.x += dx * f;
        a.y += dy * f;
        b.x -= dx * f;
        b.y -= dy * f;
      }
      for (const p of pts) collide(p, stunned);
    }
  }

  function collide(p: Pt, sliding: boolean) {
    // Le matelas : on rebondit dessus quand on arrive d'en haut, on bute contre son flanc sinon.
    const onBed = p.x >= BED_LEFT && p.x <= BED_RIGHT;
    if (onBed && p.y > BED_TOP) {
      if (p.py <= BED_TOP + 1) {
        const vy = p.y - p.py;
        p.y = BED_TOP;
        p.py = BED_TOP + vy * 0.3;
        const vx = p.x - p.px;
        p.px = p.x - vx * (sliding ? 0.92 : 0.6);
      } else {
        p.x = p.x - BED_LEFT < BED_RIGHT - p.x ? BED_LEFT - 0.5 : BED_RIGHT + 0.5;
      }
    }
    if (p.y > ROOM_FLOOR) {
      p.y = ROOM_FLOOR;
      p.px = p.x - (p.x - p.px) * 0.5;
    }
    if (p.x < 8 || p.x > ARCADE_W - 8) {
      const vx = p.x - p.px;
      p.x = clamp(p.x, 8, ARCADE_W - 8);
      p.px = p.x + vx * 0.4;
    }
    if (p.y < 6) p.y = 6;
  }

  return {
    rags,
    score,
    get over() {
      return over;
    },
    step,
    frame: () => {
      const out: number[] = [];
      for (const r of rags) {
        for (const p of r.pts) out.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
        out.push(r.facing, r.swing > 0 ? 1 - r.swing / SWING_TIME : 0, Math.round(r.dmg), r.stun > 0 ? 1 : 0);
      }
      out.push(Math.max(0, pause));
      return out;
    },
  };
}
