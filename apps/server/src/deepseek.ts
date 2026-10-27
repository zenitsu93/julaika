import { QUIZ_DEFAULT_THEME, aovFits, normalize, type AovHeat, type AovKind, type Difficulty, type IntrusPair, type QuizQuestion, type TurnKind } from '@julaika/shared';

/** Fournit `count` mots nouveaux pour une difficulté (à dessiner ou à mimer), en évitant ceux de `avoid`. */
export type WordGenerator = (difficulty: Difficulty, count: number, avoid: string[], kind?: TurnKind) => Promise<string[]>;

/** Fournit `count` paires nouvelles pour L'Intrus, sans réutiliser les mots de `avoid`. */
export type PairGenerator = (count: number, avoid: string[]) => Promise<IntrusPair[]>;

/** Écrit `count` questions de quiz sur les thèmes donnés, au niveau demandé. */
export type QuizGenerator = (themes: string[], difficulty: Difficulty, count: number) => Promise<QuizQuestion[]>;

// Quelques thèmes tirés au hasard à chaque appel : sans eux, le modèle ressort toujours les mêmes mots.
const THEMES = [
  'animaux', 'cuisine', 'sport', 'métiers', 'maison', 'nature', 'transports', 'musique', 'fêtes',
  'école', 'vêtements', 'corps humain', 'météo', 'mer', 'espace', 'contes et légendes', 'bricolage',
  'jeux et jouets', 'ville', 'ferme', 'technologie', 'vacances', 'cinéma', 'Afrique', 'marché', 'jardin',
];

// Les trois niveaux sont décrits ensemble et le modèle range ses mots dans chacun : il calibre
// bien mieux en comparant qu'en jugeant un niveau isolé. Seule la liste demandée est gardée.
const SYSTEM = `Tu fournis des mots pour julaïka, un jeu de dessin en ligne : un joueur dessine le mot, les autres le devinent dans le chat. Les joueurs sont francophones (France, Afrique, Canada…) et de tous âges.
Les trois niveaux :
- facile : un objet, animal, aliment ou personnage du quotidien, qu'un enfant de 8 ans dessine en quelques traits (ex. chat, pomme, soleil, vélo) ;
- moyen : un objet moins courant, un métier, un lieu ou un mot composé, qui demande un dessin travaillé (ex. phare, boulanger, brosse à dents, hamac) ;
- difficile : une scène, une action, une situation, une expression imagée ou un phénomène, qu'on fait deviner en combinant plusieurs éléments ou avec astuce, jamais une idée abstraite ni un mot rare (ex. embouteillage, coup de soleil, tir à la corde, fou rire).
Chaque mot doit être :
- en français, au singulier, en minuscules (sauf noms propres), de 1 à 4 mots courts et 30 caractères au plus ;
- dessinable : on doit pouvoir le faire deviner par un dessin, sans écrire de lettres ni de chiffres ;
- connu de la plupart des gens et tout public (ni violence, ni armes, ni sexe, ni alcool ni drogue, ni politique) ;
- différent des autres mots et des exemples ci-dessus.
Réponds uniquement en JSON, au format {"facile": [...], "moyen": [...], "difficile": [...]}.`;

const SYSTEM_MIME = `Tu fournis des mots pour le mode mime de julaïka, un jeu en ligne entre amis : un joueur mime le mot devant sa caméra, sans parler, et les autres le devinent dans le chat. Les joueurs sont francophones (France, Afrique, Canada…) et de tous âges.
Les trois niveaux :
- facile : une action du quotidien ou un animal qu'on reconnaît tout de suite au geste (ex. nager, se brosser les dents, singe, téléphoner) ;
- moyen : un métier, un sport ou une activité qui demande quelques gestes enchaînés (ex. dentiste, jongler, faire la vaisselle, pilote d'avion) ;
- difficile : une situation ou une petite histoire à jouer, une expression imagée (ex. rater le bus, avoir le hoquet, perdre ses clés, fou rire).
Chaque mot doit être :
- en français, au singulier, en minuscules (sauf noms propres), de 1 à 4 mots courts et 30 caractères au plus ;
- mimable : on doit pouvoir le faire deviner avec le corps et le visage, seul devant une caméra, sans parler ni écrire ;
- connu de la plupart des gens et tout public (ni violence, ni armes, ni sexe, ni alcool ni drogue, ni politique) ;
- différent des autres mots et des exemples ci-dessus.
Réponds uniquement en JSON, au format {"facile": [...], "moyen": [...], "difficile": [...]}.`;

