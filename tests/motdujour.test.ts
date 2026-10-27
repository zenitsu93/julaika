import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foldMot, scoreMot, shareMot, type MotState } from '@julaika/shared';
import { FIRST_DAY, MotDuJour } from '../apps/server/src/motdujour';
import { ANSWERS, DICTIONARY } from '../apps/server/src/mots5';

const TOKEN = 'joueur-0123456789ab';
const OTHER = 'joueur-ba9876543210';
// 27 octobre 2026, 10 h à Paris.
const AT = Date.parse('2026-10-27T09:00:00Z');

function game(now = () => AT, dir: string | null = null) {
  return new MotDuJour(dir, now);
}
const ok = (v: MotState | string) => {
  if (typeof v === 'string') throw new Error(v);
  return v;
};
/** Un mot du dictionnaire différent de la réponse. */
const wrong = (answer: string) => [...DICTIONARY].find((w) => w !== foldMot(answer))!;

describe('scoreMot', () => {
  it('marque bien placées, présentes et absentes', () => {
    expect(scoreMot('ROUTE', 'TROUS')).toEqual(['near', 'near', 'near', 'near', 'no']);
    expect(scoreMot('arbre', 'ARBRE')).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it("ne compte une lettre en double qu'autant de fois qu'elle est dans le mot", () => {
    expect(scoreMot('EEEEE', 'TERRE')).toEqual(['no', 'ok', 'no', 'no', 'ok']);
    expect(scoreMot('LLAMA', 'BALLE')).toEqual(['near', 'near', 'near', 'no', 'no']);
  });

  it('ignore les accents', () => {
    expect(foldMot('Élève')).toBe('ELEVE');
    expect(scoreMot('zebre', 'zèbre').every((m) => m === 'ok')).toBe(true);
  });
});

describe('MotDuJour', () => {
  it('a des réponses de 5 lettres, toutes différentes', () => {
    const folded = ANSWERS.map(foldMot);
    expect(folded.every((w) => w.length === 5)).toBe(true);
    expect(new Set(folded).size).toBe(folded.length);
  });

  it('numérote les jours et change de mot à minuit, heure de Paris', () => {
    const g = game();
    expect(g.today()).toBe(FIRST_DAY);
    expect(g.number(FIRST_DAY)).toBe(1);
    expect(g.today(Date.parse('2026-10-27T22:59:00Z'))).toBe('2026-10-27');
    expect(g.today(Date.parse('2026-10-27T23:00:00Z'))).toBe('2026-10-28');
    expect(g.answer('2026-10-28')).not.toBe(g.answer('2026-10-27'));
    expect(ok(g.state(TOKEN)).nextAt).toBe(Date.parse('2026-10-27T23:00:00Z'));
  });

  it('refuse les mots inconnus ou de mauvaise longueur et sans pseudo', () => {
    const g = game();
    expect(g.guess(TOKEN, 'Ju', 1, 'ABCDE')).toBe('inconnu');
    expect(g.guess(TOKEN, 'Ju', 1, 'CHAT')).toBe('longueur');
    expect(g.guess(TOKEN, '  ', 1, 'ARBRE')).toBe('pseudo');
  });

  it('cache la réponse tant que la partie dure, puis classe les joueurs', () => {
    let now = AT;
    const g = game(() => now);
    const answer = g.answer(FIRST_DAY);
    ok(g.state(TOKEN));
    ok(g.state(OTHER));

    const first = ok(g.guess(TOKEN, 'Julaïka', 3, wrong(answer)));
    expect(first.answer).toBeUndefined();
    expect(first.guesses).toHaveLength(1);
    expect(first.playing).toBe(1);

    now += 60_000;
    const won = ok(g.guess(TOKEN, 'Julaïka', 3, answer));
    expect(won).toMatchObject({ done: true, won: true, answer });
    expect(won.board).toEqual([expect.objectContaining({ name: 'Julaïka', tries: 2, ms: 60_000, you: true })]);
    expect(g.guess(TOKEN, 'Julaïka', 3, answer)).toBe('fini');

    // Trouvé du premier coup : passe devant.
    now += 60_000;
    const fast = ok(g.guess(OTHER, 'Christian', 0, answer));
    expect(fast.board.map((e) => e.name)).toEqual(['Christian', 'Julaïka']);
    expect(fast.board[1]).not.toHaveProperty('you');
    expect(fast.board[0]!.marks).toEqual([['ok', 'ok', 'ok', 'ok', 'ok']]);
  });

  it('termine la partie après 6 essais ratés', () => {
    const g = game();
    const answer = g.answer(FIRST_DAY);
    let s: MotState | string = '';
    for (let i = 0; i < 6; i++) s = g.guess(TOKEN, 'Ju', 0, wrong(answer));
    expect(ok(s)).toMatchObject({ done: true, won: false, answer });
    expect(ok(s).board[0]).toMatchObject({ won: false, tries: 6 });
  });

  it('montre les jours passés avec leur réponse, pas les jours futurs', () => {
    let now = AT;
    const g = game(() => now);
    g.guess(TOKEN, 'Ju', 0, g.answer(FIRST_DAY));
    now += 86_400_000;
    const yesterday = ok(g.state(null, FIRST_DAY));
    expect(yesterday.answer).toBe(g.answer(FIRST_DAY));
    expect(yesterday.board).toHaveLength(1);
    expect(ok(g.state(null)).answer).toBeUndefined();
    expect(g.state(null, '2026-12-31')).toBe('jour');
    expect(g.state(null, '2026-10-01')).toBe('jour');
  });

  it('garde les classements sur le disque', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mot-'));
    const g = game(() => AT, dir);
    g.guess(TOKEN, 'Ju', 2, g.answer(FIRST_DAY));
    g.flush();
    expect(Object.keys(JSON.parse(readFileSync(join(dir, `${FIRST_DAY}.json`), 'utf8')))).toEqual([TOKEN]);
    expect(ok(game(() => AT, dir).state(null)).board).toHaveLength(1);
  });

  it('partage un résultat sans les lettres', () => {
    expect(shareMot(3, [{ word: 'ARBRE', marks: ['ok', 'near', 'no', 'no', 'ok'] }], true)).toBe(
      'julaïka · Mot du jour n° 3 · 1/6\n🟩🟨⬛⬛🟩',
    );
  });
});
