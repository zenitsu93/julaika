import { muted, sampleBus } from './sounds';
import { serverNow } from './store';
import aovTourbillon from '../assets/sfx/aov-tourbillon.mp3';
import aovTrinque from '../assets/sfx/aov-trinque.mp3';
import aovFanfare from '../assets/sfx/aov-fanfare.mp3';
import quizHarpe from '../assets/sfx/quiz-harpe.mp3';
import quizCartes from '../assets/sfx/quiz-cartes.mp3';
import quizBois from '../assets/sfx/quiz-bois.mp3';
import quizCoeur from '../assets/sfx/quiz-coeur.mp3';
import quizBravo from '../assets/sfx/quiz-bravo.mp3';
import quizRate from '../assets/sfx/quiz-rate.mp3';
import quizPodium from '../assets/sfx/quiz-podium.mp3';

/**
 * Sons enregistrés : de vrais instruments et bruitages libres (voir assets/sfx/CREDITS.md),
 * montés et masterisés à part, servis comme fichiers mp3. Contrairement à sounds.ts, rien n'est
 * synthétisé : on télécharge le fichier une fois, on le décode, puis on le rejoue autant qu'on veut.
 */
const URLS = {
  'aov-tourbillon': aovTourbillon,
  'aov-trinque': aovTrinque,
  'aov-fanfare': aovFanfare,
  'quiz-harpe': quizHarpe,
  'quiz-cartes': quizCartes,
  'quiz-bois': quizBois,
  'quiz-coeur': quizCoeur,
  'quiz-bravo': quizBravo,
  'quiz-rate': quizRate,
  'quiz-podium': quizPodium,
} as const;

export type SampleId = keyof typeof URLS;

const files = new Map<SampleId, Promise<ArrayBuffer | null>>();
const decoded = new Map<SampleId, Promise<AudioBuffer | null>>();

function file(id: SampleId) {
  let f = files.get(id);
  if (!f) {
    f = fetch(URLS[id])
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    files.set(id, f);
  }
  return f;
}

function buffer(id: SampleId, c: AudioContext) {
  let b = decoded.get(id);
  if (!b) {
    // decodeAudioData détache le tampon : on lui en passe une copie.
    b = file(id).then((a) => (a ? c.decodeAudioData(a.slice(0)) : null)).catch(() => null);
    decoded.set(id, b);
  }
  return b;
}

/** Télécharge les fichiers d'un jeu dès l'arrivée sur son plateau, pour qu'ils partent pile à l'heure. */
export function preloadSamples(...ids: SampleId[]) {
  for (const id of ids) void file(id);
}

interface SampleOptions {
  /** Volume relatif (1 = niveau du master). */
  gain?: number;
  /** Vitesse de lecture : au-dessus de 1, plus aigu et plus court. */
  rate?: number;
  /** Instant serveur (ms) où le son aurait dû partir : un joueur qui arrive en retard le prend en route. */
  since?: number;
}

/** Joue un son enregistré ici seulement (rien en muet). */
export async function sample(id: SampleId, { gain = 1, rate = 1, since }: SampleOptions = {}) {
  if (muted()) return;
  const bus = sampleBus();
  if (!bus) return;
  const buf = await buffer(id, bus.c);
  if (!buf || muted()) return;
  const offset = since ? Math.max(0, (serverNow() - since) / 1000) * rate : 0;
  if (offset >= buf.duration - 0.05) return;
  const src = bus.c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = bus.c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(bus.out);
  src.onended = () => g.disconnect();
  src.start(bus.c.currentTime, offset);
}
