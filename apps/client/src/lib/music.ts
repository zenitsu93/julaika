import { useSyncExternalStore } from 'react';
import { cleanTrack, type ClientMsg, type MusicTrack, type RoomMusic } from '@julaika/shared';
import { serverNow, store as game } from './store';
import { YT_STATE, createYoutubePlayer, type YtPlayer } from './youtube';

/**
 * Lecteur de musique : une playlist à soi, jouée en boucle par un lecteur YouTube qui reste monté
 * d'une page à l'autre. Dans un salon, on peut la partager : tout le salon bascule alors sur le
 * même morceau, à la même seconde (le serveur ne relaie que le morceau, l'état et la position), et
 * reste dessus tant que le partage dure.
 */
export type MusicView = 'now' | 'search' | 'queue';

export interface MusicState {
  queue: MusicTrack[];
  index: number;
  playing: boolean;
  /** Position et durée du morceau entendu (le sien, ou celui du salon quand on l'écoute). */
  pos: number;
  dur: number;
  shuffle: boolean;
  open: boolean;
  view: MusicView;
  /** Le lecteur YouTube se charge ou le morceau démarre. */
  loading: boolean;
  /** Petit message passager (vidéo illisible, partage arrêté…), numéroté pour rejouer son animation. */
  notice: { text: string; seq: number } | null;
  /** Je partage ma musique avec le salon. */
  sharing: boolean;
  /** J'écoute la musique que partage quelqu'un d'autre (automatique tant qu'il partage). */
  listening: boolean;
  /** Le navigateur a coupé le son ou refusé la lecture : un toucher n'importe où le libère. */
  blocked: boolean;
  room: RoomMusic | null;
}

const KEY = 'julaika.musique';

function restore(): Partial<MusicState> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<MusicState> | null;
    if (!raw) return {};
    const queue = (Array.isArray(raw.queue) ? raw.queue : []).map(cleanTrack).filter((t): t is MusicTrack => t !== null).slice(0, 200);
    const index = Number(raw.index);
    return {
      queue,
      index: Number.isInteger(index) && index >= 0 && index < queue.length ? index : 0,
      pos: Math.max(0, Number(raw.pos) || 0),
      dur: queue[index]?.dur ?? 0,
      shuffle: raw.shuffle === true,
      open: raw.open === true,
    };
  } catch {
    return {};
  }
}

let state: MusicState = {
  queue: [],
  index: 0,
  playing: false,
  pos: 0,
  dur: 0,
  shuffle: false,
  open: false,
  view: 'now',
  loading: false,
  notice: null,
  sharing: false,
  listening: false,
  blocked: false,
  room: null,
  ...restore(),
};
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function set(patch: Partial<MusicState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
  if (!saveTimer) saveTimer = setTimeout(save, 800);
}

function save() {
  saveTimer = null;
  try {
    const { queue, index, pos, shuffle, open } = state;
    localStorage.setItem(KEY, JSON.stringify({ queue, index, pos: Math.floor(pos), shuffle, open }));
  } catch {
    /* stockage plein ou bloqué : la playlist vit le temps de l'onglet */
  }
}

