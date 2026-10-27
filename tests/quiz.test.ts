import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QUIZ_ANSWER_TIME,
  QUIZ_PREP_MIN_MS,
  QUIZ_READ_MS,
  QUIZ_REVEAL_TIME,
  normalize,
  parseQuizThemes,
  quizPoints,
  type QuizQuestion,
  type ServerMsg,
} from '@julaika/shared';
import { deepseekQuiz, parseQuiz } from '../apps/server/src/deepseek';
import { QUIZ_BANK } from '../apps/server/src/quizBank';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  state() {
    return (this.json.filter((m) => m.t === 'state').at(-1) as Extract<ServerMsg, { t: 'state' }>).state;
  }
}

const QUESTIONS: QuizQuestion[] = Array.from({ length: 20 }, (_, i) => ({
  theme: 'Football',
  text: `Question numéro ${i + 1} ?`,
  options: ['A', 'B', 'C', 'D'],
  answer: i % 4,
  explain: `Anecdote ${i + 1}`,
}));

async function setup(opts: { n?: number; questions?: number; generator?: (themes: string[], difficulty: string, count: number) => Promise<QuizQuestion[]> } = {}) {
  const generator = vi.fn(opts.generator ?? (async (_themes: string[], _difficulty: string, _count: number) => QUESTIONS));
  const room = new Room('QUIZ', undefined, () => 0, () => [], null, null, null, generator);
  room.game = 'quiz';
  const conns = Array.from({ length: opts.n ?? 2 }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { quizTheme: 'Football', questions: opts.questions ?? 5 } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids, generator };
}

describe('quiz : contrat', () => {
  it('découpe les thèmes, sans doublon, avec un thème par défaut', () => {
    expect(parseQuizThemes('Football, cinéma ; football / Espace')).toEqual(['Football', 'cinéma', 'Espace']);
    expect(parseQuizThemes('   ')).toEqual(['Culture générale']);
    expect(parseQuizThemes('a,b,c,d,e,f')).toHaveLength(4);
  });

  it('la vitesse et la série font les points', () => {
    expect(quizPoints(0, 1)).toBe(1000);
    expect(quizPoints(QUIZ_ANSWER_TIME * 1000, 1)).toBe(500);
    expect(quizPoints(QUIZ_ANSWER_TIME * 500, 1)).toBe(750);
    expect(quizPoints(0, 3)).toBe(1200);
    expect(quizPoints(0, 10)).toBe(1300);
  });

  it('la réserve : quatre réponses distinctes, des textes courts, aucune question en double', () => {
    expect(QUIZ_BANK.length).toBeGreaterThanOrEqual(50);
    for (const q of QUIZ_BANK) {
      expect(new Set(q.options.map(normalize)).size, q.text).toBe(4);
      expect(q.text.length, q.text).toBeLessThanOrEqual(160);
      for (const o of q.options) expect(o.length, o).toBeLessThanOrEqual(50);
    }
    expect(new Set(QUIZ_BANK.map((q) => normalize(q.text))).size).toBe(QUIZ_BANK.length);
  });
});

describe('parseQuiz', () => {
  it('garde les questions valides et mélange les réponses en suivant la bonne', () => {
    const content = JSON.stringify({
      questions: [
        { theme: 'football', question: 'Qui a gagné la Coupe du monde 1998 ?', reponses: ['La France', 'Le Brésil', 'L’Italie', 'L’Allemagne'], bonne: 0, anecdote: 'À Saint-Denis.' },
        { theme: 'cinéma', question: 'Trop peu de réponses ?', reponses: ['A', 'B', 'C'], bonne: 0 },
        { theme: 'Football', question: 'Deux réponses pareilles ?', reponses: ['A', 'a', 'C', 'D'], bonne: 0 },
        { theme: 'Football', question: 'Bonne réponse donnée en texte ?', reponses: ['Un', 'Deux', 'Trois', 'Quatre'], bonne: 'Trois' },
        { theme: 'Football', question: 'Indice hors limites ?', reponses: ['Un', 'Deux', 'Trois', 'Quatre'], bonne: 4 },
        { theme: 'Football', question: 'Qui a gagné la Coupe du monde 1998 ?', reponses: ['A', 'B', 'C', 'D'], bonne: 1 },
      ],
    });
    const out = parseQuiz(content, ['Football'], () => 0);
    expect(out.map((q) => q.text)).toEqual(['Qui a gagné la Coupe du monde 1998 ?', 'Bonne réponse donnée en texte ?']);
    for (const q of out) expect(q.theme).toBe('Football');
    expect(out[0]!.options[out[0]!.answer]).toBe('La France');
    expect(out[1]!.options[out[1]!.answer]).toBe('Trois');
    expect(out[0]!.explain).toBe('À Saint-Denis.');
    expect(parseQuiz('pas du json', ['x'])).toEqual([]);
  });

  it('demande les thèmes à DeepSeek et renvoie les questions', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ questions: [{ theme: 'Espace', question: 'Quelle planète est rouge ?', reponses: ['Mars', 'Vénus', 'Terre', 'Saturne'], bonne: 0 }] }) } }],
        }),
      ),
    );
    const gen = deepseekQuiz({ DEEPSEEK_API_KEY: 'k' }, fetchImpl as typeof fetch)!;
    const out = await gen(['Espace', 'Cinéma'], 'moyen', 5);
    expect(out).toHaveLength(1);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(body.messages[1].content).toContain('« Espace », « Cinéma »');
    expect(body.messages[1].content).toContain('Niveau : moyen');
    expect(deepseekQuiz({}, fetchImpl as typeof fetch)).toBeNull();
  });
});

