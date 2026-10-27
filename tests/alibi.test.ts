import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALIBI_EXHIBIT, ALIBI_EXHIBITS, ALIBI_PENALTY, ALIBI_PLOT, ALIBI_POINTS, ALIBI_VERDICT, ALIBI_VOTE, alibiVerdict, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
  alibi() {
    return this.last('state')!.state.alibi!;
  }
}

function setup(n = 3, rounds = 1) {
  const room = new Room('ALIB', undefined, () => 0);
  room.game = 'alibi';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const trial = () => vi.advanceTimersByTime(ALIBI_PLOT * 1000);
const exhibit = () => vi.advanceTimersByTime(ALIBI_EXHIBIT * 1000);
const score = (room: Room, id: string) => room.players.get(id)!.score;

describe("L'Alibi", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refuse de démarrer à deux', () => {
    const { room, conns } = setup(2);
    expect(room.phase).toBe('lobby');
    expect(conns[0]!.last('error')?.message).toMatch(/3 joueurs/);
  });

  it('le juge tourne, ses deux voisins sont les complices', () => {
    const { conns, ids } = setup(3);
    const seen: string[][] = [];
    for (let k = 0; k < 3; k++) {
      const a = conns[0]!.alibi();
      seen.push([a.judgeId, ...a.suspects]);
      expect(a.jury).toEqual([]);
      vi.advanceTimersByTime((ALIBI_PLOT + ALIBI_EXHIBITS * ALIBI_EXHIBIT + ALIBI_VERDICT) * 1000);
    }
    expect(seen).toEqual([
      [ids[0], ids[1], ids[2]],
      [ids[1], ids[2], ids[0]],
      [ids[2], ids[0], ids[1]],
    ]);
  });

  it('le carnet reste entre complices jusqu’au verdict', () => {
    const { room, conns, ids } = setup(3);
    room.handle(ids[1]!, { t: 'alibi', note: 'On était au cinéma' });
    room.handle(ids[0]!, { t: 'alibi', note: 'Le juge triche' });
    expect(conns[2]!.alibi().notes).toEqual([{ by: ids[1], text: 'On était au cinéma' }]);
    expect(conns[0]!.alibi().notes).toBeNull();
    trial();
    for (let i = 0; i < ALIBI_EXHIBITS; i++) exhibit();
    expect(room.phase).toBe('verdict');
    expect(conns[0]!.alibi().notes).toHaveLength(1);
  });

  it('chaque complice explique deux pièces, seul le désigné dépose', () => {
    const { room, conns, ids } = setup(3);
    trial();
    expect(room.phase).toBe('trial');
    const owners: string[] = [];
    for (let i = 0; i < ALIBI_EXHIBITS; i++) {
      const cur = conns[0]!.alibi().exhibits.at(-1)!;
      owners.push(cur.suspectId);
      const other = cur.suspectId === ids[1] ? ids[2]! : ids[1]!;
      room.handle(other, { t: 'alibi', statement: 'pas moi' });
      room.handle(cur.suspectId, { t: 'alibi', statement: 'C’était pour un gâteau' });
      expect(conns[0]!.alibi().exhibits.at(-1)!.statement).toBe('C’était pour un gâteau');
      exhibit();
    }
    expect(owners.filter((o) => o === ids[1])).toHaveLength(ALIBI_EXHIBITS / 2);
    expect(new Set(conns[0]!.alibi().exhibits.map((e) => e.item)).size).toBe(ALIBI_EXHIBITS);
  });

  it('les objections du juge font fondre la crédibilité, une par pièce', () => {
    const { room, conns, ids } = setup(3);
    room.handle(ids[0]!, { t: 'alibi', object: 'contradiction' }); // pas encore d'audience
    trial();
    room.handle(ids[1]!, { t: 'alibi', object: 'contradiction' }); // pas le juge
    room.handle(ids[0]!, { t: 'alibi', object: 'contradiction' });
    room.handle(ids[0]!, { t: 'alibi', object: 'hesitation' }); // déjà une sur cette pièce
    expect(conns[1]!.alibi().credibility).toBe(100 - ALIBI_PENALTY.contradiction);
    exhibit();
    room.handle(ids[0]!, { t: 'alibi', object: 'contradiction' });
    exhibit();
    exhibit();
    exhibit();
    // À trois, pas de jury : 40 % de crédibilité, c'est coupable.
    const r = conns[0]!.alibi().result!;
    expect(r.acquitted).toBe(false);
    expect(r.votes).toBeNull();
    expect(score(room, ids[0]!)).toBe(ALIBI_POINTS.convicted);
    expect(score(room, ids[1]!)).toBe(40);
  });

  it('sans objection, les complices sont acquittés', () => {
    const { room, ids } = setup(3);
    trial();
    for (let i = 0; i < ALIBI_EXHIBITS; i++) exhibit();
    expect(score(room, ids[1]!)).toBe(100 + ALIBI_POINTS.acquitted);
    expect(score(room, ids[0]!)).toBe(0);
  });

  it('avec un jury, la majorité tranche et les jurés du bon côté marquent', () => {
    const { room, conns, ids } = setup(5);
    expect(conns[0]!.alibi().jury).toEqual([ids[3], ids[4]]);
    trial();
    for (let i = 0; i < ALIBI_EXHIBITS; i++) exhibit();
    expect(room.phase).toBe('vote');
    room.handle(ids[1]!, { t: 'alibi', vote: true }); // un complice ne vote pas
    room.handle(ids[3]!, { t: 'alibi', vote: false });
    expect(room.phase).toBe('vote');
    expect(conns[0]!.alibi().voted).toEqual([ids[3]]);
    room.handle(ids[4]!, { t: 'alibi', vote: false });
    expect(room.phase).toBe('verdict');
    const r = conns[0]!.alibi().result!;
    expect(r).toMatchObject({ acquitted: false, votes: { acquit: 0, guilty: 2 } });
    expect(score(room, ids[3]!)).toBe(ALIBI_POINTS.juror);
    expect(score(room, ids[0]!)).toBe(ALIBI_POINTS.convicted);
  });

  it('le vote se clôt tout seul à la fin du temps', () => {
    const { room, ids } = setup(4);
    trial();
    for (let i = 0; i < ALIBI_EXHIBITS; i++) exhibit();
    expect(room.phase).toBe('vote');
    vi.advanceTimersByTime(ALIBI_VOTE * 1000);
    expect(room.phase).toBe('verdict');
    expect(score(room, ids[1]!)).toBe(100 + ALIBI_POINTS.acquitted);
  });

  it('un complice qui part classe l’affaire', () => {
    const { room, conns, ids } = setup(4);
    trial();
    room.leave(ids[2]!);
    // Affaires suivantes sautées tant que J2 en ferait partie : juge J3, complices J0 et J1.
    const a = conns[0]!.alibi();
    expect(room.phase).toBe('plot');
    expect([a.judgeId, ...a.suspects]).toEqual([ids[3], ids[0], ids[1]]);
  });

  it('égalité au jury : le doute profite aux accusés', () => {
    expect(alibiVerdict(0, { acquit: 1, guilty: 1 })).toBe(true);
    expect(alibiVerdict(40, { acquit: 0, guilty: 0 })).toBe(false);
    expect(alibiVerdict(55, null)).toBe(true);
  });
});
