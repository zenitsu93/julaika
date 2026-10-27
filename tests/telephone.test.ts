import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawOp, TEL_PROMPTS, TEL_WRITE_TIME, encodeDraw, telChainFor, telKind, type ServerMsg } from '@julaika/shared';
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

function setup(n = 3) {
  const room = new Room('TEL', undefined, () => 0);
  room.game = 'telephone';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const stroke = (x: number) => [
  new Uint8Array(encodeDraw({ op: DrawOp.Begin, color: 12, size: 10, points: [x, 10] })),
  new Uint8Array(encodeDraw({ op: DrawOp.Extend, color: 12, size: 10, points: [x + 5, 20, x + 9, 30] })),
];

describe('Téléphone dessiné', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('alterne écrire, dessiner, décrire et passe la chaîne au voisin', () => {
    expect([0, 1, 2, 3].map(telKind)).toEqual(['write', 'draw', 'describe', 'draw']);
    expect([0, 1, 2].map((s) => telChainFor(1, s, 3))).toEqual([1, 0, 2]);
  });

  it('chacun dessine la phrase du voisin, sans que les autres voient le dessin', () => {
    const { room, conns, ids } = setup();
    expect(room.phase).toBe('write');
    ids.forEach((id, i) => room.handle(id, { t: 'tel', text: `  phrase   ${i} ` }));
    expect(room.phase).toBe('draw');
    // J1 reçoit la phrase de J0, J0 celle du dernier.
    expect(conns[1]!.last('telPrompt')!.prompt).toMatchObject({ kind: 'text', text: 'phrase 0' });
    expect(conns[0]!.last('telPrompt')!.prompt).toMatchObject({ kind: 'text', text: 'phrase 2' });

    const before = conns.map((c) => c.binary);
    for (const p of stroke(100)) room.handleDraw(ids[1]!, p);
    expect(conns.map((c) => c.binary)).toEqual(before);

    ids.forEach((id) => room.handle(id, { t: 'tel', done: true }));
    expect(room.phase).toBe('describe');
    // J2 décrit le dessin de J1 (chaîne de J0) : un seul trait, ses points fusionnés.
    const prompt = conns[2]!.last('telPrompt')!.prompt!;
    expect(prompt).toMatchObject({ kind: 'drawing', by: ids[1] });
    expect(prompt.kind === 'drawing' && prompt.strokes).toEqual([{ op: DrawOp.Begin, color: 12, size: 10, points: [100, 10, 105, 20, 109, 30] }]);
  });

  it('le temps écoulé remplit les pages vides, puis l’album se feuillette', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'tel', text: 'un chat' });
    vi.advanceTimersByTime((TEL_WRITE_TIME + 1) * 1000);
    expect(conns[1]!.last('telPrompt')!.prompt).toMatchObject({ kind: 'text', text: 'un chat' });
    expect(conns[2]!.last('telPrompt')!.prompt).toMatchObject({ kind: 'text', text: TEL_PROMPTS[0] });
    vi.advanceTimersByTime((room.settings.drawTime + 1) * 1000);
    vi.advanceTimersByTime((TEL_WRITE_TIME + 1) * 1000);
    expect(room.phase).toBe('album');

    const chains = conns[0]!.last('album')!.chains;
    expect(chains).toHaveLength(3);
    expect(chains[0]!.entries.map((e) => [e.kind, e.by])).toEqual([
      ['text', ids[0]],
      ['drawing', ids[1]],
      ['text', ids[2]],
    ]);

    room.handle(ids[1]!, { t: 'tel', next: true }); // seul l'hôte tourne les pages
    expect(conns[0]!.last('state')!.state.tel!.album).toEqual({ chain: 0, entry: 0 });
    for (let i = 0; i < 2; i++) room.handle(ids[0]!, { t: 'tel', next: true });
    room.handle(ids[0]!, { t: 'tel', next: true });
    expect(conns[0]!.last('state')!.state.tel!.album).toEqual({ chain: 1, entry: 0 });
    for (let i = 0; i < 6; i++) room.handle(ids[0]!, { t: 'tel', next: true });
    expect(room.phase).toBe('lobby');
  });

  it('un joueur parti ne bloque pas l’étape', () => {
    const { room, ids } = setup();
    room.handle(ids[0]!, { t: 'tel', text: 'a' });
    room.handle(ids[1]!, { t: 'tel', text: 'b' });
    room.leave(ids[2]!);
    expect(room.phase).toBe('draw');
  });

  it('modifier sa réponse la rouvre', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'tel', text: 'a' });
    expect(conns[0]!.last('state')!.state.tel!.done).toEqual([ids[0]]);
    room.handle(ids[0]!, { t: 'tel', edit: true });
    expect(conns[0]!.last('state')!.state.tel!.done).toEqual([]);
  });
});
