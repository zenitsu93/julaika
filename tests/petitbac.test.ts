import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAC_CATEGORY_COUNT, BAC_STOP_GRACE, bacFits, bacScore, vetoKey, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  state() {
    return (this.json.filter((m) => m.t === 'state' || m.t === 'welcome').at(-1) as Extract<ServerMsg, { t: 'state' }>).state;
  }
}

function setup(n = 3) {
  const room = new Room('BAC', undefined, () => 0);
  room.game = 'petitbac';
  room.settings.rounds = 2;
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

/** Une grille pleine, chaque mot commençant par la lettre tirée. */
const grid = (letter: string, words: string[]) => words.map((w) => `${letter}${w}`);

describe('Petit Bac', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('vérifie la lettre, avec ou sans article', () => {
    expect(bacFits('Lapin', 'L')).toBe(true);
    expect(bacFits("L'Ours", 'O')).toBe(true);
    expect(bacFits('La Rochelle', 'R')).toBe(true);
    expect(bacFits('La Rochelle', 'L')).toBe(true);
    expect(bacFits('Éléphant', 'E')).toBe(true);
    expect(bacFits('Chat', 'L')).toBe(false);
    expect(bacFits('L', 'L')).toBe(false);
  });

  it('compte 10 pour une réponse unique, 5 partagée, 0 refusée par la majorité', () => {
    const answers = { a: ['Paris', 'Pomme'], b: ['paris ', 'Poire'], c: ['Lyon', 'Pêche'] };
    const voters = ['a', 'b', 'c'];
    expect(bacScore(answers, 'P', 2, {}, voters)).toEqual({ a: [5, 10], b: [5, 10], c: [0, 10] });
    // Un seul vote contre sur deux autres joueurs : égalité, la réponse tient.
    expect(bacScore(answers, 'P', 2, { [vetoKey('a', 1)]: ['b'] }, voters).a).toEqual([5, 10]);
    expect(bacScore(answers, 'P', 2, { [vetoKey('a', 1)]: ['b', 'c'] }, voters).a).toEqual([5, 0]);
  });

  it('cache les réponses pendant le remplissage, puis les dévoile au vote', () => {
    const { room, conns, ids } = setup();
    const bac = conns[0]!.state().bac!;
    expect(room.phase).toBe('fill');
    expect(bac.categories).toHaveLength(BAC_CATEGORY_COUNT);
    room.handle(ids[1]!, { t: 'bac', answers: grid(bac.letter, ['aa', 'bb']) });
    const seen = conns[0]!.state().bac!;
    expect(seen.answers).toBeNull();
    expect(seen.filled[ids[1]!]).toBe(2);
    // Il faut une grille complète pour crier « Stop ! ».
    room.handle(ids[1]!, { t: 'bac', stop: true });
    expect(conns[0]!.state().bac!.stoppedBy).toBeNull();
  });

  it('« Stop ! » laisse quelques secondes, puis vote et décompte', () => {
    const { room, conns, ids } = setup();
    const { letter } = conns[0]!.state().bac!;
    const full = grid(letter, ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    room.handle(ids[0]!, { t: 'bac', answers: full });
    room.handle(ids[1]!, { t: 'bac', answers: [full[0]!, 'Zut'] });
    room.handle(ids[0]!, { t: 'bac', stop: true });
    expect(conns[1]!.state().bac!.stoppedBy).toBe(ids[0]);
    expect(conns[1]!.state().endsAt! - Date.now()).toBeLessThanOrEqual(BAC_STOP_GRACE * 1000);

    vi.advanceTimersByTime((BAC_STOP_GRACE + 1) * 1000);
    expect(room.phase).toBe('vote');
    expect(conns[2]!.state().bac!.answers![ids[0]!]).toEqual(full);

    // On ne vote ni contre soi-même ni contre une réponse déjà hors lettre.
    room.handle(ids[0]!, { t: 'bac', veto: { player: ids[0]!, category: 1, against: true } });
    room.handle(ids[0]!, { t: 'bac', veto: { player: ids[1]!, category: 1, against: true } });
    room.handle(ids[1]!, { t: 'bac', veto: { player: ids[0]!, category: 2, against: true } });
    room.handle(ids[2]!, { t: 'bac', veto: { player: ids[0]!, category: 2, against: true } });
    expect(conns[0]!.state().bac!.vetoes).toEqual({ [vetoKey(ids[0]!, 2)]: [ids[1], ids[2]] });

    ids.forEach((id) => room.handle(id, { t: 'bac', done: true }));
    expect(room.phase).toBe('reveal');
    const points = conns[0]!.state().bac!.points!;
    expect(points[ids[0]!]).toEqual([5, 10, 0, 10, 10, 10]);
    expect(points[ids[1]!]).toEqual([5, 0, 0, 0, 0, 0]);
    expect(room.players.get(ids[0]!)!.score).toBe(45);

    // L'hôte passe à la manche suivante, nouvelle lettre ; après la dernière, le podium.
    room.handle(ids[0]!, { t: 'bac', next: true });
    expect(room.phase).toBe('fill');
    expect(conns[0]!.state().bac!.letter).not.toBe(letter);
    // Personne n'a rien écrit : pas de vote, on passe droit au décompte.
    vi.advanceTimersByTime(90_000);
    expect(room.phase).toBe('reveal');
    room.handle(ids[0]!, { t: 'bac', next: true });
    expect(room.phase).toBe('gameEnd');
  });
});