const SYSTEM_PAIRS = `Tu fournis des paires de mots pour L'Intrus, un jeu d'ambiance en ligne : tous les joueurs reçoivent le même mot (le mot « civil »), sauf un, l'intrus, qui reçoit un mot proche sans savoir qu'il est l'intrus. Chacun donne à son tour un indice d'un ou deux mots, puis tout le monde vote pour démasquer l'intrus. Les joueurs sont francophones (France, Afrique, Canada…) et de tous âges.
Les deux mots d'une paire doivent :
- appartenir au même univers et partager des indices possibles, pour que l'intrus passe inaperçu au début (ex. plage et piscine, café et thé, chat et tigre, guitare et violon, attiéké et couscous) ;
- rester bien distincts, pour que des indices précis finissent par le trahir (ni synonymes, ni l'un contenu dans l'autre, ni simple variante d'orthographe).
Chaque mot doit être :
- en français, au singulier, en minuscules (sauf noms propres), de 1 à 3 mots courts et 30 caractères au plus ;
- connu de la plupart des gens et tout public (ni violence, ni armes, ni sexe, ni alcool ni drogue, ni politique, ni religion) ;
- différent de tous les autres mots de la liste et des exemples ci-dessus.
Réponds uniquement en JSON, au format {"paires": [{"civil": "...", "intrus": "..."}]}.`;

/** Fournit des cartes nouvelles d'Action ou vérité pour un niveau, sans redonner celles de `avoid`. */
export type DareGenerator = (heat: AovHeat, count: number, avoid: string[]) => Promise<Record<AovKind, string[]>>;

// Les trois niveaux sont décrits ensemble pour que le modèle calibre ; seul celui demandé est gardé,
// puis repassé au filtre de niveau (aovFits) : rien d'explicite, même en Spicy.
const SYSTEM_DARES = `Tu écris des cartes pour « Action ou vérité » sur julaïka, un site de jeux entre amis et en couple. Les joueurs sont souvent en visio (caméra et micro), parfois dans la même pièce. Ils sont francophones (France, Afrique, Canada…) et majeurs.
Les trois niveaux :
- lite : fun et sans gêne entre amis ou collègues, aucune séduction ni romance (ex. vérité « Quelle est la pire excuse que tu aies inventée pour annuler un plan ? » ; action « Parle avec l'accent de ton choix jusqu'à ton prochain tour. ») ;
- complice : tendre et complice, pour un couple ou de très bons amis : souvenirs, compliments, petites déclarations (ex. « Qu'est-ce qui t'a fait craquer en premier chez {nom} ? » ; « Regarde {nom} dans les yeux à la caméra pendant 20 secondes sans rire. ») ;
- spicy : taquin et séducteur, qui fait rougir mais reste suggestif et jamais explicite : regards, murmures, compliments audacieux, rendez-vous rêvés (ex. « Quel regard de {nom} te trouble le plus ? » ; « Murmure un compliment à {nom} au micro, tout doucement. »).
Chaque carte doit :
- être en français, tutoyer le joueur, faire une seule phrase de 160 caractères au plus ;
- pour une action, se faire en moins d'une minute devant une caméra, sans matériel spécial ni sortir de chez soi ;
- pouvoir viser un autre joueur avec {nom} (écrit exactement ainsi), sans obligation ;
- respecter tout le monde : jamais de nudité, de vêtement à retirer, de sexe, d'alcool, de drogue, de danger, d'humiliation, ni de question sur la religion, la santé ou l'argent ;
- être différente des autres cartes et des exemples ci-dessus.
Réponds uniquement en JSON, au format {"action": [...], "verite": [...]}.`;

