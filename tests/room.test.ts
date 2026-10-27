import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawOp, encodeDraw, type ServerMsg } from '@julaika/shared';
import { CHOOSE_TIME, GAME_GRACE, LOBBY_GRACE, Room, TURN_END_TIME, type Conn } from '../apps/server/src/room';
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

  it('retire les caractères invisibles des pseudos et du chat', () => {
    const room = new Room('TEST', undefined, () => 0);
    const conn = new FakeConn();
    const id = room.join(conn, 'Ju\u202Elaïka\u200B', 0)!;
    expect(room.players.get(id)!.name).toBe('Julaïka');
    expect(room.players.get(room.join(new FakeConn(), '\u200B\u200B', 0)!)!.name).toMatch(/^Artiste\d+$/);
    room.handle(id, { t: 'chat', text: '\u200B\u2066' });
    expect(conn.json.filter((m) => m.t === 'chat' && m.line.kind === 'msg')).toHaveLength(0);
    room.handle(id, { t: 'chat', text: '👩‍❤️‍👨' });
    expect(conn.last('chat')!.line.text).toBe('👩‍❤️‍👨');
  });

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

describe('manches piégées', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aucun piège par défaut, réglage borné aux valeurs connues', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'settings', settings: { traps: 'souvent' as never } });
    expect(room.settings.traps).toBe('jamais');
    room.handle(ids[0]!, { t: 'start' });
    expect(conns[1]!.last('state')!.state.trap).toBeNull();
  });

  it('« toujours » : un piège annoncé à tous dès le choix du mot, jamais deux fois le même', () => {
    const { room, conns, ids } = setup(2);
    room.handle(ids[0]!, { t: 'settings', settings: { traps: 'toujours', rounds: 2 } });
    room.handle(ids[0]!, { t: 'start' });
    const first = conns[1]!.last('state')!.state.trap!;
    expect(first.kind).toBeTruthy();
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    room.handle(ids[1]!, { t: 'chat', text: room.word! });
    expect(room.phase).toBe('turnEnd');
    vi.advanceTimersByTime(TURN_END_TIME * 1000);
    expect(room.trap!.kind).not.toBe(first.kind);
  });

  it('« une seule couleur » : le serveur impose la couleur, sauf pour la gomme', () => {
    const { room, conns, ids } = setup(2);
    room.handle(ids[0]!, { t: 'start' });
    room.trap = { kind: 'mono', color: 7 };
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    room.handleDraw(ids[0]!, new Uint8Array(encodeDraw({ op: DrawOp.Begin, color: 2, size: 10, points: [1, 1] })));
    room.handleDraw(ids[0]!, new Uint8Array(encodeDraw({ op: DrawOp.Begin, color: 0, size: 10, points: [2, 2] })));
    expect(conns[1]!.binary.map((b) => b[1])).toEqual([7, 0]);
  });

  it('le piège disparaît au retour au salon', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'settings', settings: { traps: 'toujours' } });
    room.handle(ids[0]!, { t: 'start' });
    expect(room.trap).not.toBeNull();
    room.leave(ids[1]!);
    expect(room.trap).toBeNull();
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

