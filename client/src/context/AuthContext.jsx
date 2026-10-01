import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../lib/api.js";
const Context = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    api
      .get("/auth/me")
      .then((r) => {
        if (mounted) setUser(r.data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  async function login(data) {
    const r = await api.post("/auth/login", data);
    setUser(r.data.user);
  }
  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, loading, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
