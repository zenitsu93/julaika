import { Home } from './components/Home';
import { Game } from './components/Game';
import { Smile } from './components/Smile';
import { useGame } from './lib/store';

export function App() {
  const online = useGame((s) => s.status === 'online' && s.room !== null);
  return (
    <>
      <Smile />
      {online ? <Game /> : <Home />}
    </>
  );
}
