// Le Drap tendu : coopératif. Chacun tient un coin d'un drap ; il faut bouger ensemble pour
// attraper les cœurs qui tombent et laisser passer les orages. Trop tirer entraîne l'autre ;
// appuyer ensemble sur Action (à 250 ms près) souffle un bisou qui chasse les orages proches.

import { ARCADE_DT, ARCADE_W, Key, clamp, type ArcadeEvent, type ArcadeSim } from './arcadeBase';

export const DRAP_Y = 350;
export const DRAP_FLOOR = 440;
/** Écart entre les deux mains : trop près, le drap pend ; trop loin, il se tend puis tire l'autre. */
export const DRAP_MIN = 110;
export const DRAP_MAX = 380;
export const DRAP_LIVES = 3;
/** Le bisou se recharge en 4 s. */
export const DRAP_KISS_COOLDOWN = 4;

export const DrapItem = { Heart: 0, Gold: 1, Storm: 2 } as const;
export type DrapItem = (typeof DrapItem)[keyof typeof DrapItem];

const RUN = 360;
const KISS_SYNC = 0.25;
const KISS_RANGE = 170;

interface Item {
  id: number;
  x: number;
  y: number;
  vy: number;
  kind: DrapItem;
  sway: number;
}

export interface DrapView {
  hands: [number, number];
  combo: number;
  lives: number;
  kiss: number;
  /** Bisou en cours (de 1 à 0) pour l'onde. */
  wave: number;
  items: { id: number; x: number; y: number; kind: DrapItem }[];
}

export function drapView(v: ArrayLike<number>): DrapView {
  const n = v[6]! | 0;
  const items: DrapView['items'] = [];
  for (let i = 0; i < n; i++) {
    const o = 7 + i * 4;
    items.push({ id: v[o]!, x: v[o + 1]!, y: v[o + 2]!, kind: v[o + 3]! as DrapItem });
  }
  return { hands: [v[0]!, v[1]!], combo: v[2]!, lives: v[3]!, kiss: v[4]!, wave: v[5]!, items };
}

/** Creux du drap entre les deux mains : une parabole d'autant plus profonde que le drap est lâche. */
export function drapSag(hands: readonly [number, number]): number {
  const t = clamp((hands[1] - hands[0] - DRAP_MIN) / (DRAP_MAX - DRAP_MIN), 0, 1);
  return 8 + (1 - t) * 46;
}

export function drapYAt(x: number, hands: readonly [number, number]): number {
  const span = hands[1] - hands[0];
  const t = clamp((x - hands[0]) / span, 0, 1);
  return DRAP_Y + drapSag(hands) * 4 * t * (1 - t);
}

/** Multiplicateur de série : ×2 à 5 cœurs d'affilée, ×3 à 12. */
export function drapMultiplier(combo: number): number {
  return combo >= 12 ? 3 : combo >= 5 ? 2 : 1;
}