describe('mime enrichi', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const IMG = `data:image/jpeg;base64,${'A'.repeat(40)}`;

  function mimeTurn(drawTime = 80) {
    const s = setup();
    s.room.handle(s.ids[0]!, { t: 'settings', settings: { mode: 'mime', drawTime, traps: 'toujours' } });
    s.room.handle(s.ids[0]!, { t: 'start' });
    s.room.handle(s.ids[0]!, { t: 'choose', index: 0 });
    return s;
  }

  it('pas de manche piégée pendant un mime', () => {
    const { room } = mimeTurn();
    expect(room.trap).toBeNull();
  });

  it('une consigne surprise toutes les 20 s, jamais deux fois la même, pas en fin de tour', () => {
    const { room, conns } = mimeTurn(60);
    expect(conns[1]!.last('state')!.state.twist).toBeNull();
    vi.advanceTimersByTime(20_000);
    const first = conns[1]!.last('state')!.state.twist!;
    expect(first.n).toBe(1);
    vi.advanceTimersByTime(20_000);
    const second = conns[1]!.last('state')!.state.twist!;
    expect(second.n).toBe(2);
    expect(second.text).not.toBe(first.text);
    // 60 s de tour : rien à 60 s (marge de fin), le tour se termine.
    vi.advanceTimersByTime(20_000);
    expect(room.phase).toBe('turnEnd');
    expect(room.twist?.n).toBe(2);
    vi.advanceTimersByTime(TURN_END_TIME * 1000);
    expect(room.twist).toBeNull();
  });

  it("consignes coupées par l'hôte : aucune", () => {
    const { room, ids } = setup();
    room.handle(ids[0]!, { t: 'settings', settings: { mode: 'mime', twists: false } });
    room.handle(ids[0]!, { t: 'start' });
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    vi.advanceTimersByTime(60_000);
    expect(room.twist).toBeNull();
  });

  it('une trouvaille demande un polaroid au mimeur, diffusé une seule fois à tous', () => {
    const { room, conns, ids } = mimeTurn();
    room.handle(ids[1]!, { t: 'chat', text: room.word! });
    expect(conns[0]!.last('mimeSnap')).toEqual({ t: 'mimeSnap', finder: ids[1] });
    expect(conns[1]!.last('mimeSnap')).toBeUndefined();
    // Seul le mimeur peut répondre, avec une vraie image.
    room.handle(ids[2]!, { t: 'mimeShot', finder: ids[1]!, image: IMG });
    room.handle(ids[0]!, { t: 'mimeShot', finder: ids[1]!, image: 'javascript:alert(1)' });
    expect(conns[2]!.last('mimeShot')).toBeUndefined();
    room.handle(ids[0]!, { t: 'mimeShot', finder: ids[1]!, image: IMG });
    const shot = conns[2]!.last('mimeShot')!.shot;
    expect(shot).toMatchObject({ id: 1, round: 1, word: room.word, mimerId: ids[0], finderId: ids[1], finderName: 'J1', image: IMG });
    room.handle(ids[0]!, { t: 'mimeShot', finder: ids[1]!, image: IMG });
    expect(conns[2]!.json.filter((m) => m.t === 'mimeShot')).toHaveLength(1);
  });

  it('le dernier à trouver a aussi son polaroid, même après la fin du tour', () => {
    const { room, conns, ids } = mimeTurn();
    const word = room.word!;
    room.handle(ids[1]!, { t: 'chat', text: word });
    room.handle(ids[2]!, { t: 'chat', text: word });
    expect(room.phase).toBe('turnEnd');
    room.handle(ids[0]!, { t: 'mimeShot', finder: ids[2]!, image: null });
    expect(conns[1]!.last('mimeShot')!.shot).toMatchObject({ finderId: ids[2], image: null, word });
  });

  it('pas de polaroid en mode dessin', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'start' });
    room.handle(ids[0]!, { t: 'choose', index: 0 });
    room.handle(ids[1]!, { t: 'chat', text: room.word! });
    expect(conns[0]!.last('mimeSnap')).toBeUndefined();
    room.handle(ids[0]!, { t: 'mimeShot', finder: ids[1]!, image: IMG });
    expect(conns[1]!.last('mimeShot')).toBeUndefined();
  });
});

