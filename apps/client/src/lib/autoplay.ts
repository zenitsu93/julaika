/**
 * Son de la visio : sans geste de l'utilisateur, certains navigateurs (Safari, Chrome sur une page
 * jamais touchée) refusent de lancer une vidéo avec le son. On la lance alors en muet pour garder
 * l'image, et le premier toucher sur la page rend le son à toutes les vidéos en attente.
 */
const waiting = new Set<HTMLMediaElement>();

export function playWithSound(el: HTMLMediaElement) {
  el.muted = false;
  el.play().catch(() => {
    el.muted = true;
    void el.play().catch(() => {});
    waiting.add(el);
    document.addEventListener('pointerdown', release, true);
    document.addEventListener('keydown', release, true);
  });
}

function release() {
  document.removeEventListener('pointerdown', release, true);
  document.removeEventListener('keydown', release, true);
  for (const el of waiting) {
    if (!el.isConnected) continue;
    el.muted = false;
    void el.play().catch(() => {});
  }
  waiting.clear();
}
