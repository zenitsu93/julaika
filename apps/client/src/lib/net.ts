import { decodeDraw, isSoundId, type ClientMsg, type GameMode, type RoomGame, type RoomState, type ServerMsg } from '@julaika/shared';
import { wipeBoard } from '../motion';
import { board } from './board';
import { call } from './call';
import { mimeSnapshot } from './mime';
import { configureSounds, receive as receiveSound } from './sounds';
import { store, type GameState } from './store';

const MAX_CHAT = 120;

/** Connexion unique au serveur de jeu. */
class Net {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  connect(name: string, avatar: number, room?: string, game?: RoomGame, mode?: GameMode) {
    this.close();
    store.reset();
    store.set({ status: 'connecting' });
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.send({ t: 'join', name, avatar, room, game, mode });
      this.pingTimer = setInterval(() => this.send({ t: 'ping', at: Date.now() }), 10_000);
    };
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        const packet = decodeDraw(e.data);
        if (packet) board.apply(packet);
        return;
      }
      this.onMessage(JSON.parse(e.data) as ServerMsg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.stopPing();
      call.leave(false);
      store.set({ status: 'closed' });
    };
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(buf: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buf);
  }

  close() {
    this.stopPing();
    call.leave(false);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
        board.reset();
        call.configure({
          selfId: msg.selfId,
          ice: msg.ice,
          send: (to, data) => this.send({ t: 'rtc', to, data }),
          announce: (inCall, cam, mic) => this.send({ t: 'call', inCall, cam, mic }),
        });
        store.set({ status: 'online', selfId: msg.selfId, room: msg.state, dial: msg.state.wave?.dial ?? null, clockOffset: msg.now - Date.now(), error: null });
        history.replaceState(null, '', `/r/${msg.state.code}`);
        break;
      case 'state': {
        const phase = msg.state.phase;
        store.set((s) => ({
          room: msg.state,
          choices: phase === 'choosing' ? s.choices : null,
          turnEnd: phase === 'turnEnd' ? s.turnEnd : null,
          ranking: phase === 'gameEnd' ? s.ranking : null,
          dial: msg.state.wave?.dial ?? null,
          telPrompt: msg.state.tel ? s.telPrompt : null,
          album: phase === 'album' ? s.album : null,
          // La bombe change de main : ce que tapait l'ancien porteur disparaît.
          bombTyping: msg.state.bomb && s.bombTyping?.by === msg.state.bomb.holder ? s.bombTyping : null,
          bombEvent: msg.state.bomb ? s.bombEvent : null,
          photos: msg.state.photo && phase !== 'pose' ? s.photos : null,
          reel: msg.state.photo ? keepBest(s.reel, s.photos, msg.state) : [],
          // Les polaroids du mime restent jusqu'au lancement de la partie suivante.
          mimeShots: s.room?.phase === 'lobby' && phase !== 'lobby' ? [] : s.mimeShots,
          sketches: msg.state.flash && (phase === 'vote' || phase === 'reveal') ? s.sketches : null,
          cadPrompt: msg.state.cadavre ? s.cadPrompt : null,
          creatures: msg.state.cadavre && phase === 'reveal' ? s.creatures : null,
        }));
        call.sync(msg.state.players);
        break;
      }
      case 'chat':
        store.set((s) => ({ chat: [...s.chat.slice(-MAX_CHAT + 1), msg.line] }));
        break;
      case 'choices':
        store.set({ choices: msg.words });
        break;
      case 'turnEnd':
        store.set({ turnEnd: { word: msg.word, gains: msg.gains } });
        break;
      case 'gameEnd':
        store.set({ ranking: msg.ranking });
        break;
      case 'clear':
        wipeBoard();
        board.reset();
        break;
      case 'undo':
        board.undo();
        break;
      case 'telPrompt':
        store.set({ telPrompt: { step: msg.step, prompt: msg.prompt } });
        break;
      case 'album':
        store.set({ album: msg.chains });
        break;
      case 'bombTyping':
        store.set({ bombTyping: { by: msg.by, text: msg.text } });
        break;
      case 'bombEvent':
        store.set((s) => ({ bombEvent: { ...msg.event, seq: (s.bombEvent?.seq ?? 0) + 1 } }));
        break;
      case 'photos':
        store.set({ photos: { round: msg.round, shots: msg.shots } });
        break;
      case 'mimeSnap':
        this.send({ t: 'mimeShot', finder: msg.finder, image: mimeSnapshot() });
        break;
      case 'mimeShot':
        store.set((s) => ({ mimeShots: [...s.mimeShots, msg.shot] }));
        break;
      case 'sketches':
        store.set({ sketches: { round: msg.round, sketches: msg.sketches } });
        break;
      case 'cadPrompt':
        store.set({ cadPrompt: { step: msg.step, above: msg.above } });
        break;
      case 'creatures':
        store.set({ creatures: msg.creatures });
        break;
      case 'dial':
        store.set({ dial: msg.value });
        break;
      case 'sound':
        // Joué sauf en muet, mais la bulle s'affiche toujours.
        if (isSoundId(msg.id)) receiveSound(msg.id, msg.by);
        break;
      case 'rtc':
        void call.onSignal(msg.from, msg.data);
        break;
      case 'pong': {
        // Demi aller-retour : estimation simple et suffisante pour un compte à rebours.
        const rtt = Date.now() - msg.at;
        store.set({ clockOffset: msg.now + rtt / 2 - Date.now() });
        break;
      }
      case 'error':
        // Erreur avant d'entrer dans un salon (code inconnu, salon plein) : on revient à l'accueil.
        if (store.get().status === 'connecting') {
          this.close();
          store.set({ status: 'idle', error: msg.message });
        } else store.set({ error: msg.message });
        break;
    }
  }
}

export const net = new Net();
configureSounds((id) => net.send({ t: 'sound', id }));

/** À la révélation d'une manche du Photomaton, garde sa meilleure photo pour le final. */
function keepBest(reel: GameState['reel'], photos: GameState['photos'], state: RoomState): GameState['reel'] {
  const photo = state.photo!;
  if (state.phase !== 'reveal' || !photos || photos.round !== photo.round || reel.some((r) => r.round === photo.round)) return reel;
  const best = photos.shots
    .filter((s) => s.image && photo.stars[s.by]?.votes)
    .sort((a, b) => photo.stars[b.by]!.total - photo.stars[a.by]!.total)[0];
  return best ? [...reel, { round: photo.round, prompt: photo.prompt, shot: best }] : reel;
}