const SYSTEM_QUIZ = `Tu écris les questions d'un quiz de culture générale pour julaïka, un site de jeux entre amis : les joueurs répondent en même temps, et le plus rapide marque le plus. Ils sont francophones (France, Afrique, Canada…) et de tous âges.
Les thèmes sont écrits librement par les joueurs. Si un thème est flou, prends-le au sens le plus courant ; s'il est inapproprié (violence, sexe, haine…) ou n'est pas un thème, remplace-le par « ${QUIZ_DEFAULT_THEME} ».
Chaque question :
- porte sur un fait sûr et vérifiable, sans ambiguïté ni opinion, et n'a qu'une seule bonne réponse ;
- est courte (une phrase de 140 caractères au plus) et se comprend sans image ;
- a 4 réponses courtes (40 caractères au plus), du même genre et plausibles, pour que les mauvaises fassent hésiter ; jamais « toutes ces réponses » ni « aucune » ;
- est suivie d'une anecdote d'une phrase (160 caractères au plus) qui explique la bonne réponse ou apprend quelque chose ;
- est différente des autres : varie les angles (dates, lieux, personnes, chiffres, définitions).
Le niveau :
- facile : ce que sait presque tout le monde ;
- moyen : ce que sait quelqu'un qui s'intéresse au thème ;
- difficile : pour les passionnés, sans tomber dans le détail introuvable.
Réponds uniquement en JSON, au format {"questions": [{"theme": "...", "question": "...", "reponses": ["...", "...", "...", "..."], "bonne": 0, "anecdote": "..."}]}, où "bonne" est l'indice (de 0 à 3) de la bonne réponse et "theme" l'un des thèmes donnés.`;

const MAX_LENGTH = 30;
const MAX_DARE_LENGTH = 160;
const MAX_PAIR_WORDS = 3;
const MAX_WORDS = 4;
const WORD = /^\p{L}[\p{L}' -]*\p{L}$/u;
const MAX_CALLS_PER_HOUR = 60;
const PAUSE_AFTER_ERROR_MS = 60_000;
const TIMEOUT_MS = 15_000;

interface CallOptions {
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * Appelle l'API DeepSeek (format OpenAI) et renvoie ce que `extract` tire de la réponse JSON,
 * ou `null` sans `DEEPSEEK_API_KEY`. Les salons sont ouverts à tous : les appels sont plafonnés
 * par heure pour tout le serveur, et suspendus une minute après une erreur (le jeu repasse
 * alors sur les listes intégrées).
 */
function deepseekCaller(env: typeof process.env, fetchImpl: typeof fetch, tag: string, opts: CallOptions = {}) {
  const key = env.DEEPSEEK_API_KEY?.trim();
  if (!key) return null;
  const model = env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
  const baseUrl = (env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/+$/, '');
  const calls: number[] = [];
  let pausedUntil = 0;

  return async <T>(system: string, prompt: string, extract: (content: string) => T[]): Promise<T[]> => {
    const now = Date.now();
    while (calls.length && calls[0]! <= now - 3_600_000) calls.shift();
    if (now < pausedUntil || calls.length >= MAX_CALLS_PER_HOUR) throw new Error('DeepSeek : appels suspendus pour le moment');
    calls.push(now);

    try {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          // Sans ça, deepseek-flash réfléchit d'abord : plus lent, et la réflexion peut épuiser max_tokens.
          thinking: { type: 'disabled' },
          temperature: opts.temperature ?? 1,
          max_tokens: opts.maxTokens ?? 1500,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`DeepSeek : HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const items = extract(body.choices?.[0]?.message?.content ?? '');
      if (!items.length) throw new Error('DeepSeek : aucun mot exploitable dans la réponse');
      return items;
    } catch (err) {
      pausedUntil = Date.now() + PAUSE_AFTER_ERROR_MS;
      console.warn(`[${tag}] ${err instanceof Error ? err.message : err} : listes intégrées pendant une minute`);
      throw err;
    }
  };
}

function pickThemes(random: () => number): string[] {
  return [...THEMES].sort(() => random() - 0.5).slice(0, 3);
}

/** Générateur de paires pour L'Intrus, ou `null` sans `DEEPSEEK_API_KEY`. */
export function deepseekPairs(env = process.env, fetchImpl: typeof fetch = fetch, random = Math.random): PairGenerator | null {
  const call = deepseekCaller(env, fetchImpl, 'intrus');
  if (!call) return null;

  return async (count, avoid) => {
    const prompt = [
      `Pour varier, pioche surtout dans ces thèmes : ${pickThemes(random).join(', ')}.`,
      avoid.length ? `Mots déjà sortis, à ne pas redonner : ${avoid.join(', ')}.` : '',
      `Donne ${count} paires.`,
    ]
      .filter(Boolean)
      .join('\n');
    const taken = new Set(avoid.map(normalize));
    const pairs = await call(SYSTEM_PAIRS, prompt, (content) =>
      parsePairs(content).filter((p) => !taken.has(normalize(p.civil)) && !taken.has(normalize(p.intrus))),
    );
    return pairs.slice(0, count);
  };
}

/** Générateur de cartes pour Action ou vérité, ou `null` sans `DEEPSEEK_API_KEY`. */
export function deepseekDares(env = process.env, fetchImpl: typeof fetch = fetch): DareGenerator | null {
  const call = deepseekCaller(env, fetchImpl, 'action-verite');
  if (!call) return null;

  return async (heat, count, avoid) => {
    const prompt = [
      avoid.length ? `Cartes déjà sorties, à ne pas redonner : ${avoid.join(' | ')}` : '',
      `Donne ${count} actions et ${count} vérités du niveau « ${heat} ».`,
    ]
      .filter(Boolean)
      .join('\n');
    const taken = new Set(avoid.map(normalize));
    const [cards] = await call(SYSTEM_DARES, prompt, (content) => {
      const parsed = parseDares(content, heat);
      for (const kind of ['action', 'verite'] as const) parsed[kind] = parsed[kind].filter((t) => !taken.has(normalize(t))).slice(0, count);
      return parsed.action.length + parsed.verite.length ? [parsed] : [];
    });
    return cards!;
  };
}

/** Extrait les cartes (`{"action": [...], "verite": [...]}`) qui passent le filtre du niveau. */
export function parseDares(content: string, heat: AovHeat): Record<AovKind, string[]> {
  const out: Record<AovKind, string[]> = { action: [], verite: [] };
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return out;
  }
  const seen = new Set<string>();
  for (const kind of ['action', 'verite'] as const) {
    const list = (data as Partial<Record<AovKind, unknown>> | null)?.[kind];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      // Seul {nom} est un emplacement : toute autre accolade trahirait un gabarit mal rempli.
      const text = raw.replace(/[`]/g, "'").replace(/\s+/g, ' ').trim();
      if (text.length < 12 || text.length > MAX_DARE_LENGTH || /[{}]/.test(text.replaceAll('{nom}', ''))) continue;
      if (!aovFits(text, heat)) continue;
      const id = normalize(text);
      if (seen.has(id)) continue;
      seen.add(id);
      out[kind].push(text);
    }
  }
  return out;
}

