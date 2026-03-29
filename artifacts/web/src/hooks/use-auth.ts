import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface CurrentUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  plan: string;
  isAdmin: boolean;
  isActive: boolean;
  profession: string | null;
  licenceNumber: string | null;
  companyName: string | null;
}

let cachedUser: CurrentUser | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

type FetchUserResult = CurrentUser | null | "deleted";

export async function fetchCurrentUser(token: string): Promise<FetchUserResult> {
  try {
    const r = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 404) return "deleted";
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("inspectproof_token"));
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const onChange = () => setUser(cachedUser);
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  useEffect(() => {
    if (token && !cachedUser) {
      fetchCurrentUser(token).then(u => {
        if (u === "deleted") {
          localStorage.removeItem("inspectproof_token");
          cachedUser = null;
          setToken(null);
          setUser(null);
          notifyListeners();
          setLocation("/login");
          return;
        }
        cachedUser = u;
        setUser(u);
        notifyListeners();
      });
    } else if (!token) {
      cachedUser = null;
      setUser(null);
      notifyListeners();
    }
  }, [token]);

  const login = (newToken: string) => {
    localStorage.setItem("inspectproof_token", newToken);
    setToken(newToken);
    cachedUser = null;
    fetchCurrentUser(newToken).then(u => {
      if (u === "deleted") return;
      cachedUser = u as CurrentUser | null;
      setUser(u as CurrentUser | null);
      notifyListeners();
      if (!(u as CurrentUser)?.profession) {
        setLocation("/settings?onboarding=1");
      } else {
        setLocation("/dashboard");
      }
    });
  };

  const logout = () => {
    localStorage.removeItem("inspectproof_token");
    cachedUser = null;
    setToken(null);
    setUser(null);
    notifyListeners();
    setLocation("/login");
  };

  return { token, user, login, logout, isAuthenticated: !!token };
}
