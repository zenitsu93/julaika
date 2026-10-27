import { describe, expect, it } from 'vitest';
import {
  BED_TOP,
  DRAP_Y,
  FOOT_GOAL_TOP,
  FOOT_PLAYER_R,
  FOOT_FLOOR,
  Key,
  createDrap,
  createFoot,
  createOreillers,
  decodeFrame,
  encodeFrame,
  footView,
  pillowView,
  drapView,
  type ArcadeEvent,
} from '@julaika/shared';

function lcg(seed = 7) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function run(sim: { step: (k: readonly [number, number], r: () => number) => ArcadeEvent[] }, steps: number, keys: (i: number) => [number, number], rand = lcg()) {
  const ev: ArcadeEvent[] = [];
  for (let i = 0; i < steps; i++) ev.push(...sim.step(keys(i), rand));
  return ev;
}

describe('Images binaires', () => {
  it('aller-retour d\'une image', () => {
    const buf = encodeFrame('oreillers', 70000, [1.5, -2, 300]);
    const f = decodeFrame(buf)!;
    expect(f.kind).toBe('oreillers');
    expect(f.seq).toBe(70000 & 0xffff);
    expect([...f.values]).toEqual([1.5, -2, 300]);
    expect(new Uint8Array(buf)[0]).toBeGreaterThan(3); // jamais confondue avec un trait
  });
});

describe('Tête-à-tête', () => {
  it('les joueurs restent au sol sans touche et le ballon finit par se poser', () => {
    const sim = createFoot(lcg());
    run(sim, 600, () => [0, 0]);
    const v = footView(sim.frame());
    expect(v.players[0].y).toBeCloseTo(FOOT_FLOOR - FOOT_PLAYER_R, 0);
    expect(v.ball.y).toBeGreaterThan(FOOT_FLOOR - 30);
  });

  it('un ballon poussé dans la cage de droite donne un but au joueur de gauche', () => {
    const sim = createFoot(lcg());
    Object.assign(sim.ball, { x: 760, y: 380, vx: 400, vy: 0 });
    const ev = run(sim, 30, () => [0, 0]);
    expect(ev.some((e) => e.e === 'goal' && e.side === 0)).toBe(true);
    expect(sim.score).toEqual([1, 0]);
  });

  it('la frappe envoie le ballon vers le camp adverse', () => {
    const sim = createFoot(lcg());
    run(sim, 120, () => [0, 0]);
    const p = sim.players[0]!;
    Object.assign(sim.ball, { x: p.x + 40, y: p.y + 10, vx: 0, vy: 0 });
    const ev = run(sim, 2, (i) => [i === 0 ? Key.Action : 0, 0]);
    expect(ev.some((e) => e.e === 'kick' && e.side === 0)).toBe(true);
    expect(sim.ball.vx).toBeGreaterThan(400);
  });

  it('la frappe bisou demande une jauge pleine', () => {
    const sim = createFoot(lcg());
    const p = sim.players[1]!;
    Object.assign(sim.ball, { x: p.x - 40, y: p.y, vx: 0, vy: 0 });
    let ev = run(sim, 2, (i) => [0, i === 0 ? Key.Super : 0]);
    expect(ev.some((e) => e.e === 'super')).toBe(false);
    p.meter = 1;
    Object.assign(sim.ball, { x: p.x - 40, y: p.y, vx: 0, vy: 0 });
    ev = run(sim, 2, (i) => [0, i === 0 ? Key.Super : 0]);
    expect(ev.some((e) => e.e === 'super' && e.side === 1)).toBe(true);
    expect(sim.ball.vx).toBeLessThan(-900);
  });

  it('on ne saute pas à travers la barre', () => {
    const sim = createFoot(lcg());
    sim.players[0]!.x = 40;
    let top = 999;
    for (let i = 0; i < 60; i++) {
      sim.step([i === 0 ? Key.Up | Key.Left : Key.Left, 0], lcg());
      top = Math.min(top, sim.players[0]!.y - FOOT_PLAYER_R);
    }
    expect(top).toBeGreaterThanOrEqual(FOOT_GOAL_TOP);
  });

  it('cinq buts terminent le match', () => {
    const sim = createFoot(lcg());
    for (let g = 0; g < 5; g++) {
      Object.assign(sim.ball, { x: 30, y: 380, vx: -300, vy: 0 });
      run(sim, 200, () => [0, 0]);
    }
    expect(sim.score[1]).toBe(5);
    expect(sim.over).toBe(true);
  });
});

