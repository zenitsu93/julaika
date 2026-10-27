import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_H, CAD_JOIN, DrawOp, cadCreatureFor, cadJoinStrokes, cadWinner, encodeDraw, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  binary = 0;
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
    else this.binary++;
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

function setup(n = 2) {
  const room = new Room('CAD', undefined, () => 0);
  room.game = 'cadavre';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

/** Un trait vertical de y1 à y2, en x. */
const stroke = (x: number, y1: number, y2: number) => [
  new Uint8Array(encodeDraw({ op: DrawOp.Begin, color: 12, size: 10, points: [x, y1] })),
  new Uint8Array(encodeDraw({ op: DrawOp.Extend, color: 12, size: 10, points: [x, y2] })),
];

const allDone = (room: Room, ids: string[]) => ids.forEach((id) => room.handle(id, { t: 'cadavre', done: true }));

describe('Cadavre exquis', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('à deux, on alterne : tête et jambes pour l’un, corps pour l’autre', () => {
    expect([0, 1, 2].map((s) => cadCreatureFor(0, s, 2))).toEqual([0, 1, 0]);
    expect([0, 1, 2].map((s) => cadCreatureFor(1, s, 2))).toEqual([1, 0, 1]);
    // À trois, chaque créature passe chez tout le monde.
    expect(new Set([0, 1, 2].map((s) => cadCreatureFor(1, s, 3))).size).toBe(3);
  });

  it('ne montre du morceau d’au-dessus que la bande de jonction, sans relayer les traits', () => {
    const { room, conns, ids } = setup();
    expect(room.phase).toBe('draw');
    expect(conns[0]!.last('cadPrompt')).toEqual({ t: 'cadPrompt', step: 0, above: null });

    const before = conns.map((c) => c.binary);
    for (const p of stroke(100, 50, 200)) room.handleDraw(ids[0]!, p); // dans le haut : caché
    for (const p of stroke(300, 400, CANVAS_H - 10)) room.handleDraw(ids[0]!, p); // touche la bande
    expect(conns.map((c) => c.binary)).toEqual(before);

    allDone(room, ids);
    expect(room.stateFor(ids[0]!).cadavre!.step).toBe(1);
    // J1 dessine le corps de la créature de J0 : il ne reçoit que le trait qui déborde en bas.
    const above = conns[1]!.last('cadPrompt')!.above!;
    expect(above.name).toBe('J0');
    expect(above.strokes).toEqual([{ op: DrawOp.Begin, color: 12, size: 10, points: [300, 400, 300, CANVAS_H - 10] }]);
  });

  it('assemble les créatures, puis on vote pour leur nom', () => {
    const { room, conns, ids } = setup();
    allDone(room, ids);
    vi.advanceTimersByTime((room.settings.drawTime + 1) * 1000); // le corps, au gong
    allDone(room, ids);
    expect(room.phase).toBe('reveal');

    const creatures = conns[0]!.last('creatures')!.creatures;
    expect(creatures.map((c) => c.pieces.map((p) => p.by))).toEqual([
      [ids[0], ids[1], ids[0]],
      [ids[1], ids[0], ids[1]],
    ]);

    room.handle(ids[0]!, { t: 'cadavre', name: '  Gérard   le  poulpe ' });
    room.handle(ids[1]!, { t: 'cadavre', name: 'Bob' });
    room.handle(ids[0]!, { t: 'cadavre', heart: ids[0]! }); // pas de cœur pour soi
    room.handle(ids[1]!, { t: 'cadavre', heart: ids[0]! });
    let cad = conns[0]!.last('state')!.state.cadavre!;
    expect(cad.names).toEqual([
      { by: ids[0], text: 'Gérard le poulpe', hearts: [ids[1]] },
      { by: ids[1], text: 'Bob', hearts: [] },
    ]);

    room.handle(ids[1]!, { t: 'cadavre', next: true }); // seul l'hôte passe à la suite
    expect(room.stateFor(ids[0]!).cadavre!.reveal).toBe(0);
    room.handle(ids[0]!, { t: 'cadavre', next: true });
    cad = conns[0]!.last('state')!.state.cadavre!;
    expect(cad.reveal).toBe(1);
    expect(cad.titles[0]).toBe('Gérard le poulpe');
    expect(cad.names).toEqual([]);

    // Personne n'a d'idée : la créature est baptisée au hasard.
    room.handle(ids[0]!, { t: 'cadavre', next: true });
    cad = room.stateFor(ids[0]!).cadavre!;
    expect(cad.reveal).toBe(2);
    expect(cad.titles[1]).toMatch(/^[A-Z][a-z]+$/);

    room.handle(ids[0]!, { t: 'cadavre', next: true }); // le bestiaire, puis le salon
    expect(room.phase).toBe('lobby');
  });

  it('un nouveau venu reçoit les créatures au dévoilement', () => {
    const { room, ids } = setup();
    for (let i = 0; i < 3; i++) allDone(room, ids);
    const late = new FakeConn();
    room.join(late, 'Tard', 5);
    expect(late.last('creatures')!.creatures).toHaveLength(2);
  });

  it('garde les traits de la bande, sans pot de peinture, et le nom le plus aimé', () => {
    const fill = { op: DrawOp.Fill, color: 3, size: 4, points: [10, CANVAS_H - 5] } as const;
    const high = { op: DrawOp.Begin, color: 1, size: 10, points: [10, 10, 20, CANVAS_H - CAD_JOIN - 20] } as const;
    const edge = { op: DrawOp.Begin, color: 1, size: 10, points: [10, CANVAS_H - CAD_JOIN - 4] } as const;
    expect(cadJoinStrokes([fill, high, edge])).toEqual([edge]);
    expect(cadWinner([])).toBeNull();
    expect(cadWinner([{ by: 'a', text: 'A', hearts: ['x'] }, { by: 'b', text: 'B', hearts: ['y'] }])!.text).toBe('A');
  });
});
