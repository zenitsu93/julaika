import { useGame } from '../lib/store';
import { BombBoard } from './bombe/BombBoard';
import { Board } from './Board';
import { BacBoard } from './bac/BacBoard';
import { Chat } from './Chat';
import { IntrusBoard } from './intrus/IntrusBoard';
import { ConnaitBoard } from './connait/ConnaitBoard';
import { PhotoBoard } from './photo/PhotoBoard';
import { TelBoard } from './tel/TelBoard';
import { TopBar } from './TopBar';
import { WaveBoard } from './wave/WaveBoard';

export function Game() {
  const game = useGame((s) => s.room!.game);
  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-3 p-3">
      <TopBar />
      <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_20rem]">
        {game === 'wavelength' ? <WaveBoard /> : game === 'telephone' ? <TelBoard /> : game === 'intrus' ? <IntrusBoard /> : game === 'petitbac' ? <BacBoard /> : game === 'connait' ? <ConnaitBoard /> : game === 'bombe' ? <BombBoard /> : game === 'photomaton' ? <PhotoBoard /> : <Board />}
        <Chat />
      </div>
    </div>
  );
}
