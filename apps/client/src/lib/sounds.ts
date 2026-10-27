import { useSyncExternalStore } from 'react';
import type { SoundId } from '@julaika/shared';
import { store } from './store';

/**
 * Boîte à sons : tout est synthétisé en Web Audio, aucun fichier à charger. Seul l'identifiant
 * du bruitage circule sur le réseau ; chacun le recrée chez lui.
 *
 * Un seul AudioContext, créé au premier geste (les navigateurs refusent le son avant). Chaque
 * bruitage vit dans sa propre « voix » (un GainNode branché sur le bus maître) : toutes ses
 * sources ont un arrêt programmé, et la voix est débranchée une fois le son fini, ce qui libère
 * tout le sous-graphe. Le bus maître passe par un compresseur pour ne jamais saturer quand
 * plusieurs joueurs mitraillent en même temps.
 */

/** Libellés courts et emojis des pads et des bulles. */
export const SOUND_INFO: Record<SoundId, { label: string; emoji: string }> = {
  klaxon: { label: 'Klaxon', emoji: '📯' },
  rires: { label: 'Rires', emoji: '🤣' },
  criquets: { label: 'Criquets', emoji: '🦗' },
  tictac: { label: 'Tic-tac', emoji: '⏱️' },
  boum: { label: 'Boum', emoji: '💥' },
  pouet: { label: 'Pouet', emoji: '🎺' },
  badum: { label: 'Ba-dum-tss', emoji: '🥁' },
  trombone: { label: 'Trombone triste', emoji: '😢' },
  boing: { label: 'Boing', emoji: '🪀' },
  bravo: { label: 'Bravo', emoji: '👏' },
  ding: { label: 'Ding', emoji: '🔔' },
  sifflet: { label: 'Sifflet', emoji: '😙' },
};

