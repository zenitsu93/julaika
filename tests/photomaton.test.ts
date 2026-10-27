import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHOTO_ALL_RATED_MS,
  PHOTO_DEVELOP_MS,
  PHOTO_MAX_STARS,
  PHOTO_POSE_TIME,
  PHOTO_PROMPTS,
  PHOTO_REVEAL_TIME,
  PHOTO_STAR_POINTS,
  PHOTO_UPLOAD_GRACE,
  PHOTO_VOTE_INTRO,
  PHOTO_VOTE_TIME,
  type ServerMsg,
} from '@julaika/shared';
import { GAME_END_TIME, Room, type Conn } from '../apps/server/src/room';

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

const IMG = 'data:image/jpeg;base64,AAAA';

function setup(n = 3, rounds = 2) {
  const room = new Room('PHO', undefined, () => 0);
  room.game = 'photomaton';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { rounds } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

/** Tout le monde envoie sa photo (ou null pour ceux listés dans `noCam`). */
function shootAll(room: Room, ids: string[], noCam: number[] = []) {
  ids.forEach((id, i) => room.handle(id, { t: 'photo', image: noCam.includes(i) ? null : IMG }));
  develop();
}

/** Le flash, le temps que les tirages se révèlent, puis l'annonce de la notation. */
const develop = () => {
  vi.advanceTimersByTime(PHOTO_POSE_TIME * 1000 + PHOTO_DEVELOP_MS);
  vi.advanceTimersByTime(PHOTO_VOTE_INTRO * 1000);
};
/** Tout le monde valide ses notes, puis le petit temps avant la révélation. */
function readyAll(room: Room, ids: string[]) {
  for (const id of ids) room.handle(id, { t: 'photo', ready: true });
  vi.advanceTimersByTime(PHOTO_ALL_RATED_MS);
}

const photoState = (c: FakeConn) => c.last('state')!.state.photo!;
const score = (c: FakeConn, id: string) => c.last('state')!.state.players.find((p) => p.id === id)!.score;

describe('Photomaton', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pose, vote, révélation : une manche complète', () => {
    const { room, conns, ids } = setup();
    expect(room.phase).toBe('pose');
    const st = conns[1]!.last('state')!.state;
    expect(st.round).toBe(1);
    expect(st.endsAt).toBe(Date.now() + PHOTO_POSE_TIME * 1000);
    expect(st.photo).toMatchObject({ round: 1, rounds: 2, prompt: PHOTO_PROMPTS[0], players: ids, done: [], stars: {} });

    room.handle(ids[0]!, { t: 'photo', image: IMG });
    expect(photoState(conns[0]!).done).toEqual([ids[0]]);
    // Une seule photo par manche.
    room.handle(ids[0]!, { t: 'photo', image: null });
    shootAll(room, ids.slice(1));
    expect(room.phase).toBe('vote');
    expect(room.endsAt).toBe(Date.now() + PHOTO_VOTE_TIME * 1000);
    expect(photoState(conns[0]!).opensAt).toBe(Date.now());
    expect(photoState(conns[0]!).done).toEqual([]);
    for (const c of conns) {
      expect(c.last('photos')).toEqual({
        t: 'photos',
        round: 1,
        shots: ids.map((by, i) => ({ by, name: `J${i}`, avatar: i, image: IMG })),
      });
    }
    // Les photos ne passent jamais par l'état.
    expect(JSON.stringify(conns[0]!.last('state'))).not.toContain(IMG);

    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 5 });
    room.handle(ids[0]!, { t: 'photo', vote: ids[2]!, stars: 3 });
    room.handle(ids[1]!, { t: 'photo', vote: ids[0]!, stars: 4 });
    room.handle(ids[1]!, { t: 'photo', vote: ids[2]!, stars: 1 });
    room.handle(ids[2]!, { t: 'photo', vote: ids[0]!, stars: 2 });
    expect(room.phase).toBe('vote');
    room.handle(ids[2]!, { t: 'photo', vote: ids[1]!, stars: 5 });
    // Avoir tout noté ne suffit pas : on attend que chacun valide.
    expect(room.phase).toBe('vote');
    room.handle(ids[0]!, { t: 'photo', ready: true });
    room.handle(ids[1]!, { t: 'photo', ready: true });
    expect(photoState(conns[0]!).done).toEqual([ids[0], ids[1]]);
    // Une fois validé, on ne change plus sa note.
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 1 });
    room.handle(ids[2]!, { t: 'photo', ready: true });
    expect(room.phase).toBe('vote');
    vi.advanceTimersByTime(PHOTO_ALL_RATED_MS);
    expect(room.phase).toBe('reveal');
    expect(room.endsAt).toBe(Date.now() + PHOTO_REVEAL_TIME * 1000);
    expect(photoState(conns[0]!).stars).toEqual({
      [ids[0]!]: { total: 6, votes: 2 },
      [ids[1]!]: { total: 10, votes: 2 },
      [ids[2]!]: { total: 4, votes: 2 },
    });
    expect(score(conns[0]!, ids[0]!)).toBe(6 * PHOTO_STAR_POINTS);
    expect(score(conns[0]!, ids[1]!)).toBe(10 * PHOTO_STAR_POINTS);
    expect(score(conns[0]!, ids[2]!)).toBe(4 * PHOTO_STAR_POINTS);

    vi.advanceTimersByTime(PHOTO_REVEAL_TIME * 1000);
    expect(room.phase).toBe('pose');
    expect(photoState(conns[0]!)).toMatchObject({ round: 2, prompt: PHOTO_PROMPTS[1], done: [], stars: {} });
  });

  it('toutes les photos reçues : la table attend que les tirages se révèlent', () => {
    const { room, ids } = setup(2);
    ids.forEach((id) => room.handle(id, { t: 'photo', image: IMG }));
    expect(room.phase).toBe('pose');
    vi.advanceTimersByTime(PHOTO_POSE_TIME * 1000 + PHOTO_DEVELOP_MS - 1);
    expect(room.phase).toBe('pose');
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe('vote');
  });

  it('la notation s’annonce : pas d’étoiles avant l’ouverture', () => {
    const { room, conns, ids } = setup(2);
    ids.forEach((id) => room.handle(id, { t: 'photo', image: IMG }));
    vi.advanceTimersByTime(PHOTO_POSE_TIME * 1000 + PHOTO_DEVELOP_MS);
    expect(room.phase).toBe('vote');
    expect(photoState(conns[0]!).opensAt).toBe(Date.now() + PHOTO_VOTE_INTRO * 1000);
    expect(room.endsAt).toBe(Date.now() + (PHOTO_VOTE_INTRO + PHOTO_VOTE_TIME) * 1000);
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 5 });
    room.handle(ids[0]!, { t: 'photo', ready: true });
    expect(photoState(conns[0]!).done).toEqual([]);
    vi.advanceTimersByTime(PHOTO_VOTE_INTRO * 1000);
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 5 });
    room.handle(ids[0]!, { t: 'photo', ready: true });
    expect(photoState(conns[0]!).done).toEqual([ids[0]]);
    // L'autre a tout son temps.
    vi.advanceTimersByTime(PHOTO_VOTE_TIME * 1000 - 1);
    expect(room.phase).toBe('vote');
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe('reveal');
    expect(photoState(conns[0]!).stars[ids[1]!]).toEqual({ total: 5, votes: 1 });
  });

  it('l’hôte met en pause et relance : le temps restant est gardé', () => {
    const { room, conns, ids } = setup(2);
    vi.advanceTimersByTime(4000);
    // Un invité ne peut pas mettre en pause.
    room.handle(ids[1]!, { t: 'photo', pause: true });
    expect(photoState(conns[0]!).paused).toBe(false);
    room.handle(ids[0]!, { t: 'photo', pause: true });
    expect(photoState(conns[1]!)).toMatchObject({ paused: true, pausedLeft: PHOTO_POSE_TIME * 1000 - 4000 });
    expect(conns[1]!.last('state')!.state.endsAt).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('pose');
    room.handle(ids[0]!, { t: 'photo', pause: false });
    expect(photoState(conns[1]!).paused).toBe(false);
    expect(room.endsAt).toBe(Date.now() + PHOTO_POSE_TIME * 1000 - 4000);
    ids.forEach((id) => room.handle(id, { t: 'photo', image: IMG }));
    vi.advanceTimersByTime(PHOTO_POSE_TIME * 1000 - 4000 + PHOTO_DEVELOP_MS);
    expect(room.phase).toBe('vote');

    // Pause pendant le vote : les deux ont validé, la révélation attend la reprise.
    vi.advanceTimersByTime(PHOTO_VOTE_INTRO * 1000);
    room.handle(ids[0]!, { t: 'photo', pause: true });
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 3 });
    readyAll(room, ids);
    vi.advanceTimersByTime(120_000);
    expect(room.phase).toBe('vote');
    room.handle(ids[0]!, { t: 'photo', pause: false });
    vi.advanceTimersByTime(PHOTO_ALL_RATED_MS);
    expect(room.phase).toBe('reveal');
  });

  it('une image invalide devient null', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'photo', image: 'data:image/png;base64,AAAA' });
    room.handle(ids[1]!, { t: 'photo', image: 'x'.repeat(10) });
    room.handle(ids[2]!, { t: 'photo', image: IMG });
    develop();
    expect(room.phase).toBe('vote');
    expect(conns[0]!.last('photos')!.shots.map((s) => s.image)).toEqual([null, null, IMG]);
  });

  it('pas de vote pour soi ni pour une photo absente, étoiles bornées', () => {
    const { room, conns, ids } = setup();
    shootAll(room, ids, [2]);
    // J2 n'a pas de photo : il n'a qu'à noter J0 et J1. J0 et J1 n'ont chacun qu'une photo à noter.
    room.handle(ids[0]!, { t: 'photo', vote: ids[0]!, stars: 5 });
    room.handle(ids[0]!, { t: 'photo', vote: ids[2]!, stars: 5 });
    room.handle(ids[0]!, { t: 'photo', vote: 'inconnu', stars: 5 });
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 0 });
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: Number.NaN });
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: '4' as unknown as number });
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 99 });
    expect(photoState(conns[0]!).done).toEqual([]);
    vi.advanceTimersByTime(PHOTO_VOTE_TIME * 1000);
    expect(room.phase).toBe('reveal');
    expect(photoState(conns[0]!).stars).toEqual({
      [ids[0]!]: { total: 0, votes: 0 },
      [ids[1]!]: { total: PHOTO_MAX_STARS, votes: 1 },
    });
    expect(score(conns[0]!, ids[2]!)).toBe(0);
  });

  it('on peut changer sa note', () => {
    const { room, conns, ids } = setup(2);
    shootAll(room, ids);
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 1 });
    room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 4 });
    room.handle(ids[1]!, { t: 'photo', vote: ids[0]!, stars: 2.6 });
    readyAll(room, ids);
    expect(room.phase).toBe('reveal');
    expect(photoState(conns[0]!).stars).toEqual({ [ids[0]!]: { total: 3, votes: 1 }, [ids[1]!]: { total: 4, votes: 1 } });
  });

  it('les spectateurs ne posent ni ne votent, et reçoivent les photos en arrivant', () => {
    const { room, conns, ids } = setup();
    const late = new FakeConn();
    const lateId = room.join(late, 'Tard', 9)!;
    room.handle(lateId, { t: 'photo', image: IMG });
    expect(photoState(conns[0]!).done).toEqual([]);
    expect(late.last('photos')).toBeUndefined();
    shootAll(room, ids);
    expect(late.last('photos')!.shots).toHaveLength(3);

    room.handle(lateId, { t: 'photo', vote: ids[0]!, stars: 5 });
    const other = new FakeConn();
    room.join(other, 'Encore', 10);
    expect(other.last('photos')).toEqual(conns[0]!.last('photos'));
    expect(other.last('welcome')!.state.photo!.players).toEqual(ids);
    vi.advanceTimersByTime(PHOTO_VOTE_TIME * 1000);
    expect(photoState(conns[0]!).stars[ids[0]!]).toEqual({ total: 0, votes: 0 });
  });

  it('les minuteurs prennent le relais', () => {
    const { room, conns, ids } = setup();
    room.handle(ids[0]!, { t: 'photo', image: IMG });
    vi.advanceTimersByTime(PHOTO_POSE_TIME * 1000);
    // Après le flash, les photos peuvent encore arriver pendant le délai de grâce.
    expect(room.phase).toBe('pose');
    room.handle(ids[1]!, { t: 'photo', image: IMG });
    vi.advanceTimersByTime(PHOTO_UPLOAD_GRACE * 1000);
    expect(room.phase).toBe('vote');
    vi.advanceTimersByTime(PHOTO_VOTE_INTRO * 1000);
    expect(conns[2]!.last('photos')!.shots.map((s) => s.image)).toEqual([IMG, IMG, null]);
    // J2 n'a rien envoyé, mais il peut quand même voter.
    room.handle(ids[2]!, { t: 'photo', vote: ids[0]!, stars: 3 });
    room.handle(ids[2]!, { t: 'photo', image: IMG });
    vi.advanceTimersByTime(PHOTO_VOTE_TIME * 1000);
    expect(room.phase).toBe('reveal');
    expect(photoState(conns[0]!).stars[ids[0]!]).toEqual({ total: 3, votes: 1 });
  });

  it('sans aucune photo à noter, on passe directement à la révélation', () => {
    const { room, conns, ids } = setup();
    shootAll(room, ids, [0, 1, 2]);
    expect(room.phase).toBe('reveal');
    expect(photoState(conns[0]!).stars).toEqual({});
  });

  it('un joueur parti ne bloque ni la pose ni le vote', () => {
    const { room, ids } = setup(4);
    ids.slice(0, 2).forEach((id) => room.handle(id, { t: 'photo', image: IMG }));
    room.leave(ids[3]!);
    expect(room.phase).toBe('pose');
    room.handle(ids[2]!, { t: 'photo', image: IMG });
    develop();
    expect(room.phase).toBe('vote');
    for (const v of ids.slice(0, 2)) for (const t of ids.slice(0, 3)) if (v !== t) room.handle(v, { t: 'photo', vote: t, stars: 3 });
    readyAll(room, ids.slice(0, 2));
    expect(room.phase).toBe('vote');
    room.leave(ids[2]!);
    vi.advanceTimersByTime(PHOTO_ALL_RATED_MS);
    expect(room.phase).toBe('reveal');
  });

  it('la partie se termine après le nombre de manches', () => {
    const { room, conns, ids } = setup(2, 2);
    const prompts: string[] = [];
    for (let r = 0; r < 2; r++) {
      prompts.push(photoState(conns[0]!).prompt);
      shootAll(room, ids);
      room.handle(ids[0]!, { t: 'photo', vote: ids[1]!, stars: 2 });
      room.handle(ids[1]!, { t: 'photo', vote: ids[0]!, stars: 1 });
      readyAll(room, ids);
      vi.advanceTimersByTime(PHOTO_REVEAL_TIME * 1000);
    }
    expect(new Set(prompts).size).toBe(2);
    expect(conns[0]!.all('photos').map((m) => m.round)).toEqual([1, 2]);
    expect(room.phase).toBe('gameEnd');
    const ranking = conns[0]!.last('gameEnd')!.ranking;
    expect(ranking.map((p) => [p.id, p.score])).toEqual([
      [ids[1]!, 4 * PHOTO_STAR_POINTS],
      [ids[0]!, 2 * PHOTO_STAR_POINTS],
    ]);
    vi.advanceTimersByTime(GAME_END_TIME * 1000);
    expect(room.phase).toBe('lobby');
    expect(conns[0]!.last('state')!.state.photo).toBeNull();
  });
});
