import { useEffect, useRef, useState } from 'react';
import { bannedHeard, type InterditsCard } from '@julaika/shared';

/**
 * L'oreille de l'arbitre : la reconnaissance vocale du navigateur écoute celui qui fait deviner
 * et buzze toute seule quand elle entend le mot ou un mot interdit. Utile surtout à deux, quand
 * personne d'autre ne voit la carte. Chrome et Edge l'ont ; ailleurs, le bouton n'apparaît pas.
 */

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

export function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const ecouteSupported = () => ctor() !== null;

/**
 * Écoute tant que `on` est vrai. À chaque nouvelle carte, l'écoute repart de zéro (ce qui a été
 * dit pour la carte d'avant ne compte pas). Rend les derniers mots entendus, pour les sous-titres.
 */
export function useEcoute(card: InterditsCard | null, cardNo: number, on: boolean, onBanned: (word: string) => void) {
  const [heard, setHeard] = useState('');
  const [denied, setDenied] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const live = useRef({ card, cardNo, onBanned, fired: -1 });
  live.current = { ...live.current, card, cardNo, onBanned };

  const active = on && Boolean(card) && !denied;

  useEffect(() => {
    const Ctor = ctor();
    if (!active || !Ctor) return;
    let stopped = false;
    const r = new Ctor();
    r.lang = 'fr-FR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) text += ` ${e.results[i]![0]!.transcript}`;
      setHeard(text.trim().split(/\s+/).slice(-7).join(' '));
      const { card: c, cardNo: n, fired } = live.current;
      if (!c || fired === n) return;
      const word = bannedHeard(text, c);
      if (word) {
        live.current.fired = n;
        live.current.onBanned(word);
      }
    };
    // Chrome s'arrête après un silence : on relance tant que l'oreille est ouverte.
    r.onend = () => {
      if (!stopped) setTimeout(() => !stopped && tryStart(r), 150);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true;
        setDenied(true);
      }
    };
    rec.current = r;
    tryStart(r);
    return () => {
      stopped = true;
      r.onend = null;
      r.abort();
      rec.current = null;
      setHeard('');
    };
  }, [active]);

  // Nouvelle carte : on coupe ce qui était en cours, la relance repart d'une phrase vierge.
  useEffect(() => {
    setHeard('');
    rec.current?.abort();
  }, [cardNo]);

  return { heard, denied, listening: active };
}

export function tryStart(r: Recognition) {
  try {
    r.start();
  } catch {
    // Déjà démarrée : rien à faire.
  }
}
