import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORY_COUNTDOWN, STORY_EVERY, STORY_FILLER, STORY_LENGTH, STORY_POINTS, STORY_RULE_TIME, STORY_TIME, checkStoryRule, cleanStoryWord, type ServerMsg } from '@julaika/shared';
import { Room, type Conn } from '../apps/server/src/room';

class FakeConn implements Conn {
  json: ServerMsg[] = [];
  send(data: string | ArrayBuffer | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
  }
  last<T extends ServerMsg['t']>(t: T) {
    return this.json.filter((m) => m.t === t).at(-1) as Extract<ServerMsg, { t: T }> | undefined;
  }
}

function setup(n = 2, stories = 1, random = () => 0) {
  const room = new Room('MOT', undefined, random);
  room.game = 'motamot';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { rounds: stories } });
  room.handle(ids[0]!, { t: 'start' });
  const mot = () => room.stateFor(ids[0]!).motamot!;
  /** Le joueur dont c'est le tour écrit `word`. */
  const say = (word: string) => room.handle(mot().turn!, { t: 'motamot', word });
  return { room, conns, ids, mot, say };
}

describe('Mot à mot', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('garde un seul mot propre, ponctuation collée comprise', () => {
    expect(cleanStoryWord('  chat  noir')).toBe('chat');
    expect(cleanStoryWord("l'éléphant,")).toBe("l'éléphant,");
    expect(cleanStoryWord('peut-être...')).toBe('peut-être…');
    expect(cleanStoryWord('!!!')).toBeNull();
    expect(cleanStoryWord('')).toBeNull();
  });

  it('vérifie les contraintes du serveur, laisse les autres au jury', () => {
    expect(checkStoryRule({ kind: 'mot', text: '', arg: 'mayonnaise', jury: false }, 'Mayonnaises!', [])).toBe(true);
    expect(checkStoryRule({ kind: 'lettre', text: '', arg: 'b', jury: false }, 'Éléphant', [])).toBe(false);
    expect(checkStoryRule({ kind: 'sansE', text: '', jury: false }, 'élan', [])).toBe(false);
    expect(checkStoryRule({ kind: 'long', text: '', jury: false }, 'extraordinaire', [])).toBe(true);
    expect(checkStoryRule({ kind: 'prenom', text: '', jury: false }, 'julaïka', ['Julaïka'])).toBe(true);
    expect(checkStoryRule({ kind: 'verbe', text: '', jury: true }, 'mange', [])).toBeNull();
  });

  it('un mot chacun à tour de rôle, partout le même récit', () => {
    const { ids, mot, say, conns } = setup();
    const starter = mot().words.length;
    expect(mot().turn).toBeNull();
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    expect(mot().turn).toBe(ids[0]);
    expect(mot().length).toBe(STORY_LENGTH[0]);

    // Seul celui dont c'est le tour joue, et ce qu'il tape est relayé.
    say('dansait');
    expect(mot().turn).toBe(ids[1]);
    expect(mot().words.at(-1)).toMatchObject({ by: ids[0], text: 'dansait', late: false });
    expect(mot().words.length).toBe(starter + 1);
    expect(conns[1]!.last('state')!.state.motamot!.written).toBe(1);
  });

  it('relaie la frappe et ignore les joueurs hors tour', () => {
    const { room, ids, mot, conns } = setup();
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    room.handle(ids[1]!, { t: 'motamot', word: 'triche' });
    expect(mot().written).toBe(0);
    room.handle(ids[0]!, { t: 'motamot', typing: 'pa' });
    expect(conns[1]!.last('storyTyping')).toEqual({ t: 'storyTyping', by: ids[0], text: 'pa' });
    expect(conns[0]!.last('storyTyping')).toBeUndefined();
  });

  it('temps écoulé : le mot tapé compte, sinon « euh… », sans point', () => {
    const { room, ids, mot } = setup();
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    room.handle(ids[0]!, { t: 'motamot', typing: 'pataté' });
    vi.advanceTimersByTime(STORY_TIME * 1000);
    expect(mot().words.at(-1)).toMatchObject({ text: 'pataté', late: true });
    vi.advanceTimersByTime(STORY_TIME * 1000);
    expect(mot().words.at(-1)).toMatchObject({ by: ids[1], text: STORY_FILLER, late: true });
    expect(room.stateFor(ids[0]!).players.every((p) => p.score === 0)).toBe(true);
  });

  it('une contrainte tombe tous les 6 mots, avec plus de temps', () => {
    const { mot, say } = setup();
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    for (let i = 0; i < STORY_EVERY - 1; i++) {
      expect(mot().rule).toBeNull();
      expect(mot().nextRule).toBe(STORY_EVERY - 1 - i);
      say('mot');
    }
    const rule = mot().rule!;
    expect(rule).not.toBeNull();
    expect(mot().nextRule).toBe(0);
    // Le tour sous contrainte dure plus longtemps.
    vi.advanceTimersByTime(STORY_TIME * 1000);
    expect(mot().written).toBe(STORY_EVERY - 1);
    vi.advanceTimersByTime((STORY_RULE_TIME - STORY_TIME) * 1000);
    expect(mot().written).toBe(STORY_EVERY);
    expect(mot().words.at(-1)!.rule).toEqual(rule);
  });

  it('lecture : étoiles, jury, puis fin de partie avec le recueil', () => {
    const { room, ids, mot, say } = setup();
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    // Une contrainte du jury, posée à la main pour le test.
    let juryIndex = -1;
    while (mot().written < mot().length) {
      const s = mot();
      if (s.rule?.jury && juryIndex < 0) juryIndex = s.words.length;
      say(s.rule?.kind === 'mot' ? s.rule.arg! : s.rule?.kind === 'lettre' ? `${s.rule.arg}arbre` : 'bof');
    }
    expect(room.phase).toBe('album');
    expect(mot().turn).toBeNull();
    // L'histoire finit sur un point.
    expect(mot().words.at(-1)!.text).toMatch(/[.!?…]$/);

    // On vote pour un mot de l'autre, pas pour le sien.
    const theirs = mot().words.findIndex((w) => w.by === ids[1]);
    const mine = mot().words.findIndex((w) => w.by === ids[0]);
    room.handle(ids[0]!, { t: 'motamot', star: mine });
    expect(mot().stars[ids[0]!]).toBeUndefined();
    room.handle(ids[0]!, { t: 'motamot', star: theirs });
    expect(mot().stars[ids[0]!]).toBe(theirs);

    if (juryIndex >= 0) {
      const judge = ids.find((id) => id !== mot().words[juryIndex]!.by)!;
      room.handle(judge, { t: 'motamot', veto: juryIndex });
      expect(mot().words[juryIndex]!.vetoes).toEqual([judge]);
    }

    const before = room.stateFor(ids[1]!).players.find((p) => p.id === ids[1])!.score;
    room.handle(ids[0]!, { t: 'motamot', ready: true });
    expect(room.phase).toBe('album');
    room.handle(ids[1]!, { t: 'motamot', ready: true });
    expect(room.phase).toBe('gameEnd');
    const s = room.stateFor(ids[0]!).motamot!;
    expect(s.tales).toHaveLength(1);
    if (juryIndex >= 0) expect(s.tales[0]![juryIndex]!.ok).toBe(false);
    const after = room.stateFor(ids[1]!).players.find((p) => p.id === ids[1])!.score;
    expect(after - before).toBeGreaterThanOrEqual(STORY_POINTS.star);
  });

  it('le jury recale une contrainte à la majorité', () => {
    // Tirage au bout de la liste : la contrainte « un mot doux », jugée par les autres.
    const { room, ids, mot, say } = setup(2, 1, () => 0.999);
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    while (!mot().rule) say('la');
    expect(mot().rule).toMatchObject({ kind: 'doux', jury: true });
    const author = mot().turn!;
    const judge = ids.find((id) => id !== author)!;
    say('chaussette');
    const index = mot().words.length - 1;
    expect(mot().words[index]!.ok).toBeNull();
    // On ne se juge pas soi-même ; on peut changer d'avis.
    room.handle(author, { t: 'motamot', veto: index });
    room.handle(judge, { t: 'motamot', veto: index });
    room.handle(judge, { t: 'motamot', veto: index });
    room.handle(judge, { t: 'motamot', veto: index });
    expect(mot().words[index]!.vetoes).toEqual([judge]);
    while (mot().written < mot().length) say('la');
    for (const id of ids) room.handle(id, { t: 'motamot', ready: true });
    expect(room.stateFor(ids[0]!).motamot!.tales[0]![index]!.ok).toBe(false);
  });

  it('enchaîne les histoires en changeant de premier joueur', () => {
    const { room, ids, mot, say } = setup(2, 2);
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    expect(mot().turn).toBe(ids[0]);
    while (mot().written < mot().length) say('la');
    for (const id of ids) room.handle(id, { t: 'motamot', ready: true });
    expect(mot().story).toBe(2);
    expect(mot().written).toBe(0);
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    expect(mot().turn).toBe(ids[1]);
  });

  it('si celui qui écrit part, la main passe au suivant', () => {
    const { room, ids, conns, mot } = setup(3);
    vi.advanceTimersByTime(STORY_COUNTDOWN);
    expect(mot().turn).toBe(ids[0]);
    room.leave(ids[0]!);
    const s = conns[1]!.last('state')!.state.motamot!;
    expect(s.turn).not.toBe(ids[0]);
    expect(s.order).not.toContain(ids[0]);
  });
});
