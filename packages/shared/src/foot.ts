// Tête-à-tête : foot « grosses têtes » vu de côté, un joueur par camp. Le joueur de gauche
// défend la cage de gauche et marque à droite. Que des cercles : joueurs, ballon, barres.

import { ARCADE_DT, ARCADE_W, Key, clamp, type ArcadeEvent, type ArcadeSim } from './arcadeBase';

export const FOOT_FLOOR = 410;
export const FOOT_GOAL_W = 58;
/** Hauteur de la barre transversale : la cage va de là jusqu'au sol. */
export const FOOT_GOAL_TOP = 268;
export const FOOT_PLAYER_R = 30;
export const FOOT_BALL_R = 14;
/** Premier à 5 buts : fin avant la sonnerie. */
export const FOOT_WIN = 5;
/** La frappe bisou se recharge en 12 s ; chaque touche de balle l'accélère un peu. */
export const FOOT_SUPER_CHARGE = 12;

const RUN = 300;
const JUMP = 560;
const GRAVITY = 1500;
const BALL_GRAVITY = 1050;
const KICK_TIME = 0.2;
const KICK_REACH = FOOT_PLAYER_R + FOOT_BALL_R + 26;
/** Pause après un but, le temps de la célébration. */
const GOAL_PAUSE = 1.6;

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Footballer extends Body {
  kick: number;
  kicked: boolean;
  meter: number;
  prev: number;
}

/** Image du monde : ballon (x, y, bisou), deux joueurs (x, y, frappe, jauge), pause. */
export interface FootView {
  ball: { x: number; y: number; kiss: number };
  players: [{ x: number; y: number; kick: number; meter: number }, { x: number; y: number; kick: number; meter: number }];
  pause: number;
}

export function footView(v: ArrayLike<number>): FootView {
  const p = (i: number) => ({ x: v[i]!, y: v[i + 1]!, kick: v[i + 2]!, meter: v[i + 3]! });
  return { ball: { x: v[0]!, y: v[1]!, kiss: v[2]! }, players: [p(3), p(7)], pause: v[11]! };
}

