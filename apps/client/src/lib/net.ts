import { decodeDraw, isArcadeFrame, isSoundId, type ClientMsg, type GameMode, type RoomGame, type RoomState, type ServerMsg } from '@julaika/shared';
import { wipeBoard } from '../motion';
import { arcadeFrames, emitArcadeEvents } from './arcade';
import { board } from './board';
import { call } from './call';
import { mimeSnapshot } from './mime';
import { configureMusic, receiveRoomMusic } from './music';
import { inkLayers, resetInk } from './cerveau';
import { configureSounds, receive as receiveSound } from './sounds';
import { store, type GameState } from './store';

const MAX_CHAT = 120;
const SEAT_KEY = 'julaika:seat';
/** Une place est gardée 10 minutes au plus par le serveur : au-delà, le jeton ne sert plus à rien. */
const SEAT_TTL = 10 * 60_000;
/** Fermeture envoyée par le serveur quand la même place est reprise ailleurs (autre onglet). */
const SEAT_TAKEN = 4001;
/** Au retour au premier plan, un socket qui ne répond plus en 3 s est tenu pour mort. */
const WAKE_TIMEOUT = 3000;

interface Seat {
  room: string;
  seat: string;
  at: number;
}

/** Place gardée dans ce salon (localStorage : elle survit au rechargement de l'onglet par le téléphone). */
export function savedSeat(room: string): Seat | null {
  try {
    const seat = JSON.parse(localStorage.getItem(SEAT_KEY) ?? 'null') as Seat | null;
    return seat && seat.room === room && Date.now() - seat.at < SEAT_TTL ? seat : null;
  } catch {
    return null;
  }
}

function keepSeat(seat: Seat | null) {
  try {
    if (seat) localStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else localStorage.removeItem(SEAT_KEY);
  } catch {}
}

/** Connexion unique au serveur de jeu. */
class Net {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private lastPong = 0;
  /** De quoi revenir à sa place : pseudo, avatar, salon et jeton. */
  private me: { name: string; avatar: number; room: string; seat: string } | null = null;

  constructor() {
    // Retour sur l'onglet (après WhatsApp, l'écran verrouillé…) ou retour du réseau : on reprend tout de suite.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.wake());
    addEventListener('online', () => this.wake());
    addEventListener('pageshow', (e) => (e as PageTransitionEvent).persisted && this.wake());
  }

  connect(name: string, avatar: number, room?: string, game?: RoomGame, mode?: GameMode) {
    const seat = room ? savedSeat(room)?.seat : undefined;
    this.close();
    store.reset();
    store.set({ status: 'connecting' });
    this.open({ t: 'join', name, avatar, room, game, mode, seat });
  }

  /** Reprend la place gardée après une coupure, sans effacer le chat ni l'écran. */
  reconnect() {
    if (!this.me || store.get().status !== 'reconnecting') return;
    this.clearRetry();
    const { name, avatar, room, seat } = this.me;
    this.open({ t: 'join', name, avatar, room, seat });
  }

  /** Bouton « Réessayer » du bandeau : on repart de zéro, sans attendre le prochain essai. */
  retryNow() {
    this.retries = 0;
    this.reconnect();
  }

  private open(join: Extract<ClientMsg, { t: 'join' }>) {
    this.detach();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.send(join);
      this.lastPong = Date.now();
      this.pingTimer = setInterval(() => this.send({ t: 'ping', at: Date.now() }), 10_000);
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      if (e.data instanceof ArrayBuffer) {
        if (isArcadeFrame(e.data)) return arcadeFrames.push(e.data);
        const packet = decodeDraw(e.data);
        // Octet 3 : calque du Cerveau coupé (0 = tableau commun).
        const layer = inkLayers[new Uint8Array(e.data)[3]! - 1];
        if (packet) (layer ?? board).apply(packet);
        return;
      }
      this.onMessage(JSON.parse(e.data) as ServerMsg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.stopPing();
      call.leave(false);
      this.ws = null;
      const { status } = store.get();
      if (e.code === SEAT_TAKEN) {
        this.me = null;
        keepSeat(null);
        store.set({ status: 'closed', error: 'Ta place a été reprise dans un autre onglet.' });
      } else if (this.me && (status === 'online' || status === 'reconnecting')) {
        store.set({ status: 'reconnecting' });
        this.retryLater();
      } else store.set({ status: 'closed' });
    };
  }

  /** Nouvel essai de plus en plus espacé (1 s, 2 s, 4 s… 15 s), jusqu'à la fin du délai de grâce. */
  private retryLater() {
    this.clearRetry();
    const seat = this.me && savedSeat(this.me.room);
    if (!seat) return this.giveUp();
    // Onglet caché : le téléphone couperait de toute façon ; on attend le retour au premier plan.
    if (document.visibilityState === 'hidden') return;
    const delay = Math.min(15_000, 1000 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => this.reconnect(), delay);
  }

  private giveUp() {
    this.me = null;
    keepSeat(null);
    store.set({ status: 'closed', error: 'Le salon a fermé pendant ton absence.' });
  }

