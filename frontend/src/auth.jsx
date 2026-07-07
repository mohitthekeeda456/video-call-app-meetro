import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getStoredToken } from "./api.js";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const value = localStorage.getItem("user");
    return value ? JSON.parse(value) : null;
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
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
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
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
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
