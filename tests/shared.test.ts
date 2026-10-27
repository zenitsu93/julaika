import { describe, expect, it } from 'vitest';
import { DrawOp, checkGuess, decodeDraw, encodeDraw, floodFill, maskWord, parseMeetUrl } from '@julaika/shared';

describe('protocole de dessin', () => {
  it('encode et décode un trait', () => {
    const buf = encodeDraw({ op: DrawOp.Begin, color: 5, size: 10, points: [0, 0, 400.4, 300.6, 900, -3] });
    expect(buf.byteLength).toBe(4 + 3 * 4);
    expect(decodeDraw(buf)).toEqual({ op: DrawOp.Begin, color: 5, size: 10, points: [0, 0, 400, 301, 800, 0] });
  });

  it('rejette les paquets invalides', () => {
    expect(decodeDraw(new Uint8Array([9, 0, 0, 0]))).toBeNull();
    expect(decodeDraw(new Uint8Array([1, 0, 0]))).toBeNull();
    expect(decodeDraw(new Uint8Array([1, 0, 0, 0]))).toBeNull(); // Begin sans point
  });
});

describe('devinettes', () => {
  it('ignore casse et accents', () => {
    expect(checkGuess('  ELEPHANT ', 'éléphant')).toBe('correct');
  });
  it('signale une réponse proche', () => {
    expect(checkGuess('elephan', 'éléphant')).toBe('close');
    expect(checkGuess('chat', 'chien')).toBe('wrong');
  });
  it('masque le mot sauf espaces, tirets et lettres révélées', () => {
    expect(maskWord('arc-en ciel', new Set([0]))).toBe('a _ _ - _ _   _ _ _ _');
  });
});

describe('remplissage', () => {
  it('remplit une zone fermée sans déborder', () => {
    const w = 5, h = 5;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y++) px.set([0, 0, 0, 255], (y * w + 2) * 4); // mur vertical noir
    floodFill(px, w, h, 0, 0, [255, 0, 0]);
    expect([...px.slice(0, 3)]).toEqual([255, 0, 0]);
    expect([...px.slice((2 * w + 1) * 4, (2 * w + 1) * 4 + 3)]).toEqual([255, 0, 0]);
    expect([...px.slice(3 * 4, 3 * 4 + 3)]).toEqual([255, 255, 255]);
  });
});

describe('lien Google Meet', () => {
  it('accepte les formes courantes et normalise', () => {
    expect(parseMeetUrl('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
    expect(parseMeetUrl('meet.google.com/ABC-DEFG-HIJ?authuser=0')).toBe('https://meet.google.com/abc-defg-hij');
    expect(parseMeetUrl('  ')).toBe('');
  });
  it('refuse le reste', () => {
    expect(parseMeetUrl('https://evil.com/abc-defg-hij')).toBeNull();
    expect(parseMeetUrl('https://meet.google.com.evil.com/abc-defg-hij')).toBeNull();
    expect(parseMeetUrl('javascript:alert(1)')).toBeNull();
  });
});
