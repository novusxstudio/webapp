import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LobbyPage } from './LobbyPage'
import { WaitingRoom } from './WaitingRoom'
import { PlayPage } from './PlayPage'
import { JoinPage } from './JoinPage'
import { connectSocket, isSocketConnected } from './socket'

// =============================================================================
// AUTH INTEGRATION
// =============================================================================
// TODO: Replace with actual Auth.js session hook
// For now, we use a dev token flow

/**
 * useAuth: Placeholder for Auth.js integration
 * 
 * In production, replace with:
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
    // Check for stored dev token first
    const storedToken = localStorage.getItem('novusx.authToken');
    if (storedToken) {
      setState({ token: storedToken, loading: false, error: null });
      return;
    }

    // DEV MODE: Auto-generate a dev token if VITE_DEV_MODE is set
    if (import.meta.env.VITE_DEV_MODE === 'true') {
      // In dev mode, the backend accepts tokens signed with AUTH_SECRET
      // For testing, we'll need to either:
      // 1. Use a pre-generated test token
      // 2. Have a /dev/token endpoint on backend
      // 3. Use a mock token and disable auth in dev backend
      console.warn('[AUTH] Dev mode - no token available. Set VITE_AUTH_TOKEN or implement Auth.js');
      
      // Try to use a dev token if provided
      const devToken = import.meta.env.VITE_AUTH_TOKEN;
      if (devToken) {
        localStorage.setItem('novusx.authToken', devToken);
        setState({ token: devToken, loading: false, error: null });
      } else {
        setState({ token: null, loading: false, error: 'No auth token - set VITE_AUTH_TOKEN for dev' });
      }
      return;
    }

    // PRODUCTION: Would use Auth.js session here
    // For now, mark as error if no token
    setState({ token: null, loading: false, error: 'Authentication required' });
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
        <div style={{ display: 'flex', gap: '12px' }}>
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
          <button
            onClick={() => {
              localStorage.removeItem('novusx.authToken');
              window.location.reload();
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid #ef4444',
              background: '#fee2e2',
              color: '#b91c1c',
              cursor: 'pointer',
            }}
          >
            Clear Token &amp; Sign In Again
          </button>
        </div>
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
 * Root: Minimal hash-based router for the SPA.
 * Routes:
 *   #/lobby - Main menu
 *   #/play - Create/join options
 *   #/join - Join existing game
 *   #/waiting - Waiting for opponent
 *   #/game - Active game
 * 
 * REMOVED (PvP only):
 *   #/bots - Bot challenge (disabled)
 */
function Router() {
  const [route, setRoute] = useState<string>(window.location.hash || '#/lobby');
  
  useEffect(() => {
    const handler = () => setRoute(window.location.hash || '#/lobby');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  // PvP routes only
  if (route.startsWith('#/game')) return <App />;
  if (route.startsWith('#/waiting')) return <WaitingRoom />;
  if (route.startsWith('#/play')) return <PlayPage />;
  if (route.startsWith('#/join')) return <JoinPage />;
  
  // Redirect old bot route to lobby
  if (route.startsWith('#/bots')) {
    window.location.hash = '#/lobby';
    return null;
  }
  
  return <LobbyPage />;
}

// =============================================================================
// APP ROOT
// =============================================================================

function Root() {
  const { token, loading, error } = useAuth();

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

  // Auth error - show login prompt
  if (error || !token) {
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
        <h1 style={{ color: '#1e293b' }}>NovusX</h1>
        <p style={{ color: '#64748b' }}>{error || 'Please sign in to continue'}</p>
        
        {/* DEV MODE: Allow setting a test token */}
        {import.meta.env.VITE_DEV_MODE === 'true' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <input
              type="text"
              placeholder="Paste auth token here"
              id="dev-token-input"
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                width: '300px',
              }}
            />
            <button
              onClick={() => {
                const input = document.getElementById('dev-token-input') as HTMLInputElement;
                if (input.value) {
                  localStorage.setItem('novusx.authToken', input.value);
                  window.location.reload();
                }
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Use Token (Dev Mode)
            </button>
          </div>
        )}
        
        {/* Production: Would have Auth.js sign-in button here */}
        <button
          onClick={() => {
            // TODO: Integrate Auth.js signIn()
            console.log('Sign in clicked - integrate Auth.js');
          }}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: '#10b981',
            color: 'white',
            cursor: 'pointer',
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
