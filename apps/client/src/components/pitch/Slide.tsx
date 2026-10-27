import type { CSSProperties } from 'react';
import type { PitchSlide } from '@julaika/shared';

/** Une diapo du paquet, dessinée selon son genre. Tout est en unités de conteneur : elle tient aussi bien en vignette qu'en plein écran. */
export function Slide({ slide, brand, page, still = false, className = '' }: { slide: PitchSlide; brand: string; page?: number; still?: boolean; className?: string }) {
  return (
    <div className={`pt-slide pt-k-${slide.kind} ${still ? 'pt-still' : ''} ${className}`}>
      <div className="pt-slide-in">
        <p className="pt-title">{slide.title}</p>
        <div className="pt-body">
          <Body slide={slide} />
        </div>
        <p className="pt-foot">
          <span>{brand}</span>
          <span>{page ? `${page} / ∞` : 'Confidentiel'}</span>
        </p>
      </div>
    </div>
  );
}

const d = (i: number): CSSProperties => ({ animationDelay: `${i * 140}ms` });

function Body({ slide }: { slide: PitchSlide }) {
  const { kind, sub, art } = slide;
  switch (kind) {
    case 'crash':
    case 'rocket': {
      const up = kind === 'rocket';
      const path = up ? 'M8 62C60 60 96 56 118 46S142 14 152 4' : 'M8 50C30 42 46 46 62 34S90 18 100 22S120 58 152 64';
      return (
        <div className="pt-chart">
          <svg viewBox="0 0 160 70" aria-hidden>
            {[18, 35, 52].map((y) => (
              <path key={y} d={`M4 ${y}H156`} className="pt-grid" />
            ))}
            <path d="M4 4V66H156" className="pt-axis" />
            <path d={path} pathLength={1} className={`pt-line ${up ? 'pt-up' : 'pt-down'}`} />
          </svg>
          <span className={`pt-chart-art ${up ? 'pt-fly' : 'pt-fall'}`}>{art}</span>
          <p className="pt-sub">{sub}</p>
        </div>
      );
    }
    case 'pie': {
      const [a = '', b = ''] = sub.split(' · ');
      const big = Number.parseInt(a, 10) || 90;
      return (
        <div className="pt-split">
          <svg viewBox="0 0 42 42" className="pt-pie" aria-hidden>
            <circle cx="21" cy="21" r="15.9" className="pt-pie-bg" />
            <circle cx="21" cy="21" r="15.9" pathLength={100} className="pt-pie-slice" style={{ '--pt-pie': big } as CSSProperties} />
            <text x="21" y="24" textAnchor="middle" className="pt-pie-art">
              {art}
            </text>
          </svg>
          <ul className="pt-legend">
            <li className="m-rise" style={d(3)}>
              <i className="bg-cacao" /> {a}
            </li>
            <li className="m-rise" style={d(4)}>
              <i className="bg-gold" /> {b}
            </li>
          </ul>
        </div>
      );
    }
    case 'team':
      return (
        <div className="pt-team">
          {[...art].filter((c) => c.trim() && c !== '‍' && c !== '️').map((c, i) => (
            <span key={i} className="pt-mug" style={{ ...d(i), '--pt-tilt': `${(i - 1) * 5}deg` } as CSSProperties}>
              <span className="pt-mug-face">{c}</span>
              <span className="pt-mug-name">{['CEO', 'CTO', 'Stagiaire', 'Cheffe', 'Mascotte'][i] ?? 'Associé'}</span>
            </span>
          ))}
          <p className="pt-sub w-full">{sub}</p>
        </div>
      );
    case 'quote': {
      const m = /^(«.*»)\s*(.*)$/.exec(sub);
      return (
        <figure className="pt-quote">
          <span className="pt-quote-mark" aria-hidden>
            “
          </span>
          <blockquote className="m-rise" style={d(1)}>
            {m?.[1] ?? sub}
          </blockquote>
          <figcaption className="m-rise" style={d(3)}>
            <span className="pt-quote-art">{art}</span> {m?.[2]}
            <span className="pt-stars" aria-label="1 étoile sur 5">
              ★☆☆☆☆
            </span>
          </figcaption>
        </figure>
      );
    }
    case 'map':
      return (
        <div className="pt-map">
          <svg viewBox="0 0 160 90" aria-hidden>
            <circle cx="40" cy="58" r="26" className="pt-globe" />
            <path d="M18 50c10 4 18-6 28-2s12 12 20 8M22 70c8-4 16 2 24-2" className="pt-globe-lines" />
            <path d="M52 40C80 4 116 4 132 26" pathLength={1} className="pt-route" />
          </svg>
          <span className="pt-map-art">{art}</span>
          <span className="pt-pin">📍</span>
          <p className="pt-sub">{sub}</p>
        </div>
      );
    case 'error':
      return (
        <div className="pt-error">
          <p className="pt-error-face">:(</p>
          <p className="pt-sub">{sub}</p>
          <div className="pt-bar">
            <span />
          </div>
          <p className="pt-error-code">
            {art} Code : PAS_DE_PLAN_B <span className="pt-caret">_</span>
          </p>
        </div>
      );
    case 'price': {
      const plans = sub.split(', ou ');
      return (
        <div className="pt-price">
          {['Gratuit*', plans[0] ?? sub, plans[1] ?? 'Sur devis'].map((p, i) => (
            <div key={i} className={`pt-plan m-rise ${i === 1 ? 'pt-plan-star' : ''}`} style={d(i)}>
              {i === 1 && <span className="pt-plan-tag">Populaire</span>}
              <span className="pt-plan-art">{i === 1 ? art : i === 0 ? '🎁' : '🧾'}</span>
              <b>{p}</b>
            </div>
          ))}
          <p className="pt-fine">* hors frais de gratuité</p>
        </div>
      );
    }
    case 'roadmap': {
      const steps = sub.split(' · ');
      return (
        <div className="pt-road">
          <span className="pt-road-line" />
          {steps.map((s, i) => (
            <span key={i} className="pt-step" style={d(i + 1)}>
              <i>{i === steps.length - 1 ? art : i + 1}</i>
              {s}
            </span>
          ))}
        </div>
      );
    }
    case 'tiny':
      return (
        <div className="pt-tiny">
          <span className="pt-tiny-art">{art}</span>
          <p>{sub}</p>
          <p>{sub}</p>
          <p className="pt-tiny-zoom">🔍 Lire attentivement</p>
        </div>
      );
    case 'emoji':
      return (
        <div className="pt-hero">
          <span className="pt-hero-art">{art}</span>
          <p className="pt-sub">{sub}</p>
        </div>
      );
    case 'rival': {
      const [them = '', us = ''] = sub.split(' · ');
      return (
        <div className="pt-rival">
          <div className="pt-side m-rise" style={d(1)}>
            <span>✅</span>
            {them}
          </div>
          <span className="pt-vs">{art}</span>
          <div className="pt-side pt-us m-rise" style={d(2)}>
            <span>💛</span>
            {us}
          </div>
        </div>
      );
    }
  }
}
