import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { avatarOf } from '../lib/avatars';
import { preparePolaroid, savePolaroid } from '../lib/polaroid';
import { bump } from '../motion';
import './photo/photo.css';

/**
 * Un tirage polaroid : la photo carrée, le bord blanc épais et la légende manuscrite.
 * `enter` : comment il arrive (lancé sur la table, ou éjecté de l'appareil). `develop` :
 * l'image se révèle depuis un gris laiteux. Réutilisable par tout jeu qui fige la caméra.
 */
export function Polaroid({
  image,
  caption,
  name,
  avatar = 0,
  tilt = 0,
  enter = 'toss',
  develop = false,
  delay = 0,
  className = '',
  children,
  download = false,
}: {
  image: string | null;
  caption: string;
  name?: string;
  avatar?: number;
  tilt?: number;
  enter?: 'toss' | 'eject' | 'none';
  develop?: boolean;
  delay?: number;
  className?: string;
  children?: ReactNode;
  download?: boolean;
}) {
  const style = { '--tilt': `${tilt}deg`, animationDelay: `${delay}ms` } as CSSProperties;
  const enterClass = enter === 'toss' ? 'pola-toss' : enter === 'eject' ? 'pola-eject' : '';
  return (
    <figure style={style} className={`pola group relative m-0 rounded-[6px] bg-[#fbf8f1] p-[6%] pb-0 text-[#2a1a12] ${enterClass} ${develop ? 'pola-develop' : ''} ${className}`}>
      <div className="relative aspect-square overflow-hidden rounded-[2px] bg-[#2a1a12]">
        {image ? (
          <>
            <img src={image} alt={name ? `Photo de ${name}` : 'Photo'} draggable={false} className="size-full object-cover" style={{ animationDelay: `${delay}ms` }} />
            {develop && <span className="pola-milk absolute inset-0 bg-[#d9d4c7]" style={{ animationDelay: `${delay + 200}ms` }} aria-hidden />}
          </>
        ) : (
          // Pas de caméra : un tirage sombre avec l'avatar, comme une photo ratée.
          <span className="grid size-full place-items-center bg-[radial-gradient(circle_at_50%_40%,#4b2e21,#1c110c)] text-5xl">
            <span className="opacity-80">{avatarOf(avatar)}</span>
          </span>
        )}
        {download && image && (
          <button
            type="button"
            title="Enregistrer le polaroid"
            aria-label="Enregistrer le polaroid"
            onPointerDown={() => void preparePolaroid(image, caption, name)}
            onClick={() => void savePolaroid(image, caption, name)}
            className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/65 [@media(hover:none)]:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
          </button>
        )}
      </div>
      <figcaption className="flex min-h-[4.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-center">
        <span className="line-clamp-2 font-[Caveat,'Segoe_Print','Bradley_Hand',cursive] text-[clamp(1.05rem,2.6vw,1.4rem)] font-bold leading-[1.05]">
          {caption}
        </span>
        {name && <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86705f]">{name}</span>}
      </figcaption>
      {children}
    </figure>
  );
}

/**
 * Un vrai bouton « Télécharger » sous un tirage, pensé pour le téléphone : le PNG se prépare
 * dès l'affichage, puis la flèche plonge dans le plateau et se change en coche.
 */
export function SaveButton({ image, caption, name, small = false }: { image: string; caption: string; name?: string; small?: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Préparé à l'avance : sur iPhone, la feuille de partage doit s'ouvrir dans la foulée du toucher.
    const t = setTimeout(() => void preparePolaroid(image, caption, name).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [image, caption, name]);
  useEffect(() => {
    if (state !== 'done') return;
    const t = setTimeout(() => setState('idle'), 2200);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      ref={btn}
      type="button"
      disabled={state === 'busy'}
      onClick={async () => {
        bump(btn.current, 0.94);
        setState('busy');
        const r = await savePolaroid(image, caption, name).catch(() => 'cancelled' as const);
        setState(r === 'cancelled' ? 'idle' : 'done');
      }}
      className={`pola-save group/save inline-flex items-center gap-1.5 rounded-full border font-medium shadow-sm transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-info ${
        small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
      } ${state === 'done' ? 'border-good/50 bg-good/10 text-good' : 'border-edge bg-surface hover:border-accent hover:bg-accent/15'}`}
    >
      <span className={`relative grid place-items-center overflow-hidden ${small ? 'size-3.5' : 'size-4'}`} aria-hidden>
        {state === 'done' ? (
          <svg key="ok" viewBox="0 0 24 24" className="pola-save-ok size-full" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
          </svg>
        ) : (
          <svg key="dl" viewBox="0 0 24 24" className={`size-full ${state === 'busy' ? 'pola-save-busy' : 'pola-save-arrow'}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.5v11M7 10l5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        )}
      </span>
      {state === 'done' ? 'Enregistré' : 'Télécharger'}
    </button>
  );
}
