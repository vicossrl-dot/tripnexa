import { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { api } from '@/api/client';
import { applyUserLocale, pendingLocale, acknowledgeLocale } from '@/i18n/runtime';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [localeError, setLocaleError] = useState(false);
  const currentUser = useRef(null);
  const localeSaves = useRef(Promise.resolve());
  const saveLocale = useCallback(async locale => {
    const owner = currentUser.current?.id;
    if (!owner) return;
    const save = localeSaves.current.catch(() => {}).then(async () => {
      if (currentUser.current?.id !== owner) return;
      try {
        const updated = await api.auth.updateMe({ ui_locale: locale });
        if (currentUser.current?.id !== owner) return;
        currentUser.current = updated;
        setUser(updated);
        acknowledgeLocale(locale);
        setLocaleError(false);
      } catch { setLocaleError(true); }
    });
    localeSaves.current = save;
    await save;
  }, []);
  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true); setAuthError(null);
    try {
      const authenticated = await api.auth.me();
      currentUser.current = authenticated;
      setUser(authenticated);
      applyUserLocale(authenticated.ui_locale);
      const chosen = pendingLocale();
      // Login waits for the pre-login choice before its full-page redirect.
      if (chosen) await saveLocale(chosen);
    }
    catch (error) { currentUser.current = null; setUser(null); applyUserLocale(null); if (error.status !== 401) setAuthError({ type: 'unavailable', message: error.message }); }
    finally { setIsLoadingAuth(false); }
  }, [saveLocale]);
  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);
  return <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isLoadingAuth, authChecked: !isLoadingAuth, authError, checkUserAuth, saveLocale, localeError }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requires AuthProvider.');
  return context;
}