  /** Retour au premier plan : reconnexion immédiate, ou vérification que le socket vit encore. */
  private wake() {
    const { status } = store.get();
    if (status === 'reconnecting') {
      this.retries = 0;
      return this.reconnect();
    }
    const ws = this.ws;
    if (status !== 'online' || !ws) return;
    // Après un long sommeil, le socket peut sembler ouvert alors que le serveur l'a déjà fermé.
    const asked = Date.now();
    this.send({ t: 'ping', at: asked });
    setTimeout(() => {
      if (this.ws === ws && this.lastPong < asked) {
        this.detach();
        call.leave(false);
        store.set({ status: 'reconnecting' });
        this.reconnect();
      }
    }, WAKE_TIMEOUT);
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(buf: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(buf);
  }

  /** Fermeture voulue (on quitte, on change de salon) : la place est rendue tout de suite. */
  close() {
    this.send({ t: 'leave' });
    this.me = null;
    keepSeat(null);
    this.clearRetry();
    call.leave(false);
    this.detach();
  }

  /** Lâche le socket courant sans déclencher de reconnexion. */
  private detach() {
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Départ volontaire : on ferme sans passer par « connexion perdue » et on rend l'adresse d'accueil. */
  leave() {
    this.close();
    store.reset();
    history.replaceState(null, '', '/');
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        const self = msg.state.players.find((p) => p.id === msg.selfId);
        this.me = { name: self?.name ?? '', avatar: self?.avatar ?? 0, room: msg.state.code, seat: msg.seat };
        this.retries = 0;
        keepSeat({ room: msg.state.code, seat: msg.seat, at: Date.now() });
        board.reset();
        arcadeFrames.reset();
        resetInk();
        call.configure({
          selfId: msg.selfId,
          ice: msg.ice,
          send: (to, data) => this.send({ t: 'rtc', to, data }),
          announce: (inCall, cam, mic) => this.send({ t: 'call', inCall, cam, mic }),
        });
        store.set({ status: 'online', selfId: msg.selfId, room: msg.state, dial: msg.state.wave?.dial ?? null, clockOffset: msg.now - Date.now(), error: null });
        history.replaceState(null, '', `/r/${msg.state.code}`);
        break;
      }
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
          storyTyping: msg.state.motamot && s.storyTyping?.by === msg.state.motamot.turn ? s.storyTyping : null,
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
        resetInk();
        break;
      case 'undo':
        board.undo();
        break;
      case 'cerveauInk': {
        const layer = inkLayers[msg.layer];
        if (msg.op === 'undo') layer?.undo();
        else layer?.reset();
        break;
      }
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
      case 'storyTyping':
        store.set({ storyTyping: { by: msg.by, text: msg.text } });
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
      case 'arcadeEv':
        emitArcadeEvents(msg.ev);
        break;
      case 'dial':
        store.set({ dial: msg.value });
        break;
      case 'sound':
        // Joué sauf en muet, mais la bulle s'affiche toujours.
        if (isSoundId(msg.id)) receiveSound(msg.id, msg.by);
        break;
      case 'music':
        receiveRoomMusic(msg.music);
        break;
      case 'rtc':
        void call.onSignal(msg.from, msg.data);
        break;
      case 'pong': {
        // Demi aller-retour : estimation simple et suffisante pour un compte à rebours.
        this.lastPong = Date.now();
        // Le délai de grâce part de la coupure : la place reste valable 10 min après le dernier signe de vie.
        if (this.me) keepSeat({ room: this.me.room, seat: this.me.seat, at: this.lastPong });
        const rtt = Date.now() - msg.at;
        store.set({ clockOffset: msg.now + rtt / 2 - Date.now() });
        break;
      }
      case 'error':
        // Erreur avant d'entrer dans un salon (code inconnu, salon plein) : on revient à l'accueil.
        if (store.get().status === 'connecting') {
          this.close();
          store.set({ status: 'idle', error: msg.message });
        } else if (store.get().status === 'reconnecting') {
          this.detach();
          // Le salon n'existe plus (tout le monde est parti) : inutile d'insister. Sinon (trop d'essais), on réessaie.
          if (/introuvable/i.test(msg.message)) this.giveUp();
          else this.retryLater();
        } else store.set({ error: msg.message });
        break;
    }
  }
}

export const net = new Net();
configureSounds((id) => net.send({ t: 'sound', id }));
configureMusic((msg) => net.send(msg));

/** À la révélation d'une manche du Photomaton, garde sa meilleure photo pour le final. */
function keepBest(reel: GameState['reel'], photos: GameState['photos'], state: RoomState): GameState['reel'] {
  const photo = state.photo!;
  if (state.phase !== 'reveal' || !photos || photos.round !== photo.round || reel.some((r) => r.round === photo.round)) return reel;
  const best = photos.shots
    .filter((s) => s.image && photo.stars[s.by]?.votes)
    .sort((a, b) => photo.stars[b.by]!.total - photo.stars[a.by]!.total)[0];
  return best ? [...reel, { round: photo.round, prompt: photo.prompt, shot: best }] : reel;
}
