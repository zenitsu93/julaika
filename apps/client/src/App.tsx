import { useState } from 'react';
import { Home, codeFromUrl } from './components/Home';
import { Hub } from './components/Hub';
import { Game } from './components/Game';
import { MotDuJour } from './components/mot/MotDuJour';
import { SoundToasts } from './components/SoundBoard';
import { saveChosenGame, type GameId } from './lib/games';
import { useGame } from './lib/store';

export function App() {
  const online = useGame((s) => s.status === 'online' && s.room !== null);
  // Un lien d'invitation (/r/CODE) saute l'accueil des jeux : on va droit au pseudo.
  const [screen, setScreen] = useState<{ game: GameId | null } | null>(() => (codeFromUrl() ? { game: null } : null));
  // Chaque changement de page rejoue la « respiration » (fil d'or, page qui monte, logo qui hoche).
  const page = online ? 'salon' : screen ? (screen.game ?? 'code') : 'accueil';
  return (
    <>
      <div key={`fil-${page}`} className="page-breath" aria-hidden />
      <div key={page} className="page-in h-full">
        <Page online={online} screen={screen} setScreen={setScreen} />
      </div>
    </>
  );
}

function Page({
  online,
  screen,
  setScreen,
}: {
  online: boolean;
  screen: { game: GameId | null } | null;
  setScreen: (s: { game: GameId | null } | null) => void;
}) {
  if (online)
    return (
      <>
        {/* Départ volontaire : retour à l'accueil des jeux, pas à l'écran du pseudo. */}
        <Game onQuit={() => setScreen(null)} />
        <SoundToasts />
      </>
    );
  if (!screen)
    return (
      <Hub
        onPick={(game) => {
          saveChosenGame(game);
          setScreen({ game });
        }}
        onCode={() => setScreen({ game: null })}
      />
    );
  // Le mot du jour se joue seul, sans salon : pas de pseudo à saisir avant.
  if (screen.game === 'motdujour') return <MotDuJour onBack={() => setScreen(null)} />;
  return <Home game={screen.game} onBack={() => setScreen(null)} />;
}
