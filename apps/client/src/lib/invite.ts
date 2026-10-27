/** Lien d'invitation d'un salon : ouvert, il mène droit au pseudo puis dans le salon. */
export const inviteLink = (code: string) => `${location.origin}/r/${code}`;

/**
 * Partage natif sur téléphone (WhatsApp, SMS… depuis la feuille du système), sinon copie du lien.
 * Le salon garde la place de l'hôte pendant qu'il est dans l'autre appli.
 */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = inviteLink(code);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'julaïka', text: `Viens jouer avec moi sur julaïka ! Code du salon : ${code}`, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard?.writeText(url).catch(() => {});
  return 'copied';
}
