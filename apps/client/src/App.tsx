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
  if (online)
    return (
      <>
        <Game />
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
