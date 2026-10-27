import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRED_PICK, FRED_REVEAL, FRED_SONGS, checkSong, fredGain, fredSingerGain, initials, maskTitle, songKey, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
  chats() {
    return this.json.filter((m): m is Extract<ServerMsg, { t: 'chat' }> => m.t === 'chat').map((m) => m.line);
  }
  state() {
    return this.last('state')!.state;
  }
}

const HUM = 60;

function setup(n = 2, rounds = 1) {
  const room = new Room('FRED', undefined, () => 0);
  room.game = 'fredonne';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.settings.rounds = rounds;
  room.settings.drawTime = HUM;
  room.settings.difficulty = 'facile';
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

const score = (room: Room, id: string) => room.players.get(id)!.score;

describe('Fredonne ! : les titres', () => {
  it('compare sans accents, ponctuation ni article', () => {
    expect(songKey('Les Champs-Élysées')).toBe('champs elysees');
    expect(songKey('L’Été indien')).toBe('ete indien');
    const song = { title: 'Libérée, délivrée', artist: 'La Reine des neiges', aka: ['Let It Go'] };
    expect(checkSong('liberee delivree', song)).toBe('correct');
    expect(checkSong('let it go !', song)).toBe('correct');
    expect(checkSong('liberee delivre', song)).toBe('close');
    expect(checkSong('frozen', song)).toBe('wrong');
    expect(checkSong('   ', song)).toBe('wrong');
  });

  it('masque le titre, puis dévoile les initiales', () => {
    expect(maskTitle('Le Sud')).toBe('_ _   _ _ _');
    expect(maskTitle('Ah ! Les crocodiles', initials('Ah ! Les crocodiles'))).toBe('A _   !   L _ _   c _ _ _ _ _ _ _ _ _');
  });

  it('chaque liste a assez de chansons, sans doublon', () => {
    for (const songs of Object.values(FRED_SONGS)) {
      expect(songs.length).toBeGreaterThanOrEqual(30);
      expect(new Set(songs.map((s) => songKey(s.title))).size).toBe(songs.length);
    }
  });

  it('points : la rapidité, un bonus aux premiers, le chanteur selon la part qui trouve', () => {
    expect(fredGain(1, 0)).toBe(500);
    expect(fredGain(0, 9)).toBe(50);
    expect(fredSingerGain(1, 2)).toBe(150);
    expect(fredSingerGain(0, 0)).toBe(0);
  });
});

describe('Fredonne ! : une partie', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('seul le chanteur voit les chansons proposées, et peut en redemander une fois', () => {
    const { room, conns, ids } = setup(2);
    expect(room.phase).toBe('pick');
    const mine = conns[0]!.state().fred!;
    expect(mine.singerId).toBe(ids[0]);
    expect(mine.choices).toHaveLength(3);
    expect(conns[1]!.state().fred!.choices).toBeNull();
    room.handle(ids[1]!, { t: 'fred', reroll: true }); // pas le chanteur
    expect(conns[0]!.state().fred!.rerolled).toBe(false);
    room.handle(ids[0]!, { t: 'fred', reroll: true });
    const next = conns[0]!.state().fred!;
    expect(next.rerolled).toBe(true);
    expect(next.choices!.map((s) => s.title)).not.toEqual(mine.choices!.map((s) => s.title));
    room.handle(ids[0]!, { t: 'fred', reroll: true }); // une seule fois
    expect(conns[0]!.state().fred!.choices).toEqual(next.choices);
  });

  it('la chanson reste secrète, les indices arrivent, la bonne réponse n’est pas diffusée', () => {
    const { room, conns, ids } = setup(3);
    const song = conns[0]!.state().fred!.choices![1]!;
    room.handle(ids[0]!, { t: 'fred', pick: 1 });
    expect(room.phase).toBe('hum');
    expect(conns[0]!.state().fred!.song).toEqual(song);
    const seen = conns[1]!.state().fred!;
    expect(seen.song).toBeNull();
    expect(seen.artist).toBeNull();
    expect(seen.mask).toBe(maskTitle(song.title));

    vi.advanceTimersByTime(HUM * 400);
    expect(conns[1]!.state().fred!.artist).toBe(song.artist);
    vi.advanceTimersByTime(HUM * 300);
    expect(conns[1]!.state().fred!.mask).toBe(maskTitle(song.title, initials(song.title)));

    room.handle(ids[1]!, { t: 'chat', text: song.title.toUpperCase() });
    expect(conns[2]!.chats().some((l) => l.text === song.title.toUpperCase())).toBe(false);
    expect(conns[2]!.chats().at(-1)!.kind).toBe('correct');
    expect(conns[1]!.state().fred!.song).toEqual(song);
    expect(conns[2]!.state().fred!.song).toBeNull();
    expect(conns[2]!.state().players.find((p) => p.id === ids[1])!.guessed).toBe(true);
    expect(score(room, ids[1]!)).toBe(fredGain(0.3, 0));

    // Celui qui a trouvé n'a plus rien à taper : rien n'est relayé.
    room.handle(ids[1]!, { t: 'chat', text: 'trop facile' });
    expect(conns.some((c) => c.chats().some((l) => l.text === 'trop facile'))).toBe(false);
  });

  it('quand tout le monde a trouvé, on révèle et le chanteur marque', () => {
    const { room, conns, ids } = setup(2, 1);
    room.handle(ids[0]!, { t: 'fred', pick: 0 });
    const song = conns[0]!.state().fred!.song!;
    room.handle(ids[1]!, { t: 'chat', text: song.aka?.[0] ?? song.title });
    expect(room.phase).toBe('reveal');
    const s = conns[1]!.state().fred!;
    expect(s.result!.song).toEqual(song);
    expect(s.result!.gains[ids[0]!]).toBe(300);
    expect(score(room, ids[0]!)).toBe(300);
    expect(score(room, ids[1]!)).toBe(fredGain(1, 0));
  });

  it('à deux, le micro passe de l’un à l’autre puis la partie se termine', () => {
    const { room, conns, ids } = setup(2, 1);
    vi.advanceTimersByTime(FRED_PICK * 1000); // choix automatique
    expect(room.phase).toBe('hum');
    vi.advanceTimersByTime(HUM * 1000);
    expect(room.phase).toBe('reveal');
    expect(conns[0]!.state().fred!.result!.gains[ids[0]!]).toBe(0);
    vi.advanceTimersByTime(FRED_REVEAL * 1000);
    expect(room.phase).toBe('pick');
    expect(conns[0]!.state().fred!.singerId).toBe(ids[1]);
    expect(conns[0]!.state().players.every((p) => !p.guessed)).toBe(true);
    vi.advanceTimersByTime((FRED_PICK + HUM + FRED_REVEAL) * 1000);
    expect(room.phase).toBe('gameEnd');
  });

  it('jamais deux fois la même chanson dans une partie', () => {
    const { room, conns, ids } = setup(2, 5);
    const sung = new Set<string>();
    for (let k = 0; k < 10; k++) {
      const singer = conns[0]!.state().fred!.singerId;
      room.handle(singer, { t: 'fred', pick: 0 });
      sung.add(conns[ids.indexOf(singer)]!.state().fred!.song!.title);
      vi.advanceTimersByTime((HUM + FRED_REVEAL) * 1000);
    }
    expect(sung.size).toBe(10);
  });

  it('si le chanteur part en plein tour, on révèle et on passe au suivant', () => {
    const { room, conns, ids } = setup(3);
    room.handle(ids[0]!, { t: 'fred', pick: 0 });
    room.leave(ids[0]!);
    expect(room.phase).toBe('reveal');
    vi.advanceTimersByTime(FRED_REVEAL * 1000);
    expect(conns[1]!.state().fred!.singerId).toBe(ids[1]);
  });
});
