import { useEffect, useState } from 'react';
import { Home, codeFromUrl } from './components/Home';
import { Hub } from './components/Hub';
import { Game } from './components/Game';
import { MotDuJour } from './components/mot/MotDuJour';
import { MusicPlayer } from './components/MusicPlayer';
import { SoundToasts } from './components/SoundBoard';
import { saveChosenGame, type GameId } from './lib/games';
import { inRoom, useGame } from './lib/store';
import { refreshAccount, useAccount } from './lib/account';
import { startKeeper } from './lib/keeper';
import { go, usePage, type Page as AccountPage } from './lib/route';
import { Landing, guestChosen } from './components/account/Landing';
import { AuthPage } from './components/account/AuthCard';
import { ResetPage } from './components/account/ResetPage';
import { AlbumPage } from './components/account/AlbumPage';
import { HistoryPage } from './components/account/HistoryPage';
import { SettingsPage } from './components/account/SettingsPage';

// Le compte se charge dès l'ouverture, et les images des parties sont gardées pour l'album.
void refreshAccount();
startKeeper();

export function App() {
  const online = useGame(inRoom);
  const route = usePage();
  const { ready, user } = useAccount();
  // Sans compte, « / » mène à la landing tant qu'on n'a pas cliqué « Jouer sans compte »
  // (les liens d'invitation /r/CODE vont, eux, droit au salon).
  useEffect(() => {
    if (ready && !user && !online && !route && location.pathname === '/' && !guestChosen()) {
      history.replaceState(null, '', '/bienvenue');
      go('bienvenue');
    }
  }, [ready, user, route, online]);
  // Un lien d'invitation (/r/CODE) saute l'accueil des jeux : on va droit au pseudo.
  const [screen, setScreen] = useState<{ game: GameId | null } | null>(() => (codeFromUrl() ? { game: null } : null));
  // Chaque changement de page rejoue la « respiration » (fil d'or, page qui monte, logo qui hoche).
  const page = online ? 'salon' : route ?? (screen ? (screen.game ?? 'code') : 'accueil');
  return (
    <>
      <div key={`fil-${page}`} className="page-breath" aria-hidden />
      <div key={page} className="page-in h-full">
        {!online && route ? (
          <AccountScreen
            route={route}
            onReplay={(game) => {
              saveChosenGame(game);
              setScreen({ game });
              go(null);
            }}
          />
        ) : (
          <Page online={online} screen={screen} setScreen={setScreen} />
        )}
      </div>
      {/* Hors de la page : la musique continue quand on change d'écran. */}
      <MusicPlayer />
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

function AccountScreen({ route, onReplay }: { route: AccountPage; onReplay: (game: GameId) => void }) {
  if (route === 'bienvenue') return <Landing />;
  if (route === 'connexion' || route === 'inscription') return <AuthPage start={route} />;
  if (route === 'mot-de-passe') return <ResetPage />;
  if (route === 'album') return <AlbumPage />;
  if (route === 'historique') return <HistoryPage onReplay={onReplay} />;
  return <SettingsPage />;
}
