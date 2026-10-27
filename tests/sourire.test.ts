import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURIRE_DARES, SOURIRE_DUEL, SOURIRE_FACEOFF, SOURIRE_VERDICT, sourireGains, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
  state() {
    return this.last('state')!.state;
  }
}

function setup(n = 2, rounds = 1) {
  const room = new Room('RIRE', undefined, () => 0);
  room.game = 'sourire';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

/** Saute le face-à-face, puis `ms` de duel. */
function toDuel(ms = 0) {
  vi.advanceTimersByTime(SOURIRE_FACEOFF * 1000 + ms);
}
/** Duel complet sans sourire, puis verdict : on arrive au face-à-face suivant. */
function skipDuel() {
  vi.advanceTimersByTime((SOURIRE_FACEOFF + SOURIRE_DUEL + SOURIRE_VERDICT) * 1000);
}
const score = (room: Room, id: string) => room.players.get(id)!.score;

describe('Pas un sourire !', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('à deux, les rôles s’inversent à chaque duel', () => {
    const { room, conns, ids } = setup(2, 2);
    const roles = () => [conns[0]!.state().sourire!.defenderId, conns[0]!.state().sourire!.attackerId];
    expect(room.phase).toBe('faceoff');
    expect(conns[0]!.state().sourire!.turns).toBe(4);
    expect(roles()).toEqual([ids[0], ids[1]]);
    skipDuel();
    expect(roles()).toEqual([ids[1], ids[0]]);
    skipDuel();
    expect(roles()).toEqual([ids[0], ids[1]]);
  });

  it('à trois, chacun défend contre son voisin', () => {
    const { conns, ids } = setup(3);
    const seen: string[][] = [];
    for (let k = 0; k < 3; k++) {
      const s = conns[0]!.state().sourire!;
      seen.push([s.defenderId, s.attackerId]);
      skipDuel();
    }
    expect(seen).toEqual([
      [ids[0], ids[1]],
      [ids[1], ids[2]],
      [ids[2], ids[0]],
    ]);
  });

  it('« Il a souri ! » arrête le duel et compte les points', () => {
    const { room, conns, ids } = setup(3);
    toDuel(200);
    room.handle(ids[2]!, { t: 'sourire', smiled: true }); // trop tôt : ignoré
    expect(room.phase).toBe('duel');
    vi.advanceTimersByTime(12_000);
    room.handle(ids[2]!, { t: 'sourire', smiled: true }); // un spectateur siffle
    expect(room.phase).toBe('verdict');
    const want = sourireGains(12, true);
    expect(conns[1]!.state().sourire!.result).toEqual({ smiled: true, by: ids[2], held: 12, gains: { [ids[0]!]: want.defender, [ids[1]!]: want.attacker } });
    expect(score(room, ids[0]!)).toBe(want.defender);
    expect(score(room, ids[1]!)).toBe(want.attacker);
    expect(conns[0]!.last('chat')!.line.text).toBe('J1 a fait craquer J0 en 12 s');
    room.handle(ids[2]!, { t: 'sourire', smiled: true }); // déjà jugé
    expect(score(room, ids[1]!)).toBe(want.attacker);
  });

  it('si le temps file, le défenseur gagne ses 300 points', () => {
    const { room, conns, ids } = setup(2);
    toDuel(SOURIRE_DUEL * 1000);
    expect(room.phase).toBe('verdict');
    expect(conns[0]!.state().sourire!.result).toMatchObject({ smiled: false, by: null, held: SOURIRE_DUEL });
    expect(score(room, ids[0]!)).toBe(300);
    expect(score(room, ids[1]!)).toBe(0);
    expect(conns[1]!.last('chat')!.line.text).toBe(`J0 a tenu ${SOURIRE_DUEL} s sans sourire !`);
  });

  it('la consigne n’est visible que par l’attaquant, qui peut en tirer une autre', () => {
    const { room, conns, ids } = setup(3);
    const dare = conns[1]!.state().sourire!.dare;
    expect(SOURIRE_DARES).toContain(dare);
    expect(conns[0]!.state().sourire!.dare).toBeNull();
    expect(conns[2]!.state().sourire!.dare).toBeNull();
    room.handle(ids[0]!, { t: 'sourire', dare: true }); // pas l'attaquant
    expect(conns[1]!.state().sourire!.dare).toBe(dare);
    room.handle(ids[1]!, { t: 'sourire', dare: true });
    const next = conns[1]!.state().sourire!.dare;
    expect(next).not.toBe(dare);
    expect(SOURIRE_DARES).toContain(next);
  });

  it('seul l’attaquant déforme sa visio, remise à zéro au duel suivant', () => {
    const { room, conns, ids } = setup(2);
    room.handle(ids[0]!, { t: 'sourire', warp: 'bulle' });
    expect(conns[0]!.state().sourire!.warp).toBeNull();
    room.handle(ids[1]!, { t: 'sourire', warp: 'n’importe' as never });
    expect(conns[0]!.state().sourire!.warp).toBeNull();
    room.handle(ids[1]!, { t: 'sourire', warp: 'tourbillon' });
    expect(conns[0]!.state().sourire!.warp).toBe('tourbillon');
    room.handle(ids[1]!, { t: 'sourire', warp: null });
    expect(conns[0]!.state().sourire!.warp).toBeNull();
    room.handle(ids[1]!, { t: 'sourire', warp: 'miroir' });
    skipDuel();
    expect(conns[0]!.state().sourire!.warp).toBeNull();
  });

  it('après le dernier duel, la partie se termine avec le classement', () => {
    const { room, conns, ids } = setup(2);
    skipDuel(); // J0 tient : 300
    toDuel(5_000);
    room.handle(ids[0]!, { t: 'sourire', smiled: true }); // J1 craque en 5 s
    vi.advanceTimersByTime(SOURIRE_VERDICT * 1000);
    expect(room.phase).toBe('gameEnd');
    const ranking = conns[1]!.last('gameEnd')!.ranking;
    expect(ranking.map((p) => [p.id, p.score])).toEqual([
      [ids[0], 300 + sourireGains(5, true).attacker],
      [ids[1], sourireGains(5, true).defender],
    ]);
  });

  it('le départ d’un duelliste clôt son duel et saute les siens', () => {
    const { room, conns, ids } = setup(3);
    toDuel(3_000);
    room.leave(ids[1]!); // attaquant du duel 0, défenseur du duel 1
    expect(room.phase).toBe('faceoff');
    const s = conns[0]!.state().sourire!;
    // Duel 1 (J1 défend) sauté : duel 2, J2 contre J0.
    expect([s.turn, s.defenderId, s.attackerId]).toEqual([2, ids[2], ids[0]]);
    expect(score(room, ids[0]!)).toBe(0);
    skipDuel();
    expect(room.phase).toBe('gameEnd');
  });

  it('un joueur qui arrive en cours de partie regarde', () => {
    const { room, ids } = setup(2);
    const late = new FakeConn();
    const lateId = room.join(late, 'Tard', 5)!;
    expect(late.last('welcome')!.state.sourire).toMatchObject({ defenderId: ids[0], attackerId: ids[1], dare: null });
    skipDuel();
    skipDuel();
    expect(room.phase).toBe('gameEnd');
    expect(score(room, lateId)).toBe(0);
    expect(ids).not.toContain(lateId);
  });

  it('la boîte à sons relaie un bruitage valide aux autres, partout', () => {
    const room = new Room('SON', undefined, () => 0);
    const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
    const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
    room.handle(ids[0]!, { t: 'sound', id: 'pouet' });
    expect(conns[1]!.last('sound')).toEqual({ t: 'sound', id: 'pouet', by: ids[0] });
    expect(conns[2]!.last('sound')).toEqual({ t: 'sound', id: 'pouet', by: ids[0] });
    expect(conns[0]!.last('sound')).toBeUndefined();
    room.handle(ids[1]!, { t: 'sound', id: 'prout' as never });
    expect(conns[0]!.last('sound')).toBeUndefined();
  });
});
