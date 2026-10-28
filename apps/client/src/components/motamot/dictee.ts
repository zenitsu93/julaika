import { useEffect, useRef, useState } from 'react';
import { ctor, tryStart, type Recognition } from '../interdits/ecoute';

// Dicter son mot : la reconnaissance vocale du navigateur (fr-FR) n'écoute que pendant son
// propre tour, pour ne pas attraper les rires de la visio. Ce qu'elle entend part en direct
// comme si on le tapait ; dès qu'une phrase est terminée, le mot est posé. Sans prise en charge
// (Firefox), le bouton micro n'apparaît pas et le clavier suffit.

const KEY = 'julaika:dictee';

export const dicteeSupported = () => ctor() !== null;

/** Le mode micro, retenu d'une partie à l'autre. */
export function useDicteeMode() {
  const [on, setOn] = useState(() => {
    try {
      return dicteeSupported() && localStorage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? 'on' : 'off');
    } catch {
      // Navigation privée : le choix vaut pour cette page seulement.
    }
  };
  return [on, set] as const;
}

/**
 * Écoute tant que `active` est vrai ; `turn` change à chaque nouveau tour, ce qui repart d'une
 * phrase vierge. `onHeard(texte, fini)` reçoit le texte entendu, provisoire puis définitif.
 */
export function useDictee(active: boolean, turn: unknown, onHeard: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const cb = useRef(onHeard);
  cb.current = onHeard;

  useEffect(() => {
    const Ctor = ctor();
    if (!active || denied || !Ctor) return;
    let stopped = false;
    let done = false;
    const r: Recognition = new Ctor();
    r.lang = 'fr-FR';
    // Une phrase à la fois : Chrome la clôt dès le silence, le mot part plus vite.
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      if (done) return;
      let text = '';
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        text += ` ${res[0]!.transcript}`;
        final ||= Boolean(res.isFinal);
      }
      text = text.trim();
      if (!text) return;
      // Un mot par tour : la première phrase finie suffit, on coupe aussitôt.
      if (final) {
        done = true;
        r.abort();
      }
      cb.current(text, final);
    };
    // Chrome s'arrête après un silence : on relance tant que le tour dure.
    r.onend = () => {
      if (stopped || done) return setListening(false);
      setTimeout(() => !stopped && !done && tryStart(r), 120);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        setDenied(true);
        setListening(false);
      }
    };
    setListening(true);
    tryStart(r);
    return () => {
      stopped = true;
      r.onend = null;
      r.onresult = null;
      r.abort();
      setListening(false);
    };
  }, [active, turn, denied]);

  return { listening, denied, retry: () => setDenied(false) };
}
