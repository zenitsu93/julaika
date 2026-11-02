import { useSyncExternalStore } from 'react';

/**
 * Pages du compte, adressables par leur chemin (on peut les mettre en favori ou les partager) :
 * /bienvenue, /connexion, /inscription, /mot-de-passe, /album, /historique, /reglages.
 * Le reste (accueil des jeux, salons /r/CODE) garde son fonctionnement d'avant.
 */
export const PAGES = ['bienvenue', 'connexion', 'inscription', 'mot-de-passe', 'album', 'historique', 'reglages'] as const;
export type Page = (typeof PAGES)[number];

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
addEventListener('popstate', notify);

export function currentPage(): Page | null {
  const p = location.pathname.replace(/^\/|\/$/g, '');
  return (PAGES as readonly string[]).includes(p) ? (p as Page) : null;
}

export function usePage(): Page | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    currentPage,
  );
}

/** Va sur une page du compte, ou à l'accueil des jeux (`null`). */
export function go(page: Page | null, query = '') {
  const url = page ? `/${page}${query}` : '/';
  if (location.pathname + location.search !== url) history.pushState(null, '', url);
  scrollTo({ top: 0 });
  notify();
}
