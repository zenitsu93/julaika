import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wavePoints, waveVerdict, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';
import { REVEAL_TIME } from '../apps/server/src/wavelength';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  state() {
    return (this.json.filter((m) => m.t === 'state').at(-1) as Extract<ServerMsg, { t: 'state' }>).state;
  }
}

function setup(n = 2) {
  const room = new Room('WAVE', undefined, () => 0.5);
  room.game = 'wavelength';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = 1;
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

describe('Wavelength', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('compte les points selon la distance à la cible', () => {
    expect(wavePoints(50, 52)).toBe(4);
    expect(wavePoints(50, 60)).toBe(3);
    expect(wavePoints(50, 33)).toBe(2);
    expect(wavePoints(50, 80)).toBe(0);
    expect(waveVerdict(8, 2).title).toBe('Âmes sœurs');
  });

  it('seul le télépathe voit la cible avant la révélation', () => {
    const { room, conns, ids } = setup();
    expect(room.phase).toBe('clue');
    const psychic = conns[0]!.state().wave!;
    expect(psychic.psychicId).toBe(ids[0]);
    expect(psychic.target).toBeTypeOf('number');
    expect(conns[1]!.state().wave!.target).toBeNull();
  });

  it('indice, aiguille partagée, validation puis score d’équipe', () => {
    const { room, conns, ids } = setup();
    const target = conns[0]!.state().wave!.target!;
    room.handle(ids[1]!, { t: 'wave', dial: 10 }); // pas encore d'indice : ignoré
    room.handle(ids[0]!, { t: 'wave', clue: '  Une glace au soleil  ' });
    expect(room.phase).toBe('guess');
    expect(conns[1]!.state().wave!.clue).toBe('Une glace au soleil');

    room.handle(ids[0]!, { t: 'wave', dial: 0 }); // le télépathe ne touche pas l'aiguille
    room.handle(ids[1]!, { t: 'wave', dial: target + 1 });
    expect(conns[0]!.json.at(-1)).toEqual({ t: 'dial', value: target + 1, by: ids[1] });

    room.handle(ids[1]!, { t: 'wave', lock: true });
    expect(room.phase).toBe('reveal');
    const wave = conns[1]!.state().wave!;
    expect(wave.target).toBe(target);
    expect(wave.points).toBe(4);
    expect(wave.score).toBe(4);
  });

  it('les rôles tournent, puis la partie se termine', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'wave', clue: 'a' });
    room.handle(ids[1]!, { t: 'wave', lock: true });
    vi.advanceTimersByTime(REVEAL_TIME * 1000);
    expect(conns[0]!.state().wave!.psychicId).toBe(ids[1]);
    expect(conns[0]!.state().wave!.turn).toBe(2);
    room.handle(ids[1]!, { t: 'wave', clue: 'b' });
    vi.advanceTimersByTime(room.settings.drawTime * 1000); // temps écoulé : l'aiguille est validée
    expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(REVEAL_TIME * 1000);
    expect(room.phase).toBe('gameEnd');
    expect(conns[0]!.state().wave!.history).toHaveLength(2);
  });

  it('changer de carte une seule fois par tour', () => {
    const { conns, room, ids } = setup();
    const first = conns[0]!.state().wave!.spectrum;
    room.handle(ids[0]!, { t: 'wave', reroll: true });
    const after = conns[0]!.state().wave!;
    expect(after.spectrum).not.toEqual(first);
    expect(after.canReroll).toBe(false);
  });
});
