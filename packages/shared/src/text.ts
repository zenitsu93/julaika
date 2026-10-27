/** Minuscule, sans accents ni espaces superflus : "Élé-phant " -> "ele-phant". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Distance de Levenshtein bornée (on n'a besoin que de savoir si elle vaut <= max). */
export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export type GuessResult = 'correct' | 'close' | 'wrong';

export function checkGuess(guess: string, word: string): GuessResult {
  const g = normalize(guess);
  const w = normalize(word);
  if (g === w) return 'correct';
  if (w.length >= 4 && levenshtein(g, w, 1) <= 1) return 'close';
  return 'wrong';
}

/** Masque un mot en gardant espaces et tirets visibles et les indices déjà révélés. */
export function maskWord(word: string, revealed: ReadonlySet<number>): string {
  return [...word]
    .map((c, i) => (c === ' ' || c === '-' || revealed.has(i) ? c : '_'))
    .join(' ');
}
