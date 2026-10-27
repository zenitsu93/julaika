import { describe, expect, it } from 'vitest';
import { cleanTrack, parseYoutubeLink, type ServerMsg } from '@julaika/shared';
import { isoDuration, musicSearch, splitTitle } from '../apps/server/src/musique';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  music() {
    return this.json.filter((m): m is Extract<ServerMsg, { t: 'music' }> => m.t === 'music').at(-1)?.music;
  }
}

const track = { id: 'dQw4w9WgXcQ', title: 'Alors on danse', artist: 'Stromae', dur: 206 };

describe('lecteur de musique', () => {
  it('reconnaît les liens YouTube', () => {
    expect(parseYoutubeLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12')).toEqual({ video: 'dQw4w9WgXcQ', list: null });
    expect(parseYoutubeLink('https://youtu.be/dQw4w9WgXcQ?si=abc')).toEqual({ video: 'dQw4w9WgXcQ', list: null });
    expect(parseYoutubeLink('https://music.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toEqual({ video: null, list: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' });
    expect(parseYoutubeLink('https://m.youtube.com/shorts/dQw4w9WgXcQ')?.video).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeLink('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYoutubeLink('Stromae')).toBeNull();
  });

  it('nettoie les morceaux reçus', () => {
    expect(cleanTrack({ id: 'trop-court', title: 'x' })).toBeNull();
    expect(cleanTrack({ id: 'dQw4w9WgXcQ', title: '  Ti​tre ', artist: 'A'.repeat(300), dur: -3 })).toEqual({ id: 'dQw4w9WgXcQ', title: 'Titre', artist: 'A'.repeat(120), dur: 0 });
  });

  it('sépare artiste et titre des vidéos', () => {
    expect(splitTitle('Stromae - Alors on danse (Clip officiel)', 'StromaeVEVO')).toEqual({ artist: 'Stromae', title: 'Alors on danse' });
    expect(splitTitle('Djadja', 'Aya Nakamura - Topic')).toEqual({ artist: 'Aya Nakamura', title: 'Djadja' });
    expect(isoDuration('PT3M26S')).toBe(206);
    expect(isoDuration('PT1H2S')).toBe(3602);
  });

  it('cherche sur YouTube avec la clé du serveur, une seule fois par requête', async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      const body = url.includes('/search?')
        ? { items: [{ id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: 'Stromae - Papaoutai', channelTitle: 'StromaeVEVO' } }, { id: { videoId: 'bloquee_123' }, snippet: { title: 'x', channelTitle: 'y' } }] }
        : { items: [{ id: 'dQw4w9WgXcQ', contentDetails: { duration: 'PT3M52S' }, status: { embeddable: true } }, { id: 'bloquee_123', contentDetails: { duration: 'PT1M' }, status: { embeddable: false } }] };
      return { ok: true, status: 200, json: async () => body };
    };
    const yt = musicSearch('CLE', fetcher);
    const out = await yt.search('stromae');
    expect(out).toEqual({ tracks: [{ id: 'dQw4w9WgXcQ', title: 'Papaoutai', artist: 'Stromae', dur: 232 }] });
    expect(calls[0]).toContain('key=CLE');
    await yt.search('  Stromae ');
    expect(calls).toHaveLength(2);
    expect(await musicSearch(undefined, fetcher).search('stromae')).toEqual({ error: 'cle' });
  });

  it('partage la musique avec le salon, et la coupe quand le DJ part', () => {
    const room = new Room('TEST', undefined, () => 0);
    const [a, b] = [new FakeConn(), new FakeConn()];
    const ida = room.join(a, 'A', 0)!;
    const idb = room.join(b, 'B', 1)!;
    room.handle(ida, { t: 'music', track, playing: true, pos: 12 });
    expect(b.music()).toMatchObject({ dj: ida, track, playing: true, pos: 12 });
    // Un retardataire reçoit la musique en arrivant.
    const c = new FakeConn();
    room.join(c, 'C', 2);
    expect(c.music()?.track.id).toBe(track.id);
    // Seul le DJ peut arrêter ; un morceau invalide est ignoré.
    room.handle(idb, { t: 'music', stop: true });
    expect(b.music()).not.toBeNull();
    room.handle(idb, { t: 'music', track: { ...track, id: 'x' }, playing: true, pos: 0 });
    expect(b.music()?.dj).toBe(ida);
    room.leave(ida);
    expect(b.music()).toBeNull();
  });
});