export function useMusic<T>(select: (s: MusicState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

/** Le morceau qu'on entend : celui du salon quand on l'écoute, sinon le sien. */
export function heard(s: MusicState = state): MusicTrack | null {
  if (s.listening && s.room) return s.room.track;
  return s.queue[s.index] ?? null;
}

// ---- Le lecteur YouTube ----------------------------------------------------------------------

let host: HTMLElement | null = null;
let player: YtPlayer | null = null;
let creating: Promise<YtPlayer | null> | null = null;
let loadedId: string | null = null;
let noticeSeq = 0;
/** En écoutant le salon, j'ai mis en pause chez moi : les changements du DJ ne relancent pas le son. */
let held = false;
let sendToRoom: (msg: ClientMsg) => void = () => {};

/** Le net branche ici l'envoi au salon (évite une dépendance circulaire). */
export function configureMusic(send: (msg: ClientMsg) => void) {
  sendToRoom = send;
}

function notify(text: string) {
  set({ notice: { text, seq: ++noticeSeq } });
}

function ensurePlayer(): Promise<YtPlayer | null> {
  if (player) return Promise.resolve(player);
  if (creating) return creating;
  if (!host) return Promise.resolve(null);
  set({ loading: true });
  creating = createYoutubePlayer(host, { onState, onError })
    .then((p) => (player = p))
    .catch(() => {
      creating = null;
      set({ loading: false, playing: false });
      notify('YouTube ne répond pas, vérifie ta connexion.');
      return null;
    });
  return creating;
}

/** Le composant du lecteur donne la boîte où vit le cadre YouTube. */
export function attachHost(el: HTMLElement | null) {
  host = el;
}

/** Charge YouTube en avance quand on approche du lecteur : le premier clic part tout de suite. */
export function warm() {
  if (state.queue.length || state.room) void ensurePlayer();
}

function onState(s: number) {
  const p = player;
  if (!p) return;
  if (s === YT_STATE.playing) {
    set({ playing: true, loading: false, dur: p.getDuration() || state.dur });
    // Lancée sans geste (message du salon), la vidéo part souvent… en muet.
    if (p.isMuted()) block();
    else if (state.blocked) set({ blocked: false });
  } else if (s === YT_STATE.paused) {
    set({ playing: false, loading: false });
    // Pause qu'on n'a pas demandée alors que le DJ joue : le navigateur a refusé la lecture.
    if (state.listening && state.room?.playing && !held) block();
  } else if (s === YT_STATE.buffering) set({ loading: true });
  else if (s === YT_STATE.ended) {
    if (state.listening) return set({ playing: false });
    next(true);
  }
  if (state.sharing && (s === YT_STATE.playing || s === YT_STATE.paused)) shareSoon();
}

function onError(code: number) {
  const t = heard();
  set({ loading: false });
  // 101 et 150 : l'auteur interdit la lecture hors de YouTube ; 100 : vidéo supprimée.
  const why = code === 101 || code === 150 ? 'ne peut pas être lu hors de YouTube' : 'est introuvable';
  notify(`« ${t?.title ?? 'Ce morceau'} » ${why}.`);
  if (state.listening) return;
  if (state.queue.length > 1) next(true);
  else set({ playing: false });
}

// Position : relevée deux fois par seconde pendant la lecture.
setInterval(() => {
  if (!player || !state.playing) return;
  const pos = player.getCurrentTime();
  if (Number.isFinite(pos) && Math.abs(pos - state.pos) > 0.2) set({ pos });
}, 500);

// ---- Son bloqué par le navigateur -----------------------------------------------------------------
// Sans geste de l'utilisateur, les navigateurs (Safari surtout) refusent de lancer le son : YouTube
// joue alors en muet, ou ne démarre pas. On le repère, et le premier toucher sur la page le libère.

let startCheck: ReturnType<typeof setTimeout> | null = null;

/** Vérifie que la lecture a vraiment démarré quelques secondes après l'avoir demandée. */
function checkStarted() {
  if (startCheck) clearTimeout(startCheck);
  startCheck = setTimeout(() => {
    startCheck = null;
    const st = player?.getPlayerState();
    if (state.playing && st !== YT_STATE.playing && st !== YT_STATE.buffering) block();
  }, 3000);
}

function block() {
  if (state.blocked) return;
  set({ blocked: true });
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

/** Appelé pendant un geste : rend le son et relance la lecture là où elle doit être. */
export function unlock() {
  document.removeEventListener('pointerdown', unlock, true);
  document.removeEventListener('keydown', unlock, true);
  if (!state.blocked) return;
  set({ blocked: false });
  const p = player;
  if (!p) return;
  unmute(p);
  if (state.listening && state.room) {
    held = false;
    follow(state.room, true);
  } else if (state.playing) p.playVideo();
}

function unmute(p: YtPlayer) {
  p.unMute();
  p.setVolume(100);
}

async function load(track: MusicTrack, start: number, play: boolean) {
  set({ playing: play, pos: start, dur: track.dur, loading: play });
  const p = await ensurePlayer();
  if (!p) return;
  if (play) checkStarted();
  if (loadedId !== track.id) {
    loadedId = track.id;
    if (play) p.loadVideoById({ videoId: track.id, startSeconds: start });
    else p.cueVideoById({ videoId: track.id, startSeconds: start });
  } else {
    if (Math.abs(p.getCurrentTime() - start) > 1) p.seekTo(start, true);
    if (play) p.playVideo();
    else p.pauseVideo();
  }
}

// ---- Commandes ---------------------------------------------------------------------------------

export const music = {
  setOpen(open: boolean) {
    // Rien à écouter : l'île s'ouvre directement sur la recherche.
    set(open && !heard() && state.view === 'now' ? { open, view: 'search' } : { open });
  },
  setView(view: MusicView) {
    set({ view, open: true });
  },

  play() {
    if (player) unmute(player);
    if (state.listening && state.room) {
      held = false;
      return follow(state.room, true);
    }
    const t = heard();
    if (t) void load(t, state.pos, true);
  },
  pause() {
    // En écoutant le salon, on coupe chez soi seulement ; « lecture » recale sur le DJ.
    if (state.listening) held = true;
    player?.pauseVideo();
    set({ playing: false, loading: false });
    if (state.sharing) shareSoon();
  },
  toggle() {
    if (state.playing) music.pause();
    else music.play();
  },
  next: () => next(false),
  prev() {
    if (state.listening) return;
    if (state.pos > 3 || state.queue.length < 2) return music.seek(0);
    goTo((state.index - 1 + state.queue.length) % state.queue.length, state.playing);
  },
  seek(pos: number) {
    if (state.listening) return;
    const t = heard();
    if (!t) return;
    const to = Math.max(0, Math.min(pos, (state.dur || t.dur || pos) - 0.5));
    set({ pos: to });
    if (player && loadedId === t.id) player.seekTo(to, true);
    if (state.sharing) shareSoon();
  },
  playAt(i: number) {
    if (state.listening && state.room) return notify(`${nameOf(state.room.dj)} a la main sur la musique du salon.`);
    if (state.queue[i]) goTo(i, true);
  },
  toggleShuffle() {
    set({ shuffle: !state.shuffle });
  },

  /** Ajoute à la playlist (sans doublon). Renvoie le nombre de morceaux vraiment ajoutés. */
  add(tracks: MusicTrack[]): number {
    const have = new Set(state.queue.map((t) => t.id));
    const fresh = tracks.filter((t) => !have.has(t.id) && have.add(t.id));
    if (!fresh.length) return 0;
    const wasEmpty = state.queue.length === 0;
    set({ queue: [...state.queue, ...fresh].slice(0, 200) });
    if (wasEmpty) set({ index: 0, pos: 0, dur: fresh[0]!.dur });
    return fresh.length;
  },
  remove(i: number) {
    const queue = state.queue.filter((_, k) => k !== i);
    if (i === state.index) {
      const index = Math.min(i, Math.max(0, queue.length - 1));
      set({ queue, index, pos: 0 });
      const t = queue[index];
      if (t && !state.listening) void load(t, 0, state.playing);
      else if (!t) {
        player?.pauseVideo();
        set({ playing: false, dur: 0 });
      }
    } else set({ queue, index: i < state.index ? state.index - 1 : state.index });
  },
  /** Déplace un morceau pour qu'il passe juste après celui en cours. */
  playNext(i: number) {
    if (i === state.index) return;
    const queue = [...state.queue];
    const [t] = queue.splice(i, 1);
    const cur = i < state.index ? state.index - 1 : state.index;
    queue.splice(cur + 1, 0, t!);
    set({ queue, index: cur });
  },
  clear() {
    player?.pauseVideo();
    set({ queue: [], index: 0, pos: 0, dur: 0, playing: false });
  },

  // ---- Avec le salon ----
  share(on: boolean) {
    if (on) {
      if (!heard() || state.listening) return;
      set({ sharing: true, listening: false });
      shareNow();
    } else {
      set({ sharing: false });
      sendToRoom({ t: 'music', stop: true });
    }
  },
};

function next(auto: boolean) {
  if (state.listening) return;
  const n = state.queue.length;
  if (!n) return;
  const index = state.shuffle && n > 1 ? (state.index + 1 + Math.floor(Math.random() * (n - 1))) % n : (state.index + 1) % n;
  goTo(index, auto || state.playing);
}

function goTo(index: number, play: boolean) {
  const t = state.queue[index];
  if (!t) return;
  set({ index });
  void load(t, 0, play);
  if (state.sharing) shareSoon();
}

// ---- Partage avec le salon -------------------------------------------------------------------

let shareTimer: ReturnType<typeof setTimeout> | null = null;

function shareNow() {
  shareTimer = null;
  const t = heard();
  if (!state.sharing || !t) return;
  const pos = player && loadedId === t.id ? player.getCurrentTime() : state.pos;
  sendToRoom({ t: 'music', track: t, playing: state.playing, pos });
}

/** Regroupe les changements rapprochés (morceau suivant puis lecture) en un seul envoi. */
function shareSoon() {
  if (!shareTimer) shareTimer = setTimeout(shareNow, 250);
}

function follow(m: RoomMusic, play = !held) {
  const elapsed = m.playing ? Math.max(0, (serverNow() - m.at) / 1000) : 0;
  void load(m.track, m.pos + elapsed, play && m.playing);
}

function stopListening(pause: boolean) {
  held = false;
  set({ listening: false, blocked: false });
  if (pause) {
    player?.pauseVideo();
    set({ playing: false, loading: false });
  }
  const own = state.queue[state.index];
  set({ dur: own?.dur ?? 0, pos: 0 });
}

/** Message du serveur : quelqu'un partage, change de morceau, met en pause, ou arrête. */
export function receiveRoomMusic(m: RoomMusic | null) {
  const self = game.get().selfId;
  const before = state.room;
  set({ room: m });
  if (!m) {
    if (state.listening) {
      stopListening(true);
      notify('Le partage de musique est terminé.');
    }
    set({ sharing: false });
    return;
  }
  if (m.dj === self) return;
  // Quelqu'un partage : tout le salon bascule sur sa musique, au même endroit, jusqu'à la fin du
  // partage. Sa propre playlist attend (elle reprend quand le partage s'arrête).
  const fresh = before?.dj !== m.dj || !state.listening;
  if (fresh) held = false;
  if (state.sharing) {
    set({ sharing: false });
    notify(`${nameOf(m.dj)} partage sa musique à son tour.`);
  } else if (fresh) notify(`${nameOf(m.dj)} partage sa musique : tu l'écoutes avec le salon.`);
  if (!state.listening) set({ listening: true, view: 'now' });
  follow(m);
}

export function nameOf(id: string): string {
  return game.get().room?.players.find((p) => p.id === id)?.name ?? 'Un joueur';
}

// En quittant le salon, le partage s'arrête ; sa propre musique continue.
game.subscribe(() => {
  if (game.get().status === 'online' || (!state.room && !state.sharing && !state.listening)) return;
  if (state.listening) stopListening(true);
  set({ room: null, sharing: false });
});
