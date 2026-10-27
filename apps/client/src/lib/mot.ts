import type { MotError, MotState } from '@julaika/shared';

/** Identifiant anonyme du joueur, gardé dans le navigateur : il relie tes essais d'un jour à l'autre. */
export function motToken(): string {
  try {
    const saved = localStorage.getItem('julaika:token');
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved)) return saved;
    const token = crypto.randomUUID();
    localStorage.setItem('julaika:token', token);
    return token;
  } catch {
    return (sessionToken ??= crypto.randomUUID());
  }
}
let sessionToken: string | undefined;

export async function fetchMot(date?: string): Promise<MotState> {
  const q = new URLSearchParams({ token: motToken(), ...(date ? { date } : {}) });
  const res = await fetch(`/api/mot?${q}`);
  if (!res.ok) throw new Error(`mot ${res.status}`);
  return res.json();
}

export async function sendGuess(word: string, name: string, avatar: number): Promise<MotState | MotError> {
  const res = await fetch('/api/mot/essai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: motToken(), name, avatar, word }),
  });
  const body = await res.json().catch(() => ({ error: 'requete' }));
  if (res.ok) return body as MotState;
  if (typeof body.error === 'string') return body.error as MotError;
  throw new Error(`mot ${res.status}`);
}

export const MOT_ERRORS: Record<MotError | 'reseau', string> = {
  longueur: 'Il faut 5 lettres.',
  inconnu: "Ce mot n'est pas dans le dictionnaire.",
  fini: 'Tu as déjà joué aujourd’hui. Reviens demain !',
  pseudo: 'Choisis un pseudo pour le classement.',
  jour: 'Ce jour n’existe pas encore.',
  complet: 'Le classement du jour est complet. Reviens demain !',
  reseau: 'Connexion perdue. Réessaie.',
};

/** « mardi 27 octobre » */
export const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(date));

export const shiftDay = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/** 1 min 05 s, 42 s */
export function duration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
