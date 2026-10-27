import { useSyncExternalStore } from 'react';
import type { IceServer, PlayerPublic, RtcSignal } from '@julaika/shared';

/**
 * Visio intégrée : maillage WebRTC pair à pair, signalisation via le WebSocket du jeu.
 *
 * Pour éviter les offres croisées, seul le joueur à l'identifiant le plus petit initie la
 * connexion ; il crée d'emblée un transceiver audio et un vidéo en `sendrecv`. Activer ou couper
 * la caméra remplace juste la piste (`replaceTrack`), sans renégociation.
 */

type Send = (to: string, data: RtcSignal) => void;
type Kind = 'audio' | 'video';

interface Peer {
  pc: RTCPeerConnection;
  stream: MediaStream;
  initiator: boolean;
  pending: RTCIceCandidateInit[];
}

const VIDEO: MediaTrackConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { max: 15 } };
/** Pendant son mime, on est affiché en grand : image plus fine et plus fluide, débit relevé. */
const VIDEO_MIME: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } };
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
/** Plafond par flux vidéo sortant : 8 personnes × 250 kb/s restent sous 2 Mb/s montants. */
const VIDEO_BITRATE = 250_000;
/** Un seul mimeur à la fois : 7 × 600 kb/s, le temps d'un tour. */
const VIDEO_BITRATE_MIME = 600_000;

export interface CallView {
  joined: boolean;
  cam: boolean;
  mic: boolean;
  /** Micro coupé d'office pendant son tour de mime. */
  hushed: boolean;
  local: MediaStream | null;
  remotes: Record<string, MediaStream>;
  error: string | null;
}

class Call {
  private peers = new Map<string, Peer>();
  private tracks: Partial<Record<Kind, MediaStreamTrack>> = {};
  private ice: IceServer[] = [];
  private selfId: string | null = null;
  private send: Send = () => {};
  private announce: (inCall: boolean, cam: boolean, mic: boolean) => void = () => {};
  private listeners = new Set<() => void>();
  /** Tour de mime en cours : micro coupé (pas le droit de parler) et vidéo en haute qualité. */
  private miming = false;
  private view: CallView = { joined: false, cam: false, mic: false, hushed: false, local: null, remotes: {}, error: null };

  configure(opts: { selfId: string; ice: IceServer[]; send: Send; announce: Call['announce'] }) {
    this.leave(false);
    this.miming = false;
    this.selfId = opts.selfId;
    this.ice = opts.ice;
    this.send = opts.send;
    this.announce = opts.announce;
  }

  // ---- Actions de l'utilisateur ----------------------------------------------

  async join(cam: boolean, mic: boolean) {
    this.update({ joined: true, error: null });
    await Promise.all([cam && this.enable('video'), mic && this.enable('audio')]);
    this.publish();
  }

  leave(notify = true) {
    for (const id of [...this.peers.keys()]) this.drop(id);
    for (const t of Object.values(this.tracks)) t?.stop();
    this.tracks = {};
    const was = this.view.joined;
    this.update({ joined: false, cam: false, mic: false, hushed: false, local: null, remotes: {} });
    if (notify && was) this.announce(false, false, false);
  }

  async toggle(kind: Kind) {
    if (kind === 'audio' && this.miming) return;
    if (this.tracks[kind]) this.disable(kind);
    else await this.enable(kind);
    this.publish();
  }

  /** Début ou fin de son tour de mime. Le micro reste ouvert côté navigateur, sa piste est juste muette. */
  setMiming(on: boolean) {
    if (this.miming === on) return;
    this.miming = on;
    if (this.tracks.audio) this.tracks.audio.enabled = !on;
    void this.tracks.video?.applyConstraints(on ? VIDEO_MIME : VIDEO).catch(() => {});
    for (const { pc } of this.peers.values()) void this.capBitrate(pc);
    this.publish();
  }

  // ---- Synchronisation avec l'état du salon ----------------------------------

  /** Ouvre une connexion vers chaque participant, ferme celles des absents. */
  sync(players: PlayerPublic[]) {
    if (!this.view.joined || !this.selfId) return;
    const present = new Set(players.filter((p) => p.inCall && p.id !== this.selfId).map((p) => p.id));
    for (const id of this.peers.keys()) if (!present.has(id)) this.drop(id);
    for (const id of present) if (!this.peers.has(id) && this.selfId < id) void this.offer(this.peer(id, true));
  }

