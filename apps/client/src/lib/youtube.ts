/** Le lecteur YouTube intégré (IFrame Player API), chargé seulement quand on touche au lecteur. */

export interface YtPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  isMuted(): boolean;
  unMute(): void;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: { onReady: () => void; onStateChange: (e: { data: number }) => void; onError: (e: { data: number }) => void };
    },
  ) => YtPlayer;
}

/** États renvoyés par le lecteur. */
export const YT_STATE = { ended: 0, playing: 1, paused: 2, buffering: 3, cued: 5 } as const;

let api: Promise<YtNamespace> | null = null;

function loadApi(): Promise<YtNamespace> {
  if (api) return api;
  api = new Promise<YtNamespace>((resolve, reject) => {
    const w = window as unknown as { YT?: YtNamespace; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve(w.YT);
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      resolve(w.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      script.remove();
      api = null;
      reject(new Error('YouTube injoignable'));
    };
    document.head.appendChild(script);
  });
  return api;
}

/** Crée le lecteur dans `host`. Le cadre n'est jamais déplacé ensuite : le déplacer le rechargerait. */
export async function createYoutubePlayer(
  host: HTMLElement,
  events: { onState: (state: number) => void; onError: (code: number) => void },
): Promise<YtPlayer> {
  const YT = await loadApi();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    host.replaceChildren(el);
    const player = new YT.Player(el, {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, iv_load_policy: 3, disablekb: 1, origin: location.origin },
      events: {
        onReady: () => resolve(player),
        onStateChange: (e) => events.onState(e.data),
        onError: (e) => events.onError(e.data),
      },
    });
  });
}

/** Miniature d'une vidéo (320 × 180). */
export const thumbOf = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
