import { randomInt } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Seau à jetons : `capacity` d'un coup, puis `perSecond` jetons rendus chaque seconde. */
export function bucket(capacity: number, perSecond: number, now: () => number = Date.now): () => boolean {
  let tokens = capacity;
  let last = now();
  return () => {
    const t = now();
    tokens = Math.min(capacity, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

/**
 * Un seau par clé (une IP), oublié après `idleMs` sans usage : les visiteurs partis ne
 * s'entassent pas en mémoire, et ceux qui restent gardent leur compte.
 */
export function keyedBuckets(capacity: number, perSecond: number, idleMs = 10 * 60_000, now: () => number = Date.now) {
  const seen = new Map<string, { take: () => boolean; at: number }>();
  const take = (key: string) => {
    const t = now();
    let entry = seen.get(key);
    if (!entry) seen.set(key, (entry = { take: bucket(capacity, perSecond, now), at: t }));
    entry.at = t;
    return entry.take();
  };
  const prune = () => {
    const limit = now() - idleMs;
    for (const [key, entry] of seen) if (entry.at < limit) seen.delete(key);
  };
  return { take, prune, size: () => seen.size };
}

/**
 * IP du visiteur. Le proxy le plus proche (Caddy, nginx) ajoute l'adresse qu'il voit à la fin de
 * X-Forwarded-For : c'est la seule valeur fiable, les précédentes viennent du client.
 */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.at(-1) ?? req.socket.remoteAddress ?? '';
}

/**
 * Le WebSocket n'accepte que les pages du jeu : même hôte que la requête, ou un poste de
 * développement. Sans en-tête Origin (outil hors navigateur), les autres limites suffisent.
 */
export function allowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.host === host || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Compte les connexions ouvertes par IP. */
export function connectionCounter(max: number) {
  const open = new Map<string, number>();
  return {
    /** Réserve une place pour `ip`, ou `false` si elle en a déjà `max`. */
    add(ip: string): boolean {
      const n = open.get(ip) ?? 0;
      if (n >= max) return false;
      open.set(ip, n + 1);
      return true;
    },
    remove(ip: string) {
      const n = (open.get(ip) ?? 1) - 1;
      if (n <= 0) open.delete(ip);
      else open.set(ip, n);
    },
    count: (ip: string) => open.get(ip) ?? 0,
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** Code de salon tiré au hasard cryptographique : 32⁸ ≈ mille milliards de possibilités. */
export function roomCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

/**
 * Plafonne les appels d'un générateur d'IA pour un salon : `max` par heure glissante. Au-delà, la
 * promesse échoue et le salon repasse sur ses listes intégrées, comme après une erreur de l'API.
 */
export function aiBudget(max: number, now: () => number = Date.now) {
  const calls: number[] = [];
  return <A extends unknown[], R>(gen: ((...args: A) => Promise<R>) | null) =>
    gen &&
    ((...args: A): Promise<R> => {
      const t = now();
      while (calls.length && calls[0]! <= t - 3_600_000) calls.shift();
      if (calls.length >= max) return Promise.reject(new Error('IA : quota du salon atteint'));
      calls.push(t);
      return gen(...args);
    });
}

/** En-têtes de sécurité des pages du jeu. `host` sert à autoriser le WebSocket du même site. */
export function securityHeaders(host: string | undefined): Record<string, string> {
  const safeHost = /^[a-z0-9.:-]+$/i.test(host ?? '') ? host : null;
  const sockets = safeHost ? ` wss://${safeHost} ws://${safeHost}` : '';
  return {
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      // React pose des styles en ligne (animations, positions) : 'unsafe-inline' reste nécessaire ici.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      `connect-src 'self'${sockets}`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(self), microphone=(self), display-capture=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
  };
}
