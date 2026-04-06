import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = (path: string) => `/api${path}`;

function authHeader() {
  return {
    Authorization: `Bearer ${localStorage.getItem("inspectproof_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

function PaymentFailedBanner() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const canManageBilling = user?.isCompanyAdmin || user?.isAdmin;

  const { data: subData } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const r = await fetch(API("/billing/subscription"), { headers: authHeader() });
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!canManageBilling,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(API("/billing/portal"), { method: "POST", headers: authHeader() });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const subscriptionStatus = subData?.subscription?.status ?? null;
  const isPaymentFailing = subscriptionStatus === "past_due" || subscriptionStatus === "unpaid";

  if (!isPaymentFailing || !canManageBilling || dismissed || location === "/billing") return null;

  return (
    <div className="flex items-center gap-3 bg-red-50 border-b border-red-200 px-5 py-3 text-red-800">
      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
      <p className="text-sm flex-1">
        <span className="font-semibold">Payment required</span> — Your subscription is <strong>{subscriptionStatus}</strong>. Update your payment method to avoid service interruption.
      </p>
      <Button
        size="sm"
        className="bg-red-600 hover:bg-red-700 text-white shrink-0 h-7 px-3 text-xs"
        onClick={() => portalMutation.mutate()}
        disabled={portalMutation.isPending}
      >
        {portalMutation.isPending ? "Opening…" : "Update payment"}
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="text-red-400 hover:text-red-600 shrink-0 ml-1"
        aria-label="Dismiss payment alert"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (user?.mobileOnly) {
    return <Redirect to="/mobile-only" />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
        <PaymentFailedBanner />
        <div className="mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8 flex-1">
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
