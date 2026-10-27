import { useEffect, useState } from 'react';

let audio: AudioContext | null = null;

/**
 * Vrai quand le flux porte de la voix. Mesure locale (aucun échange réseau) : un analyseur
 * Web Audio lu dix fois par seconde, avec une petite retenue pour éviter le clignotement.
 */
export function useSpeaking(stream: MediaStream | null, enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || !enabled || !stream.getAudioTracks().length || typeof AudioContext === 'undefined') {
      setSpeaking(false);
      return;
    }
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let quietSince = 0;
    let on = false;
    const id = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 2; i < 40; i++) sum += data[i]!;
      const loud = sum / 38 > 28;
      const now = performance.now();
      if (loud) quietSince = now;
      const next = loud || now - quietSince < 350;
      if (next !== on) setSpeaking((on = next));
    }, 100);
    return () => {
      clearInterval(id);
      source.disconnect();
      setSpeaking(false);
    };
  }, [stream, enabled]);
  return speaking;
}
