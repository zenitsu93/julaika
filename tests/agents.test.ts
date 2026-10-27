import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENTS_DUO_PATTERN, AGENTS_DUO_TOKENS, AGENTS_WORDS, agentsClueError, type AgentsColor, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  state() {
    return (this.json.filter((m) => m.t === 'state' || m.t === 'welcome').at(-1) as Extract<ServerMsg, { t: 'state' }>).state;
  }
  agents() {
    return this.state().agents!;
  }
}

function setup(n: number, rounds = 1) {
  const room = new Room('AGEN', undefined, () => 0.42);
  room.game = 'agents';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.settings.drawTime = 60;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const indexes = (key: AgentsColor[], color: AgentsColor) => key.flatMap((c, i) => (c === color ? [i] : []));

describe('Agents secrets', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('les mots de la liste sont uniques', () => {
    expect(new Set(AGENTS_WORDS).size).toBe(AGENTS_WORDS.length);
    expect(AGENTS_WORDS.length).toBeGreaterThan(200);
  });

  it('le motif du duo donne 9 agents et 3 assassins par clé, 15 agents en tout', () => {
    expect(AGENTS_DUO_PATTERN).toHaveLength(25);
    for (const side of [0, 1]) {
      expect(AGENTS_DUO_PATTERN.filter((p) => p[side] === 'or')).toHaveLength(9);
      expect(AGENTS_DUO_PATTERN.filter((p) => p[side] === 'assassin')).toHaveLength(3);
    }
    expect(AGENTS_DUO_PATTERN.filter(([a, b]) => a === 'or' || b === 'or')).toHaveLength(15);
  });

  it('refuse les indices de plusieurs mots ou tirés de la grille', () => {
    const cards = ['Pomme', 'Château', 'Sous-marin'].map((word) => ({ word, revealed: null, by: null, neutral: [] }));
    expect(agentsClueError('fruit', cards)).toBeNull();
    expect(agentsClueError('deux mots', cards)).toMatch(/seul mot/);
    expect(agentsClueError('chateau', cards)).toMatch(/Château/);
    expect(agentsClueError('POMMES', cards)).toMatch(/Pomme/);
    expect(agentsClueError('marin', cards)).toMatch(/Sous-marin/);
  });

  it('à deux, le mode duo : chacun voit sa propre clé', () => {
    const { room, conns, ids } = setup(2);
    const [a, b] = [conns[0]!.agents(), conns[1]!.agents()];
    expect(room.phase).toBe('clue');
    expect(a.mode).toBe('duo');
    expect(a.myTeam).toBe('or');
    expect(b.myTeam).toBe('cacao');
    expect(a.key).not.toEqual(b.key);
    expect(indexes(a.key!, 'or')).toHaveLength(9);
    expect(a.tokens).toBe(AGENTS_DUO_TOKENS);
    expect(a.cards).toHaveLength(25);
    // L'autre côté ne peut pas donner l'indice.
    room.handle(ids[1]!, { t: 'agents', clue: 'fruit', count: 2 });
    expect(room.phase).toBe('clue');
  });

  it('duo : un indice, des agents trouvés, puis un passant rend la main', () => {
    const { room, conns, ids } = setup(2);
    const key = conns[0]!.agents().key!;
    room.handle(ids[0]!, { t: 'agents', clue: 'zorglub', count: 2 });
    expect(room.phase).toBe('guess');
    expect(conns[1]!.agents().tokens).toBe(AGENTS_DUO_TOKENS - 1);
    // Celui qui a donné l'indice ne retourne pas de carte.
    const [first, second] = indexes(key, 'or');
    room.handle(ids[0]!, { t: 'agents', guess: first! });
    expect(conns[0]!.agents().cards[first!]!.revealed).toBeNull();

    room.handle(ids[1]!, { t: 'agents', point: first! });
    expect(conns[0]!.agents().pointers[ids[1]!]).toBe(first);
    room.handle(ids[1]!, { t: 'agents', guess: first! });
    room.handle(ids[1]!, { t: 'agents', guess: second! });
    let s = conns[0]!.agents();
    expect(s.cards[first!]!.revealed).toBe('or');
    expect(s.clue!.found).toBe(2);
    expect(s.left.or).toBe(7);
    expect(room.players.get(ids[1]!)!.score).toBe(20);

    const neutral = indexes(key, 'neutre')[0]!;
    room.handle(ids[1]!, { t: 'agents', guess: neutral });
    s = conns[0]!.agents();
    expect(s.cards[neutral]!.revealed).toBeNull();
    expect(s.cards[neutral]!.neutral).toEqual(['or']);
    expect(room.phase).toBe('clue');
    expect(s.turn).toBe('cacao');
  });

  it('duo : toucher un assassin fait échouer la mission', () => {
    const { room, conns, ids } = setup(2);
    const key = conns[0]!.agents().key!;
    room.handle(ids[0]!, { t: 'agents', clue: 'zorglub', count: 1 });
    room.handle(ids[1]!, { t: 'agents', guess: indexes(key, 'assassin')[0]! });
    const s = conns[0]!.agents();
    expect(room.phase).toBe('reveal');
    expect(s.result).toEqual({ winner: null, reason: 'assassin', by: ids[1] });
    expect(s.keys).not.toBeNull();
    vi.advanceTimersByTime(11_000);
    expect(room.phase).toBe('gameEnd');
  });

  it('duo : les 15 agents trouvés, mission accomplie', () => {
    const { room, conns, ids } = setup(2);
    const keyA = conns[0]!.agents().key!;
    const keyB = conns[1]!.agents().key!;
    room.handle(ids[0]!, { t: 'agents', clue: 'zorglub', count: 9 });
    for (const i of indexes(keyA, 'or')) room.handle(ids[1]!, { t: 'agents', guess: i });
    // La clé « or » est vidée : la main passe, et elle ne revient plus.
    expect(conns[0]!.agents().turn).toBe('cacao');
    room.handle(ids[1]!, { t: 'agents', clue: 'zorglub', count: 9 });
    for (const i of indexes(keyB, 'or')) room.handle(ids[0]!, { t: 'agents', guess: i });
    expect(conns[0]!.agents().result?.winner).toBe('duo');
    expect(room.players.get(ids[0]!)!.score).toBe(15 * 10 + 100);
  });

  it('duo : sans indice à temps, le tour est perdu, et la mission échoue après 9 tours', () => {
    const { room, conns } = setup(2);
    for (let t = 1; t < AGENTS_DUO_TOKENS; t++) {
      vi.advanceTimersByTime(61_000);
      expect(conns[0]!.agents().tokens).toBe(AGENTS_DUO_TOKENS - t);
    }
    vi.advanceTimersByTime(61_000);
    expect(room.phase).toBe('reveal');
    expect(conns[0]!.agents().result?.reason).toBe('tours');
  });

  it('à quatre, deux équipes : seul l’espion voit la clé', () => {
    const { room, conns, ids } = setup(4);
    const s = conns[0]!.agents();
    expect(s.mode).toBe('equipes');
    expect(s.teams).toEqual({ or: [ids[0], ids[2]], cacao: [ids[1], ids[3]] });
    expect(s.spies).toEqual({ or: ids[0], cacao: ids[1] });
    expect(s.key).not.toBeNull();
    expect(conns[2]!.agents().key).toBeNull();
    expect(indexes(s.key!, 'or')).toHaveLength(9);
    expect(indexes(s.key!, 'cacao')).toHaveLength(8);
    expect(indexes(s.key!, 'assassin')).toHaveLength(1);
    // L'espion de l'autre équipe ne peut pas jouer.
    room.handle(ids[1]!, { t: 'agents', clue: 'fruit', count: 1 });
    expect(room.phase).toBe('clue');
  });

  it('équipes : nombre + 1 essais, une carte adverse rend la main', () => {
    const { room, conns, ids } = setup(4);
    const key = conns[0]!.agents().key!;
    const words = conns[0]!.agents().cards.map((c) => c.word);
    // Un mot de la grille est refusé.
    room.handle(ids[0]!, { t: 'agents', clue: words[0]!, count: 1 });
    expect(room.phase).toBe('clue');
    room.handle(ids[0]!, { t: 'agents', clue: 'zorglub', count: 1 });
    expect(conns[2]!.agents().guessesLeft).toBe(2);
    // L'espion ne retourne pas de carte, son coéquipier oui.
    const mine = indexes(key, 'or');
    room.handle(ids[0]!, { t: 'agents', guess: mine[0]! });
    expect(conns[0]!.agents().cards[mine[0]!]!.revealed).toBeNull();
    room.handle(ids[2]!, { t: 'agents', guess: mine[0]! });
    expect(conns[0]!.agents().left.or).toBe(8);
    expect(room.players.get(ids[0]!)!.score).toBe(10);
    room.handle(ids[2]!, { t: 'agents', guess: indexes(key, 'cacao')[0]! });
    const s = conns[0]!.agents();
    expect(s.left.cacao).toBe(7);
    expect(s.turn).toBe('cacao');
    expect(room.players.get(ids[1]!)!.score).toBe(10);
  });

  it('équipes : l’assassin fait gagner l’autre équipe, et l’espion change à la grille suivante', () => {
    const { room, conns, ids } = setup(4, 2);
    const key = conns[0]!.agents().key!;
    room.handle(ids[0]!, { t: 'agents', clue: 'zorglub', count: 1 });
    room.handle(ids[2]!, { t: 'agents', guess: indexes(key, 'assassin')[0]! });
    expect(conns[0]!.agents().result).toEqual({ winner: 'cacao', reason: 'assassin', by: ids[2] });
    expect(room.players.get(ids[1]!)!.score).toBe(100);
    vi.advanceTimersByTime(10_000);
    const s = conns[0]!.agents();
    expect(s.grid).toBe(2);
    expect(s.turn).toBe('cacao');
    expect(s.spies).toEqual({ or: ids[2], cacao: ids[3] });
    expect(s.record).toEqual(['cacao']);
  });

  it('équipes : si un espion part, un coéquipier le remplace ; une équipe trop petite perd la grille', () => {
    const { room, conns, ids } = setup(5);
    expect(conns[1]!.agents().teams.or).toEqual([ids[0], ids[2], ids[4]]);
    room.leave(ids[0]!);
    expect(conns[1]!.agents().spies.or).toBe(ids[2]);
    room.leave(ids[3]!);
    const s = conns[1]!.agents();
    expect(room.phase).toBe('reveal');
    expect(s.result).toEqual({ winner: 'or', reason: 'equipe', by: null });
  });
});