describe('Room : place gardée après une coupure', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const seatOf = (conn: FakeConn) => conn.last('welcome')!.seat;

  it("l'hôte seul qui passe sur WhatsApp garde son salon et sa place", () => {
    const onEmpty = vi.fn();
    const room = new Room('TEST', onEmpty, () => 0);
    const conn = new FakeConn();
    const id = room.join(conn, 'Christian', 0)!;
    room.disconnect(id, conn);
    vi.advanceTimersByTime((LOBBY_GRACE - 1) * 1000);
    expect(onEmpty).not.toHaveBeenCalled();
    expect(room.publicPlayers()[0]!.connected).toBe(false);

    const back = new FakeConn();
    expect(room.resume(seatOf(conn), back)).toBe(id);
    expect(back.last('welcome')!.selfId).toBe(id);
    expect(back.last('welcome')!.state.players[0]).toMatchObject({ isHost: true, connected: true });
    vi.advanceTimersByTime(LOBBY_GRACE * 1000);
    expect(onEmpty).not.toHaveBeenCalled();
  });

  it('un ami rejoint pendant que l\'hôte est absent, et l\'hôte reste hôte', () => {
    const room = new Room('TEST', undefined, () => 0);
    const host = new FakeConn();
    const hostId = room.join(host, 'Hôte', 0)!;
    room.disconnect(hostId, host);
    const friend = new FakeConn();
    room.join(friend, 'Julaïka', 1);
    expect(friend.last('welcome')!.state.players.find((p) => p.id === hostId)).toMatchObject({ isHost: true, connected: false });
    room.resume(seatOf(host), new FakeConn());
    expect(friend.last('state')!.state.players.find((p) => p.id === hostId)!.connected).toBe(true);
    expect(friend.json.some((m) => m.t === 'chat' && m.line.text.includes('est de retour'))).toBe(true);
  });

  it('la place se libère à la fin du délai de grâce, et le salon vide disparaît', () => {
    const onEmpty = vi.fn();
    const room = new Room('TEST', onEmpty, () => 0);
    const conn = new FakeConn();
    const id = room.join(conn, 'A', 0)!;
    room.disconnect(id, conn);
    vi.advanceTimersByTime(LOBBY_GRACE * 1000);
    expect(room.players.size).toBe(0);
    expect(onEmpty).toHaveBeenCalledOnce();
    expect(room.resume(seatOf(conn), new FakeConn())).toBeNull();
  });

  it("en partie, le délai est plus court et l'hôte passe à un joueur présent", () => {
    const { room, conns, ids } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    room.disconnect(ids[0]!, conns[0]!);
    vi.advanceTimersByTime(GAME_GRACE * 1000);
    expect(room.players.has(ids[0]!)).toBe(false);
    expect(room.hostId).toBe(ids[1]);
  });

  it('quitter rend la place tout de suite', () => {
    const { room, ids, conns } = setup(2);
    room.leave(ids[1]!);
    expect(room.players.has(ids[1]!)).toBe(false);
    expect(room.resume(seatOf(conns[1]!), new FakeConn())).toBeNull();
  });

  it("une connexion remplacée est coupée et sa fermeture n'efface pas la nouvelle", () => {
    const { room, conns, ids } = setup(2);
    const old = conns[1]!;
    const close = vi.fn();
    (old as FakeConn & { close?: () => void }).close = close;
    const fresh = new FakeConn();
    room.resume(seatOf(old), fresh);
    expect(close).toHaveBeenCalledOnce();
    room.disconnect(ids[1]!, old);
    expect(room.publicPlayers().find((p) => p.id === ids[1])!.connected).toBe(true);
  });

  it('un jeton inconnu ne reprend rien', () => {
    const { room } = setup(2);
    expect(room.resume('x'.repeat(22), new FakeConn())).toBeNull();
  });
});

describe('Room : reprise en plein Téléphone dessiné', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('le joueur qui revient retrouve sa consigne', () => {
    const room = new Room('TEST', undefined, () => 0);
    room.game = 'telephone';
    const conns = [new FakeConn(), new FakeConn(), new FakeConn()];
    const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
    room.handle(ids[0]!, { t: 'start' });
    const seat = conns[1]!.last('welcome')!.seat;
    room.disconnect(ids[1]!, conns[1]!);
    const back = new FakeConn();
    room.resume(seat, back);
    expect(back.last('telPrompt')).toMatchObject({ step: 0, prompt: null });
    expect(back.last('welcome')!.state.tel).not.toBeNull();
  });
});

