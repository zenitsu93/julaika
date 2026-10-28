import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERDITS_CARDS, INTERDITS_GRACE_MS, INTERDITS_INTRO, INTERDITS_SKIPS, INTERDITS_VERDICT, bannedHeard, type ServerMsg } from '@julaika/shared';
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

const TURN = 60;

function setup(n = 2, rounds = 1) {
  const room = new Room('TABU', undefined, () => 0);
  room.game = 'interdits';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.settings.drawTime = TURN;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

/** Passe la présentation, puis le délai de grâce de la première carte. */
function toExplain() {
  vi.advanceTimersByTime(INTERDITS_INTRO * 1000 + INTERDITS_GRACE_MS);
}
/** Laisse passer la grâce de la carte qui vient d'arriver. */
const grace = () => vi.advanceTimersByTime(INTERDITS_GRACE_MS);
const score = (room: Room, id: string) => room.players.get(id)!.score;

describe('Mots interdits', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('à deux, pas de gardien et les rôles alternent', () => {
    const { room, conns, ids } = setup(2, 2);
    expect(room.phase).toBe('faceoff');
    const s = conns[1]!.state().interdits!;
    expect([s.explainerId, s.guardId, s.turns]).toEqual([ids[0], null, 4]);
    vi.advanceTimersByTime((INTERDITS_INTRO + TURN + INTERDITS_VERDICT) * 1000);
    expect(room.phase).toBe('faceoff');
    expect(conns[1]!.state().interdits!.explainerId).toBe(ids[1]);
  });

  it('la carte n’est montrée qu’à celui qui fait deviner et au gardien', () => {
    const { conns, ids } = setup(3);
    toExplain();
    const card = conns[0]!.state().interdits!.card!;
    expect(INTERDITS_CARDS.map((c) => c.word)).toContain(card.word);
    expect(card.ban).toHaveLength(4); // difficulté « moyen »
    expect(conns[0]!.state().interdits!.guardId).toBe(ids[2]);
    expect(conns[2]!.state().interdits!.card).toEqual(card);
    expect(conns[1]!.state().interdits!.card).toBeNull();
  });

  it('un mot trouvé à l’oral : 100 pour celui qui explique, 50 par devineur', () => {
    const { room, conns, ids } = setup(3);
    toExplain();
    const n = conns[0]!.state().interdits!.cardNo;
    room.handle(ids[1]!, { t: 'interdits', found: n }); // un devineur ne peut pas valider
    expect(conns[0]!.state().interdits!.played).toHaveLength(0);
    room.handle(ids[0]!, { t: 'interdits', found: n });
    room.handle(ids[0]!, { t: 'interdits', found: n }); // double clic : la carte est déjà passée
    const s = conns[1]!.state().interdits!;
    expect(s.played).toHaveLength(1);
    expect(s.played[0]!.outcome).toBe('found');
    expect(s.cardNo).toBe(n + 1);
    expect([score(room, ids[0]!), score(room, ids[1]!), score(room, ids[2]!)]).toEqual([100, 50, 0]);
  });

  it('une bonne réponse tapée dans le chat gagne la carte', () => {
    const { room, conns, ids } = setup(2);
    toExplain();
    const word = conns[0]!.state().interdits!.card!.word;
    room.handle(ids[1]!, { t: 'chat', text: word.toUpperCase() });
    expect(conns[0]!.state().interdits!.played[0]).toMatchObject({ word, outcome: 'found', by: ids[1] });
    expect(score(room, ids[1]!)).toBe(100);
    expect(conns[0]!.json.some((m) => m.t === 'chat' && m.line.kind === 'msg' && m.line.text === word.toUpperCase())).toBe(false);
  });

  it('celui qui explique et le gardien ne peuvent rien taper, les essais ratés passent en bulles', () => {
    const { room, conns, ids } = setup(3);
    toExplain();
    room.handle(ids[0]!, { t: 'chat', text: 'indice secret' });
    room.handle(ids[2]!, { t: 'chat', text: 'autre indice' });
    expect(conns[1]!.json.some((m) => m.t === 'chat' && m.line.text.includes('indice'))).toBe(false);
    room.handle(ids[1]!, { t: 'chat', text: 'bonjour' });
    expect(conns[0]!.last('chat')!.line.text).toBe('bonjour');
  });

  it('le buzz du gardien coûte 50 à celui qui explique, sans passer sous zéro', () => {
    const { room, conns, ids } = setup(3);
    toExplain();
    let n = conns[0]!.state().interdits!.cardNo;
    room.handle(ids[1]!, { t: 'interdits', buzz: n }); // un devineur ne buzze pas
    expect(conns[0]!.state().interdits!.cardNo).toBe(n);
    room.handle(ids[0]!, { t: 'interdits', found: n });
    grace();
    n = conns[0]!.state().interdits!.cardNo;
    room.handle(ids[2]!, { t: 'interdits', buzz: n, heard: 'sable' });
    expect(conns[1]!.state().interdits!.played[1]).toMatchObject({ outcome: 'buzz', by: ids[2], heard: 'sable' });
    expect([score(room, ids[0]!), score(room, ids[2]!)]).toEqual([50, 50]);
    grace();
    room.handle(ids[0]!, { t: 'interdits', buzz: conns[0]!.state().interdits!.cardNo }); // il avoue
    grace();
    room.handle(ids[0]!, { t: 'interdits', buzz: conns[0]!.state().interdits!.cardNo });
    expect(score(room, ids[0]!)).toBe(0);
  });

  it('un clic juste après l’arrivée d’une carte est ignoré', () => {
    const { room, conns, ids } = setup(2);
    toExplain();
    room.handle(ids[0]!, { t: 'interdits', found: conns[0]!.state().interdits!.cardNo });
    room.handle(ids[0]!, { t: 'interdits', found: conns[0]!.state().interdits!.cardNo });
    expect(conns[0]!.state().interdits!.played).toHaveLength(1);
  });

  it('on ne passe que trois cartes par tour', () => {
    const { room, conns, ids } = setup(2);
    toExplain();
    for (let i = 0; i < INTERDITS_SKIPS + 2; i++) {
      room.handle(ids[0]!, { t: 'interdits', skip: conns[0]!.state().interdits!.cardNo });
      grace();
    }
    const s = conns[0]!.state().interdits!;
    expect(s.skips).toBe(0);
    expect(s.played.filter((p) => p.outcome === 'skip')).toHaveLength(INTERDITS_SKIPS);
  });

  it('le bilan donne les gains du tour, puis la partie se termine', () => {
    const { room, conns, ids } = setup(2);
    toExplain();
    room.handle(ids[0]!, { t: 'interdits', found: conns[0]!.state().interdits!.cardNo });
    vi.advanceTimersByTime(TURN * 1000);
    expect(room.phase).toBe('verdict');
    expect(conns[1]!.state().interdits!.gains).toEqual({ [ids[0]!]: 100, [ids[1]!]: 50 });
    vi.advanceTimersByTime((INTERDITS_VERDICT + INTERDITS_INTRO + TURN + INTERDITS_VERDICT) * 1000);
    expect(room.phase).toBe('gameEnd');
  });

  it('si celui qui explique part, on passe au tour suivant', () => {
    const { room, conns, ids } = setup(3);
    toExplain();
    room.leave(ids[0]!);
    expect(room.phase).toBe('faceoff');
    expect(conns[1]!.state().interdits!.explainerId).toBe(ids[1]);
  });

  it('l’arbitre vocal repère le mot, les mots interdits et leurs pluriels', () => {
    const card = { word: 'Plage', ban: ['sable', 'mer', 'pomme de terre', 'cheval'] };
    expect(bannedHeard('on y va en été', card)).toBeNull();
    expect(bannedHeard('il y a du Sable fin', card)).toBe('sable');
    expect(bannedHeard('les plages bondées', card)).toBe('Plage');
    expect(bannedHeard('des pommes de terre', card)).toBeNull();
    expect(bannedHeard('une pomme de terre', card)).toBe('pomme de terre');
    expect(bannedHeard('trois chevaux', card)).toBe('cheval');
    expect(bannedHeard('la mère de Paul', card)).toBe('mer');
  });
});
