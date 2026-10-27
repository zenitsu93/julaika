import { useSyncExternalStore } from 'react';
import type { IceServer, PlayerPublic, RtcSignal, WarpId } from '@julaika/shared';
import { createWarp, type Warp } from './warp';

/**
 * Visio intégrée : maillage WebRTC pair à pair, signalisation via le WebSocket du jeu.
 *
 * Pour éviter les offres croisées, seul le joueur à l'identifiant le plus petit initie la
 * connexion ; il crée d'emblée un transceiver audio et un vidéo en `sendrecv`. Activer ou couper
 * la caméra remplace juste la piste (`replaceTrack`), sans renégociation.
 *
 * Une déformation (`setWarp`) intercale un canvas entre la caméra et l'envoi : la piste vidéo
 * envoyée et affichée en local est alors celle du canvas (voir `outVideo`).
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
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
/** Plafond par flux vidéo sortant : 8 personnes × 250 kb/s restent sous 2 Mb/s montants. */
const VIDEO_BITRATE = 250_000;

export interface CallView {
  joined: boolean;
  cam: boolean;
  mic: boolean;
  local: MediaStream | null;
  /** Déformation choisie, appliquée dès que la caméra est allumée. */
  warp: WarpId | null;
  remotes: Record<string, MediaStream>;
  error: string | null;
}

class Call {
  private peers = new Map<string, Peer>();
  private tracks: Partial<Record<Kind, MediaStreamTrack>> = {};
  /** Déformation en cours et la piste caméra qu'elle lit. */
  private warper: { warp: Warp; source: MediaStreamTrack } | null = null;
  private ice: IceServer[] = [];
  private selfId: string | null = null;
  private send: Send = () => {};
  private announce: (inCall: boolean, cam: boolean, mic: boolean) => void = () => {};
  private listeners = new Set<() => void>();
  private view: CallView = { joined: false, cam: false, mic: false, local: null, warp: null, remotes: {}, error: null };

  configure(opts: { selfId: string; ice: IceServer[]; send: Send; announce: Call['announce'] }) {
    this.leave(false);
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
    this.warper?.warp.stop();
    this.warper = null;
    for (const t of Object.values(this.tracks)) t?.stop();
    this.tracks = {};
    const was = this.view.joined;
    this.update({ joined: false, cam: false, mic: false, local: null, warp: null, remotes: {} });
    if (notify && was) this.announce(false, false, false);
  }

  async toggle(kind: Kind) {
    if (this.tracks[kind]) this.disable(kind);
    else await this.enable(kind);
    this.publish();
  }

  /** Choisit (ou retire, avec null) la déformation de sa caméra, chez soi comme chez les autres. */
  async setWarp(effect: WarpId | null) {
    if (effect && typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      this.update({ error: 'Déformations non prises en charge par ce navigateur.' });
      return;
    }
    this.update({ warp: effect });
    await this.syncWarp();
    if (this.tracks.video) this.publish();
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
          await t.sender.replaceTrack(this.out(t.receiver.track.kind as Kind));
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
        pc.addTransceiver(this.out(kind) ?? kind, { direction: 'sendrecv' });
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
      params.encodings[0]!.maxBitrate = VIDEO_BITRATE;
      await sender.setParameters(params).catch(() => {});
    }
  }

  // ---- Pistes locales --------------------------------------------------------

  private async enable(kind: Kind) {
    try {
      const media = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { video: VIDEO } : { audio: AUDIO });
      const track = media.getTracks()[0]!;
      this.tracks[kind] = track;
      if (kind === 'video') await this.syncWarp();
      else await this.replace(kind);
    } catch {
      this.update({ error: kind === 'video' ? "Caméra indisponible ou refusée par le navigateur." : "Micro indisponible ou refusé par le navigateur." });
    }
  }

  private disable(kind: Kind) {
    this.tracks[kind]?.stop(); // coupe aussi le voyant de la caméra
    delete this.tracks[kind];
    if (kind === 'video') void this.syncWarp();
    else void this.replace(kind);
  }

  /** Piste vidéo envoyée : la déformée si un effet est actif sur la caméra, sinon la brute. */
  private outVideo(): MediaStreamTrack | null {
    const cam = this.tracks.video ?? null;
    return cam && this.warper?.source === cam ? this.warper.warp.track : cam;
  }

  private out(kind: Kind): MediaStreamTrack | null {
    return kind === 'video' ? this.outVideo() : (this.tracks.audio ?? null);
  }

  /** Aligne le canvas de déformation sur l'effet choisi et la caméra, puis met à jour l'envoi. */
  private async syncWarp() {
    const effect = this.view.warp;
    const cam = this.tracks.video;
    const old = this.warper;
    if (effect && cam && old?.source === cam) {
      old.warp.set(effect);
      return;
    }
    this.warper = null;
    if (effect && cam) {
      try {
        this.warper = { warp: createWarp(cam, effect), source: cam };
      } catch {
        this.update({ warp: null, error: 'Déformations non prises en charge par ce navigateur.' });
      }
    }
    await this.replace('video');
    // Arrêtée seulement une fois remplacée chez les pairs.
    old?.warp.stop();
  }

  private async replace(kind: Kind) {
    const track = this.out(kind);
    for (const { pc } of this.peers.values()) {
      for (const t of pc.getTransceivers()) {
        if (t.receiver.track.kind === kind) await t.sender.replaceTrack(track).catch(() => {});
      }
      if (track) void this.capBitrate(pc);
    }
  }

  private publish() {
    const cam = Boolean(this.tracks.video);
    const mic = Boolean(this.tracks.audio);
    const local = cam ? new MediaStream([this.outVideo()!]) : null;
    this.update({ cam, mic, local });
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
