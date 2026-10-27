import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAS_DUEL, BRAS_FACEOFF, BRAS_LIMIT, BRAS_MIN_GAP, BRAS_TARGETS, BRAS_VERDICT, brasGains, brasPower, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  state() {
    return (this.json.filter((m) => m.t === 'state').at(-1) as Extract<ServerMsg, { t: 'state' }>).state;
  }
}

/** Générateur pseudo-aléatoire reproductible : jamais de cible dorée sous 0,12 au premier tirage. */
function lcg(seed = 7) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function setup(n = 2, rounds = 1, random: () => number = lcg()) {
  const room = new Room('BRAS', undefined, random);
  room.game = 'brasdefer';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const toDuel = () => vi.advanceTimersByTime(BRAS_FACEOFF * 1000);
const score = (room: Room, id: string) => room.players.get(id)!.score;

/** Tape la première cible du joueur, en respectant l'écart minimal entre deux coups. */
function tap(room: Room, conn: FakeConn, id: string) {
  vi.advanceTimersByTime(BRAS_MIN_GAP + 60);
  const t = conn.state().bras!.targets[0]!;
  room.handle(id, { t: 'bras', hit: t.id });
  vi.advanceTimersByTime(60);
  return t;
}

describe('Bras de fer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('à deux, un duel par manche et on change de côté', () => {
    const { room, conns, ids } = setup(2, 2);
    const s = () => conns[0]!.state().bras!;
    expect(room.phase).toBe('faceoff');
    expect(s().turns).toBe(2);
    expect([s().leftId, s().rightId]).toEqual([ids[0], ids[1]]);
    expect(s().targets).toEqual([]);
    vi.advanceTimersByTime((BRAS_FACEOFF + BRAS_DUEL + BRAS_VERDICT) * 1000);
    expect([s().leftId, s().rightId]).toEqual([ids[1], ids[0]]);
  });

  it('chaque duelliste reçoit ses propres cibles, pas les spectateurs', () => {
    const { conns } = setup(3);
    toDuel();
    const [a, b, c] = conns.map((k) => k.state().bras!.targets);
    expect(a).toHaveLength(BRAS_TARGETS);
    expect(b).toHaveLength(BRAS_TARGETS);
    expect(c).toEqual([]);
    expect(a!.map((t) => t.id)).not.toEqual(b!.map((t) => t.id));
  });

  it('un coup pousse la jauge vers l’adversaire, crier double la force', () => {
    const { room, conns, ids } = setup(2);
    toDuel();
    const t1 = tap(room, conns[0]!, ids[0]!);
    const p1 = brasPower(t1.gold, false);
    expect(conns[1]!.state().bras!.pos).toBe(p1);
    room.handle(ids[1]!, { t: 'bras', voice: true });
    const t2 = tap(room, conns[1]!, ids[1]!);
    expect(conns[0]!.state().bras!.voice[ids[1]!]).toBe(true);
    expect(conns[0]!.state().bras!.pos).toBe(p1 - brasPower(t2.gold, true));
    expect(conns[0]!.state().bras!.hits).toEqual({ [ids[0]!]: 1, [ids[1]!]: 1 });
  });

  it('ignore les cibles inconnues, les rafales trop rapides et les spectateurs', () => {
    const { room, conns, ids } = setup(3);
    toDuel();
    const t = conns[0]!.state().bras!.targets[0]!;
    room.handle(ids[0]!, { t: 'bras', hit: 99999 });
    room.handle(ids[2]!, { t: 'bras', hit: t.id });
    room.handle(ids[1]!, { t: 'bras', hit: t.id }); // la cible d'un autre
    vi.advanceTimersByTime(100);
    expect(conns[0]!.state().bras!.pos).toBe(0);
    room.handle(ids[0]!, { t: 'bras', hit: t.id });
    const next = conns[0]!.state().bras!.targets; // pas encore diffusé : on lit l'ancien état
    room.handle(ids[0]!, { t: 'bras', hit: next[1]!.id }); // trop tôt après le premier coup
    vi.advanceTimersByTime(100);
    expect(conns[2]!.state().bras!.hits[ids[0]!]).toBe(1);
    expect(conns[0]!.state().bras!.targets.map((x) => x.id)).not.toContain(t.id);
  });

  it('la jauge au bout, c’est K.O. avant la fin du temps', () => {
    const { room, conns, ids } = setup(2);
    toDuel();
    while (room.phase === 'duel') tap(room, conns[0]!, ids[0]!);
    expect(room.phase).toBe('verdict');
    const r = conns[1]!.state().bras!;
    expect(r.pos).toBe(BRAS_LIMIT);
    expect(r.result).toEqual({ winner: ids[0], ko: true, gains: { [ids[0]!]: 150, [ids[1]!]: 0 } });
    expect(score(room, ids[0]!)).toBe(150);
  });

  it('à la fin du temps, celui qui mène gagne aux points', () => {
    const { room, conns, ids } = setup(2);
    toDuel();
    tap(room, conns[1]!, ids[1]!);
    const pos = conns[0]!.state().bras!.pos;
    vi.advanceTimersByTime(BRAS_DUEL * 1000);
    const r = conns[0]!.state().bras!.result!;
    expect(r.winner).toBe(ids[1]);
    expect(r.ko).toBe(false);
    expect(score(room, ids[1]!)).toBe(brasGains(pos, false).winner);
  });

  it('égalité parfaite : 25 points chacun', () => {
    const { room, conns, ids } = setup(2);
    toDuel();
    vi.advanceTimersByTime(BRAS_DUEL * 1000);
    expect(conns[0]!.state().bras!.result).toEqual({ winner: null, ko: false, gains: { [ids[0]!]: 25, [ids[1]!]: 25 } });
    expect(score(room, ids[0]!)).toBe(25);
  });

  it('un duelliste qui part clôt le duel', () => {
    const { room, conns, ids } = setup(3);
    toDuel();
    room.leave(ids[1]!);
    const s = conns[0]!.state().bras!;
    expect(room.phase).toBe('faceoff');
    expect([s.leftId, s.rightId]).toEqual([ids[2], ids[0]]);
  });

  it('la partie se termine après le dernier duel', () => {
    const { room } = setup(2);
    vi.advanceTimersByTime((BRAS_FACEOFF + BRAS_DUEL + BRAS_VERDICT) * 1000);
    expect(room.phase).toBe('gameEnd');
  });
});
