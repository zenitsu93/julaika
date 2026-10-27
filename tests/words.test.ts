import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Difficulty, ServerMsg } from '@julaika/shared';
import { deepseekWords, parseWords } from '../apps/server/src/deepseek';
import { Room, WORD_BATCH, type Conn } from '../apps/server/src/room';
import { WORDS_FR } from '../apps/server/src/words';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  choices() {
    return this.json.filter((m) => m.t === 'choices').at(-1) as Extract<ServerMsg, { t: 'choices' }> | undefined;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function reply(content: string, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
  );
}

describe('parseWords', () => {
  it('garde les mots valides du niveau demandé, sans doublons', () => {
    const content = JSON.stringify({
      facile: ['chat'],
      moyen: ['Phare', 'phare', 'feu d’artifice', 'lettre au Père Noël', 'R2D2', 'a', 'un mot bien trop long ici', 42, 'hamac '],
    });
    expect(parseWords(content, 'moyen')).toEqual(['Phare', "feu d'artifice", 'lettre au Père Noël', 'hamac']);
  });

  it('ignore une réponse qui n’est pas du JSON attendu', () => {
    expect(parseWords('voici des mots : chat, chien', 'facile')).toEqual([]);
    expect(parseWords('{"mots": ["chat"]}', 'facile')).toEqual([]);
  });
});

describe('deepseekWords', () => {
  it('désactivé sans clé', () => {
    expect(deepseekWords({})).toBeNull();
  });

  it('demande des mots du bon niveau et écarte ceux déjà sortis', async () => {
    const fetch = reply('{"facile": ["chat"], "difficile": ["fou rire", "mal de mer", "Course en sac"]}');
    const generate = deepseekWords({ DEEPSEEK_API_KEY: 'sk-test' }, fetch)!;
    expect(await generate('difficile', 3, ['course en sac'])).toEqual(['fou rire', 'mal de mer']);

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('deepseek-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.messages[1].content).toContain('« difficile »');
    expect(body.messages[1].content).toContain('course en sac');
  });

  it('se met en pause après une erreur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = reply('', 402);
    const generate = deepseekWords({ DEEPSEEK_API_KEY: 'sk-test' }, fetch)!;
    await expect(generate('facile', 3, [])).rejects.toThrow('HTTP 402');
    await expect(generate('facile', 3, [])).rejects.toThrow('suspendus');
    expect(fetch).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('mots selon la difficulté', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(generate?: (d: Difficulty, n: number, avoid: string[]) => Promise<string[]>) {
    const gen = generate ? vi.fn(generate) : null;
    const room = new Room('TEST', undefined, Math.random, undefined, gen);
    const conns = [new FakeConn(), new FakeConn()];
    const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
    return { room, conns, ids, gen };
  }

  it('sans IA, tire dans la liste intégrée de la difficulté choisie', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'settings', settings: { difficulty: 'difficile' } });
    room.handle(ids[0]!, { t: 'start' });
    for (const w of conns[0]!.choices()!.words) expect(WORDS_FR.difficile).toContain(w);
    room.dispose();
  });

  it('refuse une difficulté inconnue', () => {
    const { room, ids } = setup();
    room.handle(ids[0]!, { t: 'settings', settings: { difficulty: 'extrême' as Difficulty } });
    expect(room.settings.difficulty).toBe('moyen');
  });

  it('propose les mots générés et en recommande avant d’en manquer', async () => {
    let calls = 0;
    const { room, conns, ids, gen } = setup(async () => {
      calls++;
      return Array.from({ length: 10 }, (_, i) => `lot${calls} mot${i}`);
    });
    // Commandés dès le deuxième joueur, avant même le lancement.
    expect(gen).toHaveBeenCalledWith('moyen', WORD_BATCH, [], 'draw');
    await flush();
    room.handle(ids[0]!, { t: 'start' });
    const offered = conns[0]!.choices()!.words;
    expect(offered).toHaveLength(3);
    for (const w of offered) expect(w).toMatch(/^lot1 /);
    // Plus que 7 mots, moins de trois tours : nouvel appel, sans redemander ceux déjà vus.
    expect(gen).toHaveBeenCalledTimes(2);
    const avoid = gen!.mock.calls[1]![2];
    expect(avoid).toHaveLength(10);
    expect(avoid).toEqual(expect.arrayContaining(offered));
    room.dispose();
  });

  it("repasse sur la liste intégrée si l'IA échoue", async () => {
    const { room, conns, ids, gen } = setup(async () => {
      throw new Error('panne');
    });
    await flush();
    room.handle(ids[0]!, { t: 'settings', settings: { difficulty: 'facile' } });
    await flush();
    room.handle(ids[0]!, { t: 'start' });
    expect(gen).toHaveBeenCalledWith('facile', WORD_BATCH, expect.any(Array), 'draw');
    for (const w of conns[0]!.choices()!.words) expect(WORDS_FR.facile).toContain(w);
    room.dispose();
  });
});
