import { BOMB_MAX_LIVES, INTRUS_MIN_PLAYERS, SETTINGS_LIMITS, TRAPS, type Difficulty, type GameMode, type RoomGame, type RoomSettings } from '@julaika/shared';
import { useEffect, useRef } from 'react';
import { net } from '../lib/net';
import { TRAP_INFO, TRAP_MODE_LABELS } from '../lib/traps';
import { useGame } from '../lib/store';
import { bump, Ticker, useIndicator } from '../motion';
import { Planche } from './mime/Planche';

const FIELDS: { key: keyof typeof SETTINGS_LIMITS; label: string; step?: number; max?: number }[] = [
  { key: 'rounds', label: 'Manches' },
  { key: 'drawTime', label: 'Temps de dessin (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
  { key: 'wordChoices', label: 'Mots proposés' },
  { key: 'hints', label: 'Indices' },
];

const MODES: { value: GameMode; label: string; hint: string }[] = [
  { value: 'dessin', label: '✏️ Dessin', hint: 'On dessine le mot, les autres devinent.' },
  { value: 'mime', label: '🎭 Mime', hint: 'On mime le mot devant la caméra (ou en vrai), sans parler.' },
  { value: 'mixte', label: '🎲 Mixte', hint: 'Chaque tour, dessin ou mime au hasard.' },
];

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'facile', label: 'Facile' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'difficile', label: 'Difficile' },
];

