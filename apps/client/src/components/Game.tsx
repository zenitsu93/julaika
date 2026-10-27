import { useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../lib/store';
import { animate } from '../motion';
import { Annonces } from './Annonces';
import { AgentsBoard } from './agents/AgentsBoard';
import { AlibiBoard } from './alibi/AlibiBoard';
import { ArcadeBoard } from './arcade/ArcadeBoard';
import { BombBoard } from './bombe/BombBoard';
import { BrasBoard } from './bras/BrasBoard';
import { Board } from './Board';
import { BacBoard } from './bac/BacBoard';
import { CadBoard } from './cadavre/CadBoard';
import { InterditsBoard } from './interdits/InterditsBoard';
import { IntrusBoard } from './intrus/IntrusBoard';
import { CerveauBoard } from './cerveau/CerveauBoard';
import { ConnaitBoard } from './connait/ConnaitBoard';
import { FlashBoard } from './flash/FlashBoard';
import { StoryBoard } from './motamot/StoryBoard';
import { FredBoard } from './fred/FredBoard';
import { PhotoBoard } from './photo/PhotoBoard';
import { QuizBoard } from './quiz/QuizBoard';
import { PitchBoard } from './pitch/PitchBoard';
import { SourireBoard, useSmiledKey } from './sourire/SourireBoard';
import { TelBoard } from './tel/TelBoard';
import { AovBoard } from './verite/AovBoard';
import { ReconnectBanner } from './Reconnect';
import { TopBar } from './TopBar';
import { EndDock, useQuit } from './QuitButton';
import { PickerProvider, useGamePicker } from './GamePicker';
import { WaveBoard } from './wave/WaveBoard';

export function Game({ onQuit }: { onQuit: () => void }) {
  const game = useGame((s) => s.room!.game);
  const quit = useQuit(onQuit);
  const picker = useGamePicker();
  useSmiledKey();
  // Nouveau jeu dans le même salon : le fil d'or repasse et le plateau arrive comme une page neuve.
  const shown = useRef(game);
  const [swaps, setSwaps] = useState(0);
  const board = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (shown.current === game) return;
    shown.current = game;
    setSwaps((n) => n + 1);
    animate(board.current?.firstElementChild, [{ opacity: 0, transform: 'translateY(14px) scale(.985)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 460 });
  }, [game]);
  return (
    <PickerProvider value={picker.open}>
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-3 p-3">
      {swaps > 0 && <div key={swaps} className="page-breath" aria-hidden />}
      <ReconnectBanner />
      <TopBar onQuit={quit.ask} onSwitch={picker.isHost ? picker.open : undefined} />
      <Annonces />
      <div ref={board} className="grid flex-1">
        {game === 'wavelength' ? <WaveBoard /> : game === 'telephone' ? <TelBoard /> : game === 'intrus' ? <IntrusBoard /> : game === 'petitbac' ? <BacBoard /> : game === 'connait' ? <ConnaitBoard /> : game === 'bombe' ? <BombBoard /> : game === 'photomaton' ? <PhotoBoard /> : game === 'sourire' ? <SourireBoard /> : game === 'brasdefer' ? <BrasBoard /> : game === 'flash' ? <FlashBoard /> : game === 'cadavre' ? <CadBoard /> : game === 'interdits' ? <InterditsBoard /> : game === 'motamot' ? <StoryBoard /> : game === 'agents' ? <AgentsBoard /> : game === 'fredonne' ? <FredBoard /> : game === 'alibi' ? <AlibiBoard /> : game === 'pitch' ? <PitchBoard /> : game === 'cerveau' ? <CerveauBoard /> : game === 'verite' ? <AovBoard /> : game === 'quiz' ? <QuizBoard /> : game === 'foot' || game === 'oreillers' || game === 'drap' ? <ArcadeBoard /> : <Board />}
      </div>
      <EndDock onAsk={quit.ask} onSwitch={picker.isHost ? picker.open : undefined} />
      {quit.dialog}
      {picker.dialog}
    </div>
    </PickerProvider>
  );
}