const VOLUME = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Contexte audio, créé à la demande et relancé s'il a été suspendu (onglet en veille, iOS…). */
function audio(): AudioContext | null {
  if (!ctx) {
    const AC = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = isMuted ? 0 : VOLUME;
    master.connect(comp).connect(ctx.destination);
    // Deux secondes de bruit blanc, partagées par tous les bruitages (lues en boucle, départ au hasard).
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

// Déverrouillage au premier geste : ensuite, les sons reçus peuvent jouer sans clic préalable.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

// ---- Briques de synthèse ---------------------------------------------------------------

interface Voice {
  c: AudioContext;
  out: GainNode;
}

function tone(v: Voice, type: OscillatorType, f: number, t0: number, t1: number): OscillatorNode {
  const o = v.c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.start(t0);
  o.stop(t1);
  return o;
}

function noise(v: Voice, t0: number, t1: number): AudioBufferSourceNode {
  const n = v.c.createBufferSource();
  n.buffer = noiseBuf;
  n.loop = true;
  n.start(t0, Math.random() * 1.5);
  n.stop(t1);
  return n;
}

function filter(v: Voice, type: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
  const b = v.c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** Enveloppe : montée, maintien puis chute exponentielle (vers 0,0001 : une rampe exponentielle ne peut atteindre 0). */
function env(v: Voice, peak: number, t0: number, attack: number, hold: number, release: number): GainNode {
  const g = v.c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  return g;
}

/** Vibrato : un LFO branché sur un paramètre, profondeur constante ou qui évolue. */
function lfo(v: Voice, rate: number, depth: number, t0: number, t1: number, ...targets: AudioParam[]): GainNode {
  const o = tone(v, 'sine', rate, t0, t1);
  const d = v.c.createGain();
  d.gain.setValueAtTime(depth, t0);
  o.connect(d);
  for (const p of targets) d.connect(p);
  return d;
}

// ---- Les bruitages (chacun rend sa durée en secondes) -----------------------------------

const SYNTH: Record<SoundId, (v: Voice, t: number) => number> = {
  // Pouet-pouet de voiture : carré et scies désaccordées (tierce majeure), qui fléchissent au relâché.
  klaxon(v, t) {
    for (const [at, d] of [
      [0, 0.18],
      [0.26, 0.38],
    ] as const) {
      const s = t + at;
      const lp = filter(v, 'lowpass', 2600, 0.8);
      lp.connect(env(v, 0.22, s, 0.012, d - 0.05, 0.06)).connect(v.out);
      for (const [type, f] of [
        ['square', 392],
        ['sawtooth', 494],
        ['sawtooth', 497.5],
      ] as const) {
        const o = tone(v, type, f, s, s + d + 0.08);
        o.frequency.setValueAtTime(f, s + d - 0.03);
        o.frequency.linearRampToValueAtTime(f * 0.93, s + d + 0.06);
        o.connect(lp);
      }
    }
    return 0.8;
  },

  // Deux rieurs : « ha » en rafale (souffle du h, puis voix dans les formants du a), de plus en plus grave.
  rires(v, t) {
    for (const [base, offset, count, level] of [
      [290, 0, 7, 1.4],
      [430, 0.07, 6, 0.8],
    ] as const) {
      for (let i = 0; i < count; i++) {
        const s = t + offset + i * 0.15 + (Math.random() - 0.5) * 0.025;
        const f0 = base * (1 - i * 0.045);
        const h = noise(v, s, s + 0.06);
        h.connect(filter(v, 'bandpass', 1600, 0.8)).connect(env(v, 0.18, s, 0.008, 0.015, 0.03)).connect(v.out);
        const vs = s + 0.025;
        const o = tone(v, 'sawtooth', f0 * 1.1, vs, vs + 0.2);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.82, vs + 0.16);
        const g = env(v, level * (1 - i * 0.07), vs, 0.015, 0.05, 0.08);
        o.connect(filter(v, 'bandpass', 820, 5)).connect(g);
        o.connect(filter(v, 'bandpass', 1250, 7)).connect(g);
        g.connect(v.out);
      }
    }
    return 1.35;
  },

  // Nuit d'été : souffle sourd, et deux criquets qui stridulent par salves de trois chirps.
  criquets(v, t) {
    noise(v, t, t + 1.9)
      .connect(filter(v, 'lowpass', 450, 0.5))
      .connect(env(v, 0.05, t, 0.35, 0.9, 0.6))
      .connect(v.out);
    for (const [f, off, groups] of [
      [4400, 0, 4],
      [5150, 0.19, 3],
    ] as const) {
      for (let g = 0; g < groups; g++)
        for (let k = 0; k < 3; k++) {
          const s = t + off + g * 0.42 + k * 0.034;
          tone(v, 'sine', f, s, s + 0.03).connect(env(v, 0.1, s, 0.004, 0.008, 0.014)).connect(v.out);
        }
    }
    return 1.9;
  },

  // Tic aigu, tac plus grave : un clic de bruit et une petite note sèche.
  tictac(v, t) {
    for (let i = 0; i < 4; i++) {
      const s = t + i * 0.3;
      const tic = i % 2 === 0;
      tone(v, 'sine', tic ? 2100 : 1350, s, s + 0.05).connect(env(v, 0.3, s, 0.001, 0.004, 0.035)).connect(v.out);
      noise(v, s, s + 0.03)
        .connect(filter(v, 'highpass', tic ? 4200 : 2600))
        .connect(env(v, 0.22, s, 0.001, 0.002, 0.016))
        .connect(v.out);
    }
    return 1.2;
  },

  // Explosion : sinus qui s'effondre, souffle qui s'assombrit et grondement de queue.
  boum(v, t) {
    const o = tone(v, 'sine', 150, t, t + 1.3);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    o.connect(env(v, 1, t, 0.004, 0.08, 1.1)).connect(v.out);
    const lp = filter(v, 'lowpass', 3500, 0.7);
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + 1.3);
    noise(v, t, t + 1.7).connect(lp).connect(env(v, 0.9, t, 0.002, 0.04, 1.5)).connect(v.out);
    noise(v, t, t + 2)
      .connect(filter(v, 'lowpass', 160, 1.5))
      .connect(env(v, 0.9, t + 0.02, 0.08, 0.2, 1.6))
      .connect(v.out);
    return 2;
  },

  // Trompette de clown : buzz de kazoo, la note remonte et le filtre passe de « ou » à « è ».
  pouet(v, t) {
    const d = 0.55;
    const bp = filter(v, 'bandpass', 650, 2.5);
    bp.frequency.setValueAtTime(650, t + 0.1);
    bp.frequency.exponentialRampToValueAtTime(1700, t + 0.24);
    bp.connect(env(v, 1.1, t, 0.02, d - 0.14, 0.1)).connect(v.out);
    const oscs = (['sawtooth', 'square'] as const).map((type, i) => {
      const o = tone(v, type, 250, t, t + d + 0.05);
      o.detune.value = i * 14;
      o.frequency.linearRampToValueAtTime(235, t + 0.11);
      o.frequency.exponentialRampToValueAtTime(410, t + 0.22);
      o.frequency.linearRampToValueAtTime(392, t + d);
      o.connect(bp);
      return o;
    });
    lfo(v, 26, 8, t, t + d + 0.05, ...oscs.map((o) => o.frequency));
    return 0.7;
  },

  // Ba-dum-tss : deux toms qui descendent, puis une cymbale (carrés « métalliques » et bruit, passe-haut).
  badum(v, t) {
    const tom = (s: number, f0: number, f1: number, d: number) => {
      const o = tone(v, 'sine', f0, s, s + d + 0.05);
      o.frequency.exponentialRampToValueAtTime(f1, s + d);
      o.connect(env(v, 0.9, s, 0.002, 0.02, d)).connect(v.out);
      noise(v, s, s + 0.04)
        .connect(filter(v, 'bandpass', f0 * 4, 1))
        .connect(env(v, 0.25, s, 0.001, 0.004, 0.03))
        .connect(v.out);
    };
    tom(t, 210, 120, 0.28);
    tom(t + 0.2, 150, 82, 0.34);
    const s = t + 0.46;
    const hp = filter(v, 'highpass', 7000, 0.7);
    hp.connect(env(v, 0.2, s, 0.002, 0.04, 1.3)).connect(v.out);
    for (const f of [263, 400, 421, 474, 587, 845]) tone(v, 'square', f * 2, s, s + 1.4).connect(hp);
    noise(v, s, s + 1.4).connect(hp);
    return 1.9;
  },

  // Wah-wah-wah-waaah : quatre notes qui descendent, filtre qui s'ouvre puis se ferme, vibrato à la fin.
  trombone(v, t) {
    const notes = [
      [293.66, 0, 0.34],
      [277.18, 0.38, 0.34],
      [261.63, 0.76, 0.34],
      [246.94, 1.14, 1.05],
    ] as const;
    for (const [f, at, d] of notes) {
      const s = t + at;
      const last = d > 0.5;
      const o = tone(v, 'sawtooth', f * 1.03, s, s + d + 0.15);
      o.frequency.exponentialRampToValueAtTime(f, s + 0.06);
      o.frequency.setValueAtTime(f, s + d * 0.55);
      o.frequency.exponentialRampToValueAtTime(f * (last ? 0.9 : 0.97), s + d);
      const lp = filter(v, 'lowpass', 350, 5);
      lp.frequency.setValueAtTime(350, s);
      lp.frequency.exponentialRampToValueAtTime(1500, s + 0.1);
      lp.frequency.exponentialRampToValueAtTime(500, s + d);
      if (last) {
        const vib = lfo(v, 5.5, 0, s, s + d + 0.15, o.frequency);
        vib.gain.linearRampToValueAtTime(7, s + 0.4);
        lfo(v, 5.5, 250, s + 0.3, s + d + 0.15, lp.frequency);
      }
      o.connect(lp).connect(env(v, 0.6, s, 0.03, d - 0.12, 0.14)).connect(v.out);
    }
    return 2.4;
  },

  // Ressort : la note bondit puis tremble de moins en moins vite et de moins en moins fort.
  boing(v, t) {
    const d = 0.9;
    const a = tone(v, 'triangle', 130, t, t + d);
    a.frequency.exponentialRampToValueAtTime(360, t + 0.06);
    a.frequency.exponentialRampToValueAtTime(290, t + d);
    const b = tone(v, 'sine', 351, t, t + d);
    b.frequency.exponentialRampToValueAtTime(972, t + 0.06);
    b.frequency.exponentialRampToValueAtTime(783, t + d);
    const wob = lfo(v, 15, 80, t, t + d, a.frequency, b.frequency);
    wob.gain.exponentialRampToValueAtTime(3, t + d);
    a.connect(env(v, 0.7, t, 0.004, 0.04, d - 0.06)).connect(v.out);
    b.connect(env(v, 0.18, t, 0.004, 0.02, 0.4)).connect(v.out);
    return d;
  },

  // Applaudissements : une foule de petits claquements de bruit, et quelques « ouais ».
  bravo(v, t) {
    const d = 1.9;
    noise(v, t, t + d)
      .connect(filter(v, 'bandpass', 1500, 0.6))
      .connect(env(v, 0.06, t, 0.2, 1.0, 0.6))
      .connect(v.out);
    for (let i = 0; i < 170; i++) {
      const x = Math.random();
      const s = t + x * (d - 0.1);
      // Densité en cloche : ça monte vite et s'éteint doucement.
      const shape = Math.min(1, x * 6) * (1 - x * 0.75);
      noise(v, s, s + 0.03)
        .connect(filter(v, 'bandpass', 900 + Math.random() * 1800, 1.3))
        .connect(env(v, (0.12 + Math.random() * 0.3) * shape + 0.001, s, 0.001, 0.002, 0.025))
        .connect(v.out);
    }
    for (const [at, f0] of [
      [0.12, 170],
      [0.34, 245],
      [0.6, 200],
    ] as const) {
      const s = t + at;
      const o = tone(v, 'sawtooth', f0 * 0.9, s, s + 0.65);
      o.frequency.linearRampToValueAtTime(f0 * 1.15, s + 0.22);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.8, s + 0.6);
      const g = env(v, 0.9, s, 0.06, 0.25, 0.25);
      // « ou » → « ais » : les deux formants glissent vers le haut.
      const f1 = filter(v, 'bandpass', 330, 5);
      f1.frequency.setValueAtTime(330, s + 0.05);
      f1.frequency.linearRampToValueAtTime(720, s + 0.25);
      const f2 = filter(v, 'bandpass', 800, 6);
      f2.frequency.setValueAtTime(800, s + 0.05);
      f2.frequency.linearRampToValueAtTime(1850, s + 0.28);
      o.connect(f1).connect(g);
      o.connect(f2).connect(g);
      g.connect(v.out);
    }
    return d + 0.1;
  },

  // Cloche : partiels inharmoniques, les aigus s'éteignent plus vite que le fondamental.
  ding(v, t) {
    const f = 1046.5;
    for (const [r, a, d] of [
      [0.5, 0.12, 2.3],
      [1, 0.5, 2.2],
      [2, 0.16, 1.4],
      [2.76, 0.2, 1],
      [5.4, 0.09, 0.5],
      [8.93, 0.05, 0.3],
    ] as const) {
      tone(v, 'sine', f * r, t, t + d + 0.05).connect(env(v, a, t, 0.002, 0, d)).connect(v.out);
    }
    noise(v, t, t + 0.02)
      .connect(filter(v, 'highpass', 5000))
      .connect(env(v, 0.15, t, 0.001, 0.002, 0.012))
      .connect(v.out);
    return 2.4;
  },

  // Sifflement admiratif : un trait qui monte, puis un qui monte et redescend, avec un peu de souffle.
  sifflet(v, t) {
    const whistle = (s: number, [first, ...rest]: [[number, number], ...[number, number][]]) => {
      const len = rest.length ? rest[rest.length - 1]![0] : 0;
      const o = tone(v, 'sine', first[1], s, s + len + 0.05);
      for (const [dt, f] of rest) o.frequency.exponentialRampToValueAtTime(f, s + dt);
      lfo(v, 6, 12, s, s + len + 0.05, o.frequency);
      o.connect(env(v, 0.32, s, 0.03, len - 0.09, 0.06)).connect(v.out);
      noise(v, s, s + len)
        .connect(filter(v, 'bandpass', 3200, 0.8))
        .connect(env(v, 0.025, s, 0.03, len - 0.09, 0.06))
        .connect(v.out);
    };
    whistle(t, [
      [0, 800],
      [0.24, 2600],
    ]);
    whistle(t + 0.38, [
      [0, 1000],
      [0.2, 2500],
      [0.62, 700],
    ]);
    return 1.05;
  },
};

