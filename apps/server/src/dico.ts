// Dictionnaire de la Bombe à mots : « an-array-of-french-words » (licence MIT, Zeke Sikelianos
// et Titus Wormer), ~336 000 mots avec les formes conjuguées et les pluriels.
import WORDS from 'an-array-of-french-words/index.json' with { type: 'json' };
import { foldWord, type Difficulty } from '@julaika/shared';

/** Nombre minimal (et maximal) de mots contenant une syllabe, selon la difficulté. */
const BANDS: Record<Difficulty, [number, number]> = {
  facile: [4000, Infinity],
  moyen: [1200, Infinity],
  difficile: [250, 2500],
};

let words: Set<string> | null = null;
/** Mots sans tiret ni apostrophe, pour montrer un exemple après une explosion. */
let plain: string[] = [];
let syllables: Record<Difficulty, string[]> | null = null;

/** Construit le dictionnaire au premier besoin (environ une seconde), puis le garde. */
function load(): { words: Set<string>; syllables: Record<Difficulty, string[]> } {
  if (words && syllables) return { words, syllables };
  words = new Set();
  plain = [];
  const counts = new Map<string, number>();
  for (const raw of WORDS as string[]) {
    const w = foldWord(raw);
    words.add(w);
    if (!/^[a-z]+$/.test(w)) continue;
    plain.push(w);
    // Chaque syllabe compte une fois par mot.
    const seen = new Set<string>();
    for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
    for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const pick = ([min, max]: [number, number]) => [...counts].filter(([, c]) => c >= min && c <= max).map(([s]) => s).sort();
  syllables = { facile: pick(BANDS.facile), moyen: pick(BANDS.moyen), difficile: pick(BANDS.difficile) };
  return { words, syllables };
}

/** Prépare le dictionnaire dès qu'un salon de Bombe s'ouvre, pour que la partie démarre sans attendre. */
export function warmDictionary(): void {
  load();
}

export function isFrenchWord(folded: string): boolean {
  return load().words.has(folded);
}

export function syllablesFor(difficulty: Difficulty): readonly string[] {
  return load().syllables[difficulty];
}

/** Quelques mots courts qui contiennent la syllabe (les plus courts d'abord, ils parlent mieux). */
export function wordsWith(syllable: string, limit = 20): string[] {
  load();
  const found: string[] = [];
  for (const w of plain) {
    if (w.length >= 4 && w.length <= 9 && w.includes(syllable)) found.push(w);
    if (found.length >= limit * 20) break;
  }
  return found.sort((a, b) => a.length - b.length).slice(0, limit);
}
