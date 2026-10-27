import { describe, expect, it, vi } from 'vitest';
import { normalize } from '@julaika/shared';
import { deepseekPairs, parsePairs } from '../apps/server/src/deepseek';
import { INTRUS_PAIRS } from '../apps/server/src/intrusPairs';

function reply(content: string, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
  );
}

describe('INTRUS_PAIRS', () => {
  it('assez de paires, des mots courts et distincts', () => {
    expect(INTRUS_PAIRS.length).toBeGreaterThanOrEqual(100);
    for (const { civil, intrus } of INTRUS_PAIRS) {
      for (const w of [civil, intrus]) {
        expect(w.trim().length, w).toBeGreaterThan(0);
        expect(w.length, w).toBeLessThanOrEqual(30);
      }
      expect(normalize(civil), civil).not.toBe(normalize(intrus));
    }
  });

  it('aucun mot en double dans toute la liste', () => {
    const all = INTRUS_PAIRS.flatMap((p) => [normalize(p.civil), normalize(p.intrus)]);
    const dupes = all.filter((w, i) => all.indexOf(w) !== i);
    expect(dupes).toEqual([]);
  });

  it('passe les mêmes règles que les paires générées', () => {
    expect(parsePairs(JSON.stringify({ paires: INTRUS_PAIRS }))).toEqual(INTRUS_PAIRS);
  });
});

describe('parsePairs', () => {
  it('garde les paires valides, nettoyées', () => {
    const content = JSON.stringify({
      paires: [
        { civil: 'plage', intrus: 'piscine' },
        { civil: ' jus d’orange ', intrus: 'limonade' },
      ],
    });
    expect(parsePairs(content)).toEqual([
      { civil: 'plage', intrus: 'piscine' },
      { civil: "jus d'orange", intrus: 'limonade' },
    ]);
  });

  it('ignore une réponse qui n’est pas du JSON attendu', () => {
    expect(parsePairs('plage / piscine')).toEqual([]);
    expect(parsePairs('{"paires": "plage"}')).toEqual([]);
    expect(parsePairs('{"mots": [{"civil": "plage", "intrus": "piscine"}]}')).toEqual([]);
  });

  it('écarte les paires invalides et les mots déjà pris', () => {
    const content = JSON.stringify({
      paires: [
        { civil: 'café', intrus: 'Cafe' },
        { civil: 'chat' },
        { civil: 'chat', intrus: 42 },
        { civil: 'R2D2', intrus: 'robot' },
        { civil: 'un mot vraiment beaucoup trop long', intrus: 'court' },
        { civil: 'quatre mots en tout', intrus: 'trois' },
        'plage',
        null,
        { civil: 'lune', intrus: 'soleil' },
        { civil: 'Soleil', intrus: 'étoile' },
      ],
    });
    expect(parsePairs(content)).toEqual([{ civil: 'lune', intrus: 'soleil' }]);
  });
});

describe('deepseekPairs', () => {
  it('désactivé sans clé', () => {
    expect(deepseekPairs({})).toBeNull();
  });

  it('demande des paires et écarte celles déjà sorties', async () => {
    const fetch = reply(
      JSON.stringify({
        paires: [
          { civil: 'café', intrus: 'thé' },
          { civil: 'guitare', intrus: 'violon' },
          { civil: 'avion', intrus: 'hélicoptère' },
        ],
      }),
    );
    const generate = deepseekPairs({ DEEPSEEK_API_KEY: 'sk-test' }, fetch)!;
    expect(await generate(5, ['Thé'])).toEqual([
      { civil: 'guitare', intrus: 'violon' },
      { civil: 'avion', intrus: 'hélicoptère' },
    ]);

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(init!.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.messages[0].content).toContain('"paires"');
    expect(body.messages[1].content).toContain('Donne 5 paires');
    expect(body.messages[1].content).toContain('Thé');
  });

  it('lève une erreur sur HTTP 500, puis se met en pause', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = reply('', 500);
    const generate = deepseekPairs({ DEEPSEEK_API_KEY: 'sk-test' }, fetch)!;
    await expect(generate(3, [])).rejects.toThrow('HTTP 500');
    await expect(generate(3, [])).rejects.toThrow('suspendus');
    expect(fetch).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
