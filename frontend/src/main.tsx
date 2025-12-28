import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LobbyPage } from './LobbyPage'

function Root() {
  const [route, setRoute] = useState<string>(window.location.hash || '#/lobby');
  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/lobby');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  if (route.startsWith('#/game')) return <App />;
  return <LobbyPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
