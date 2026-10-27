import { useState } from 'react';
import { Home, codeFromUrl } from './components/Home';
import { Hub } from './components/Hub';
import { Game } from './components/Game';
import { saveChosenGame, type GameId } from './lib/games';
import { useGame } from './lib/store';

export function App() {
  const online = useGame((s) => s.status === 'online' && s.room !== null);
  // Un lien d'invitation (/r/CODE) saute l'accueil des jeux : on va droit au pseudo.
  const [screen, setScreen] = useState<{ game: GameId | null } | null>(() => (codeFromUrl() ? { game: null } : null));
  if (online) return <Game />;
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
  return <Home game={screen.game} onBack={() => setScreen(null)} />;
}
