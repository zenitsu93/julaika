import { cleanTrack, isPlaylistId, isVideoId, type MusicTrack } from '@julaika/shared';

/**
 * Recherche de musique sur YouTube pour le lecteur.
 * La clé de l'API YouTube Data v3 (YOUTUBE_API_KEY) reste sur le serveur : le navigateur ne la voit jamais.
 * Quota gratuit : 10 000 unités par jour, une recherche en coûte 100 et une playlist 1, d'où le cache.
 */
const API = 'https://www.googleapis.com/youtube/v3';
const CACHE_MS = 6 * 3_600_000;
const CACHE_MAX = 300;
const TIMEOUT_MS = 6000;

export type MusicResult = { tracks: MusicTrack[] } | { error: 'cle' | 'introuvable' | 'youtube' | 'requete' };

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function musicSearch(key: string | undefined, fetcher: Fetch = fetch, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; out: MusicResult }>();
  const cached = async (k: string, run: () => Promise<MusicResult>): Promise<MusicResult> => {
    const hit = cache.get(k);
    if (hit && now() - hit.at < CACHE_MS) return hit.out;
    const out = await run();
    if ('tracks' in out) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(k, { at: now(), out });
    }
    return out;
  };
  const get = async (path: string, params: Record<string, string>): Promise<Record<string, unknown> | null> => {
    const qs = new URLSearchParams({ ...params, key: key! });
    try {
      const res = await fetcher(`${API}/${path}?${qs}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        console.warn(`[musique] YouTube ${path} : HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      console.warn(`[musique] YouTube ${path} :`, (e as Error).message);
      return null;
    }
  };
  /** Durées des vidéos (1 unité pour 50 vidéos) et filtre des vidéos qu'on ne peut pas intégrer. */
  const details = async (ids: string[]): Promise<Map<string, number> | null> => {
    if (!ids.length) return new Map();
    const data = await get('videos', { part: 'contentDetails,status', id: ids.join(','), maxResults: '50' });
    if (!data) return null;
    const out = new Map<string, number>();
    for (const v of (data.items as Record<string, any>[] | undefined) ?? []) {
      if (v?.status?.embeddable === false) continue;
      out.set(String(v.id), isoDuration(String(v?.contentDetails?.duration ?? '')));
    }
    return out;
  };

  return {
    enabled: Boolean(key),

    /** Recherche par titre ou artiste : 10 vidéos au plus. */
    search(q: string): Promise<MusicResult> {
      const query = q.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!query) return Promise.resolve({ error: 'requete' });
      if (!key) return Promise.resolve({ error: 'cle' });
      return cached(`s:${query.toLowerCase()}`, async () => {
        const data = await get('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '10', q: query, regionCode: 'FR', relevanceLanguage: 'fr' });
        if (!data) return { error: 'youtube' };
        const found = ((data.items as Record<string, any>[] | undefined) ?? []).map((it) => ({ id: it?.id?.videoId, ...fromSnippet(it?.snippet) }));
        const durations = await details(found.map((t) => t.id).filter(isVideoId));
        const tracks = found
          .filter((t) => isVideoId(t.id) && (!durations || durations.has(t.id)))
          .map((t) => cleanTrack({ ...t, dur: durations?.get(t.id) ?? 0 }))
          .filter((t): t is MusicTrack => t !== null);
        return { tracks };
      });
    },

    /** Les morceaux d'une playlist YouTube (50 premiers). */
    playlist(list: string): Promise<MusicResult> {
      if (!isPlaylistId(list)) return Promise.resolve({ error: 'requete' });
      if (!key) return Promise.resolve({ error: 'cle' });
      return cached(`p:${list}`, async () => {
        const data = await get('playlistItems', { part: 'snippet', playlistId: list, maxResults: '50' });
        if (!data) return { error: 'introuvable' };
        const found = ((data.items as Record<string, any>[] | undefined) ?? []).map((it) => ({
          id: it?.snippet?.resourceId?.videoId,
          ...fromSnippet(it?.snippet, it?.snippet?.videoOwnerChannelTitle),
        }));
        const durations = await details(found.map((t) => t.id).filter(isVideoId));
        const tracks = found
          .filter((t) => isVideoId(t.id) && (!durations || durations.has(t.id)))
          .map((t) => cleanTrack({ ...t, dur: durations?.get(t.id) ?? 0 }))
          .filter((t): t is MusicTrack => t !== null);
        return tracks.length ? { tracks } : { error: 'introuvable' };
      });
    },

    /** Une vidéo collée en lien. Sans clé, l'oEmbed de YouTube donne quand même le titre. */
    video(id: string): Promise<MusicResult> {
      if (!isVideoId(id)) return Promise.resolve({ error: 'requete' });
      return cached(`v:${id}`, async () => {
        if (key) {
          const data = await get('videos', { part: 'snippet,contentDetails,status', id });
          const v = (data?.items as Record<string, any>[] | undefined)?.[0];
          if (data && !v) return { error: 'introuvable' };
          if (v) {
            const track = cleanTrack({ id, ...fromSnippet(v.snippet), dur: isoDuration(String(v?.contentDetails?.duration ?? '')) });
            return track ? { tracks: [track] } : { error: 'introuvable' };
          }
        }
        try {
          const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
          const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!res.ok) return { error: 'introuvable' };
          const o = (await res.json()) as { title?: string; author_name?: string };
          const track = cleanTrack({ id, ...splitTitle(o.title ?? '', o.author_name ?? ''), dur: 0 });
          return track ? { tracks: [track] } : { error: 'introuvable' };
        } catch {
          return { error: 'youtube' };
        }
      });
    },
  };
}

function fromSnippet(snippet: Record<string, any> | undefined, owner?: string) {
  return splitTitle(decodeEntities(String(snippet?.title ?? '')), decodeEntities(String(owner ?? snippet?.channelTitle ?? '')));
}

/**
 * « Stromae - Alors on danse (Clip officiel) » devient titre « Alors on danse », artiste « Stromae ».
 * Les chaînes « … - Topic » et « …VEVO » perdent leur suffixe.
 */
export function splitTitle(raw: string, channel: string): { title: string; artist: string } {
  const artist = channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  const clean = raw
    .replace(/\s*[([](?:clip|vid[ée]o|audio|lyrics?|paroles|official|officiel|visuali[sz]er)[^)\]]*[)\]]/gi, '')
    .trim();
  const m = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1]!.trim(), title: m[2]!.trim() };
  return { title: clean || raw, artist };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Durée ISO 8601 de YouTube (PT1H2M3S) en secondes. */
export function isoDuration(s: string): number {
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, sec] = m.map((x) => Number(x ?? 0));
  return d! * 86_400 + h! * 3600 + min! * 60 + sec!;
}
