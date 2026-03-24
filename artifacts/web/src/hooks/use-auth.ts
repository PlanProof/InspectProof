import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export function useAuth() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("inspectproof_token"));
  const [, setLocation] = useLocation();

  const login = (newToken: string) => {
    localStorage.setItem("inspectproof_token", newToken);
    setToken(newToken);
    setLocation("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("inspectproof_token");
    setToken(null);
    setLocation("/login");
  };

  return { token, login, logout, isAuthenticated: !!token };
}
