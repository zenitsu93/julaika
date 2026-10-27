// Côté client des jeux d'action : les images du monde reçues du serveur, rejouées avec un
// léger retard pour interpoler entre deux, les événements (but, coup…) et les touches.

import { ARCADE_DELAY_MS, ARCADE_HZ, ARCADE_SEND_EVERY, Key, decodeFrame, type ArcadeEvent } from '@julaika/shared';

/** Écart entre deux images du serveur (ms). */
const PERIOD = (1000 * ARCADE_SEND_EVERY) / ARCADE_HZ;

interface Frame {
  t: number;
  v: Float32Array;
}

/**
 * Les dernières images, datées sur l'horloge du serveur (numéro d'image × période) recalée
 * sur la nôtre : on garde le plus petit décalage vu, ce qui efface les retards du réseau.
 */
class Frames {
  private list: Frame[] = [];
  private lastSeq = -1;
  private wraps = 0;
  private offset: number | null = null;

  push(data: ArrayBuffer) {
    const f = decodeFrame(data);
    if (!f) return;
    if (this.lastSeq >= 0 && f.seq < this.lastSeq - 30000) this.wraps++;
    this.lastSeq = f.seq;
    const serverT = (this.wraps * 65536 + f.seq) * PERIOD;
    const base = performance.now() - serverT;
    // Après une pause (face-à-face, but), le serveur n'envoyait rien : on recale.
    if (this.offset === null || base - this.offset > 250) this.offset = base;
    else this.offset = Math.min(this.offset + 0.05, base);
    this.list.push({ t: serverT, v: f.values });
    if (this.list.length > 40) this.list.splice(0, this.list.length - 40);
  }

  /** Les deux images qui encadrent l'instant à afficher, et la part de l'une dans l'autre. */
  sample(): { a: Float32Array; b: Float32Array; k: number } | null {
    const list = this.list;
    if (!list.length || this.offset === null) return null;
    const t = performance.now() - this.offset - ARCADE_DELAY_MS;
    const last = list[list.length - 1]!;
    if (t >= last.t || list.length === 1) return { a: last.v, b: last.v, k: 0 };
    for (let i = list.length - 2; i >= 0; i--) {
      const a = list[i]!;
      if (a.t <= t) {
        const b = list[i + 1]!;
        return { a: a.v, b: b.v, k: (t - a.t) / (b.t - a.t || 1) };
      }
    }
    return { a: list[0]!.v, b: list[0]!.v, k: 0 };
  }

  reset() {
    this.list = [];
    this.lastSeq = -1;
    this.wraps = 0;
    this.offset = null;
  }
}

export const arcadeFrames = new Frames();

/** Mélange deux images valeur par valeur (même longueur) ; sinon, la plus récente. */
export function mix(s: { a: Float32Array; b: Float32Array; k: number }): Float32Array {
  const { a, b, k } = s;
  if (a === b || a.length !== b.length || k <= 0) return k <= 0 ? a : b;
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = a[i]! + (b[i]! - a[i]!) * k;
  return out;
}

const eventListeners = new Set<(ev: ArcadeEvent[]) => void>();

export function onArcadeEvents(fn: (ev: ArcadeEvent[]) => void) {
  eventListeners.add(fn);
  return () => void eventListeners.delete(fn);
}

export function emitArcadeEvents(ev: ArcadeEvent[]) {
  for (const l of eventListeners) l(ev);
}

// ---- Touches -------------------------------------------------------------------------------

/** Touches physiques (e.code) : ZQSD en AZERTY et WASD en QWERTY tombent au même endroit. */
const CODES: Record<string, number> = {
  ArrowLeft: Key.Left,
  KeyA: Key.Left,
  ArrowRight: Key.Right,
  KeyD: Key.Right,
  ArrowUp: Key.Up,
  KeyW: Key.Up,
  Space: Key.Action,
  KeyX: Key.Action,
  KeyJ: Key.Action,
  KeyC: Key.Super,
  KeyK: Key.Super,
  ShiftLeft: Key.Super,
  ShiftRight: Key.Super,
};

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Les touches du joueur : clavier et boutons tactiles s'additionnent. `mirror` inverse gauche et
 * droite pour celui qui joue côté droit (son écran est retourné pour qu'il attaque vers la droite).
 */
export function startArcadeInput(send: (k: number) => void, mirror: boolean): { press: (bit: number, down: boolean) => void; stop: () => void } {
  let keyboard = 0;
  let touch = 0;
  let sent = -1;
  const flush = () => {
    let k = keyboard | touch;
    if (mirror) {
      const l = k & Key.Left;
      const r = k & Key.Right;
      k = (k & ~(Key.Left | Key.Right)) | (l ? Key.Right : 0) | (r ? Key.Left : 0);
    }
    if (k !== sent) send((sent = k));
  };
  const down = (e: KeyboardEvent) => {
    const bit = CODES[e.code];
    if (!bit || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    keyboard |= bit;
    flush();
  };
  const up = (e: KeyboardEvent) => {
    const bit = CODES[e.code];
    if (!bit) return;
    keyboard &= ~bit;
    flush();
  };
  const release = () => {
    keyboard = 0;
    touch = 0;
    flush();
  };
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', release);
  return {
    press(bit, isDown) {
      touch = isDown ? touch | bit : touch & ~bit;
      flush();
    },
    stop() {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', release);
      if (sent > 0) send(0);
    },
  };
}
