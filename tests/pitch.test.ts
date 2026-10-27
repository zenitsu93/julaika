import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PITCH_BRIEF,
  PITCH_MIN_TALK,
  PITCH_POINTS,
  PITCH_RATE,
  PITCH_SLIDES,
  PITCH_SLIDE_COOLDOWN,
  PITCH_TIME,
  PITCH_VERDICT,
  makeProduct,
  pitchGains,
  type ServerMsg,
} from '@julaika/shared';
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

function setup(n = 2, rounds = 1) {
  const room = new Room('PTCH', undefined, () => 0.3);
  room.game = 'pitch';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const toPitch = (ms = 0) => vi.advanceTimersByTime(PITCH_BRIEF * 1000 + ms);
const score = (room: Room, id: string) => room.players.get(id)!.score;

describe('Pitch saboté', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('à deux, les rôles s’inversent à chaque pitch', () => {
    const { room, conns, ids } = setup(2, 2);
    expect(room.phase).toBe('brief');
    const p = () => conns[0]!.state().pitch!;
    expect(p().turns).toBe(4);
    expect(p().pitcherId).toBe(ids[0]);
    vi.advanceTimersByTime((PITCH_BRIEF + PITCH_TIME + PITCH_RATE + PITCH_VERDICT) * 1000);
    expect(p().pitcherId).toBe(ids[1]);
    expect(room.phase).toBe('brief');
  });

  it('seul un investisseur envoie des diapos, avec un délai entre deux', () => {
    const { room, conns, ids } = setup(2);
    room.handle(ids[1]!, { t: 'pitch', slide: 2 });
    expect(conns[0]!.state().pitch!.slide).toBeNull(); // pas encore pendant la découverte
    toPitch();
    room.handle(ids[0]!, { t: 'pitch', slide: 2 });
    expect(conns[0]!.state().pitch!.slide).toBeNull(); // le vendeur ne se sabote pas
    room.handle(ids[1]!, { t: 'pitch', slide: 3 });
    expect(conns[0]!.state().pitch!.slide).toEqual({ index: 3, by: ids[1], n: 1 });
    room.handle(ids[1]!, { t: 'pitch', slide: 4 });
    expect(conns[0]!.state().pitch!.slide!.index).toBe(3);
    vi.advanceTimersByTime(PITCH_SLIDE_COOLDOWN);
    room.handle(ids[1]!, { t: 'pitch', slide: PITCH_SLIDES.length });
    room.handle(ids[1]!, { t: 'pitch', slide: 4 });
    expect(conns[0]!.state().pitch!.slide).toEqual({ index: 4, by: ids[1], n: 2 });
    expect(conns[0]!.state().pitch!.sent[ids[1]!]).toBe(2);
  });

  it('le vendeur conclut, l’investisseur note, les points tombent', () => {
    const { room, conns, ids } = setup(2);
    toPitch();
    room.handle(ids[0]!, { t: 'pitch', done: true });
    expect(room.phase).toBe('pitch'); // trop tôt
    vi.advanceTimersByTime(PITCH_MIN_TALK * 1000);
    room.handle(ids[1]!, { t: 'pitch', slide: 0 });
    room.handle(ids[0]!, { t: 'pitch', done: true });
    expect(room.phase).toBe('vote');
    room.handle(ids[0]!, { t: 'pitch', rate: 5 }); // pas sa propre note
    room.handle(ids[1]!, { t: 'pitch', rate: 4 });
    expect(room.phase).toBe('verdict');
    const r = conns[0]!.state().pitch!.result!;
    expect(r.avg).toBe(4);
    expect(r.raised).toBe(1_000_000);
    expect(score(room, ids[0]!)).toBe(4 * PITCH_POINTS);
    expect(score(room, ids[1]!)).toBe(10);
  });

  it('à trois, on attend toutes les offres avant le verdict', () => {
    const { room, conns, ids } = setup(3);
    vi.advanceTimersByTime((PITCH_BRIEF + PITCH_TIME) * 1000);
    room.handle(ids[1]!, { t: 'pitch', rate: 2 });
    expect(room.phase).toBe('vote');
    expect(conns[0]!.state().pitch!.rated).toEqual([ids[1]]);
    expect(conns[0]!.state().pitch!.result).toBeNull();
    room.handle(ids[2]!, { t: 'pitch', rate: 5 });
    expect(conns[0]!.state().pitch!.result!.avg).toBe(3.5);
  });

  it('sans offre à temps, le pitch rapporte zéro', () => {
    const { room, ids } = setup(2);
    vi.advanceTimersByTime((PITCH_BRIEF + PITCH_TIME + PITCH_RATE) * 1000);
    expect(room.phase).toBe('verdict');
    expect(score(room, ids[0]!)).toBe(0);
  });

  it('le vendeur change de produit une seule fois', () => {
    const { room, conns, ids } = setup(2);
    const first = conns[0]!.state().pitch!.product;
    room.handle(ids[0]!, { t: 'pitch', reroll: true });
    expect(conns[0]!.state().pitch!.rerolled).toBe(true);
    const n = conns[0]!.json.length;
    room.handle(ids[0]!, { t: 'pitch', reroll: true });
    expect(conns[0]!.json.length).toBe(n);
    expect(first.brand).toBeTruthy();
  });

  it('fin de partie après le dernier pitch', () => {
    const { room } = setup(2);
    vi.advanceTimersByTime(2 * (PITCH_BRIEF + PITCH_TIME + PITCH_RATE + PITCH_VERDICT) * 1000);
    expect(room.phase).toBe('gameEnd');
  });

  it('produits et gains', () => {
    const p = makeProduct(() => 0.99);
    expect(p.what && p.twist && p.target && p.buzzword).toBeTruthy();
    expect(pitchGains([], { b: 99 }, 'a')).toEqual({ a: 0, b: 60 });
  });
});
