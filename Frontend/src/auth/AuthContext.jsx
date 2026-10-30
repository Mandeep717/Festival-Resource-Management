/* eslint-disable react-refresh/only-export-components -- Context and its consumer hook belong together. */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { get, post, put } from "../api/client";

const AuthContext = createContext(null);
const roles = ["attendee", "volunteer", "organizer", "admin"];

async function loadProfile(role) {
  const result = await get(`/${role}/me`);
  return result.profile || result.admin || result.user || result[role] || result;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      for (const candidate of roles) {
        try {
          const profile = await loadProfile(candidate);
          if (active) {
            setUser(profile);
            setRole(candidate);
          }
          break;
        } catch (error) {
          if (error.status !== 401 && error.status !== 403 && error.status !== 404) break;
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user, role, loading,
    async login(accountType, credentials) {
      await post(`/${accountType}/login`, credentials);
      const profile = await loadProfile(accountType);
      setUser(profile);
      setRole(accountType);
      return profile;
    },
    async register(accountType, details) {
      return post(`/${accountType}/register`, details);
    },
    async logout() {
      if (role) await post(`/${role}/logout`, {});
      setUser(null);
      setRole(null);
    },
    async changePassword(oldPassword, newPassword) {
      if (!role || role === "admin") throw new Error("Password changes are not available for this account here.");
      return put(`/${role}/change-password`, { oldPassword, newPassword });
    },
  }), [user, role, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
