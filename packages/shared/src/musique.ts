/** Lecteur de musique : un morceau YouTube, et la musique qu'un joueur partage avec son salon. */
export interface MusicTrack {
  /** Identifiant de la vidéo YouTube (11 caractères). */
  id: string;
  title: string;
  artist: string;
  /** Durée en secondes, quand on la connaît (0 sinon). */
  dur: number;
}

/** Musique partagée avec le salon : celui qui la met (le « DJ ») et où il en est. */
export interface RoomMusic {
  dj: string;
  track: MusicTrack;
  playing: boolean;
  /** Position (s) au moment `at` (horloge du serveur, ms). */
  pos: number;
  at: number;
}

export const MUSIC_TEXT_MAX = 120;

export function isVideoId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);
}

export function isPlaylistId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{10,64}$/.test(v);
}

/** Morceau reçu d'un client ou d'une API : identifiant valide, textes coupés, durée bornée. */
export function cleanTrack(v: unknown): MusicTrack | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  if (!isVideoId(t.id)) return null;
  const text = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, MUSIC_TEXT_MAX);
  const dur = Number(t.dur);
  return { id: t.id, title: text(t.title) || 'Sans titre', artist: text(t.artist), dur: Number.isFinite(dur) && dur > 0 ? Math.min(Math.round(dur), 86_400) : 0 };
}

/**
 * Ce qu'on colle dans la recherche : un lien de vidéo, de playlist, ou les deux.
 * youtube.com/watch?v=…&list=…, youtu.be/…, music.youtube.com, /shorts/…, /embed/….
 */
export function parseYoutubeLink(input: string): { video: string | null; list: string | null } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
  let video: string | null = url.searchParams.get('v');
  if (host === 'youtu.be') video = url.pathname.slice(1).split('/')[0] ?? null;
  const path = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
  if (path) video = path[1] ?? null;
  const list = url.searchParams.get('list');
  const out = { video: isVideoId(video) ? video : null, list: isPlaylistId(list) ? list : null };
  return out.video || out.list ? out : null;
}