export function createFoot(random: () => number): ArcadeSim & { ball: Body & { kiss: number }; players: Footballer[] } {
  const ground = FOOT_FLOOR - FOOT_PLAYER_R;
  const players: Footballer[] = [0, 1].map(() => ({ x: 0, y: ground, vx: 0, vy: 0, kick: 0, kicked: false, meter: 0, prev: 0 }));
  const ball = { x: ARCADE_W / 2, y: 150, vx: 0, vy: 0, kiss: 0 };
  const score: [number, number] = [0, 0];
  let pause = 0;
  let over = false;

  const kickoff = (toward: number) => {
    players[0]!.x = 190;
    players[1]!.x = ARCADE_W - 190;
    for (const p of players) Object.assign(p, { y: ground, vx: 0, vy: 0, kick: 0, kicked: false });
    // Le ballon tombe au centre, légèrement vers le camp qui vient d'encaisser.
    Object.assign(ball, { x: ARCADE_W / 2, y: 140, vx: toward * (30 + random() * 40), vy: 0, kiss: 0 });
  };
  kickoff(random() < 0.5 ? -1 : 1);

  function step(keys: readonly [number, number]): ArcadeEvent[] {
    const ev: ArcadeEvent[] = [];
    if (over) return ev;
    const dt = ARCADE_DT;
    if (pause > 0) {
      pause -= dt;
      if (pause <= 0 && !over) kickoff(score[0] > score[1] ? 1 : -1);
      return ev;
    }

    players.forEach((p, side) => {
      const k = keys[side]! | 0;
      const pressed = k & ~p.prev;
      p.prev = k;
      const dir = side === 0 ? 1 : -1;
      const want = (k & Key.Right ? 1 : 0) - (k & Key.Left ? 1 : 0);
      p.vx += (want * RUN - p.vx) * 0.35;
      const onGround = p.y >= ground - 0.5;
      if (pressed & Key.Up && onGround) p.vy = -JUMP;
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > ground) {
        p.y = ground;
        p.vy = 0;
      }
      // Sous la barre transversale, on ne saute pas au travers.
      const inGoal = p.x < FOOT_GOAL_W + FOOT_PLAYER_R * 0.6 || p.x > ARCADE_W - FOOT_GOAL_W - FOOT_PLAYER_R * 0.6;
      if (inGoal && p.y - FOOT_PLAYER_R < FOOT_GOAL_TOP + 6) {
        p.y = FOOT_GOAL_TOP + 6 + FOOT_PLAYER_R;
        p.vy = Math.max(0, p.vy);
      }
      p.x = clamp(p.x, FOOT_PLAYER_R, ARCADE_W - FOOT_PLAYER_R);
      p.meter = Math.min(1, p.meter + dt / FOOT_SUPER_CHARGE);

      if (pressed & Key.Action && p.kick <= 0) {
        p.kick = KICK_TIME;
        p.kicked = false;
      }
      const reach = Math.hypot(ball.x - (p.x + dir * 16), ball.y - (p.y + FOOT_PLAYER_R * 0.5));
      if (pressed & Key.Super && p.meter >= 1 && reach < KICK_REACH + 8) {
        // Frappe bisou : tendue, presque sans gravité, et une traînée de cœurs.
        p.meter = 0;
        p.kick = KICK_TIME;
        p.kicked = true;
        ball.vx = dir * 1040;
        ball.vy = -140;
        ball.kiss = 1.1;
        ev.push({ e: 'super', side: side as 0 | 1, x: ball.x, y: ball.y });
      } else if (p.kick > 0 && !p.kicked && reach < KICK_REACH) {
        p.kicked = true;
        // Plus le ballon est bas, plus la frappe le soulève.
        const low = clamp((ball.y - p.y) / FOOT_PLAYER_R, -1, 1.5);
        ball.vx = dir * 640 + p.vx * 0.25;
        ball.vy = -260 - low * 140;
        p.meter = Math.min(1, p.meter + 0.04);
        ev.push({ e: 'kick', side: side as 0 | 1, x: ball.x, y: ball.y });
      }
      p.kick = Math.max(0, p.kick - dt);
    });

    // Les deux joueurs ne se traversent pas.
    // Contre un mur, c'est l'autre qui recule de tout l'écart.
    const [a, b] = players as [Footballer, Footballer];
    const gap = b.x - a.x;
    const min = FOOT_PLAYER_R * 1.9;
    if (Math.abs(gap) < min && Math.abs(a.y - b.y) < FOOT_PLAYER_R * 1.6) {
      const s = gap >= 0 ? 1 : -1;
      const [lo, hi] = s > 0 ? [a, b] : [b, a];
      const mid = clamp((lo.x + hi.x) / 2, FOOT_PLAYER_R + min / 2, ARCADE_W - FOOT_PLAYER_R - min / 2);
      lo.x = mid - min / 2;
      hi.x = mid + min / 2;
    }

    // Ballon : sous-pas pour ne pas traverser un joueur lancé à pleine vitesse.
    const SUB = 3;
    for (let s = 0; s < SUB; s++) {
      const h = dt / SUB;
      ball.vy += BALL_GRAVITY * (ball.kiss > 0 ? 0.25 : 1) * h;
      ball.vx *= 0.9993;
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      const r = FOOT_BALL_R;
      if (ball.y > FOOT_FLOOR - r) {
        ball.y = FOOT_FLOOR - r;
        ball.vy = Math.abs(ball.vy) > 60 ? -ball.vy * 0.68 : 0;
        ball.vx *= 0.985;
      }
      if (ball.y < r) {
        ball.y = r;
        ball.vy = Math.abs(ball.vy) * 0.7;
      }
      if (ball.x < r) {
        ball.x = r;
        ball.vx = Math.abs(ball.vx) * 0.75;
      }
      if (ball.x > ARCADE_W - r) {
        ball.x = ARCADE_W - r;
        ball.vx = -Math.abs(ball.vx) * 0.75;
      }
      // Barres transversales : un segment de chaque côté.
      for (const [x0, x1] of [
        [0, FOOT_GOAL_W],
        [ARCADE_W - FOOT_GOAL_W, ARCADE_W],
      ] as const) {
        const cx = clamp(ball.x, x0, x1);
        const dx = ball.x - cx;
        const dy = ball.y - FOOT_GOAL_TOP;
        const d = Math.hypot(dx, dy);
        if (d < r && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          ball.x = cx + nx * r;
          ball.y = FOOT_GOAL_TOP + ny * r;
          const vn = ball.vx * nx + ball.vy * ny;
          if (vn < 0) {
            ball.vx -= 1.7 * vn * nx;
            ball.vy -= 1.7 * vn * ny;
            if (-vn > 200) ev.push({ e: 'post', x: ball.x, y: ball.y });
          }
        }
      }
      for (const p of players) {
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const d = Math.hypot(dx, dy);
        const min = FOOT_PLAYER_R + r;
        if (d < min && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          ball.x = p.x + nx * min;
          ball.y = p.y + ny * min;
          const rvx = ball.vx - p.vx;
          const rvy = ball.vy - p.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            ball.vx -= 1.55 * vn * nx;
            ball.vy -= 1.55 * vn * ny;
            // Une tête, ça renvoie toujours un peu vers le haut.
            if (ny < -0.3) ball.vy = Math.min(ball.vy, -220);
          }
        }
      }
    }
    ball.kiss = Math.max(0, ball.kiss - dt);

    // But : le ballon entièrement passé sous la barre.
    const under = ball.y > FOOT_GOAL_TOP;
    const scorer: 0 | 1 | null = under && ball.x + FOOT_BALL_R * 0.4 < FOOT_GOAL_W ? 1 : under && ball.x - FOOT_BALL_R * 0.4 > ARCADE_W - FOOT_GOAL_W ? 0 : null;
    if (scorer !== null) {
      score[scorer]++;
      ev.push({ e: 'goal', side: scorer, x: ball.x, y: ball.y, v: ball.kiss > 0 ? 1 : 0 });
      pause = GOAL_PAUSE;
      if (score[scorer] >= FOOT_WIN) over = true;
    }
    return ev;
  }

  return {
    ball,
    players,
    score,
    get over() {
      return over;
    },
    step,
    frame: () => {
      const r = (n: number) => Math.round(n * 10) / 10;
      const p = (q: Footballer) => [r(q.x), r(q.y), q.kick > 0 ? 1 - q.kick / KICK_TIME : 0, q.meter];
      return [r(ball.x), r(ball.y), ball.kiss, ...p(players[0]!), ...p(players[1]!), Math.max(0, pause)];
    },
  };
}
