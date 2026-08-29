import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getMe, logout as apiLogout } from "@/lib/api";
import PhoneAuth from "@/components/PhoneAuth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openLogin = useCallback(() => setShowLogin(true), []);
  const logout = useCallback(async () => { await apiLogout(); setUser(null); }, []);

  return (
    <AuthContext.Provider value={{ user, loading, openLogin, logout, refresh, setUser }}>
      {children}
      <PhoneAuth
        open={showLogin}
        onOpenChange={setShowLogin}
        onAuthed={(u) => { setUser(u); setShowLogin(false); }}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
