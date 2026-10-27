import { useGame } from '../lib/store';
import { AgentsBoard } from './agents/AgentsBoard';
import { AlibiBoard } from './alibi/AlibiBoard';
import { BombBoard } from './bombe/BombBoard';
import { BrasBoard } from './bras/BrasBoard';
import { Board } from './Board';
import { BacBoard } from './bac/BacBoard';
import { CadBoard } from './cadavre/CadBoard';
import { Chat } from './Chat';
import { InterditsBoard } from './interdits/InterditsBoard';
import { IntrusBoard } from './intrus/IntrusBoard';
import { ConnaitBoard } from './connait/ConnaitBoard';
import { FlashBoard } from './flash/FlashBoard';
import { StoryBoard } from './motamot/StoryBoard';
import { FredBoard } from './fred/FredBoard';
import { PhotoBoard } from './photo/PhotoBoard';
import { SourireBoard, useSmiledKey } from './sourire/SourireBoard';
import { TelBoard } from './tel/TelBoard';
import { TopBar } from './TopBar';
import { WaveBoard } from './wave/WaveBoard';

export function Game() {
  const game = useGame((s) => s.room!.game);
  useSmiledKey();
  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-3 p-3">
      <TopBar />
      <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_20rem]">
        {game === 'wavelength' ? <WaveBoard /> : game === 'telephone' ? <TelBoard /> : game === 'intrus' ? <IntrusBoard /> : game === 'petitbac' ? <BacBoard /> : game === 'connait' ? <ConnaitBoard /> : game === 'bombe' ? <BombBoard /> : game === 'photomaton' ? <PhotoBoard /> : game === 'sourire' ? <SourireBoard /> : game === 'brasdefer' ? <BrasBoard /> : game === 'flash' ? <FlashBoard /> : game === 'cadavre' ? <CadBoard /> : game === 'interdits' ? <InterditsBoard /> : game === 'motamot' ? <StoryBoard /> : game === 'agents' ? <AgentsBoard /> : game === 'fredonne' ? <FredBoard /> : game === 'alibi' ? <AlibiBoard /> : <Board />}
        <Chat />
      </div>
    </div>
  );
}
