import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNAIT_ANSWER_TIME, CONNAIT_GUESS_POINTS, CONNAIT_QUESTIONS, CONNAIT_REVEAL_TIME, CONNAIT_STAR_POINTS, connaitVerdict, type ServerMsg } from '@julaika/shared';
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

function setup(n = 3, rounds = 1) {
  const room = new Room('QUI', undefined, () => 0);
  room.game = 'connait';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { rounds } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

describe('Qui me connaît le mieux', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('les questions ont toutes quatre réponses distinctes', () => {
    expect(CONNAIT_QUESTIONS.length).toBeGreaterThanOrEqual(40);
    for (const q of CONNAIT_QUESTIONS) expect(new Set(q.options).size).toBe(4);
    expect(new Set(CONNAIT_QUESTIONS.map((q) => q.topic)).size).toBe(CONNAIT_QUESTIONS.length);
  });

  it('garde les réponses secrètes, puis dévoile tout et compte les points', () => {
    const { room, conns, ids } = setup();
    expect(room.phase).toBe('answer');
    const s0 = conns[0]!.state().connait!;
    expect(s0.starId).toBe(ids[0]);
    expect(s0.question!.options).toHaveLength(4);

    room.handle(ids[0]!, { t: 'connait', pick: 2 });
    room.handle(ids[1]!, { t: 'connait', pick: 2 });
    // Chacun voit qui a répondu, mais seulement son propre choix.
    const seen = conns[2]!.state().connait!;
    expect(seen.answered).toEqual([ids[0], ids[1]]);
    expect(seen.mine).toBeNull();
    expect(seen.reveal).toBeNull();
    expect(conns[1]!.state().connait!.mine).toBe(2);

    room.handle(ids[2]!, { t: 'connait', pick: 1 });
    expect(room.phase).toBe('reveal');
    const reveal = conns[2]!.state().connait!.reveal!;
    expect(reveal.answer).toBe(2);
    expect(reveal.picks).toEqual({ [ids[0]!]: 2, [ids[1]!]: 2, [ids[2]!]: 1 });
    expect(reveal.gains).toEqual({ [ids[1]!]: CONNAIT_GUESS_POINTS, [ids[0]!]: CONNAIT_STAR_POINTS });
    const scores = Object.fromEntries(conns[0]!.state().players.map((p) => [p.id, p.score]));
    expect(scores).toEqual({ [ids[0]!]: CONNAIT_STAR_POINTS, [ids[1]!]: CONNAIT_GUESS_POINTS, [ids[2]!]: 0 });

    vi.advanceTimersByTime(CONNAIT_REVEAL_TIME * 1000);
    expect(room.phase).toBe('answer');
    expect(conns[0]!.state().connait!.starId).toBe(ids[1]);
  });

  it('refuse les choix hors des réponses et laisse changer d’avis', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[1]!, { t: 'connait', pick: 7 });
    room.handle(ids[1]!, { t: 'connait', pick: -1 });
    expect(conns[1]!.state().connait!.mine).toBeNull();
    room.handle(ids[1]!, { t: 'connait', pick: 0 });
    room.handle(ids[1]!, { t: 'connait', pick: 3 });
    expect(conns[1]!.state().connait!.mine).toBe(3);
  });

  it('la vedette change de question une fois, et les paris repartent de zéro', () => {
    const { room, conns, ids } = setup();
    const first = conns[0]!.state().connait!.question!.topic;
    room.handle(ids[1]!, { t: 'connait', pick: 0 });
    room.handle(ids[1]!, { t: 'connait', reroll: true }); // pas la vedette : ignoré
    expect(conns[0]!.state().connait!.question!.topic).toBe(first);

    room.handle(ids[0]!, { t: 'connait', reroll: true });
    const after = conns[0]!.state().connait!;
    expect(after.question!.topic).not.toBe(first);
    expect(after.answered).toEqual([]);
    expect(after.canReroll).toBe(false);
  });

  it('sans réponse de la vedette, personne ne marque ; la partie finit après chaque vedette', () => {
    const { room, conns, ids } = setup(2);
    room.handle(ids[1]!, { t: 'connait', pick: 0 });
    vi.advanceTimersByTime(CONNAIT_ANSWER_TIME * 1000);
    expect(room.phase).toBe('reveal');
    expect(conns[0]!.state().connait!.reveal).toMatchObject({ answer: null, gains: {} });
    vi.advanceTimersByTime(CONNAIT_REVEAL_TIME * 1000);
    expect(conns[0]!.state().connait!.starId).toBe(ids[1]);
    vi.advanceTimersByTime((CONNAIT_ANSWER_TIME + CONNAIT_REVEAL_TIME) * 1000);
    expect(room.phase).toBe('gameEnd');
    expect(conns[0]!.state().connait!.history).toHaveLength(2);
  });

  it('si la vedette part, on passe à la question suivante', () => {
    const { room, conns, ids } = setup(3);
    room.leave(ids[0]!);
    const s = conns[1]!.state().connait!;
    expect(room.phase).toBe('answer');
    expect(s.starId).toBe(ids[1]);
  });

  it('donne un titre selon la part de paris justes', () => {
    expect(connaitVerdict(9, 10).title).toBe('Âmes sœurs');
    expect(connaitVerdict(0, 0).title).toBe('Parfaits étrangers');
  });
});
