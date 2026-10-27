import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AOV_HEAT_BONUS, AOV_JOKERS, AOV_PICK_TIME, AOV_POINTS, AOV_SPIN_MS, AOV_SPIN_WAIT, AOV_VERDICT_TIME, aovFits, aovHeat, aovTitles, type ServerMsg } from '@julaika/shared';
import { AOV_CARDS } from '../apps/server/src/aovCards';
import { parseDares } from '../apps/server/src/deepseek';
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

function setup(n = 2, rounds = 1, aovLevel: 'lite' | 'complice' | 'spicy' | 'crescendo' = 'lite') {
  const room = new Room('AOV', undefined, () => 0);
  room.game = 'verite';
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ids = conns.map((c, i) => room.join(c, `J${i}`, i)!);
  room.handle(ids[0]!, { t: 'settings', settings: { rounds, aovLevel } });
  room.handle(ids[0]!, { t: 'start' });
  return { room, conns, ids };
}

describe('Action ou vérité', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('chaque carte écrite respecte son niveau', () => {
    for (const heat of ['lite', 'complice', 'spicy'] as const) {
      for (const kind of ['action', 'verite'] as const) {
        const cards = AOV_CARDS[heat][kind];
        expect(cards.length).toBeGreaterThanOrEqual(25);
        expect(new Set(cards).size).toBe(cards.length);
        for (const text of cards) expect(aovFits(text, heat), `${heat} : ${text}`).toBe(true);
      }
    }
  });

  it('le filtre de niveau écarte l’explicite partout et la romance en Lite', () => {
    expect(aovFits('Enlève ton soutien-gorge', 'spicy')).toBe(false);
    expect(aovFits('Fais un strip-tease nue', 'spicy')).toBe(false);
    expect(aovFits('Envoie un bisou à {nom}', 'lite')).toBe(false);
    expect(aovFits('Envoie un bisou à {nom}', 'complice')).toBe(true);
    expect(aovFits('Danse de façon sexy', 'complice')).toBe(false);
    expect(aovFits('Danse de façon sexy', 'spicy')).toBe(true);
    expect(aovFits('Quel est ton écrivain préféré ?', 'lite')).toBe(true);
  });

  it('crescendo monte de Lite à Spicy', () => {
    expect([1, 2, 3, 4, 5, 6].map((t) => aovHeat('crescendo', t, 6))).toEqual(['lite', 'lite', 'complice', 'complice', 'spicy', 'spicy']);
    expect(aovHeat('spicy', 1, 6)).toBe('spicy');
  });

  it('bouteille, choix, carte, validation et points', () => {
    const { room, conns, ids } = setup(2, 1, 'complice');
    expect(room.phase).toBe('spin');
    let s = conns[0]!.state().aov!;
    expect(s.spinnerId).toBe(ids[0]);
    expect(s.playerId).toBeNull();

    // Seul le lanceur fait tourner ; la bouteille évite le lanceur.
    room.handle(ids[1]!, { t: 'aov', spin: true });
    expect(conns[0]!.state().aov!.spinAt).toBeNull();
    room.handle(ids[0]!, { t: 'aov', spin: true });
    s = conns[0]!.state().aov!;
    expect(s.playerId).toBe(ids[1]);
    vi.advanceTimersByTime(AOV_SPIN_MS);
    expect(room.phase).toBe('pick');

    // Seul le joueur désigné choisit.
    room.handle(ids[0]!, { t: 'aov', choose: 'action' });
    expect(room.phase).toBe('pick');
    room.handle(ids[1]!, { t: 'aov', choose: 'action' });
    s = conns[1]!.state().aov!;
    expect(room.phase).toBe('dare');
    expect(s.card!.kind).toBe('action');
    expect(s.card!.heat).toBe('complice');
    expect(s.card!.text).not.toContain('{nom}');

    // Joker : nouvelle carte, un joker de moins.
    const first = s.card!.text;
    room.handle(ids[1]!, { t: 'aov', pass: true });
    s = conns[1]!.state().aov!;
    expect(s.jokers[ids[1]!]).toBe(AOV_JOKERS - 1);
    expect(s.card!.text).not.toBe(first);

    // Le joueur ne se juge pas lui-même ; l'autre valide.
    room.handle(ids[1]!, { t: 'aov', vote: true });
    expect(room.phase).toBe('dare');
    room.handle(ids[0]!, { t: 'aov', vote: true });
    s = conns[1]!.state().aov!;
    expect(room.phase).toBe('verdict');
    expect(s.verdict).toBe('done');
    expect(room.players.get(ids[1]!)!.score).toBe(AOV_POINTS.action + AOV_HEAT_BONUS.complice);
    expect(s.history[0]!.passes).toBe(1);

    // Tour suivant : celui qui vient de jouer lance la bouteille, et elle tombe sur l'autre.
    vi.advanceTimersByTime(AOV_VERDICT_TIME * 1000);
    s = conns[0]!.state().aov!;
    expect(room.phase).toBe('spin');
    expect(s.spinnerId).toBe(ids[1]);
    vi.advanceTimersByTime(AOV_SPIN_WAIT * 1000);
    expect(conns[0]!.state().aov!.playerId).toBe(ids[0]);
  });

  it('dégonflé : pas de points ; trop d’hésitation : la bouteille choisit', () => {
    const { room, conns, ids } = setup(3);
    vi.advanceTimersByTime(AOV_SPIN_WAIT * 1000 + AOV_SPIN_MS);
    const player = conns[0]!.state().aov!.playerId!;
    vi.advanceTimersByTime(AOV_PICK_TIME * 1000);
    expect(room.phase).toBe('dare');
    const judges = ids.filter((id) => id !== player);
    room.handle(judges[0]!, { t: 'aov', vote: false });
    room.handle(judges[1]!, { t: 'aov', vote: false });
    expect(conns[0]!.state().aov!.verdict).toBe('chicken');
    expect(room.players.get(player)!.score).toBe(0);
  });

  it('chacun joue autant de fois, puis la partie se termine', () => {
    const { room, conns } = setup(3, 2);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(AOV_SPIN_WAIT * 1000 + AOV_SPIN_MS);
      seen.push(conns[0]!.state().aov!.playerId!);
      vi.advanceTimersByTime(AOV_PICK_TIME * 1000 + room.settings.drawTime * 1000 + AOV_VERDICT_TIME * 1000);
    }
    expect(room.phase).toBe('gameEnd');
    for (const id of new Set(seen)) expect(seen.filter((x) => x === id)).toHaveLength(2);
  });

  it('cartes de l’IA filtrées selon le niveau', () => {
    const raw = JSON.stringify({
      action: ['Envoie un bisou à {nom} devant la caméra.', 'Fais 10 pompes en chantant.', 'Retire ta culotte', 'Bonjour {x} !'],
      verite: ['Quel est ton plus grand fou rire ?', 'Quel est ton plus grand fou rire ?'],
    });
    expect(parseDares(raw, 'lite')).toEqual({ action: ['Fais 10 pompes en chantant.'], verite: ['Quel est ton plus grand fou rire ?'] });
    expect(parseDares(raw, 'complice').action).toContain('Envoie un bisou à {nom} devant la caméra.');
    expect(parseDares('pas du json', 'lite')).toEqual({ action: [], verite: [] });
  });

  it('les titres de fin récompensent les audacieux', () => {
    const base = { name: 'x', avatar: 0, heat: 'lite' as const, text: 't' };
    const titles = aovTitles([
      { ...base, playerId: 'a', kind: 'action', outcome: 'done', passes: 0 },
      { ...base, playerId: 'b', kind: 'verite', outcome: 'done', passes: 2 },
    ]);
    expect(titles).toEqual([
      { playerId: 'a', title: 'Tête brûlée', icon: '🔥' },
      { playerId: 'b', title: 'Livre ouvert', icon: '📖' },
    ]);
  });
});
