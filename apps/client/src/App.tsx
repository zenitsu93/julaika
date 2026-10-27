import { Home } from './components/Home';
import { Game } from './components/Game';
import { useGame } from './lib/store';

export function App() {
  const online = useGame((s) => s.status === 'online' && s.room !== null);
  return online ? <Game /> : <Home />;
}
