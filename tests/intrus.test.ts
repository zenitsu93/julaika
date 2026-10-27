import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTRUS_HESITATE_GRACE, INTRUS_HESITATE_TIME, INTRUS_POINTS, intrusClueRounds, type IntrusState, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';
import { CLUE_TIME, REVEAL_TIME, STEAL_TIME, VOTE_TIME } from '../apps/server/src/intrus';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  intrus(): IntrusState {
    return (this.json.filter((m) => m.t === 'state').at(-1) as Extract<ServerMsg, { t: 'state' }>).state.intrus!;
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

function setup(n = 3, rounds = 1) {
  const room = new Room('INTR', undefined, () => 0);
  room.game = 'intrus';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.handle(ids[0]!, { t: 'start' });
  const conn = (id: string) => conns[ids.indexOf(id)]!;
  const view = () => conns[0]!.intrus();
  // L'intrus est le seul dont le mot diffère de celui de la majorité.
  const intrusId = () => {
    const words = ids.map((id) => conn(id).intrus().word);
    return ids.find((_, i) => words.filter((w) => w === words[i]).length === 1)!;
  };
  /** Chaque joueur donne un indice à son tour, jusqu'au vote. */
  const allClues = () => {
    while (room.phase === 'clue') room.handle(view().speakerId!, { t: 'intrus', clue: `indice ${view().clues.length}` });
  };
  return { room, conns, ids, conn, view, intrusId, allClues };
}

describe("L'Intrus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refuse de démarrer à deux', () => {
    const { room, conns } = setup(2);
    expect(room.phase).toBe('lobby');
    expect(conns[0]!.last('error')?.message).toMatch(/3 joueurs/);
  });

  it('chacun ne connaît que son mot, et un seul a un mot différent', () => {
    const { ids, conn, intrusId } = setup(4);
    const words = ids.map((id) => conn(id).intrus().word);
    expect(words.every(Boolean)).toBe(true);
    expect(new Set(words).size).toBe(2);
    const intrus = intrusId();
    expect(ids.filter((id) => conn(id).intrus().word === conn(intrus).intrus().word)).toEqual([intrus]);
  });

  it('les indices passent à tour de rôle, et on ne peut pas donner son propre mot', () => {
    const { room, view, conn } = setup(3);
    const first = view().speakerId!;
    expect(view().order[0]).toBe(first);
    room.handle(view().order[1]!, { t: 'intrus', clue: 'pas mon tour' });
    expect(view().clues).toHaveLength(0);

    room.handle(first, { t: 'intrus', clue: ` ${conn(first).intrus().word!.toUpperCase()} ` });
    expect(view().clues).toHaveLength(0);
    expect(conn(first).last('error')?.message).toMatch(/Pas ton mot/);

    room.handle(first, { t: 'intrus', clue: '  sable   chaud ' });
    expect(view().clues).toEqual([{ by: first, text: 'sable chaud', round: 0 }]);
    expect(view().speakerId).toBe(view().order[1]);
  });

  it('« Hésitation ! » raccourcit le temps de l’orateur, une fois par manche, et marque son indice', () => {
    const { room, view, conn } = setup(3);
    const [speaker, a, b] = view().order as [string, string, string];
    // Trop tôt (délai de grâce), et jamais sur soi-même.
    room.handle(a, { t: 'intrus', hesitate: true });
    expect(view().hesitationBy).toBeNull();
    vi.advanceTimersByTime(INTRUS_HESITATE_GRACE * 1000);
    room.handle(speaker, { t: 'intrus', hesitate: true });
    expect(view().hesitationBy).toBeNull();

    room.handle(a, { t: 'intrus', hesitate: true });
    expect(view().hesitationBy).toBe(a);
    expect(conn(a).intrus().canHesitate).toBe(false);
    expect(room.endsAt! - Date.now()).toBe(INTRUS_HESITATE_TIME * 1000);
    room.handle(b, { t: 'intrus', hesitate: true }); // déjà quelqu'un sur ce tour
    expect(view().hesitationBy).toBe(a);

    room.handle(speaker, { t: 'intrus', clue: 'euh' });
    expect(view().clues).toEqual([{ by: speaker, text: 'euh', round: 0, hesitated: true }]);
    expect(view().hesitationBy).toBeNull();

    // Au suivant : b peut buzzer, a a déjà grillé sa cartouche.
    vi.advanceTimersByTime(INTRUS_HESITATE_GRACE * 1000);
    room.handle(a, { t: 'intrus', hesitate: true });
    expect(view().hesitationBy).toBeNull();
    room.handle(b, { t: 'intrus', hesitate: true });
    expect(view().hesitationBy).toBe(b);
    // Sans réponse dans le temps raccourci, on passe au suivant.
    vi.advanceTimersByTime(INTRUS_HESITATE_TIME * 1000);
    expect(view().speakerId).toBe(b);
    expect(view().clues).toHaveLength(1);
  });

  it("le temps écoulé passe au suivant, puis on vote après les tours d'indices", () => {
    const { room, view } = setup(3);
    const rounds = intrusClueRounds(3);
    for (let i = 0; i < 3 * rounds; i++) vi.advanceTimersByTime(CLUE_TIME * 1000);
    expect(room.phase).toBe('vote');
    expect(view().clues).toHaveLength(0);
  });

  it("l'intrus démasqué peut voler la manche en devinant le mot des autres", () => {
    const { room, ids, conn, intrusId, allClues } = setup(3);
    allClues();
    expect(room.phase).toBe('vote');
    const intrus = intrusId();
    const civils = ids.filter((id) => id !== intrus);
    room.handle(civils[0]!, { t: 'intrus', vote: civils[0]! }); // pas pour soi
    expect(conn(civils[0]!).intrus().myVote).toBeNull();
    for (const id of civils) room.handle(id, { t: 'intrus', vote: intrus });
    expect(conn(intrus).intrus().voted).toHaveLength(2);
    expect(conn(intrus).intrus().result).toBeNull(); // les votes restent cachés
    room.handle(intrus, { t: 'intrus', vote: civils[0]! });

    expect(room.phase).toBe('steal');
    expect(conn(intrus).intrus().accusedId).toBe(intrus);
    const civilWord = conn(civils[0]!).intrus().word!;
    room.handle(civils[0]!, { t: 'intrus', steal: civilWord }); // seul l'intrus tente
    expect(room.phase).toBe('steal');
    room.handle(intrus, { t: 'intrus', steal: civilWord });

    expect(room.phase).toBe('reveal');
    const result = conn(civils[1]!).intrus().result!;
    expect(result).toMatchObject({ intrusId: intrus, accusedId: intrus, caught: true, stolen: true, civil: civilWord });
    expect(result.gains[intrus]).toBe(INTRUS_POINTS.stolen);
    expect(result.gains[civils[0]!]).toBe(INTRUS_POINTS.spotted);
    expect(room.players.get(civils[1]!)!.score).toBe(INTRUS_POINTS.spotted);
  });

  it("l'intrus s'échappe quand le vote se trompe ou finit à égalité", () => {
    const { room, ids, conn, intrusId, allClues } = setup(3);
    allClues();
    const intrus = intrusId();
    const [a, b] = ids.filter((id) => id !== intrus);
    room.handle(a!, { t: 'intrus', vote: b! });
    room.handle(b!, { t: 'intrus', vote: intrus });
    room.handle(intrus, { t: 'intrus', vote: a! });
    expect(room.phase).toBe('reveal');
    const result = conn(a!).intrus().result!;
    expect(result.accusedId).toBeNull();
    expect(result.caught).toBe(false);
    expect(result.gains[intrus]).toBe(INTRUS_POINTS.escaped);
    expect(result.votes).toEqual({ [a!]: b, [b!]: intrus, [intrus]: a });
  });

  it("l'intrus démasqué qui ne répond pas laisse la manche aux civils", () => {
    const { room, ids, conn, intrusId, allClues } = setup(3);
    allClues();
    const intrus = intrusId();
    for (const id of ids) if (id !== intrus) room.handle(id, { t: 'intrus', vote: intrus });
    vi.advanceTimersByTime(VOTE_TIME * 1000);
    expect(room.phase).toBe('steal');
    vi.advanceTimersByTime(STEAL_TIME * 1000);
    expect(conn(intrus).intrus().result).toMatchObject({ caught: true, stolen: false, steal: null });
    expect(conn(intrus).intrus().result!.gains[intrus]).toBe(0);
  });

  it('sans vote ni réponse, les minuteurs mènent la partie jusqu’au podium', () => {
    const { room, view, allClues } = setup(3, 2);
    allClues();
    vi.advanceTimersByTime(VOTE_TIME * 1000);
    expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(REVEAL_TIME * 1000);
    expect(view().manche).toBe(2);
    expect(room.phase).toBe('clue');
    allClues();
    vi.advanceTimersByTime(VOTE_TIME * 1000);
    expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(REVEAL_TIME * 1000);
    expect(room.phase).toBe('gameEnd');
    expect(view().history).toHaveLength(2);
  });

  it('jamais deux fois le même mot dans une partie', () => {
    const { room, conns, allClues } = setup(3, 5);
    const seen: string[] = [];
    for (let m = 0; m < 5; m++) {
      seen.push(...new Set(conns.map((c) => c.intrus().word!)));
      allClues();
      vi.advanceTimersByTime(VOTE_TIME * 1000);
      vi.advanceTimersByTime(REVEAL_TIME * 1000);
    }
    expect(room.phase).toBe('gameEnd');
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('un départ de l’intrus relance une manche ; sous trois joueurs, retour au salon', () => {
    const { room, ids, conn, intrusId } = setup(4, 3);
    const intrus = intrusId();
    const watcher = ids.find((id) => id !== intrus)!;
    const view = () => conn(watcher).intrus();
    room.leave(intrus);
    expect(view().manche).toBe(2);
    expect(room.phase).toBe('clue');
    room.leave(ids.find((id) => room.players.has(id) && id !== watcher)!);
    expect(room.phase).toBe('lobby');
  });
});
