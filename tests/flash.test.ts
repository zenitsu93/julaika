import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DrawOp,
  FLASH_DRAW_TIME,
  FLASH_IMAGES,
  FLASH_MAX_STARS,
  FLASH_READY_TIME,
  FLASH_REVEAL_TIME,
  FLASH_SHOW_TIME,
  FLASH_STAR_POINTS,
  FLASH_VOTE_TIME,
  PALETTE,
  encodeDraw,
  flashSvg,
  type ServerMsg,
} from '@julaika/shared';
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

function setup(n = 3, rounds = 2) {
  const room = new Room('FLA', undefined, () => 0);
  room.game = 'flash';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { rounds } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const stroke = (color: number, x = 100) => [
  new Uint8Array(encodeDraw({ op: DrawOp.Begin, color, size: 10, points: [x, 10] })),
  new Uint8Array(encodeDraw({ op: DrawOp.Extend, color, size: 10, points: [x + 5, 20, x + 9, 30] })),
];

/** L'image passe, puis tout le monde gribouille un trait. */
function memorizeAndDraw(room: Room, ids: string[], blank: number[] = []) {
  vi.advanceTimersByTime((FLASH_READY_TIME + FLASH_SHOW_TIME) * 1000);
  const colors = FLASH_IMAGES[0]!.colors;
  ids.forEach((id, i) => {
    if (!blank.includes(i)) for (const p of stroke(colors[0])) room.handleDraw(id, p);
  });
}

const flashState = (c: FakeConn) => c.last('state')!.state.flash!;
const score = (c: FakeConn, id: string) => c.last('state')!.state.players.find((p) => p.id === id)!.score;

describe('Flash', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mémorisation, dessin, vote, révélation : une manche complète', () => {
    const { room, conns, ids } = setup();
    expect(room.phase).toBe('memorize');
    const st = conns[1]!.last('state')!.state;
    expect(st.endsAt).toBe(Date.now() + (FLASH_READY_TIME + FLASH_SHOW_TIME) * 1000);
    expect(st.flash).toMatchObject({
      round: 1,
      rounds: 2,
      players: ids,
      image: 0,
      colors: [...FLASH_IMAGES[0]!.colors],
      showAt: Date.now() + FLASH_READY_TIME * 1000,
      stars: {},
    });

    memorizeAndDraw(room, ids);
    expect(room.phase).toBe('draw');
    expect(room.endsAt).toBe(Date.now() + FLASH_DRAW_TIME * 1000);
    // Pendant le dessin, l'image est cachée et les traits ne sont relayés à personne.
    expect(flashState(conns[0]!)).toMatchObject({ image: null, showAt: null });
    expect(conns.every((c) => c.binary === 0)).toBe(true);

    for (const id of ids) room.handle(id, { t: 'flash', done: true });
    expect(room.phase).toBe('vote');
    const sketches = conns[2]!.last('sketches')!;
    expect(sketches.round).toBe(1);
    expect(sketches.sketches.map((s) => [s.by, s.name, s.strokes.length])).toEqual(ids.map((id, i) => [id, `J${i}`, 1]));
    // Le trait arrive fusionné (début + suite).
    expect(sketches.sketches[0]!.strokes[0]!.points).toEqual([100, 10, 105, 20, 109, 30]);
    expect(flashState(conns[0]!).image).toBe(0);

    room.handle(ids[0]!, { t: 'flash', vote: ids[1]!, stars: 5 });
    room.handle(ids[0]!, { t: 'flash', vote: ids[2]!, stars: 3 });
    room.handle(ids[1]!, { t: 'flash', vote: ids[0]!, stars: 4 });
    room.handle(ids[1]!, { t: 'flash', vote: ids[2]!, stars: 1 });
    room.handle(ids[2]!, { t: 'flash', vote: ids[0]!, stars: 2 });
    expect(room.phase).toBe('vote');
    room.handle(ids[2]!, { t: 'flash', vote: ids[1]!, stars: 5 });
    expect(room.phase).toBe('reveal');
    expect(room.endsAt).toBe(Date.now() + FLASH_REVEAL_TIME * 1000);
    expect(flashState(conns[0]!).stars).toEqual({
      [ids[0]!]: { total: 6, votes: 2 },
      [ids[1]!]: { total: 10, votes: 2 },
      [ids[2]!]: { total: 4, votes: 2 },
    });
    expect(score(conns[0]!, ids[1]!)).toBe(10 * FLASH_STAR_POINTS);

    vi.advanceTimersByTime(FLASH_REVEAL_TIME * 1000);
    expect(room.phase).toBe('memorize');
    // Pas deux fois la même image dans une partie.
    expect(flashState(conns[0]!)).toMatchObject({ round: 2, image: 1, done: [], stars: {} });
  });

  it('le minuteur du dessin prend le relais, et finit la partie après la dernière manche', () => {
    const { room, conns, ids } = setup(2, 1);
    memorizeAndDraw(room, ids);
    room.handle(ids[0]!, { t: 'flash', done: true });
    vi.advanceTimersByTime((FLASH_DRAW_TIME + 1) * 1000);
    expect(room.phase).toBe('vote');
    vi.advanceTimersByTime(FLASH_VOTE_TIME * 1000);
    expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(FLASH_REVEAL_TIME * 1000);
    expect(room.phase).toBe('gameEnd');
    expect(conns[0]!.last('gameEnd')!.ranking).toHaveLength(2);
  });

  it('trois couleurs seulement : les autres prennent la première, la gomme passe', () => {
    const { room, conns, ids } = setup(2);
    vi.advanceTimersByTime((FLASH_READY_TIME + FLASH_SHOW_TIME) * 1000);
    const colors = FLASH_IMAGES[0]!.colors;
    const outside = PALETTE.findIndex((_, i) => i !== 0 && !colors.includes(i as never));
    for (const p of stroke(outside)) room.handleDraw(ids[0]!, p);
    for (const p of stroke(0, 200)) room.handleDraw(ids[0]!, p);
    for (const p of stroke(colors[2], 300)) room.handleDraw(ids[0]!, p);
    for (const id of ids) room.handle(id, { t: 'flash', done: true });
    expect(conns[1]!.last('sketches')!.sketches[0]!.strokes.map((s) => s.color)).toEqual([colors[0], 0, colors[2]]);
  });

  it('on ne dessine pas pendant la mémorisation, ni après avoir rendu ; annuler et effacer marchent', () => {
    const { room, conns, ids } = setup(2);
    for (const p of stroke(FLASH_IMAGES[0]!.colors[0])) room.handleDraw(ids[0]!, p);
    vi.advanceTimersByTime((FLASH_READY_TIME + FLASH_SHOW_TIME) * 1000);
    const c = FLASH_IMAGES[0]!.colors[1];
    for (const x of [100, 200, 300]) for (const p of stroke(c, x)) room.handleDraw(ids[0]!, p);
    room.handle(ids[0]!, { t: 'undo' });
    for (const p of stroke(c)) room.handleDraw(ids[1]!, p);
    room.handle(ids[1]!, { t: 'clear' });
    for (const p of stroke(c, 400)) room.handleDraw(ids[1]!, p);
    room.handle(ids[1]!, { t: 'flash', done: true });
    for (const p of stroke(c, 500)) room.handleDraw(ids[1]!, p);
    // Retoucher rouvre le dessin.
    room.handle(ids[1]!, { t: 'flash', edit: true });
    expect(flashState(conns[0]!).done).toEqual([]);
    room.handle(ids[0]!, { t: 'flash', done: true });
    room.handle(ids[1]!, { t: 'flash', done: true });
    const sk = conns[0]!.last('sketches')!.sketches;
    expect(sk[0]!.strokes.map((s) => s.points[0])).toEqual([100, 200]);
    expect(sk[1]!.strokes.map((s) => s.points[0])).toEqual([400]);
  });

  it('pas de note pour soi ni pour une page blanche, étoiles bornées', () => {
    const { room, conns, ids } = setup();
    memorizeAndDraw(room, ids, [2]);
    vi.advanceTimersByTime((FLASH_DRAW_TIME + 1) * 1000);
    expect(room.phase).toBe('vote');
    room.handle(ids[0]!, { t: 'flash', vote: ids[0]!, stars: 5 });
    room.handle(ids[0]!, { t: 'flash', vote: ids[2]!, stars: 5 });
    room.handle(ids[0]!, { t: 'flash', vote: ids[1]!, stars: 0 });
    room.handle(ids[0]!, { t: 'flash', vote: ids[1]!, stars: '4' as unknown as number });
    expect(flashState(conns[0]!).done).toEqual([]);
    room.handle(ids[0]!, { t: 'flash', vote: ids[1]!, stars: 99 });
    expect(flashState(conns[0]!).done).toEqual([ids[0]]);
    vi.advanceTimersByTime(FLASH_VOTE_TIME * 1000);
    expect(flashState(conns[0]!).stars).toEqual({
      [ids[0]!]: { total: 0, votes: 0 },
      [ids[1]!]: { total: FLASH_MAX_STARS, votes: 1 },
    });
  });

  it('un spectateur ne joue pas, et reçoit les croquis en arrivant', () => {
    const { room, conns, ids } = setup(2);
    memorizeAndDraw(room, ids);
    const late = new FakeConn();
    const lateId = room.join(late, 'Tard', 9)!;
    for (const p of stroke(FLASH_IMAGES[0]!.colors[0])) room.handleDraw(lateId, p);
    room.handle(lateId, { t: 'flash', done: true });
    expect(room.phase).toBe('draw');
    for (const id of ids) room.handle(id, { t: 'flash', done: true });
    expect(late.last('sketches')!.sketches).toHaveLength(2);
    const other = new FakeConn();
    room.join(other, 'Encore', 10);
    expect(other.last('sketches')).toEqual(conns[0]!.last('sketches'));
  });

  it('chaque image a trois couleurs de la palette et rend un SVG complet', () => {
    expect(FLASH_IMAGES.length).toBeGreaterThanOrEqual(12);
    for (const img of FLASH_IMAGES) {
      expect(new Set(img.colors).size).toBe(3);
      for (const c of img.colors) expect(PALETTE[c]).toBeDefined();
      const svg = flashSvg(img);
      expect(svg).not.toMatch(/\{\d\}/);
      expect(svg).not.toContain('undefined');
    }
  });
});