/** Voix d'un bruitage, débranchée (et donc libérée) une fois sa durée écoulée. */
function voice(run: (v: Voice, t: number) => number) {
  const c = audio();
  if (!c || !master) return;
  const out = c.createGain();
  out.connect(master);
  const dur = run({ c, out }, c.currentTime + 0.01);
  setTimeout(() => out.disconnect(), (dur + 0.3) * 1000);
}

/** Joue un bruitage ici seulement (rien en muet). */
export function play(id: SoundId) {
  if (isMuted) return;
  voice(SYNTH[id]);
}

/** Petit clic de compte à rebours pour les jeux ; plus aigu et plus fort quand ça presse. */
export function tick(urgent = false) {
  if (isMuted) return;
  voice((v, t) => {
    tone(v, urgent ? 'square' : 'sine', urgent ? 1760 : 1180, t, t + 0.07)
      .connect(env(v, urgent ? 0.12 : 0.2, t, 0.001, 0.005, 0.05))
      .connect(v.out);
    return 0.08;
  });
}

/**
 * Un seul coup d'horloge (tic aigu, tac plus grave), pour une mèche qui brûle. `heat` (0 à 1)
 * monte la note, durcit le timbre et pousse le volume : à la fin, ça claque comme une trotteuse affolée.
 */