  async onSignal(from: string, data: RtcSignal) {
    if (!this.view.joined) return;
    if ('sdp' in data) {
      const peer = this.peers.get(from) ?? this.peer(from, false);
      const { pc } = peer;
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        // Côté répondant : les transceivers viennent de l'offre, on y branche nos pistes.
        for (const t of pc.getTransceivers()) {
          t.direction = 'sendrecv';
          await t.sender.replaceTrack(this.tracks[t.receiver.track.kind as Kind] ?? null);
        }
        await pc.setLocalDescription(await pc.createAnswer());
        this.send(from, { sdp: pc.localDescription!.toJSON() as { type: 'answer'; sdp: string } });
      }
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if ('candidate' in data) {
      const peer = this.peers.get(from);
      if (!peer) return;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pending.push(data.candidate);
    }
  }

  // ---- Connexions ------------------------------------------------------------

  private peer(id: string, initiator: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice as RTCIceServer[] });
    const peer: Peer = { pc, stream: new MediaStream(), initiator, pending: [] };
    this.peers.set(id, peer);

    if (initiator) {
      for (const kind of ['audio', 'video'] as const) {
        pc.addTransceiver(this.tracks[kind] ?? kind, { direction: 'sendrecv' });
      }
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send(id, { candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } });
    };
    pc.ontrack = (e) => {
      peer.stream.addTrack(e.track);
      this.update({ remotes: { ...this.view.remotes, [id]: peer.stream } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') void this.capBitrate(pc);
      // Réseau qui change (wifi → 4G) : l'initiateur relance la recherche de chemin.
      if (pc.connectionState === 'failed' && peer.initiator) {
        pc.restartIce();
        void this.offer(peer);
      }
    };
    return peer;
  }

  private async offer(peer: Peer) {
    const to = [...this.peers].find(([, p]) => p === peer)?.[0];
    if (!to) return;
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    this.send(to, { sdp: peer.pc.localDescription!.toJSON() as { type: 'offer'; sdp: string } });
  }

  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.close();
    this.peers.delete(id);
    const { [id]: _, ...rest } = this.view.remotes;
    this.update({ remotes: rest });
  }

  private async capBitrate(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) continue;
      params.encodings[0]!.maxBitrate = this.miming ? VIDEO_BITRATE_MIME : VIDEO_BITRATE;
      await sender.setParameters(params).catch(() => {});
    }
  }

  // ---- Pistes locales --------------------------------------------------------

  private async enable(kind: Kind) {
    try {
      const media = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: this.miming ? VIDEO_MIME : VIDEO } : { audio: AUDIO });
      const track = media.getTracks()[0]!;
      if (kind === 'audio' && this.miming) track.enabled = false;
      this.tracks[kind] = track;
      await this.replace(kind, track);
    } catch {
      this.update({ error: kind === 'video' ? "Caméra indisponible ou refusée par le navigateur." : "Micro indisponible ou refusé par le navigateur." });
    }
  }

  private disable(kind: Kind) {
    this.tracks[kind]?.stop(); // coupe aussi le voyant de la caméra
    delete this.tracks[kind];
    void this.replace(kind, null);
  }

  private async replace(kind: Kind, track: MediaStreamTrack | null) {
    for (const { pc } of this.peers.values()) {
      for (const t of pc.getTransceivers()) {
        if (t.receiver.track.kind === kind) await t.sender.replaceTrack(track).catch(() => {});
      }
      if (track) void this.capBitrate(pc);
    }
  }

  private publish() {
    const cam = Boolean(this.tracks.video);
    const mic = Boolean(this.tracks.audio?.enabled);
    const local = cam ? new MediaStream([this.tracks.video!]) : null;
    this.update({ cam, mic, local, hushed: this.miming && Boolean(this.tracks.audio) });
    if (this.view.joined) this.announce(true, cam, mic);
  }

  // ---- Abonnement React ------------------------------------------------------

  private update(patch: Partial<CallView>) {
    this.view = { ...this.view, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  snapshot = () => this.view;
}

export const call = new Call();

export function useCall(): CallView {
  return useSyncExternalStore(call.subscribe, call.snapshot);
}
