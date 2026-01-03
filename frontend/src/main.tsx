import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LobbyPage } from './LobbyPage'
import { WaitingRoom } from './WaitingRoom'
import { PlayPage } from './PlayPage'
import { JoinPage } from './JoinPage'
import { connectSocket } from './socket'

// =============================================================================
// AUTH INTEGRATION
// =============================================================================
// TODO: Integrate Auth.js for production authentication
// Replace useAuth() with actual Auth.js session hook

/**
 * useAuth: Placeholder for Auth.js integration
 * 
 * Replace with:
 * import { useSession } from "next-auth/react"
 * const { data: session, status } = useSession()
 * return { token: session?.accessToken, loading: status === "loading" }
 */
function useAuth(): { token: string | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ token: string | null; loading: boolean; error: string | null }>({
    token: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // TODO: Replace with Auth.js session check
    // For now, show sign-in required
    setState({ token: null, loading: false, error: null });
  }, []);

  return state;
}

// =============================================================================
// SOCKET CONNECTION MANAGER
// =============================================================================

function SocketProvider({ children, token }: { children: React.ReactNode; token: string }) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    connectSocket(token)
      .then(() => {
        setConnected(true);
        setError(null);
      })
      .catch((err) => {
        console.error('[SOCKET] Failed to connect:', err);
        setError(err.message);
        setConnected(false);
      });
  }, [token]);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '16px',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <h2 style={{ color: '#ef4444' }}>Connection Error</h2>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!connected) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>Connecting to server...</p>
      </div>
    );
  }

  return <>{children}</>;
}

// =============================================================================
// ROUTER
// =============================================================================

/**
 * Router: Minimal hash-based router for the SPA.
 * Routes:
 *   #/lobby - Main menu
 *   #/play - Create/join options
 *   #/join - Join existing game
 *   #/waiting - Waiting for opponent
 *   #/game - Active game
 */
function Router() {
  const [route, setRoute] = useState<string>(window.location.hash || '#/lobby');
  
  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/lobby');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (route.startsWith('#/game')) return <App />;
  if (route.startsWith('#/waiting')) return <WaitingRoom />;
  if (route.startsWith('#/play')) return <PlayPage />;
  if (route.startsWith('#/join')) return <JoinPage />;
  
  return <LobbyPage />;
}

// =============================================================================
// APP ROOT
// =============================================================================

function Root() {
  const { token, loading } = useAuth();

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Not authenticated - show sign in
  if (!token) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '16px',
        fontFamily: 'system-ui, sans-serif',
        background: '#f8fafc',
      }}>
        <h1 style={{ color: '#1e293b', fontSize: '2.5rem', fontWeight: 700 }}>NovusX</h1>
        <p style={{ color: '#64748b' }}>Sign in to play</p>
        
        {/* TODO: Replace with Auth.js SignIn button */}
        <button
          onClick={() => {
            // TODO: Integrate Auth.js signIn()
            alert('Auth.js integration required');
          }}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 600,
            marginTop: '16px',
          }}
        >
          Sign In
        </button>
      </div>
    );
  }

  // Authenticated - wrap router in socket provider
  return (
    <SocketProvider token={token}>
      <Router />
    </SocketProvider>
  );
}

// Mount the SPA
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
