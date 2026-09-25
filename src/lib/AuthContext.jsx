import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { api } from '@/api/client';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true); setAuthError(null);
    try { setUser(await api.auth.me()); }
    catch (error) { setUser(null); if (error.status !== 401) setAuthError({ type: 'unavailable', message: error.message }); }
    finally { setIsLoadingAuth(false); }
  }, []);
  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);
  return <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isLoadingAuth, authChecked: !isLoadingAuth, authError, checkUserAuth }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requires AuthProvider.');
  return context;
}
