import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOMB_BOOM_PAUSE, BOMB_COUNTDOWN, BOMB_FUSE, BOMB_LETTERS, foldWord, newBonusLetters, type ServerMsg } from '@julaika/shared';
import { isFrenchWord, syllablesFor, wordsWith } from '../apps/server/src/dico';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
  all<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

function setup(n = 3, lives = 2) {
  const room = new Room('BOM', undefined, () => 0);
  room.game = 'bombe';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { rounds: lives, difficulty: 'facile' } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids, bomb: () => room.stateFor(ids[0]!).bomb! };
}

/** Un vrai mot du dictionnaire qui contient la syllabe (le n-ième, pour varier). */
function wordWith(syllable: string, skip = 0): string {
  return wordsWith(syllable)[skip]!;
}

type Internals = { bomb: { letters: Map<string, string>; syllable: string } };

describe('Bombe à mots', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('replie accents et ligatures, et compte les lettres bonus', () => {
    expect(foldWord(' Cœur ')).toBe('coeur');
    expect(foldWord('Élève')).toBe('eleve');
    expect(newBonusLetters('abricot', 'a')).toBe('bciort');
    expect(newBonusLetters('kiwi', '')).toBe('i'); // k et w ne comptent pas
  });

  it('tire des syllabes plus rares quand c’est difficile', () => {
    expect(syllablesFor('facile').length).toBeGreaterThan(100);
    expect(syllablesFor('difficile').length).toBeGreaterThan(syllablesFor('facile').length);
    expect(syllablesFor('facile')).toContain('ent');
    expect(isFrenchWord('mangeaient')).toBe(true);
    expect(isFrenchWord('zxqv')).toBe(false);
  });

  it('un mot valide passe la bombe au voisin, un mot refusé la laisse', () => {
    const { room, conns, ids, bomb } = setup();
    expect(room.phase).toBe('bomb');
    expect(bomb().holder).toBe(ids[0]);
    const syllable = bomb().syllable;

    // Avant la fin du compte à rebours, rien ne compte.
    room.handle(ids[0]!, { t: 'bomb', word: wordWith(syllable) });
    expect(bomb().holder).toBe(ids[0]);
    vi.advanceTimersByTime(BOMB_COUNTDOWN);
    expect(bomb().litAt).not.toBeNull();

    // Seul celui qui tient la bombe peut jouer, et ce qu'il tape est relayé aux autres.
    room.handle(ids[1]!, { t: 'bomb', word: wordWith(syllable) });
    room.handle(ids[0]!, { t: 'bomb', typing: 'ab' });
    expect(conns[1]!.last('bombTyping')).toEqual({ t: 'bombTyping', by: ids[0], text: 'ab' });
    expect(conns[0]!.last('bombTyping')).toBeUndefined();

    room.handle(ids[0]!, { t: 'bomb', word: 'zzzz' });
    expect(conns[2]!.last('bombEvent')!.event).toMatchObject({ kind: 'bad', reason: 'syllabe' });
    room.handle(ids[0]!, { t: 'bomb', word: `${syllable}zzq` });
    expect(conns[2]!.last('bombEvent')!.event).toMatchObject({ kind: 'bad', reason: 'inconnu' });
    expect(bomb().holder).toBe(ids[0]);

    const word = wordWith(syllable);
    room.handle(ids[0]!, { t: 'bomb', word: word.toUpperCase() });
    expect(conns[2]!.last('bombEvent')!.event).toMatchObject({ kind: 'ok', by: ids[0], word });
    expect(bomb()).toMatchObject({ holder: ids[1], last: { by: ids[0], word }, words: { [ids[0]!]: 1 } });
    expect(bomb().syllable).not.toBe(syllable);
    expect(room.publicPlayers()[0]!.score).toBeGreaterThan(0);
  });

  it('refuse un mot déjà dit', () => {
    const { room, conns, ids, bomb } = setup();
    vi.advanceTimersByTime(BOMB_COUNTDOWN);
    const syllable = bomb().syllable;
    const word = wordWith(syllable);
    room.handle(ids[0]!, { t: 'bomb', word });
    (room as unknown as Internals).bomb.syllable = syllable;
    room.handle(ids[1]!, { t: 'bomb', word: word.toUpperCase() });
    expect(conns[0]!.last('bombEvent')!.event).toMatchObject({ kind: 'bad', by: ids[1], reason: 'deja' });
    expect(bomb().holder).toBe(ids[1]);
  });

  it('la bombe explose chez celui qui la tient, jusqu’au dernier survivant', () => {
    const { room, conns, ids, bomb } = setup(2, 1);
    vi.advanceTimersByTime(BOMB_COUNTDOWN);
    vi.advanceTimersByTime(BOMB_FUSE[0] * 1000);
    expect(conns[1]!.last('bombEvent')!.event).toMatchObject({ kind: 'boom', by: ids[0], lives: 0 });
    expect(bomb().lives[ids[0]!]).toBe(0);
    vi.advanceTimersByTime(BOMB_BOOM_PAUSE);
    expect(room.phase).toBe('gameEnd');
    const ranking = conns[0]!.last('gameEnd')!.ranking;
    expect(ranking[0]!.id).toBe(ids[1]);
  });

  it('après une explosion, la bombe repart du voisin avec une nouvelle mèche', () => {
    const { room, ids, bomb } = setup(3, 2);
    vi.advanceTimersByTime(BOMB_COUNTDOWN + BOMB_FUSE[0] * 1000);
    expect(bomb()).toMatchObject({ holder: ids[1], litAt: null, lives: { [ids[0]!]: 1 } });
    vi.advanceTimersByTime(BOMB_BOOM_PAUSE);
    expect(bomb().litAt).not.toBeNull();
    expect(room.phase).toBe('bomb');
  });

  it('toutes les lettres placées rendent une vie perdue', () => {
    const { room, conns, ids, bomb } = setup(2, 2);
    vi.advanceTimersByTime(BOMB_COUNTDOWN + BOMB_FUSE[0] * 1000 + BOMB_BOOM_PAUSE);
    // J0 a perdu une vie ; c'est J1 qui tient la bombe.
    expect(bomb().holder).toBe(ids[1]);
    room.handle(ids[1]!, { t: 'bomb', word: wordWith(bomb().syllable) });
    expect(bomb().holder).toBe(ids[0]);
    // On simule un joueur à qui il ne manque qu'une lettre du mot qu'il va donner.
    const syllable = bomb().syllable;
    const word = wordWith(syllable, 3);
    const missing = newBonusLetters(word, '');
    (room as unknown as Internals).bomb.letters.set(ids[0]!, [...BOMB_LETTERS].filter((c) => !missing.includes(c)).join(''));
    room.handle(ids[0]!, { t: 'bomb', word });
    expect(conns[1]!.last('bombEvent')!.event).toEqual({ kind: 'life', by: ids[0], lives: 2 });
    expect(bomb().letters[ids[0]!]).toBe('');
  });

  it('un départ fait passer la bombe ; seul restant = fin de partie', () => {
    const { room, ids, bomb } = setup(3);
    vi.advanceTimersByTime(BOMB_COUNTDOWN);
    room.leave(ids[0]!);
    expect(bomb().holder).toBe(ids[1]);
    room.leave(ids[1]!);
    expect(room.phase).toBe('lobby'); // moins de 2 joueurs : retour au salon
  });
});
