import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LobbyPage } from './LobbyPage'
import { WaitingRoom } from './WaitingRoom'
import { BotsPage } from './BotsPage'

function Root() {
  const [route, setRoute] = useState<string>(window.location.hash || '#/lobby');
  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/lobby');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  if (route.startsWith('#/game')) return <App />;
  if (route.startsWith('#/waiting')) return <WaitingRoom />;
  if (route.startsWith('#/bots')) return <BotsPage />;
  return <LobbyPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
