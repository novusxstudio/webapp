import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LobbyPage } from './LobbyPage'
import { WaitingRoom } from './WaitingRoom'
import { PlayPage } from './PlayPage'
import { JoinPage } from './JoinPage'
import { connectSocket } from './socket'

// Server URL from environment
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;

// =============================================================================
// AUTH STATE
// =============================================================================

interface AuthState {
  token: string | null;
  user: { id: string; email: string } | null;
  loading: boolean;
  error: string | null;
}

function useAuth(): AuthState & { signIn: (username: string) => Promise<void>; signOut: () => void } {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    loading: true,
    error: null,
  });

  // Check for existing token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('novusx.token');
    const storedUser = localStorage.getItem('novusx.user');
    
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setState({ token: storedToken, user, loading: false, error: null });
      } catch {
        // Invalid stored data, clear it
        localStorage.removeItem('novusx.token');
        localStorage.removeItem('novusx.user');
        setState({ token: null, user: null, loading: false, error: null });
      }
    } else {
      setState({ token: null, user: null, loading: false, error: null });
    }
  }, []);

  const signIn = async (username: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Sign in failed');
      }

      const data = await response.json();
      
      // Store in localStorage
      localStorage.setItem('novusx.token', data.token);
      localStorage.setItem('novusx.user', JSON.stringify(data.user));
      
      setState({
        token: data.token,
        user: data.user,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setState(s => ({ ...s, loading: false, error: message }));
    }
  };

  const signOut = () => {
    localStorage.removeItem('novusx.token');
    localStorage.removeItem('novusx.user');
    localStorage.removeItem('novusx.gameId');
    localStorage.removeItem('novusx.playerId');
    localStorage.removeItem('novusx.state');
    setState({ token: null, user: null, loading: false, error: null });
    window.location.reload();
  };

  return { ...state, signIn, signOut };
}

// =============================================================================
// SOCKET CONNECTION
// =============================================================================

function SocketProvider({ children, token }: { children: React.ReactNode; token: string }) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedActiveGame, setCheckedActiveGame] = useState(false);

  useEffect(() => {
    if (!token) return;

    connectSocket(token)
      .then((socket) => {
        setConnected(true);
        setError(null);
        
        // Check for active game on connect
        const onActiveGameFound = (data: { gameId: string; playerId: number; state: any; reconnectToken?: string }) => {
          console.log('[SOCKET] Active game found:', data.gameId);
          
          // Store game data
          localStorage.setItem('novusx.gameId', data.gameId);
          localStorage.setItem('novusx.playerId', String(data.playerId));
          if (data.state) {
            localStorage.setItem('novusx.state', JSON.stringify(data.state));
          }
          if (data.reconnectToken) {
            localStorage.setItem('novusx.reconnectToken', data.reconnectToken);
          }
          
          // Navigate to game
          window.location.hash = '#/game';
          setCheckedActiveGame(true);
        };
        
        const onNoActiveGame = () => {
          console.log('[SOCKET] No active game');
          setCheckedActiveGame(true);
        };
        
        socket.once('ACTIVE_GAME_FOUND', onActiveGameFound);
        socket.once('NO_ACTIVE_GAME', onNoActiveGame);
        
        // Also handle auto-reconnect from the server
        socket.on('RECONNECTED', (data: { gameId: string; playerId: number; state: any; reconnectToken?: string }) => {
          console.log('[SOCKET] Auto-reconnected to game:', data.gameId);
          
          localStorage.setItem('novusx.gameId', data.gameId);
          localStorage.setItem('novusx.playerId', String(data.playerId));
          if (data.state) {
            localStorage.setItem('novusx.state', JSON.stringify(data.state));
          }
          if (data.reconnectToken) {
            localStorage.setItem('novusx.reconnectToken', data.reconnectToken);
          }
          
          window.location.hash = '#/game';
          setCheckedActiveGame(true);
        });
        
        // Ask server if we have an active game
        socket.emit('CHECK_ACTIVE_GAME');
        
        // Timeout fallback - if no response in 2s, assume no active game
        setTimeout(() => {
          setCheckedActiveGame(true);
        }, 2000);
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

  if (!connected || !checkedActiveGame) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <p>{connected ? 'Checking for active game...' : 'Connecting to server...'}</p>
      </div>
    );
  }

  return <>{children}</>;
}

// =============================================================================
// ROUTER
// =============================================================================

function Router({ onSignOut }: { onSignOut: () => void }) {
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
  
  return <LobbyPage onSignOut={onSignOut} />;
}

// =============================================================================
// SIGN IN PAGE
// =============================================================================

function SignInPage({ onSignIn, loading, error }: { 
  onSignIn: (username: string) => void; 
  loading: boolean;
  error: string | null;
}) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSignIn(username.trim());
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: '24px',
      fontFamily: 'system-ui, sans-serif',
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    }}>
      <h1 style={{ 
        color: '#f8fafc', 
        fontSize: '3rem', 
        fontWeight: 700,
        margin: 0,
        textShadow: '0 2px 10px rgba(0,0,0,0.3)',
      }}>
        NovusX
      </h1>
      <p style={{ color: '#94a3b8', margin: 0 }}>Enter your username to play</p>
      
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '300px',
      }}>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          disabled={loading}
          maxLength={20}
          style={{
            padding: '14px 18px',
            borderRadius: '8px',
            border: '2px solid #334155',
            background: '#1e293b',
            color: '#f8fafc',
            fontSize: '16px',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#334155'}
        />
        <button
          type="submit"
          disabled={loading || !username.trim()}
          style={{
            padding: '14px 24px',
            borderRadius: '8px',
            border: 'none',
            background: loading ? '#475569' : '#3b82f6',
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 600,
            transition: 'background 0.2s',
          }}
        >
          {loading ? 'Signing in...' : 'Play'}
        </button>
      </form>

      {error && (
        <p style={{ 
          color: '#f87171', 
          margin: 0,
          padding: '12px 16px',
          background: 'rgba(248, 113, 113, 0.1)',
          borderRadius: '8px',
        }}>
          {error}
        </p>
      )}

      <p style={{ 
        color: '#64748b', 
        fontSize: '12px',
        marginTop: '24px',
      }}>
        No account needed • Just enter a username
      </p>
    </div>
  );
}

// =============================================================================
// APP ROOT
// =============================================================================

function Root() {
  const { token, user, loading, error, signIn, signOut } = useAuth();

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: '#0f172a',
        color: '#f8fafc',
      }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Not authenticated - show sign in
  if (!token || !user) {
    return (
      <SignInPage 
        onSignIn={signIn} 
        loading={loading}
        error={error}
      />
    );
  }

  // Authenticated - wrap router in socket provider
  return (
    <SocketProvider token={token}>
      <Router onSignOut={signOut} />
    </SocketProvider>
  );
}

// Mount the SPA
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