// Wavelength : pas de mots à régler, une carte par joueur et par manche.
const WAVE_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Cartes par joueur' },
  { key: 'drawTime', label: 'Temps par étape (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Téléphone dessiné : une étape par joueur, seul le temps de dessin se règle.
const TEL_FIELDS: typeof FIELDS = [
  { key: 'drawTime', label: 'Temps de dessin (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// L'Intrus : pas de dessin, seulement le nombre de manches.
const INTRUS_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Manches' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Photomaton : une consigne par manche, rien d'autre à régler.
const PHOTO_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Manches' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Flash : une image par manche, les temps sont fixes.
const FLASH_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Images' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Petit Bac : des manches, le temps pour remplir la grille.
const BAC_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Manches' },
  { key: 'drawTime', label: 'Temps par grille (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Qui me connaît le mieux : chacun passe sur la sellette `rounds` fois.
const CONNAIT_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Tours par joueur' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Bombe à mots : les « manches » deviennent les vies de départ.
const BOMB_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Vies', max: BOMB_MAX_LIVES },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Pas un sourire ! : des duels de 30 s, chacun défend autant de fois qu'il y a de manches.
const SOURIRE_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Duels par joueur' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Bras de fer : à deux, un duel par manche ; à plus, chacun affronte son voisin.
const BRAS_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Manches' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Cadavre exquis : trois morceaux par créature, seul le temps de dessin se règle.
const CAD_FIELDS: typeof FIELDS = [
  { key: 'drawTime', label: 'Temps par morceau (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Mots interdits : chacun fait deviner `rounds` fois ; la difficulté règle le nombre de mots interdits.
const INTERDITS_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Tours par joueur' },
  { key: 'drawTime', label: 'Temps par tour (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

// Mot à mot : le nombre d'histoires, le reste est fixé (4 s par mot).
const STORY_FIELDS: typeof FIELDS = [
  { key: 'rounds', label: 'Histoires' },
  { key: 'maxPlayers', label: 'Joueurs max' },
];

const RULES: Partial<Record<RoomGame, string[]>> = {
  wavelength: [
    'Le télépathe voit où se cache la cible entre deux extrêmes, et donne un indice.',
    "Les autres placent l'aiguille ensemble (parlez-vous en visio !), puis valident.",
    "Le volet s'ouvre : jusqu'à 4 points pour l'équipe. On change de télépathe.",
  ],
  telephone: [
    'Chacun écrit une phrase farfelue, en secret.',
    'Ton voisin la dessine, le suivant devine le dessin, et ainsi de suite : tout le monde joue en même temps.',
    "À la fin, l'album rejoue chaque chaîne, dessin après phrase. Plus on est, plus ça déraille !",
  ],
  intrus: [
    "Chacun reçoit un mot secret. Tous ont le même, sauf l'intrus, qui en a un proche… et ne le sait pas.",
    'À tour de rôle, donnez un indice : assez précis pour vous reconnaître, assez flou pour ne rien livrer.',
    "Votez pour l'intrus. Démasqué, il peut encore voler la manche en devinant votre mot.",
  ],

  petitbac: [
    'Une lettre tombe : trouve un mot qui commence par elle dans chaque catégorie.',
    'Grille pleine ? Crie « Stop ! » : les autres n’ont plus que 5 secondes.',
    'On vote contre les réponses douteuses. 10 points par mot unique, 5 s’il est partagé.',
  ],

  connait: [
    'À chaque tour, un joueur passe sur la sellette : une question sur lui, quatre réponses.',
    'Il répond en secret pendant que les autres parient sur sa réponse.',
    'Tout se dévoile d’un coup : 100 points par pari juste, et 50 pour la vedette par personne qui la connaît.',
  ],

  bombe: [
    'La bombe passe de main en main. Quand tu la tiens, tape un mot qui contient la syllabe affichée.',
    'Personne ne sait quand elle explose : celui qui la tient perd une vie.',
    'Place toutes les lettres bonus pour regagner une vie. Le dernier debout gagne !',
  ],

  photomaton: [
    'Une consigne absurde s’affiche : prépare ta plus belle tête devant la caméra.',
    '3, 2, 1… flash ! Ta caméra est figée en polaroid, en même temps que celle des autres.',
    'Les tirages se posent côte à côte : note ceux des autres de 1 à 5 étoiles.',
  ],

  flash: [
    'Une image s’affiche trois secondes, pas une de plus : regarde bien !',
    'Redessine-la de mémoire en 15 s, avec ses trois couleurs seulement.',
    'Les croquis entourent l’original : note la ressemblance de 1 à 5 étoiles. Chaque étoile rapporte 20 points.',
  ],

  cadavre: [
    'Chacun dessine une tête en secret, en laissant dépasser le cou sous les pointillés.',
    'La feuille est pliée et passe au voisin : il ne voit que ce qui dépasse, et dessine le corps. Puis les jambes. À deux, on alterne.',
    'On déplie chaque créature, on propose des noms et on donne son cœur : le plus aimé la baptise.',
  ],

  motamot: [
    'Une histoire s’écrit un mot chacun, à tour de rôle : 4 secondes par mot, Espace pour valider.',
    'Tous les 6 mots, une contrainte tombe : « un verbe », « place le mot Mayonnaise »… Les autres peuvent recaler les tricheurs.',
    'À la fin, l’histoire est lue à voix haute : vote pour ton mot préféré !',
  ],

  sourire: [
    'Un défenseur garde un visage de marbre pendant 30 s ; son attaquant a des bruitages, des grimaces à faire et peut déformer sa visio.',
    'Au moindre sourire, on appuie sur « Il a souri ! » (ou Espace) : plus il craque tôt, plus l’attaquant marque.',
    'Puis on inverse les rôles. Allumez vos caméras, c’est bien plus drôle !',
  ],

  brasdefer: [
    'Deux joueurs face à face, une jauge au milieu : tapote les cibles qui apparaissent pour la pousser dans le camp de l’autre.',
    'Crie, commente, rugis au micro : tant que tu dépasses le seuil, chaque coup pousse deux fois plus. Les cibles dorées aussi.',
    'Jauge plaquée au bout : K.O. ! Sinon, au bout de 30 s, celui qui mène gagne aux points.',
  ],

  interdits: [
    'À ton tour, une carte : fais deviner le mot à voix haute, en visio, sans dire les mots interdits.',
    'Les autres crient leurs réponses ou les tapent dans le chat. Trouvé ? Entrée, carte suivante !',
    'À trois et plus, un gardien voit la carte et buzze ; à deux, l’oreille de l’arbitre (reconnaissance vocale) s’en charge.',
  ],
};

export function Lobby() {
  const room = useGame((s) => s.room!);
  const wave = room.game === 'wavelength';
  const rules = RULES[room.game];
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const error = useGame((s) => s.error);
  const mimeShots = useGame((s) => s.mimeShots);
  const set = (settings: Partial<RoomSettings>) => net.send({ t: 'settings', settings });
  const level = useIndicator(LEVELS.findIndex((l) => l.value === room.settings.difficulty));
  const modeIndex = Math.max(0, MODES.findIndex((m) => m.value === room.settings.mode));
  const mode = useIndicator(modeIndex);
  const trapMode = useIndicator(TRAP_MODE_LABELS.findIndex((l) => l.value === room.settings.traps));
  const minPlayers = room.game === 'intrus' ? INTRUS_MIN_PLAYERS : 2;
  const canStart = room.players.length >= minPlayers;
  const start = useRef<HTMLButtonElement>(null);

  // Le bouton s'éclaire quand le deuxième joueur arrive.
  useEffect(() => {
    if (canStart) bump(start.current, 1.04);
  }, [canStart]);

  return (
    <div className="panel p-5 text-left shadow-sm">
      {!rules && mimeShots.length > 0 && (
        <div className="mb-5 border-b border-edge pb-4">
          <Planche shots={mimeShots} />
        </div>
      )}
      <h2 className="mb-4 text-lg font-semibold">Réglages du salon <span className="font-mono text-muted">#{room.code}</span></h2>
      {!rules && (
      <div className="mb-3 text-sm">
        <span className="mb-1 block text-muted">Mode de jeu</span>
        <div ref={mode.container} role="group" aria-label="Mode de jeu" className="relative grid grid-cols-3 gap-1 rounded-md border border-edge p-1">
          <span ref={mode.indicator} className="m-indicator rounded bg-primary" />
          {MODES.map(({ value, label }) => {
            const active = room.settings.mode === value;
            return (
              <button
                key={value}
                type="button"
                data-slot
                aria-pressed={active}
                disabled={!isHost}
                onClick={() => set({ mode: value })}
                className={`relative rounded px-2 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                  active ? 'text-on-primary' : 'text-muted enabled:hover:bg-edge/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p key={modeIndex} className="m-fade mt-1 text-xs text-muted">{MODES[modeIndex]!.hint}</p>
        {room.settings.mode !== 'dessin' && (
          <label className="m-rise mt-2 flex items-start gap-2 rounded-md border border-edge bg-surface px-3 py-2 text-sm">
            <input type="checkbox" className="mt-0.5 accent-primary" disabled={!isHost} checked={room.settings.twists} onChange={(e) => set({ twists: e.target.checked })} />
            <span>
              <span className="font-medium">Consignes surprises</span>
              <span className="block text-xs text-muted">Toutes les 20 s, le mimeur change de style : au ralenti, comme un robot, sur un pied…</span>
            </span>
          </label>
        )}
      </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(wave ? WAVE_FIELDS : room.game === 'telephone' ? TEL_FIELDS : room.game === 'intrus' ? INTRUS_FIELDS : room.game === 'petitbac' ? BAC_FIELDS : room.game === 'connait' ? CONNAIT_FIELDS : room.game === 'bombe' ? BOMB_FIELDS : room.game === 'photomaton' ? PHOTO_FIELDS : room.game === 'sourire' ? SOURIRE_FIELDS : room.game === 'brasdefer' ? BRAS_FIELDS : room.game === 'flash' ? FLASH_FIELDS : room.game === 'cadavre' ? CAD_FIELDS : room.game === 'interdits' ? INTERDITS_FIELDS : room.game === 'motamot' ? STORY_FIELDS : FIELDS).map(({ key, label: base, step, max: cap }) => {
          const label = key === 'drawTime' && !rules && room.settings.mode !== 'dessin' ? 'Temps par tour (s)' : base;
          const [min, limit] = SETTINGS_LIMITS[key];
          const max = cap ?? limit;
          return (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-muted">{label}</span>
              {/* Chez les invités, la valeur roule quand l'hôte la change. */}
              {!isHost ? (
                <div className="input font-mono opacity-80" aria-label={label}>
                  <Ticker value={Math.min(max, room.settings[key])} />
                </div>
              ) : (
              <input
                type="number"
                className="input font-mono tabular-nums"
                min={min}
                max={max}
                step={step ?? 1}
                disabled={!isHost}
                value={Math.min(max, room.settings[key])}
                onChange={(e) => set({ [key]: Number(e.target.value) })}
              />
              )}
            </label>
          );
        })}
      </div>
      {(!rules || room.game === 'bombe' || room.game === 'interdits') && (
        <div className="mt-3 text-sm">
          <span className="mb-1 block text-muted">{room.game === 'bombe' ? 'Difficulté des syllabes' : room.game === 'interdits' ? 'Mots interdits par carte (3, 4 ou 5)' : 'Difficulté des mots'}</span>
          <div ref={level.container} role="group" aria-label="Difficulté" className="relative grid grid-cols-3 gap-1 rounded-md border border-edge p-1">
            <span ref={level.indicator} className="m-indicator rounded bg-primary" />
            {LEVELS.map(({ value, label }) => {
              const active = room.settings.difficulty === value;
              return (
                <button
                  key={value}
                  type="button"
                  data-slot
                  aria-pressed={active}
                  disabled={!isHost}
                  onClick={() => set({ difficulty: value })}
                  className={`relative rounded px-3 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                    active ? 'text-on-primary' : 'text-muted enabled:hover:bg-edge/50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {rules ? (
        <ol className="mt-4 space-y-1.5 text-sm text-muted">
          {rules.map((rule, i) => (
            <li key={i}>
              <b className="text-ink">{i + 1}.</b> {rule}
            </li>
          ))}
        </ol>
      ) : (
      <>
      {room.settings.mode !== 'mime' && (
      <div className="mt-3 text-sm">
        <span className="mb-1 flex items-center gap-1.5 text-muted">
          Manches piégées
          <span className="rounded-full bg-accent/20 px-1.5 text-[10px] font-semibold tracking-wide text-ink uppercase">Nouveau</span>
        </span>
        <div ref={trapMode.container} role="group" aria-label="Manches piégées" className="relative grid grid-cols-3 gap-1 rounded-md border border-edge p-1">
          <span ref={trapMode.indicator} className={`m-indicator rounded ${room.settings.traps === 'jamais' ? 'bg-primary' : 'bg-accent'}`} />
          {TRAP_MODE_LABELS.map(({ value, label }) => {
            const active = room.settings.traps === value;
            return (
              <button
                key={value}
                type="button"
                data-slot
                aria-pressed={active}
                disabled={!isHost}
                onClick={() => set({ traps: value })}
                className={`relative rounded px-3 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                  active ? (value === 'jamais' ? 'text-on-primary' : 'text-black') : 'text-muted enabled:hover:bg-edge/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* Les quatre pièges se déploient en éventail quand on les active. */}
        {room.settings.traps !== 'jamais' && (
          <ul key={room.settings.traps} className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {TRAPS.map((kind, i) => (
              <li
                key={kind}
                title={TRAP_INFO[kind].rule}
                className="m-pop flex items-center gap-1.5 rounded-md border border-edge bg-surface px-2 py-1 text-xs"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <span className="text-base">{TRAP_INFO[kind].icon}</span>
                <span className="leading-tight">{TRAP_INFO[kind].name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-muted">Mots perso (séparés par des virgules)</span>
        <textarea
          className="input h-16 resize-none"
          disabled={!isHost}
          defaultValue={room.settings.customWords.join(', ')}
          onBlur={(e) => set({ customWords: e.target.value.split(',') })}
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" disabled={!isHost} checked={room.settings.customOnly} onChange={(e) => set({ customOnly: e.target.checked })} />
        Uniquement mes mots
      </label>
      </>
      )}
      {isHost ? (
        <button ref={start} className="btn-primary mt-5 w-full py-2.5" disabled={!canStart} onClick={() => net.send({ t: 'start' })}>
          {canStart ? 'Lancer la partie' : minPlayers > 2 ? `En attente de joueurs (${room.players.length}/${minPlayers})…` : 'En attente de joueurs…'}
        </button>
      ) : (
        <p className="mt-5 text-center text-muted">L'hôte va lancer la partie…</p>
      )}
      {error && (
        <p key={error} className="m-rise mt-2 text-center text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
