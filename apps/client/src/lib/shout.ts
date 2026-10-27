import { useSyncExternalStore } from 'react';

/**
 * Niveau du micro pour le Bras de fer : on ouvre un flux audio à part (sans contrôle de gain
 * automatique, qui écraserait les cris), un analyseur Web Audio le lit à chaque image et
 * calcule le volume en décibels. Rien ne part sur le réseau à part « je crie / je ne crie plus ».
 */

/** Volume ramené de -50 dB (silence) à -5 dB (cri) sur 0..1. */
const FLOOR_DB = -50;
const CEIL_DB = -5;
/** Seuil du cri sur cette échelle, et la retenue avant de retomber (pas de clignotement entre deux syllabes). */
export const SHOUT_THRESHOLD = 0.58;
const HOLD_MS = 280;

export interface ShoutView {
  on: boolean;
  loud: boolean;
  error: string | null;
}

class Shout {
  private view: ShoutView = { on: false, loud: false, error: null };
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private loudAt = 0;
  private listeners = new Set<() => void>();
  private levels = new Set<(level: number) => void>();
  level = 0;

  async start() {
    if (this.stream) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      this.update({ error: 'Micro refusé : autorise-le dans ton navigateur pour doubler ta force.' });
      return;
    }
    this.ctx ??= new AudioContext();
    void this.ctx.resume().catch(() => {});
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.3;
    const source = this.ctx.createMediaStreamSource(this.stream);
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const loop = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const db = 10 * Math.log10(sum / data.length + 1e-12);
      const target = Math.max(0, Math.min(1, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)));
      // Monte vite, redescend doucement : l'aiguille du vumètre reste lisible.
      this.level = target > this.level ? target : this.level * 0.9 + target * 0.1;
      const now = performance.now();
      if (target >= SHOUT_THRESHOLD) this.loudAt = now;
      const loud = now - this.loudAt < HOLD_MS;
      if (loud !== this.view.loud) this.update({ loud });
      for (const l of this.levels) l(this.level);
      this.raf = requestAnimationFrame(loop);
    };
    this.update({ on: true, error: null });
    loop();
    this.stream.getAudioTracks()[0]?.addEventListener('ended', () => this.stop());
    this.stopSource = () => source.disconnect();
  }

  private stopSource = () => {};

  stop() {
    cancelAnimationFrame(this.raf);
    this.stopSource();
    this.stopSource = () => {};
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.level = 0;
    for (const l of this.levels) l(0);
    this.update({ on: false, loud: false });
  }

  get = () => this.view;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  /** Niveau à chaque image, pour écrire directement dans le DOM sans re-rendu. */
  onLevel(l: (level: number) => void) {
    this.levels.add(l);
    l(this.level);
    return () => void this.levels.delete(l);
  }

  private update(patch: Partial<ShoutView>) {
    this.view = { ...this.view, ...patch };
    for (const l of this.listeners) l();
  }
}

export const shout = new Shout();

export const useShout = () => useSyncExternalStore(shout.subscribe, shout.get);
