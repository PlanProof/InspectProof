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
  isActive: boolean;
  isAdmin?: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getBaseUrl() {
  return process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
}

async function fetchCurrentUser(token: string): Promise<User | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // /api/auth/me returns the user object directly (not wrapped)
    return data.id ? (data as User) : (data.user ?? null);
  } catch {
    return null;
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

          const freshUser = await fetchCurrentUser(storedToken);
          if (freshUser) {
            setUser(freshUser);
            await AsyncStorage.setItem("auth_user", JSON.stringify(freshUser));
          } else if (!storedUser) {
            await AsyncStorage.removeItem("auth_token");
            setToken(null);
          }
        }
      } catch {
        // ignore storage errors
      } finally {
        setIsLoading(false);
      }
    };
    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string) => {
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
    const freshUser = await fetchCurrentUser(token);
    if (freshUser) {
      setUser(freshUser);
      await AsyncStorage.setItem("auth_user", JSON.stringify(freshUser));
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