describe('Room : changer de jeu sans quitter le salon', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("l'hôte change de jeu au salon : mêmes joueurs, même code, visio et musique gardées", () => {
    const { room, conns, ids } = setup(3);
    room.handle(ids[0]!, { t: 'meet', url: 'https://meet.google.com/abc-defg-hij' });
    room.handle(ids[1]!, { t: 'call', inCall: true, cam: true, mic: true });
    room.handle(ids[1]!, { t: 'music', track: { id: 'dQw4w9WgXcQ', title: 'Chanson', artist: 'Artiste', dur: 200 }, playing: true, pos: 12 });
    const music = conns[2]!.last('music')!.music;
    expect(music?.dj).toBe(ids[1]);
    room.handle(ids[0]!, { t: 'game', game: 'bombe' });
    const state = conns[2]!.last('state')!.state;
    expect(state).toMatchObject({ code: 'TEST', game: 'bombe', phase: 'lobby', meetUrl: 'https://meet.google.com/abc-defg-hij' });
    expect(state.players.map((p) => p.id)).toEqual(ids);
    expect(state.players.find((p) => p.id === ids[1])!.inCall).toBe(true);
    expect(conns[2]!.last('music')!.music).toEqual(music);
    expect(conns[2]!.json.some((m) => m.t === 'chat' && m.line.text.includes('Bombe à mots'))).toBe(true);
    room.handle(ids[0]!, { t: 'start' });
    expect(room.phase).toBe('bomb');
  });

  it('seul l’hôte change de jeu, et un jeu inconnu est ignoré', () => {
    const { room, ids } = setup(2);
    room.handle(ids[1]!, { t: 'game', game: 'quiz' });
    expect(room.game).toBe('dessin');
    room.handle(ids[0]!, { t: 'game', game: 'tetris' as never });
    expect(room.game).toBe('dessin');
  });

  it('la carte Mime règle le Dessin en mime', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'game', game: 'quiz' });
    room.handle(ids[0]!, { t: 'game', game: 'dessin', mode: 'mime' });
    expect(room.game).toBe('dessin');
    expect(room.settings.mode).toBe('mime');
  });

  it('en pleine partie, changer de jeu arrête la partie et ramène tout le monde au salon', () => {
    const { room, conns, ids } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    expect(room.phase).toBe('choosing');
    room.handle(ids[0]!, { t: 'game', game: 'petitbac' });
    expect(room.phase).toBe('lobby');
    expect(room.game).toBe('petitbac');
    expect(room.drawerId).toBeNull();
    expect(conns[1]!.json.some((m) => m.t === 'chat' && m.line.text.includes('a arrêté la partie'))).toBe(true);
    // Le minuteur du tour arrêté ne relance rien.
    vi.advanceTimersByTime(CHOOSE_TIME * 1000 * 2);
    expect(room.phase).toBe('lobby');
  });

  it('sur le podium, rechoisir le même jeu revient au salon sans attendre', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'game', game: 'connait' });
    room.handle(ids[0]!, { t: 'start' });
    expect(room.phase).not.toBe('lobby');
    room.handle(ids[0]!, { t: 'game', game: 'connait' });
    expect(room.phase).toBe('lobby');
    expect(room.game).toBe('connait');
  });

  it('les places gardées survivent au changement de jeu', () => {
    const { room, conns, ids } = setup(2);
    room.disconnect(ids[1]!, conns[1]!);
    room.handle(ids[0]!, { t: 'game', game: 'wavelength' });
    const back = new FakeConn();
    expect(room.resume(conns[1]!.last('welcome')!.seat, back)).toBe(ids[1]);
    expect(back.last('welcome')!.state.game).toBe('wavelength');
  });
});
