import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LobbyPage } from './LobbyPage'
import { WaitingRoom } from './WaitingRoom'
import { BotsPage } from './BotsPage'
import { PlayPage } from './PlayPage'
import { JoinPage } from './JoinPage'

/**
 * Root: Minimal hash-based router for the SPA.
 * - Tracks `window.location.hash` and switches pages without a router library.
 * - Defaults to `#/lobby` when no hash is present.
 */
function Root() {
  const [route, setRoute] = useState<string>(window.location.hash || '#/lobby');
  useEffect(() => {
    // Update route state when the hash changes
    const handler = () => setRoute(window.location.hash || '#/lobby');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  if (route.startsWith('#/game')) return <App />;
  if (route.startsWith('#/waiting')) return <WaitingRoom />;
  if (route.startsWith('#/bots')) return <BotsPage />;
  if (route.startsWith('#/play')) return <PlayPage />;
  if (route.startsWith('#/join')) return <JoinPage />;
  return <LobbyPage />;
}

// Mount the SPA into the DOM root element
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
