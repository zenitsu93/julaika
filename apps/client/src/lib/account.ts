import { useSyncExternalStore } from 'react';
import type { UserPublic } from '@julaika/shared';

/** Le compte du joueur : chargé au démarrage, mis à jour à la connexion et à la déconnexion. */
export interface AccountState {
  ready: boolean;
  user: UserPublic | null;
  google: boolean;
  stats: { parties: number; wins: number; images: number; games: number } | null;
}

let state: AccountState = { ready: false, user: null, google: false, stats: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<AccountState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

export const account = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAccount(): AccountState {
  return useSyncExternalStore(account.subscribe, account.get);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Appel JSON à l'API, avec le cookie de session. Lève une ApiError lisible en cas de refus. */
export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'reseau', 'Pas de connexion : vérifie ton réseau et réessaie.');
  }
  const data = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!r.ok) throw new ApiError(r.status, data.error ?? 'serveur', data.message ?? 'Le serveur ne répond pas, réessaie dans un instant.');
  return data as T;
}

/** Le pseudo et l'avatar du compte deviennent ceux des salons. */
function rememberIdentity(user: UserPublic) {
  try {
    localStorage.setItem('julaika:name', JSON.stringify(user.name));
    localStorage.setItem('julaika:avatar', JSON.stringify(user.avatar));
  } catch {}
}

export async function refreshAccount() {
  try {
    const me = await api<{ user: UserPublic | null; google: boolean; stats: AccountState['stats'] }>('/api/auth/moi');
    set({ ready: true, user: me.user, google: me.google, stats: me.stats });
  } catch {
    set({ ready: true });
  }
}

/** Après une connexion réussie : le compte, son pseudo, puis les images gardées en attente. */
export async function signedIn(user: UserPublic) {
  rememberIdentity(user);
  set({ user });
  await refreshAccount();
  const { flushPending } = await import('./keeper');
  void flushPending();
}

export async function logout() {
  await api('/api/auth/deconnexion', { body: {} }).catch(() => {});
  // Déconnecté, on repart de la landing : l'accueil des jeux attend un nouveau « Jouer sans compte ».
  try {
    sessionStorage.removeItem('julaika:invite');
  } catch {}
  set({ user: null, stats: null });
}

export function setUser(user: UserPublic) {
  rememberIdentity(user);
  set({ user });
}

export const isSignedIn = () => !!state.user;