describe('Bataille d\'oreillers', () => {
  it('un pantin laissé tranquille tient debout sur le lit', () => {
    const sim = createOreillers(lcg());
    run(sim, 300, () => [0, 0]);
    const v = pillowView(sim.frame());
    for (const r of v.rags) {
      expect(r.pts[0]!.y).toBeLessThan(r.pts[2]!.y - 40); // la tête au-dessus du bassin
      expect(r.pts[2]!.y).toBeLessThan(BED_TOP);
      expect(Math.max(r.pts[6]!.y, r.pts[8]!.y)).toBeGreaterThan(BED_TOP - 4);
    }
  });

  it('il avance et saute', () => {
    const sim = createOreillers(lcg());
    run(sim, 60, () => [0, 0]);
    const x0 = sim.rags[0]!.pts[2]!.x;
    run(sim, 40, () => [Key.Right, 0]);
    expect(sim.rags[0]!.pts[2]!.x - x0).toBeGreaterThan(60);
    const y0 = sim.rags[1]!.pts[2]!.y;
    let top = y0;
    for (let i = 0; i < 30; i++) {
      sim.step([0, i === 0 ? Key.Up : 0], lcg());
      top = Math.min(top, sim.rags[1]!.pts[2]!.y);
    }
    expect(y0 - top).toBeGreaterThan(25);
  });

  it('un coup d\'oreiller touche et repousse l\'adversaire', () => {
    const sim = createOreillers(lcg());
    run(sim, 60, () => [0, 0]);
    run(sim, 80, () => [Key.Right, Key.Left]);
    const before = sim.rags[1]!.pts[2]!.x;
    const ev = run(sim, 30, (i) => [i === 0 ? Key.Action : 0, 0]);
    expect(ev.some((e) => e.e === 'hit' && e.side === 0)).toBe(true);
    run(sim, 20, () => [0, 0]);
    expect(sim.rags[1]!.pts[2]!.x).toBeGreaterThan(before + 10);
    expect(sim.rags[1]!.dmg).toBeGreaterThan(0);
  });

  it('tomber du lit donne le point à l\'autre', () => {
    const sim = createOreillers(lcg());
    for (const p of sim.rags[1]!.pts) {
      p.x += 300;
      p.px += 300;
    }
    const ev = run(sim, 120, () => [0, 0]);
    expect(ev.some((e) => e.e === 'fall' && e.side === 1)).toBe(true);
    expect(sim.score).toEqual([1, 0]);
  });

  it('tomber ensemble, c\'est un câlin : pas de point', () => {
    const sim = createOreillers(lcg());
    sim.rags.forEach((r, s) => {
      for (const p of r.pts) {
        p.x += s ? 300 : -300;
        p.px += s ? 300 : -300;
      }
    });
    const ev = run(sim, 120, () => [0, 0]);
    expect(ev.some((e) => e.e === 'hug')).toBe(true);
    expect(sim.score).toEqual([0, 0]);
  });
});

describe('Le Drap tendu', () => {
  it('un cœur qui tombe dans le drap rapporte un point', () => {
    const sim = createDrap(lcg());
    sim.items.push({ id: 999, x: 400, y: DRAP_Y - 60, vy: 200, kind: 0, sway: 0 });
    const ev = run(sim, 40, () => [0, 0]);
    expect(ev.some((e) => e.e === 'catch')).toBe(true);
    expect(sim.score[0]).toBeGreaterThanOrEqual(1);
  });

  it('un orage attrapé coûte une vie', () => {
    const sim = createDrap(() => 0.99); // pas d'orage tiré au sort
    sim.items.push({ id: 999, x: 400, y: DRAP_Y - 40, vy: 200, kind: 2, sway: 0 });
    run(sim, 30, () => [0, 0]);
    expect(sim.lives).toBe(2);
  });

  it('tirer trop fort entraîne l\'autre', () => {
    const sim = createDrap(lcg());
    run(sim, 120, () => [Key.Left, 0]);
    const v = drapView(sim.frame());
    expect(v.hands[1] - v.hands[0]).toBeLessThanOrEqual(380.5);
    expect(v.hands[1]).toBeLessThan(530);
  });

  it('le bisou à deux chasse les orages proches', () => {
    const sim = createDrap(() => 0.99);
    sim.items.push({ id: 999, x: 400, y: DRAP_Y - 100, vy: 100, kind: 2, sway: 0 });
    const ev = run(sim, 3, (i) => (i === 0 ? [Key.Action, 0] : i === 1 ? [Key.Action, Key.Action] : [Key.Action, Key.Action]));
    expect(ev.some((e) => e.e === 'kiss' && e.v === 1)).toBe(true);
    run(sim, 60, () => [0, 0]);
    expect(sim.lives).toBe(3);
  });
});
