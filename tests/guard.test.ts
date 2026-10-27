import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, aiBudget, allowedOrigin, bucket, clientIp, connectionCounter, keyedBuckets, roomCode, securityHeaders } from '../apps/server/src/guard';

const req = (headers: Record<string, string>, remote = '10.0.0.9') => ({ headers, socket: { remoteAddress: remote } }) as unknown as IncomingMessage;

describe('garde-fous du serveur', () => {
  it('le seau se vide puis se remplit avec le temps', () => {
    let now = 0;
    const take = bucket(2, 1, () => now);
    expect([take(), take(), take()]).toEqual([true, true, false]);
    now = 1000;
    expect(take()).toBe(true);
  });

  it('un seau par IP, oublié après un long silence', () => {
    let now = 0;
    const buckets = keyedBuckets(1, 0, 1000, () => now);
    expect(buckets.take('a')).toBe(true);
    expect(buckets.take('a')).toBe(false);
    expect(buckets.take('b')).toBe(true);
    now = 5000;
    buckets.prune();
    expect(buckets.size()).toBe(0);
  });

  it("lit l'IP ajoutée par le proxy, pas celle que le client invente", () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8');
    expect(clientIp(req({}))).toBe('10.0.0.9');
  });

  it("n'accepte le WebSocket que depuis le site lui-même", () => {
    expect(allowedOrigin('https://julaika.2nbdigital.com', 'julaika.2nbdigital.com')).toBe(true);
    expect(allowedOrigin('https://pirate.example', 'julaika.2nbdigital.com')).toBe(false);
    expect(allowedOrigin('http://localhost:5173', 'localhost:3001')).toBe(true);
    expect(allowedOrigin('pas une url', 'julaika.2nbdigital.com')).toBe(false);
    expect(allowedOrigin(undefined, 'julaika.2nbdigital.com')).toBe(true);
  });

  it('plafonne les connexions par IP', () => {
    const c = connectionCounter(2);
    expect([c.add('a'), c.add('a'), c.add('a')]).toEqual([true, true, false]);
    c.remove('a');
    expect(c.add('a')).toBe(true);
    expect(c.count('b')).toBe(0);
  });

  it('tire des codes de salon longs, sans caractères ambigus', () => {
    const codes = new Set(Array.from({ length: 200 }, roomCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(new RegExp(`^[A-HJ-NP-Z2-9]{${CODE_LENGTH}}$`));
  });

  it("plafonne les appels d'IA d'un salon sur une heure glissante", async () => {
    let now = 0;
    const wrap = aiBudget(2, () => now);
    const gen = wrap(async (n: number) => n * 2)!;
    await expect(gen(1)).resolves.toBe(2);
    await expect(gen(2)).resolves.toBe(4);
    await expect(gen(3)).rejects.toThrow('quota');
    now = 3_600_001;
    await expect(gen(4)).resolves.toBe(8);
    expect(wrap(null)).toBeNull();
  });

  it('pose une CSP qui autorise le WebSocket du même hôte seulement', () => {
    const h = securityHeaders('julaika.2nbdigital.com');
    expect(h['content-security-policy']).toContain("connect-src 'self' wss://julaika.2nbdigital.com");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['permissions-policy']).toContain('camera=(self)');
    expect(securityHeaders('mal"formé')['content-security-policy']).toContain("connect-src 'self';");
  });
});