export function clock(tac: boolean, heat = 0) {
  if (isMuted) return;
  const h = Math.min(1, Math.max(0, heat));
  voice((v, t) => {
    const f = (tac ? 1300 : 2050) * (1 + h * 0.35);
    tone(v, h > 0.7 ? 'triangle' : 'sine', f, t, t + 0.05)
      .connect(env(v, 0.2 + h * 0.14, t, 0.001, 0.004, 0.035))
      .connect(v.out);
    noise(v, t, t + 0.03)
      .connect(filter(v, 'highpass', tac ? 2600 : 4200))
      .connect(env(v, 0.16 + h * 0.12, t, 0.001, 0.002, 0.016))
      .connect(v.out);
    return 0.06;
  });
}

/** Buzzer de plateau télé : deux coups rauques et graves, pour « Hésitation ! ». */
export function buzzer() {
  if (isMuted) return;
  voice((v, t) => {
    for (const at of [0, 0.2]) {
      const s = t + at;
      const lp = filter(v, 'lowpass', 1400, 1.2);
      lp.connect(env(v, 0.32, s, 0.006, 0.12, 0.05)).connect(v.out);
      for (const f of [110, 116.5, 165]) tone(v, 'square', f, s, s + 0.2).connect(lp);
    }
    return 0.45;
  });
}

