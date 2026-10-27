import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { iceServersFor } from '../apps/server/src/ice';

describe('serveurs ICE', () => {
  it('STUN seul sans configuration TURN', () => {
    expect(iceServersFor('p1', {})).toHaveLength(1);
  });
  it('identifiants TURN temporaires au format coturn', () => {
    const [, turn] = iceServersFor('p1', { TURN_URLS: 'turn:a:3478, turns:a:5349', TURN_SECRET: 's' }, 1_000_000);
    expect(turn!.urls).toEqual(['turn:a:3478', 'turns:a:5349']);
    expect(turn!.username).toBe(`${1000 + 12 * 3600}:p1`);
    expect(turn!.credential).toBe(createHmac('sha1', 's').update(turn!.username!).digest('base64'));
  });
});
