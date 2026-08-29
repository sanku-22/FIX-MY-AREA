import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { adminMe, adminLogout as apiAdminLogout } from "@/lib/api";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const a = await adminMe();
      setAdmin(a);
    } catch (e) {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => { await apiAdminLogout(); setAdmin(null); }, []);

  return (
    <AdminAuthContext.Provider value={{ admin, loading, setAdmin, refresh, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