describe('quiz : partie', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('prépare, lit, ouvre les réponses, puis compte les points à la vitesse', async () => {
    const { room, conns, ids, generator } = await setup();
    expect(room.phase).toBe('prep');
    // Commandé à l'arrivée du 2e joueur (thème par défaut), puis dès le réglage du thème, avec le maximum de questions.
    expect(generator.mock.calls.map((c) => c[0])).toEqual([['Culture générale'], ['Football']]);
    expect(generator.mock.calls[1]![2]).toBe(20);

    await vi.advanceTimersByTimeAsync(QUIZ_PREP_MIN_MS);
    expect(room.phase).toBe('answer');
    const s = conns[0]!.state().quiz!;
    expect(s.source).toBe('ia');
    expect(s.index).toBe(1);
    expect(s.total).toBe(5);
    expect(s.question!.text).toBe('Question numéro 1 ?');
    expect(JSON.stringify(s)).not.toContain('Anecdote');

    // Trop tôt : la question se lit encore.
    room.handle(ids[0]!, { t: 'quiz', pick: 0 });
    expect(conns[0]!.state().quiz!.mine).toBeNull();

    await vi.advanceTimersByTimeAsync(QUIZ_READ_MS);
    room.handle(ids[0]!, { t: 'quiz', pick: 0 });
    room.handle(ids[0]!, { t: 'quiz', pick: 1 }); // verrouillée : on ne change plus
    expect(conns[0]!.state().quiz!.mine).toBe(0);
    expect(conns[1]!.state().quiz!.mine).toBeNull();
    expect(conns[1]!.state().quiz!.answered).toEqual([ids[0]]);

    await vi.advanceTimersByTimeAsync(QUIZ_ANSWER_TIME * 500);
    room.handle(ids[1]!, { t: 'quiz', pick: 2 });
    expect(room.phase).toBe('reveal');
    const reveal = conns[1]!.state().quiz!.reveal!;
    expect(reveal.answer).toBe(0);
    expect(reveal.explain).toBe('Anecdote 1');
    expect(reveal.gains).toEqual({ [ids[0]!]: 1000 });
    expect(reveal.fastest).toBe(ids[0]);
    expect(reveal.streaks).toEqual({ [ids[0]!]: 1, [ids[1]!]: 0 });

    // Deuxième question, la bonne réponse est B : J0 enchaîne et prend le bonus de série.
    await vi.advanceTimersByTimeAsync(QUIZ_REVEAL_TIME * 1000 + QUIZ_READ_MS);
    expect(conns[0]!.state().quiz!.index).toBe(2);
    room.handle(ids[0]!, { t: 'quiz', pick: 1 });
    await vi.advanceTimersByTimeAsync(QUIZ_ANSWER_TIME * 1000);
    expect(room.phase).toBe('reveal');
    expect(conns[0]!.state().quiz!.reveal!.gains).toEqual({ [ids[0]!]: 1100 });
    expect(conns[0]!.state().players.find((p) => p.id === ids[0])!.score).toBe(2100);
  });

  it('va au bout des questions puis termine la partie', async () => {
    const { room, conns } = await setup({ questions: 5 });
    await vi.advanceTimersByTimeAsync(QUIZ_PREP_MIN_MS);
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(QUIZ_READ_MS + QUIZ_ANSWER_TIME * 1000 + QUIZ_REVEAL_TIME * 1000);
    expect(room.phase).toBe('gameEnd');
    expect(conns[0]!.state().quiz!.history).toHaveLength(5);
  });

  it('se rabat sur la réserve quand l’IA échoue', async () => {
    const { room, conns } = await setup({ generator: async () => Promise.reject(new Error('panne')) });
    await vi.advanceTimersByTimeAsync(QUIZ_PREP_MIN_MS);
    expect(room.phase).toBe('answer');
    const s = conns[0]!.state().quiz!;
    expect(s.source).toBe('reserve');
    // Le thème demandé passe en premier quand la réserve en a.
    expect(s.question!.theme).toBe('Sport');
    expect(conns[0]!.json.some((m) => m.t === 'chat' && m.line.text.includes('réserve'))).toBe(true);
  });
});
