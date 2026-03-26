import React from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
        <footer className="border-t border-border/50 mt-4 py-4 px-6 text-center">
          <p className="text-xs text-muted-foreground">
            InspectProof &mdash; a product of PlanProof Technologies Pty Ltd
          </p>
        </footer>
      </main>
    </div>
  );
}