/** Générateur de mots pour le jeu de dessin, ou `null` sans `DEEPSEEK_API_KEY`. */
export function deepseekWords(env = process.env, fetchImpl: typeof fetch = fetch, random = Math.random): WordGenerator | null {
  const call = deepseekCaller(env, fetchImpl, 'mots');
  if (!call) return null;

  return async (difficulty, count, avoid, kind = 'draw') => {
    const prompt = [
      `Pour varier, pioche surtout dans ces thèmes : ${pickThemes(random).join(', ')}.`,
      avoid.length ? `Mots déjà sortis, à ne pas redonner : ${avoid.join(', ')}.` : '',
      `Donne ${count} mots du niveau « ${difficulty} ». Pour te calibrer, range aussi 8 mots dans chacun des deux autres niveaux.`,
    ]
      .filter(Boolean)
      .join('\n');
    const taken = new Set(avoid.map(normalize));
    const words = await call(kind === 'mime' ? SYSTEM_MIME : SYSTEM, prompt, (content) => parseWords(content, difficulty).filter((w) => !taken.has(normalize(w))));
    return words.slice(0, count);
  };
}

/**
 * Générateur de questions pour le quiz, ou `null` sans `DEEPSEEK_API_KEY`. Les faits comptent
 * plus que la fantaisie : température plus basse, et plus de temps pour une vingtaine de questions.
 */
export function deepseekQuiz(env = process.env, fetchImpl: typeof fetch = fetch, random = Math.random): QuizGenerator | null {
  const call = deepseekCaller(env, fetchImpl, 'quiz', { maxTokens: 6000, timeoutMs: 45_000, temperature: 0.7 });
  if (!call) return null;

  return async (themes, difficulty, count) => {
    // Quelques questions de plus : celles qui ne passent pas les contrôles tombent.
    const ask = Math.min(25, count + 3);
    const prompt = [
      themes.length > 1
        ? `Thèmes, à répartir à parts égales et dans le désordre : ${themes.map((t) => `« ${t} »`).join(', ')}.`
        : `Thème : « ${themes[0] ?? QUIZ_DEFAULT_THEME} ».`,
      `Niveau : ${difficulty}.`,
      `Donne ${ask} questions.`,
    ].join('\n');
    const questions = await call(SYSTEM_QUIZ, prompt, (content) => parseQuiz(content, themes, random));
    return questions.slice(0, count);
  };
}

