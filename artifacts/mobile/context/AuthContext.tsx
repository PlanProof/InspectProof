import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string | null;
  avatar?: string | null;
  companyName?: string | null;
  profession?: string | null;
  isActive: boolean;
  isAdmin?: boolean;
  requiresPasswordChange?: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getBaseUrl() {
  return process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
}

type FetchUserResult =
  | { status: "ok"; user: User }
  | { status: "invalid_token" }
  | { status: "network_error" };

async function fetchCurrentUser(token: string): Promise<FetchUserResult> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 404) return { status: "invalid_token" };
    if (!res.ok) return { status: "network_error" };
    const data = await res.json();
    const user = data.id ? (data as User) : (data.user ?? null);
    if (!user) return { status: "invalid_token" };
    return { status: "ok", user };
  } catch {
    return { status: "network_error" };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("auth_token");
        const storedUser = await AsyncStorage.getItem("auth_user");

        if (storedToken) {
          setToken(storedToken);
          setAuthTokenGetter(() => storedToken);

          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }

          const result = await fetchCurrentUser(storedToken);
          if (result.status === "ok") {
            setUser(result.user);
            await AsyncStorage.setItem("auth_user", JSON.stringify(result.user));
          } else if (result.status === "invalid_token") {
            await AsyncStorage.removeItem("auth_token");
            await AsyncStorage.removeItem("auth_user");
            setToken(null);
            setUser(null);
          }
          // network_error: keep stored data so offline use still works
        }
      } catch {
        // ignore storage errors
      } finally {
        setIsLoading(false);
      }
    };
    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const response = await fetch(`${getBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Invalid credentials");
    }

    const data = await response.json();
    await AsyncStorage.setItem("auth_token", data.token);
    await AsyncStorage.setItem("auth_user", JSON.stringify(data.user));
    setAuthTokenGetter(() => data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user as User;
  };

  const logout = async () => {
    await AsyncStorage.removeItem("auth_token");
    await AsyncStorage.removeItem("auth_user");
    setAuthTokenGetter(() => null);
    setToken(null);
    setUser(null);
    router.replace("/login");
  };

  const refreshUser = async () => {
    if (!token) return;
    const result = await fetchCurrentUser(token);
    if (result.status === "ok") {
      setUser(result.user);
      await AsyncStorage.setItem("auth_user", JSON.stringify(result.user));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