/** Buzzer de jeu télé (Mots interdits) : deux carrés graves désaccordés, râpeux, une demi-seconde. */
export function buzzerLong() {
  if (isMuted) return;
  voice((v, t) => {
    const lp = filter(v, 'lowpass', 1400, 1.2);
    lp.connect(env(v, 0.32, t, 0.008, 0.42, 0.08)).connect(v.out);
    for (const f of [110, 116.5, 220]) tone(v, 'square', f, t, t + 0.52).connect(lp);
    return 0.55;
  });
}

/**
 * Petits bruits des jeux d'action. thump : frappe sourde (ballon, coup d'oreiller), plus grave
 * quand `power` monte ; pop : bulle claire qui monte (cœur attrapé) ; whoosh : souffle filtré (bisou, chute).
 */
export function thump(power = 0.5) {
  if (isMuted) return;
  voice((v, t) => {
    const o = tone(v, 'sine', 180 - power * 70, t, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    o.connect(env(v, 0.5, t, 0.002, 0.01, 0.12)).connect(v.out);
    const lp = filter(v, 'lowpass', 900 + power * 1200);
    noise(v, t, t + 0.06).connect(lp).connect(env(v, 0.12 + power * 0.12, t, 0.001, 0.005, 0.05)).connect(v.out);
    return 0.18;
  });
}

export function pop(step = 0) {
  if (isMuted) return;
  voice((v, t) => {
    const f = 620 * Math.pow(2, Math.min(step, 12) / 12);
    const o = tone(v, 'triangle', f, t, t + 0.14);
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.09);
    o.connect(env(v, 0.22, t, 0.004, 0.02, 0.1)).connect(v.out);
    return 0.15;
  });
}

