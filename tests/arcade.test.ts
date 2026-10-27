import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCADE_DURATION, ARCADE_FACEOFF, ARCADE_VERDICT, arcadeGains, decodeFrame, footView, type RoomGame, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  frames: ArrayBuffer[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
    else this.frames.push(data instanceof ArrayBuffer ? data : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer));
  }
  state() {
    return (this.json.filter((m) => m.t === 'state').at(-1) as Extract<ServerMsg, { t: 'state' }>).state;
  }
}

function setup(game: RoomGame, n = 2, rounds = 1) {
  const room = new Room('ARCA', undefined, () => 0.5);
  room.game = game;
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

describe('Jeux d’action dans le salon', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('face-à-face, puis la partie diffuse le monde en binaire à tout le salon', () => {
    const { conns, ids } = setup('foot', 3);
    const s = conns[0]!.state();
    expect(s.phase).toBe('faceoff');
    expect(s.arcade).toMatchObject({ kind: 'foot', leftId: ids[0], rightId: ids[1], turns: 3, score: [0, 0] });
    expect(conns[2]!.frames.length).toBe(1); // le terrain est déjà là pendant le 3, 2, 1
    vi.advanceTimersByTime(ARCADE_FACEOFF * 1000);
    expect(conns[0]!.state().phase).toBe('duel');
    vi.advanceTimersByTime(1000);
    const n = conns[2]!.frames.length;
    expect(n).toBeGreaterThan(20); // ~30 images par seconde
    const f = decodeFrame(conns[2]!.frames.at(-1)!)!;
    expect(f.kind).toBe('foot');
  });

  it('seuls les deux joueurs en piste pilotent', () => {
    const { room, conns, ids } = setup('foot', 3);
    vi.advanceTimersByTime(ARCADE_FACEOFF * 1000 + 200);
    const x0 = () => footView(decodeFrame(conns[0]!.frames.at(-1)!)!.values).players[0].x;
    const start = x0();
    room.handle(ids[2]!, { t: 'arcade', k: 2 }); // spectateur : ignoré
    vi.advanceTimersByTime(300);
    expect(x0()).toBeCloseTo(start, 0);
    room.handle(ids[0]!, { t: 'arcade', k: 2 }); // droite
    vi.advanceTimersByTime(300);
    expect(x0()).toBeGreaterThan(start + 40);
  });

  it('à la sonnerie, le verdict et les points ; puis la partie suivante, côtés inversés', () => {
    const { room, conns, ids } = setup('oreillers', 2, 2);
    vi.advanceTimersByTime((ARCADE_FACEOFF + ARCADE_DURATION.oreillers) * 1000);
    const s = conns[0]!.state();
    expect(s.phase).toBe('verdict');
    expect(s.arcade!.result).not.toBeNull();
    const g = arcadeGains('oreillers', s.arcade!.score, false);
    expect(room.players.get(ids[0]!)!.score).toBe(g.left);
    vi.advanceTimersByTime(ARCADE_VERDICT * 1000);
    expect(conns[0]!.state().arcade).toMatchObject({ turn: 1, leftId: ids[1], rightId: ids[0] });
  });

  it('le Drap tendu garde le record du salon', () => {
    const { conns } = setup('drap', 2, 1);
    vi.advanceTimersByTime((ARCADE_FACEOFF + ARCADE_DURATION.drap) * 1000);
    const a = conns[0]!.state().arcade!;
    expect(a.result!.winner).toBeNull();
    expect(a.result!.team).toBe(a.score[0]);
    expect(a.best).toBe(Math.max(0, a.score[0]));
  });

  it('un joueur qui part fait passer à la partie suivante', () => {
    const { room, conns, ids } = setup('foot', 3, 1);
    vi.advanceTimersByTime(ARCADE_FACEOFF * 1000 + 100);
    room.leave(ids[1]!);
    const a = conns[0]!.state().arcade!;
    expect(a.turn).toBe(2);
    expect([a.leftId, a.rightId]).toEqual([ids[2], ids[0]]);
  });
});
