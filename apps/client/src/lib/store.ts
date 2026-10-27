import { useSyncExternalStore } from 'react';
import type { BombEvent, ChatLine, PlayerPublic, RoomState, TelChain, TelEntry } from '@julaika/shared';

export interface GameState {
  status: 'idle' | 'connecting' | 'online' | 'closed';
  selfId: string | null;
  room: RoomState | null;
  chat: ChatLine[];
  choices: string[] | null;
  turnEnd: { word: string; gains: Record<string, number> } | null;
  ranking: PlayerPublic[] | null;
  error: string | null;
  /** Aiguille de Wavelength, tenue à part pour ne re-rendre que le cadran à chaque mouvement. */
  dial: number | null;
  /** Téléphone dessiné : ce qu'on a reçu à dessiner ou décrire, et l'album une fois révélé. */
  telPrompt: { step: number; prompt: TelEntry | null } | null;
  album: TelChain[] | null;
  /** Bombe à mots : ce que tape celui qui tient la bombe, et le dernier événement (numéroté pour rejouer l'animation). */
  bombTyping: { by: string; text: string } | null;
  bombEvent: (BombEvent & { seq: number }) | null;
  /** Décalage horloge serveur - horloge locale (ms). */
  clockOffset: number;
}

const initial: GameState = {
  status: 'idle',
  selfId: null,
  room: null,
  chat: [],
  choices: null,
  turnEnd: null,
  ranking: null,
  error: null,
  dial: null,
  telPrompt: null,
  album: null,
  bombTyping: null,
  bombEvent: null,
  clockOffset: 0,
};

let state = initial;
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    for (const l of listeners) l();
  },
  reset() {
    store.set(initial);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Abonnement avec sélecteur : un composant ne se re-rend que si sa tranche change. */
export function useGame<T>(select: (s: GameState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

export const serverNow = () => Date.now() + store.get().clockOffset;