/**
 * Extrait les questions (`{"questions": [...]}`) en écartant celles qui ne tiendraient pas à l'écran
 * ou dont la réponse est douteuse, puis mélange les réponses : le modèle range trop souvent la bonne en premier.
 */
export function parseQuiz(content: string, themes: string[], random: () => number = Math.random): QuizQuestion[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const list = (data as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return [];
  const byKey = new Map(themes.map((t) => [normalize(t), t]));
  const seen = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const raw of list) {
    const item = raw as { theme?: unknown; question?: unknown; reponses?: unknown; bonne?: unknown; anecdote?: unknown } | null;
    const text = cleanText(item?.question, 160);
    if (!text || text.length < 8 || !Array.isArray(item?.reponses) || item.reponses.length !== 4) continue;
    const options = item.reponses.map((r) => cleanText(typeof r === 'number' ? String(r) : r, 50));
    if (options.some((o) => !o)) continue;
    if (new Set(options.map((o) => normalize(o!))).size !== 4) continue;
    // La bonne réponse : un indice de 0 à 3, ou à défaut le texte d'une des réponses.
    let answer = typeof item.bonne === 'number' ? item.bonne : Number.NaN;
    if (typeof item.bonne === 'string') {
      answer = /^[0-3]$/.test(item.bonne) ? Number(item.bonne) : options.findIndex((o) => normalize(o!) === normalize(item.bonne as string));
    }
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);

    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const theme = byKey.get(normalize(String(item.theme ?? ''))) ?? themes[0] ?? QUIZ_DEFAULT_THEME;
    out.push({
      theme,
      text,
      options: order.map((i) => options[i]!),
      answer: order.indexOf(answer),
      explain: cleanText(item.anecdote, 220) ?? '',
    });
  }
  return out;
}

function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[\u0000-\u001f]/g, ' ').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  return text && text.length <= max ? text : null;
}

/** Extrait les mots du niveau demandé (`{"difficile": [...]}`) en écartant ce qui ne tiendrait pas dans le jeu. */
export function parseWords(content: string, difficulty: Difficulty): string[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const list = (data as Partial<Record<Difficulty, unknown>> | null)?.[difficulty];
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of list) {
    const word = cleanWord(raw, MAX_WORDS);
    if (!word) continue;
    const id = normalize(word);
    if (seen.has(id)) continue;
    seen.add(id);
    words.push(word);
  }
  return words;
}

/** Extrait les paires (`{"paires": [{"civil": ..., "intrus": ...}]}`) en écartant celles qui ne tiendraient pas dans le jeu. */
export function parsePairs(content: string): IntrusPair[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const list = (data as { paires?: unknown } | null)?.paires;
  if (!Array.isArray(list)) return [];
  // Un mot ne sert qu'une fois : deux paires qui partagent un mot se trahiraient d'une manche à l'autre.
  const seen = new Set<string>();
  const pairs: IntrusPair[] = [];
  for (const raw of list) {
    const item = raw as Partial<Record<keyof IntrusPair, unknown>> | null;
    const civil = cleanWord(item?.civil, MAX_PAIR_WORDS);
    const intrus = cleanWord(item?.intrus, MAX_PAIR_WORDS);
    if (!civil || !intrus) continue;
    const a = normalize(civil);
    const b = normalize(intrus);
    if (a === b || seen.has(a) || seen.has(b)) continue;
    seen.add(a).add(b);
    pairs.push({ civil, intrus });
  }
  return pairs;
}

/** Mot nettoyé (apostrophes, espaces), ou `null` s'il ne tiendrait pas dans le jeu. */
function cleanWord(raw: unknown, maxWords: number): string | null {
  if (typeof raw !== 'string') return null;
  const word = raw.replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  if (word.length > MAX_LENGTH || word.split(' ').length > maxWords || !WORD.test(word)) return null;
  return word;
}