export function whoosh(up = true) {
  if (isMuted) return;
  voice((v, t) => {
    const bp = filter(v, 'bandpass', up ? 500 : 1800, 1.4);
    bp.frequency.exponentialRampToValueAtTime(up ? 2400 : 300, t + 0.35);
    noise(v, t, t + 0.4).connect(bp).connect(env(v, 0.28, t, 0.06, 0.08, 0.24)).connect(v.out);
    return 0.42;
  });
}

// ---- Muet ---------------------------------------------------------------------------------

const MUTE_KEY = 'julaika:muted';
/**
 * « Plop » d'un message reçu dans le chat : une goutte ronde (sinus qui retombe) suivie d'une
 * note plus haute, comme une bulle qui éclot. Très court et doux ; `soft` le baisse encore quand
 * la musique de l'île joue. Les rafales sont regroupées : un seul plop par instant.
 */
let lastPing = 0;
export function chatPing(soft = false) {
  if (isMuted) return;
  const now = performance.now();
  if (now - lastPing < 400) return;
  lastPing = now;
  const k = soft ? 0.45 : 1;
  voice((v, t) => {
    for (const [at, f, a] of [
      [0, 880, 0.2],
      [0.075, 1318.5, 0.14],
    ] as const) {
      const s = t + at;
      const o = tone(v, 'sine', f * 0.8, s, s + 0.2);
      o.frequency.exponentialRampToValueAtTime(f, s + 0.025);
      o.connect(filter(v, 'lowpass', 3000)).connect(env(v, a * k, s, 0.004, 0.01, 0.14)).connect(v.out);
    }
    return 0.3;
  });
}

let isMuted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const muteListeners = new Set<() => void>();

export const muted = () => isMuted;

export function setMuted(b: boolean) {
  if (b === isMuted) return;
  isMuted = b;
  try {
    localStorage.setItem(MUTE_KEY, b ? '1' : '0');
  } catch {
    // Stockage refusé (navigation privée) : le réglage tient le temps de la session.
  }
  // Coupe net ce qui joue déjà, et rouvre en douceur.
  if (ctx && master) master.gain.setTargetAtTime(b ? 0 : VOLUME, ctx.currentTime, 0.015);
  for (const l of muteListeners) l();
}

export const toggleMuted = () => setMuted(!isMuted);

const subscribeMuted = (l: () => void) => {
  muteListeners.add(l);
  return () => void muteListeners.delete(l);
};

export const useMuted = () => useSyncExternalStore(subscribeMuted, muted);

// ---- Envoi, réception et bulles -------------------------------------------------------------

export interface SoundEvent {
  id: SoundId;
  /** Identifiant du joueur qui l'a envoyé (soi-même pour un envoi local). */
  by: string;
  at: number;
}

const soundListeners = new Set<(e: SoundEvent) => void>();

/** Abonnement aux bruitages envoyés ou reçus, pour afficher les bulles. Rend le désabonnement. */
export function onSound(listener: (e: SoundEvent) => void) {
  soundListeners.add(listener);
  return () => void soundListeners.delete(listener);
}

function emit(id: SoundId, by: string) {
  const e = { id, by, at: Date.now() };
  for (const l of soundListeners) l(e);
}

/** Émetteur réseau, branché par net.ts (évite qu'on importe net ici : il nous importe déjà). */
let emitter: (id: SoundId) => void = () => {};
export function configureSounds(send: (id: SoundId) => void) {
  emitter = send;
}

/** Joue tout de suite chez soi et envoie au salon (le serveur relaie aux autres). */
export function send(id: SoundId) {
  play(id);
  emitter(id);
  emit(id, store.get().selfId ?? '');
}

const lastFrom = new Map<string, number>();

/** Bruitage reçu d'un autre joueur : joué (sauf muet) et toujours annoncé en bulle. */
export function receive(id: SoundId, by: string) {
  // Garde-fou si quelqu'un mitraille malgré la recharge des pads : un son par joueur toutes les 250 ms.
  const now = Date.now();
  if (now - (lastFrom.get(by) ?? 0) < 250) return;
  lastFrom.set(by, now);
  play(id);
  emit(id, by);
}
