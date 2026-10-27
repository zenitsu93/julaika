import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CERVEAU_BRIEF, CERVEAU_MODELS, CERVEAU_REVEAL, DrawOp, cerveauKind, cerveauScore, decodeDraw, encodeDraw, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  binary: Uint8Array[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
    else this.binary.push(new Uint8Array(data as ArrayBuffer));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

function setup(mode: 'guide' | 'moitie' | 'lignes' | 'mixte' = 'guide', n = 2) {
  const room = new Room('CER', undefined, () => 0);
  room.game = 'cerveau';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { cerveau: mode, rounds: 1 } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const pkt = (op: DrawOp, points: number[]) => new Uint8Array(encodeDraw({ op, color: 12, size: 10, points }));

describe('Cerveau coupé', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mesure la ressemblance des formes, pas leur place ni leur taille', () => {
    const house = CERVEAU_MODELS.find((m) => m.id === 'maison')!.paths;
    expect(cerveauScore(house, house)).toBe(100);
    // La même maison, deux fois plus petite et dans un coin.
    const small = house.map((p) => p.map((v, i) => (i % 2 ? v / 2 + 10 : v / 2 + 20)));
    expect(cerveauScore(house, small)).toBeGreaterThanOrEqual(95);
    const sun = CERVEAU_MODELS.find((m) => m.id === 'soleil')!.paths;
    const scribble = [[100, 100, 700, 500, 100, 500, 700, 100]];
    expect(cerveauScore(sun, scribble)).toBe(0);
    expect(cerveauScore(house, sun)).toBeLessThan(20);
    expect(cerveauScore(house, [])).toBe(0);
    expect(cerveauScore(house, [[400, 300, 402, 301]])).toBe(0);
  });

  it('enchaîne les modes en mixte', () => {
    expect([0, 1, 2, 3].map((t) => cerveauKind('mixte', t))).toEqual(['guide', 'moitie', 'lignes', 'guide']);
    expect(cerveauKind('lignes', 5)).toBe('lignes');
  });

  it('cache le modèle à l’artiste guidé, relaie son calque et révèle quand les deux ont fini', () => {
    const { room, conns, ids } = setup('guide');
    const [guide, artist] = ids as [string, string];
    expect(room.phase).toBe('draw');
    const st = (i: number) => conns[i]!.last('state')!.state.cerveau!;
    expect(st(0).duo).toEqual([guide, artist]);
    expect(st(0).model).not.toBeNull();
    expect(st(1).model).toBeNull();

    // Pendant le briefing, rien ne passe ; le guide ne dessine jamais.
    room.handleDraw(artist, pkt(DrawOp.Begin, [10, 10]));
    expect(conns[0]!.binary).toHaveLength(0);
    vi.advanceTimersByTime(CERVEAU_BRIEF * 1000);
    room.handleDraw(guide, pkt(DrawOp.Begin, [10, 10]));
    expect(conns[1]!.binary).toHaveLength(0);
    room.handleDraw(artist, pkt(DrawOp.Begin, [10, 10]));
    room.handleDraw(artist, pkt(DrawOp.Extend, [200, 200]));
    expect(conns[0]!.binary).toHaveLength(2);
    expect(conns[0]!.binary[0]![3]).toBe(2); // calque de l'artiste
    // Pot de peinture refusé.
    room.handleDraw(artist, pkt(DrawOp.Fill, [50, 50]));
    expect(conns[0]!.binary).toHaveLength(2);

    room.handle(artist, { t: 'undo' });
    expect(conns[0]!.last('cerveauInk')).toEqual({ t: 'cerveauInk', layer: 1, op: 'undo' });

    room.handle(guide, { t: 'cerveau', done: true });
    expect(room.phase).toBe('draw');
    room.handle(artist, { t: 'cerveau', done: true });
    expect(room.phase).toBe('reveal');
    expect(st(1).model).not.toBeNull();
    expect(st(1).score).toBe(0);

    vi.advanceTimersByTime(CERVEAU_REVEAL * 1000);
    // Deux joueurs, une manche : deux dessins, les rôles s'inversent.
    expect(st(0).turn).toBe(1);
    expect(st(0).duo).toEqual([artist, guide]);
    expect(st(0).model).toBeNull();
    vi.advanceTimersByTime((CERVEAU_BRIEF + room.settings.drawTime + 1) * 1000);
    expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(CERVEAU_REVEAL * 1000);
    expect(room.phase).toBe('album');
    expect(st(0).scores).toHaveLength(2);
    room.handle(artist, { t: 'cerveau', next: true }); // seul l'hôte ramène au salon
    expect(room.phase).toBe('album');
    room.handle(guide, { t: 'cerveau', next: true });
    expect(room.phase).toBe('lobby');
  });

  it('moitié chacun : les traits restent de leur côté de la frontière', () => {
    const { room, conns, ids } = setup('moitie');
    vi.advanceTimersByTime(CERVEAU_BRIEF * 1000);
    room.handleDraw(ids[0]!, pkt(DrawOp.Begin, [100, 100]));
    room.handleDraw(ids[0]!, pkt(DrawOp.Extend, [700, 120]));
    room.handleDraw(ids[1]!, pkt(DrawOp.Begin, [100, 300]));
    const got = conns[1]!.binary.map((b) => decodeDraw(b)!);
    expect(got[1]!.points).toEqual([400, 120]);
    const right = decodeDraw(conns[0]!.binary[0]!)!;
    expect(right.points).toEqual([400, 300]);
    expect(conns[0]!.binary[0]![3]).toBe(2);
  });

  it('droites contre courbes : le joueur des droites ne trace que des segments', () => {
    const { room, conns, ids } = setup('lignes');
    vi.advanceTimersByTime(CERVEAU_BRIEF * 1000);
    room.handleDraw(ids[0]!, pkt(DrawOp.Begin, [100, 100]));
    room.handleDraw(ids[0]!, pkt(DrawOp.Extend, [150, 120, 200, 130])); // main levée : refusé
    room.handleDraw(ids[0]!, pkt(DrawOp.Extend, [300, 300]));
    room.handleDraw(ids[0]!, pkt(DrawOp.Extend, [310, 300])); // un seul segment par trait
    expect(conns[1]!.binary).toHaveLength(2);
    room.handleDraw(ids[1]!, pkt(DrawOp.Begin, [100, 100]));
    room.handleDraw(ids[1]!, pkt(DrawOp.Extend, [150, 120, 200, 130]));
    expect(conns[0]!.binary).toHaveLength(2);
  });

  it('un nouveau venu reçoit le dessin en cours', () => {
    const { room, ids } = setup('guide');
    vi.advanceTimersByTime(CERVEAU_BRIEF * 1000);
    room.handleDraw(ids[1]!, pkt(DrawOp.Begin, [10, 10]));
    room.handleDraw(ids[1]!, pkt(DrawOp.Extend, [20, 20]));
    const late = new FakeConn();
    room.join(late, 'Tard', 3);
    expect(late.binary).toHaveLength(2);
    expect(late.last('welcome')!.state.cerveau!.model).not.toBeNull();
  });
});
