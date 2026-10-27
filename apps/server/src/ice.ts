import { createHmac } from 'node:crypto';
import type { IceServer } from '@julaika/shared';

const STUN: IceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const TTL_SECONDS = 12 * 3600;

/**
 * Serveurs ICE donnés à chaque joueur. Avec TURN_URLS et TURN_SECRET, on ajoute un relais coturn
 * avec des identifiants temporaires (API REST de coturn : `use-auth-secret`), donc aucun mot de
 * passe fixe n'est envoyé au navigateur.
 */
export function iceServersFor(playerId: string, env = process.env, now = Date.now()): IceServer[] {
  const urls = env.TURN_URLS?.split(',').map((u) => u.trim()).filter(Boolean);
  const secret = env.TURN_SECRET;
  if (!urls?.length || !secret) return [STUN];
  const username = `${Math.floor(now / 1000) + TTL_SECONDS}:${playerId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return [STUN, { urls, username, credential }];
}
