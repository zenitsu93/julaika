import { useEffect, useRef } from 'react';
import { reducedMotion } from './animate';

/**
 * Ressort amorti : `onFrame` reçoit à chaque image une valeur qui rejoint `target` avec un
 * léger dépassement, sans re-rendu React (on écrit directement dans le DOM). Sert à
 * l'aiguille de Wavelength, qu'elle soit tirée au doigt ou bougée par un coéquipier.
 */
export function useSpring(target: number, onFrame: (v: number) => void, { stiffness = 170, damping = 18 } = {}) {
  const state = useRef({ x: target, v: 0, raf: 0, last: 0 });
  const frame = useRef(onFrame);
  frame.current = onFrame;

  useEffect(() => {
    const s = state.current;
    if (reducedMotion()) {
      s.x = target;
      s.v = 0;
      frame.current(target);
      return;
    }
    const step = (t: number) => {
      const dt = Math.min(0.032, (t - (s.last || t)) / 1000) || 1 / 60;
      s.last = t;
      const force = stiffness * (target - s.x) - damping * s.v;
      s.v += force * dt;
      s.x += s.v * dt;
      if (Math.abs(target - s.x) < 0.01 && Math.abs(s.v) < 0.01) {
        s.x = target;
        s.v = 0;
        s.last = 0;
        frame.current(target);
        return;
      }
      frame.current(s.x);
      s.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(s.raf);
    s.last = 0;
    s.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(s.raf);
  }, [target, stiffness, damping]);
}
