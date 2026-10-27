import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, reducedMotion } from './animate';

/**
 * Compteur mécanique : seuls les caractères qui changent glissent (vers le bas si la valeur
 * baisse, vers le haut si elle monte). Sert au chrono et aux réglages du salon.
 */
export function Ticker({ value, className = '' }: { value: string | number; className?: string }) {
  const text = String(value);
  const slots = useRef<(HTMLSpanElement | null)[]>([]);
  const prev = useRef(text);

  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = text;
    if (before === text || before.length !== text.length) return;
    const up = (parseFloat(text.replace(':', '.')) || 0) > (parseFloat(before.replace(':', '.')) || 0);
    [...text].forEach((c, i) => {
      if (before[i] === c) return;
      animate(slots.current[i], [{ transform: `translateY(${up ? 60 : -60}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 180 });
    });
  }, [text]);

  return (
    <span className={`inline-flex overflow-hidden tabular-nums ${className}`} aria-label={text}>
      {[...text].map((c, i) => (
        <span key={i} ref={(el) => void (slots.current[i] = el)} className="inline-block" aria-hidden>
          {c}
        </span>
      ))}
    </span>
  );
}

/** Nombre qui compte jusqu'à sa nouvelle valeur (scores, gains). */
export function useCountUp(value: number, { from, delay = 0, duration = 500 }: { from?: number; delay?: number; duration?: number } = {}) {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(from ?? value);
  useEffect(() => {
    const start = current.current;
    if (start === value || reducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / duration);
        const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
        current.current = v;
        setShown(v);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value, delay, duration]);
  return shown;
}
