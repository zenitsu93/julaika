import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawOp, encodeDraw, type ServerMsg } from '@julaika/shared';
import { CHOOSE_TIME, Room, TURN_END_TIME, type Conn } from '../apps/server/src/room';
import { MIME_FR } from '../apps/server/src/words';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  binary: Uint8Array[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
    else this.binary.push(new Uint8Array(data as ArrayBuffer));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

function setup(n = 3) {
  const room = new Room('TEST', undefined, () => 0);
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  return { room, conns, ids };
}

describe('Room', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('le premier joueur est hôte et seul lui peut lancer', () => {
    const { room, ids } = setup();
    room.handle(ids[1]!, { t: 'start' });
    expect(room.phase).toBe('lobby');
    room.handle(ids[0]!, { t: 'start' });
    expect(room.phase).toBe('choosing');
    expect(room.drawerId).toBe(ids[0]);
  });

  it('le mot est choisi automatiquement si le dessinateur ne choisit pas', () => {
    const { room, ids } = setup();
    room.handle(ids[0]!, { t: 'start' });
    vi.advanceTimersByTime(CHOOSE_TIME * 1000);
    expect(room.phase).toBe('drawing');
    expect(room.word).toBeTruthy();
  });

  it('ne dévoile pas le mot aux devineurs', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'start' });
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    expect(conns[0]!.last('state')!.state.hint).toBe(room.word);
    const hint = conns[1]!.last('state')!.state.hint!;
    expect(hint).not.toBe(room.word);
    expect(hint.replace(/[ \-]/g, '')).toMatch(/^_+$/);
  });

  it('bonne réponse : points, puis fin de tour quand tout le monde a trouvé', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'start' });
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    const word = room.word!;
    room.handle(ids[1]!, { t: 'chat', text: word.toUpperCase() });
    expect(room.players.get(ids[1]!)!.score).toBeGreaterThan(400);
    expect(room.phase).toBe('drawing');
    room.handle(ids[2]!, { t: 'chat', text: word });
    expect(room.phase).toBe('turnEnd');
    expect(conns[2]!.last('turnEnd')!.word).toBe(word);
    expect(room.players.get(ids[0]!)!.score).toBe(300);
    vi.advanceTimersByTime(TURN_END_TIME * 1000);
    expect(room.drawerId).toBe(ids[1]);
  });

  it('le chat de ceux qui ont trouvé reste privé', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'start' });
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    room.handle(ids[1]!, { t: 'chat', text: room.word! });
    const before = conns[2]!.json.length;
    room.handle(ids[1]!, { t: 'chat', text: 'trop facile' });
    expect(conns[2]!.json.length).toBe(before);
    expect(conns[0]!.last('chat')!.line.kind).toBe('guessed');
  });

  it('relaie le dessin, refuse celui des non-dessinateurs, rejoue pour les nouveaux', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'start' });
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    const pkt = new Uint8Array(encodeDraw({ op: DrawOp.Begin, color: 1, size: 4, points: [1, 2, 3, 4] }));
    room.handleDraw(ids[0]!, pkt);
    room.handleDraw(ids[1]!, pkt);
    expect(conns[1]!.binary).toHaveLength(1);
    expect(conns[0]!.binary).toHaveLength(0);
    const late = new FakeConn();
    room.join(late, 'Tard', 0);
    expect(late.binary).toHaveLength(1);
    room.handle(ids[0]!, { t: 'undo' });
    const later = new FakeConn();
    room.join(later, 'Encore', 0);
    expect(later.binary).toHaveLength(0);
  });

  it('enchaîne les manches puis termine la partie', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'settings', settings: { rounds: 1 } });
    room.handle(ids[0]!, { t: 'start' });
    for (let turn = 0; turn < 2; turn++) {
      room.handle(room.drawerId!, { t: 'choose', index: 0 });
      const guesser = ids.find((id) => id !== room.drawerId)!;
      room.handle(guesser, { t: 'chat', text: room.word! });
      vi.advanceTimersByTime(TURN_END_TIME * 1000);
    }
    expect(room.phase).toBe('gameEnd');
  });

  it('retour au salon si un joueur part et qu’il en reste un seul', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'start' });
    room.leave(ids[1]!);
    expect(room.phase).toBe('lobby');
    expect(room.hostId).toBe(ids[0]);
  });

  it('borne les réglages', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'settings', settings: { drawTime: 9999, rounds: -4 } });
    expect(room.settings.drawTime).toBe(240);
    expect(room.settings.rounds).toBe(1);
  });
});

describe('visio', () => {
  it("seul l'hôte partage un lien Meet valide, diffusé à tous", () => {
    const { room, conns, ids } = setup(2);
    room.handle(ids[1]!, { t: 'meet', url: 'https://meet.google.com/abc-defg-hij' });
    expect(room.meetUrl).toBe('');
    room.handle(ids[0]!, { t: 'meet', url: 'https://evil.com/x' });
    expect(conns[0]!.last('error')).toBeTruthy();
    room.handle(ids[0]!, { t: 'meet', url: 'meet.google.com/abc-defg-hij' });
    expect(conns[1]!.last('state')!.state.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
  });
});

describe('visio intégrée', () => {
  it('relaie la signalisation seulement entre participants', () => {
    const { room, conns, ids } = setup(3);
    const sdp = { sdp: { type: 'offer' as const, sdp: 'v=0' } };
    room.handle(ids[0]!, { t: 'call', inCall: true, cam: true, mic: true });
    room.handle(ids[0]!, { t: 'rtc', to: ids[1]!, data: sdp });
    expect(conns[1]!.last('rtc')).toBeUndefined();
    room.handle(ids[1]!, { t: 'call', inCall: true, cam: false, mic: true });
    room.handle(ids[0]!, { t: 'rtc', to: ids[1]!, data: sdp });
    expect(conns[1]!.last('rtc')).toEqual({ t: 'rtc', from: ids[0], data: sdp });
    room.handle(ids[2]!, { t: 'rtc', to: ids[1]!, data: sdp });
    expect(conns[1]!.json.filter((m) => m.t === 'rtc')).toHaveLength(1);
    const me = conns[2]!.last('state')!.state.players.find((p) => p.id === ids[1]);
    expect(me).toMatchObject({ inCall: true, cam: false, mic: true });
  });
  it('mode mime : mots à mimer, dessin refusé, même boucle de devinette', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'settings', settings: { mode: 'mime' } });
    room.handle(ids[0]!, { t: 'start' });
    expect(room.turnKind).toBe('mime');
    expect(MIME_FR.moyen).toContain(conns[0]!.last('choices')!.words[0]);
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    expect(conns[1]!.last('state')!.state.turnKind).toBe('mime');
    room.handleDraw(ids[0]!, new Uint8Array(encodeDraw({ op: DrawOp.Begin, color: 1, size: 1, points: [1, 1] })));
    expect(conns[1]!.binary).toHaveLength(0);
    room.handle(ids[1]!, { t: 'chat', text: room.word! });
    expect(room.players.get(ids[1]!)!.guessed).toBe(true);
  });

  it('le mode de jeu inconnu est ignoré et ne change qu\'au salon', () => {
    const { room, ids } = setup();
    room.handle(ids[0]!, { t: 'settings', settings: { mode: 'karaoke' as never } });
    expect(room.settings.mode).toBe('dessin');
    room.handle(ids[0]!, { t: 'settings', settings: { mode: 'mixte' } });
    expect(room.settings.mode).toBe('mixte');
  });
});
