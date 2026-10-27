import { decodeDraw, type ClientMsg, type RoomGame, type ServerMsg } from '@julaika/shared';
import { wipeBoard } from '../motion';
import { board } from './board';
import { call } from './call';
import { store } from './store';

const MAX_CHAT = 120;

/** Connexion unique au serveur de jeu. */
class Net {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  connect(name: string, avatar: number, room?: string, game?: RoomGame) {
    this.close();
    store.reset();
    store.set({ status: 'connecting' });
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.send({ t: 'join', name, avatar, room, game });
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
      case 'dial':
        store.set({ dial: msg.value });
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
