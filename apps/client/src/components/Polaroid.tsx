import type { CSSProperties, ReactNode } from 'react';
import { avatarOf } from '../lib/avatars';
import { downloadPolaroid } from '../lib/polaroid';
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
            onClick={() => void downloadPolaroid(image, caption, name)}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/65"
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
