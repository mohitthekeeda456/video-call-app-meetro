import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getStoredToken } from "./api.js";

const AuthContext = createContext(null);

function normalizeUser(user) {
  if (!user) return null;

  return {
    id: user.id || user._id,
    name: user.name,
    email: user.email
  };
}

function readStoredUser() {
  try {
    const value = localStorage.getItem("user");
    return value ? normalizeUser(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(() => readStoredUser());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      if (!token) {
        setReady(true);
        return;
      }

      if (user) {
        setReady(true);
      }

      try {
        const data = await api("/api/me");
        const normalizedUser = normalizeUser(data.user);
        setUser(normalizedUser);
        localStorage.setItem("user", JSON.stringify(normalizedUser));
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
      } finally {
        setReady(true);
      }
    }

    bootstrap();
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      applyAuth(data) {
        const normalizedUser = normalizeUser(data.user);
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(normalizedUser));
        setToken(data.token);
        setUser(normalizedUser);
      },
      logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
      }
    }),
    [ready, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
