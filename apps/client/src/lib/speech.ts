import { useEffect, useRef, useState } from 'react';

// Lecture à voix haute avec la synthèse vocale du navigateur, en français. Tout est local :
// chacun entend l'album chez soi, rien ne passe par le serveur.

const KEY = 'julaika:voix';
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Meilleure voix française : fr-FR d'abord, puis locale (plus réactive et avec les limites de mots). */
function frenchVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'));
  const score = (v: SpeechSynthesisVoice) => (v.lang.toLowerCase() === 'fr-fr' ? 2 : 0) + (v.localService ? 1 : 0);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export interface Line {
  text: string;
  /** Position (en caractères) d'un passage à suivre mot à mot, pour l'appel `onWord`. */
  track?: { from: number; onWord: (word: number) => void };
}

/**
 * Narrateur : `say` lit une suite de phrases (en coupant ce qui se lisait), `on` dit si la voix
 * est active (retenu d'une partie à l'autre), `speaking` si elle parle en ce moment.
 */
export function useNarrator() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (!canSpeak) return;
    // Les voix arrivent parfois après le chargement : on les réclame tôt.
    speechSynthesis.getVoices();
    const ping = () => speechSynthesis.getVoices();
    speechSynthesis.addEventListener?.('voiceschanged', ping);
    return () => {
      speechSynthesis.removeEventListener?.('voiceschanged', ping);
      run.current++;
      speechSynthesis.cancel();
    };
  }, []);

  const stop = () => {
    run.current++;
    setSpeaking(false);
    if (canSpeak) speechSynthesis.cancel();
  };

  const say = (lines: Line[]) => {
    stop();
    if (!canSpeak || !on || !lines.length) return;
    const id = run.current;
    const voice = frenchVoice();
    lines.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(line.text);
      u.lang = voice?.lang ?? 'fr-FR';
      if (voice) u.voice = voice;
      u.rate = 1.02;
      u.pitch = 1.05;
      u.onstart = () => id === run.current && setSpeaking(true);
      if (line.track) {
        const { from, onWord } = line.track;
        u.onboundary = (e) => {
          if (id !== run.current || e.name === 'sentence' || e.charIndex < from) return;
          onWord(line.text.slice(from, e.charIndex).split(/\s+/).length - 1);
        };
      }
      const done = () => {
        if (id !== run.current) return;
        line.track?.onWord(-1);
        if (i === lines.length - 1) setSpeaking(false);
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  };

  const toggle = () => {
    const next = !on;
    if (!next) stop();
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour cette page.
    }
    return next;
  };

  return { on, speaking, say, stop, toggle };
}
