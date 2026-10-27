import { Board } from './Board';
import { Chat } from './Chat';
import { PlayerList } from './PlayerList';
import { TopBar } from './TopBar';

export function Game() {
  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-3 p-3">
      <TopBar />
      <div className="grid flex-1 gap-3 lg:grid-cols-[14rem_1fr_18rem]">
        <PlayerList />
        <Board />
        <Chat />
      </div>
    </div>
  );
}
