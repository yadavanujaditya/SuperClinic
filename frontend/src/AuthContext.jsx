import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Guards against React StrictMode double-invoking this effect, which would otherwise
  // fire the one-time session_id exchange twice and race the backend into creating
  // duplicate user records for the same email.
  const hasProcessedSession = useRef(false);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiFetch("/api/auth/me");
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      // If returning from Google OAuth redirect, session_id lives in the URL hash.
      if (window.location.hash?.includes("session_id=")) {
        if (hasProcessedSession.current) return;
        hasProcessedSession.current = true;
        const sessionId = window.location.hash.split("session_id=")[1]?.split("&")[0];
        try {
          const me = await apiFetch("/api/auth/google/session", {
            method: "POST",
            body: JSON.stringify({ session_id: sessionId }),
          });
          setUser(me);
        } catch {
          setUser(null);
        }
        // Clean the hash so refreshes don't try to re-exchange the same session_id.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setLoading(false);
        return;
      }
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const register = useCallback(async (email, password, name) => {
    const me = await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
    setUser(me);
    return me;
  }, []);

  const login = useCallback(async (email, password) => {
    const me = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setUser(me);
    return me;
  }, []);

  const loginWithGoogle = useCallback(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (fields) => {
    const me = await apiFetch("/api/auth/profile", { method: "PUT", body: JSON.stringify(fields) });
    setUser(me);
    return me;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, register, login, loginWithGoogle, logout, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