export function createDrap(random: () => number): ArcadeSim & { hands: [number, number]; items: Item[]; lives: number } {
  const hands: [number, number] = [ARCADE_W / 2 - 130, ARCADE_W / 2 + 130];
  const items: Item[] = [];
  const score: [number, number] = [0, 0];
  let lives = DRAP_LIVES;
  let combo = 0;
  let clock = 0;
  let spawnIn = 1;
  let nextId = 1;
  let kiss = 0;
  let wave = 0;
  const lastAction = [-9, -9];
  const prev = [0, 0];
  let over = false;

  function step(keys: readonly [number, number]): ArcadeEvent[] {
    const ev: ArcadeEvent[] = [];
    if (over) return ev;
    const dt = ARCADE_DT;
    clock += dt;
    kiss = Math.max(0, kiss - dt);
    wave = Math.max(0, wave - dt * 2);

    // Les mains : chacun bouge la sienne, et celui qui tire trop entraîne l'autre.
    const want = [0, 1].map((s) => {
      const k = keys[s]! | 0;
      return (k & Key.Right ? 1 : 0) - (k & Key.Left ? 1 : 0);
    });
    hands[0] += want[0]! * RUN * dt;
    hands[1] += want[1]! * RUN * dt;
    const span = hands[1] - hands[0];
    if (span > DRAP_MAX) {
      const extra = span - DRAP_MAX;
      if (want[0]! < 0 && want[1]! <= 0) hands[1] -= extra;
      else if (want[1]! > 0 && want[0]! >= 0) hands[0] += extra;
      else {
        hands[0] += extra / 2;
        hands[1] -= extra / 2;
      }
    } else if (span < DRAP_MIN) {
      const lack = DRAP_MIN - span;
      if (want[0]! > 0 && want[1]! >= 0) hands[1] += lack;
      else if (want[1]! < 0 && want[0]! <= 0) hands[0] -= lack;
      else {
        hands[0] -= lack / 2;
        hands[1] += lack / 2;
      }
    }
    // Contre les murs, le drap glisse en bloc.
    if (hands[0] < 16) {
      hands[1] += 16 - hands[0];
      hands[0] = 16;
    }
    if (hands[1] > ARCADE_W - 16) {
      hands[0] -= hands[1] - (ARCADE_W - 16);
      hands[1] = ARCADE_W - 16;
    }

    // Bisou : les deux appuient sur Action presque en même temps.
    [0, 1].forEach((s) => {
      const k = keys[s]! | 0;
      if (k & ~prev[s]! & Key.Action) lastAction[s] = clock;
      prev[s] = k;
    });
    if (kiss <= 0 && Math.abs(lastAction[0]! - lastAction[1]!) <= KISS_SYNC && clock - Math.max(lastAction[0]!, lastAction[1]!) < 0.05) {
      kiss = DRAP_KISS_COOLDOWN;
      wave = 1;
      const mid = (hands[0] + hands[1]) / 2;
      let blown = 0;
      for (const it of items) {
        if (it.kind === DrapItem.Storm && Math.hypot(it.x - mid, it.y - DRAP_Y) < KISS_RANGE + (hands[1] - hands[0]) / 2) {
          it.vy = -420;
          it.kind = DrapItem.Storm;
          it.sway = 99; // marqué : repart vers le ciel et disparaît
          blown++;
        }
      }
      ev.push({ e: 'kiss', x: mid, y: DRAP_Y - 30, v: blown });
      lastAction[0] = lastAction[1] = -9;
    }

    // Ça tombe de plus en plus vite et de plus en plus souvent.
    const heat = Math.min(1, clock / 55);
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnIn = 1.15 - heat * 0.65 + random() * 0.35;
      const roll = random();
      const kind = roll < 0.18 + heat * 0.17 ? DrapItem.Storm : roll > 0.9 ? DrapItem.Gold : DrapItem.Heart;
      items.push({
        id: nextId++,
        x: 40 + random() * (ARCADE_W - 80),
        y: -20,
        vy: (kind === DrapItem.Gold ? 170 : 115) + heat * 110 + random() * 40,
        kind,
        sway: random() * Math.PI * 2,
      });
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]!;
      const before = it.y;
      if (it.sway === 99) {
        it.y += it.vy * dt;
        if (it.y < -40) items.splice(i, 1);
        continue;
      }
      it.y += it.vy * dt;
      it.x = clamp(it.x + Math.sin(clock * 2 + it.sway) * 30 * dt, 12, ARCADE_W - 12);
      const inside = it.x >= hands[0] && it.x <= hands[1];
      const line = drapYAt(it.x, hands);
      if (inside && before <= line && it.y >= line) {
        items.splice(i, 1);
        if (it.kind === DrapItem.Storm) {
          lives--;
          combo = 0;
          ev.push({ e: 'storm', x: it.x, y: line, v: lives });
          if (lives <= 0) over = true;
        } else {
          combo++;
          const pts = (it.kind === DrapItem.Gold ? 3 : 1) * drapMultiplier(combo);
          score[0] += pts;
          score[1] = score[0];
          ev.push({ e: 'catch', x: it.x, y: line, v: pts });
          if (combo === 5 || combo === 12) ev.push({ e: 'combo', x: it.x, y: line, v: drapMultiplier(combo) });
        }
      } else if (it.y > DRAP_FLOOR) {
        items.splice(i, 1);
        if (it.kind !== DrapItem.Storm) combo = 0;
      }
    }
    return ev;
  }

  return {
    hands,
    items,
    get lives() {
      return lives;
    },
    score,
    get over() {
      return over;
    },
    step,
    frame: () => {
      const r = (n: number) => Math.round(n * 10) / 10;
      const out = [r(hands[0]), r(hands[1]), combo, lives, kiss, wave, items.length];
      for (const it of items) out.push(it.id, r(it.x), r(it.y), it.kind);
      return out;
    },
  };
}
