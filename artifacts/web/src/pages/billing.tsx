import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, CheckCircle2, ArrowRight, Shield, Zap, Building2,
  BarChart3, Users, FileText, Infinity, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";

const API = (path: string) => `/api${path}`;

function formatAUD(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

const PLAN_ICONS: Record<string, any> = {
  free_trial: Shield,
  starter: Zap,
  professional: BarChart3,
  enterprise: Building2,
};

const PLAN_ICON_COLORS: Record<string, string> = {
  free_trial: "text-gray-500",
  starter: "text-[#466DB5]",
  professional: "text-[#C5D92D]",
  enterprise: "text-[#0B1933]",
};

interface StripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  interval: string | null;
}

interface Plan {
  id: string;
  plan: string;
  name: string;
  description: string;
  prices: StripePrice[];
  limits: {
    maxProjects: number | null;
    maxInspectionsMonthly: number | null;
    maxInspectionsTotal: number | null;
    maxTeamMembers: number | null;
    label: string;
  };
}

export default function Billing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncedRef = useRef(false);

  const params = new URLSearchParams(window.location.search);
  const success = params.get("success") === "1";
  const cancelled = params.get("cancelled") === "1";

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("inspectproof_token") ?? ""}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    if (cancelled) {
      toast({ title: "Checkout cancelled", description: "No charges were made.", variant: "destructive" });
    }
    if (success && !syncedRef.current) {
      syncedRef.current = true;
      setSyncing(true);
      // Sync the plan from Stripe immediately — don't wait for a webhook
      fetch(API("/billing/sync-plan"), { method: "POST", headers: authHeader() })
        .then(() => queryClient.invalidateQueries({ queryKey: ["billing-subscription"] }))
        .then(() => {
          setSyncing(false);
          toast({ title: "Subscription activated!", description: "Your plan has been updated." });
        })
        .catch(() => {
          setSyncing(false);
          toast({ title: "Subscription activated!", description: "Welcome to your new plan." });
        });
    }
  }, []);

  const { data: subData } = useQuery({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const r = await fetch(API("/billing/subscription"), { headers: authHeader() });
      return r.json();
    },
  });

  const { data: plansData } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const r = await fetch(API("/billing/plans"), { headers: authHeader() });
      return r.json();
    },
  });

  const { data: planConfigsData } = useQuery({
    queryKey: ["billing-plan-configs"],
    queryFn: async () => {
      const r = await fetch(API("/billing/plan-configs"));
      return r.json();
    },
    staleTime: 60_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const r = await fetch(API("/billing/checkout"), {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ priceId }),
      });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () => toast({ title: "Error", description: "Could not start checkout.", variant: "destructive" }),
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

  const currentPlan = subData?.plan ?? "free_trial";
  const usage = subData?.usage ?? { projects: 0, inspections: 0 };
  const limits = subData?.limits ?? {};

  const stripePlans: Plan[] = plansData?.plans ?? [];

  const planConfigs: Record<string, { label: string; description: string; features: string[]; isPopular: boolean; isBestValue: boolean }> =
    Object.fromEntries(
      (planConfigsData?.plans ?? []).map((p: any) => [
        p.planKey,
        {
          label: p.label,
          description: p.description ?? "",
          features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || "[]"),
          isPopular: p.isPopular,
          isBestValue: p.isBestValue,
        },
      ])
    );

  const getPlanConfig = (planKey: string) => planConfigs[planKey] ?? {
    label: planKey,
    description: "",
    features: [],
    isPopular: false,
    isBestValue: false,
  };

  const freePlan = {
    plan: "free_trial",
    name: getPlanConfig("free_trial").label || "Free Trial",
    description: getPlanConfig("free_trial").description || "Try InspectProof with no commitment.",
    prices: [],
    limits: { maxProjects: 1, maxInspectionsTotal: 10, maxInspectionsMonthly: null, maxTeamMembers: 1, label: "Free Trial" },
  };

  const enterprisePlan = {
    plan: "enterprise",
    name: getPlanConfig("enterprise").label || "Enterprise",
    description: getPlanConfig("enterprise").description || "Custom solutions for large organisations.",
    prices: [],
    limits: { maxProjects: null, maxInspectionsTotal: null, maxInspectionsMonthly: null, maxTeamMembers: null, label: "Enterprise" },
  };

  const allPlans = [freePlan, ...stripePlans, enterprisePlan];

  function getPrice(plan: typeof freePlan & Partial<Plan>) {
    if (!("prices" in plan) || !plan.prices?.length) return null;
    const p = (plan as Plan).prices;
    if (billing === "annual") return p.find(x => x.interval === "year") ?? null;
    return p.find(x => x.interval === "month") ?? null;
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0B1933] tracking-tight">Plans & Billing</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription and payment details.</p>
      </div>
      {syncing && (
        <div className="mb-6 flex items-center gap-3 bg-[#466DB5]/10 border border-[#466DB5]/30 rounded-xl px-5 py-3 text-[#0B1933]">
          <svg className="animate-spin h-4 w-4 text-[#466DB5]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm font-medium">Confirming your subscription with Stripe…</span>
        </div>
      )}
      <div className="max-w-6xl">
        {/* Current usage */}
        {subData && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Current plan</p>
                <h2 className="text-xl font-bold text-[#0B1933]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {limits.label ?? currentPlan}
                </h2>
                {subData.subscription && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {subData.subscription.cancelAtPeriodEnd
                      ? "Cancels at end of billing period"
                      : `Renews ${new Date(subData.subscription.currentPeriodEnd * 1000).toLocaleDateString("en-AU")}`}
                  </p>
                )}
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-[#0B1933]">{usage.projects}</p>
                  <p className="text-xs text-gray-500">
                    {limits.maxProjects ? `of ${limits.maxProjects} projects` : "projects (unlimited)"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-[#0B1933]">{usage.inspections}</p>
                  <p className="text-xs text-gray-500">
                    {limits.maxInspectionsMonthly
                      ? `of ${limits.maxInspectionsMonthly} this month`
                      : limits.maxInspectionsTotal
                      ? `of ${limits.maxInspectionsTotal} total`
                      : "inspections (unlimited)"}
                  </p>
                </div>
              </div>
              {subData.stripeCustomerId && (
                <Button
                  variant="outline"
                  className="border-[#0B1933] text-[#0B1933]"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Manage billing
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Billing toggle */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#0B1933] mb-3" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Choose your plan
          </h1>
          <p className="text-gray-500 mb-6">Scale as your practice grows. Cancel or change any time.</p>
          <div className="inline-flex bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billing === "monthly" ? "bg-white text-[#0B1933] shadow-sm" : "text-gray-500"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billing === "annual" ? "bg-white text-[#0B1933] shadow-sm" : "text-gray-500"}`}
            >
              Annual <span className="text-[#466DB5] ml-1 text-xs font-semibold">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
          {allPlans.map((plan) => {
            const config = getPlanConfig(plan.plan);
            const Icon = PLAN_ICONS[plan.plan] ?? Shield;
            const iconColor = PLAN_ICON_COLORS[plan.plan] ?? "text-gray-500";
            const price = getPrice(plan as any);
            const isCurrent = plan.plan === currentPlan;
            const isPro = plan.plan === "professional";
            const showBadge = config.isPopular || config.isBestValue;

            return (
              <div
                key={plan.plan}
                className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col transition-all ${
                  isPro ? "border-[#C5D92D] shadow-lg" : isCurrent ? "border-[#466DB5]" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {showBadge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className={config.isBestValue ? "bg-[#C5D92D] text-[#0B1933] hover:bg-[#C5D92D]" : "bg-[#466DB5] text-white hover:bg-[#466DB5]"}>
                      {config.isBestValue ? "Best Value" : "Popular"}
                    </Badge>
                  </div>
                )}
                {isCurrent && !showBadge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-[#466DB5] text-white hover:bg-[#466DB5]">Current plan</Badge>
                  </div>
                )}

                <div className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-4 ${iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <h3 className="font-bold text-[#0B1933] text-lg mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {plan.name}
                </h3>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">{plan.description}</p>

                <div className="mb-6">
                  {plan.plan === "free_trial" ? (
                    <p className="text-3xl font-bold text-[#0B1933]">Free</p>
                  ) : plan.plan === "enterprise" ? (
                    <p className="text-xl font-bold text-[#0B1933]">Contact us</p>
                  ) : price ? (
                    <>
                      <p className="text-3xl font-bold text-[#0B1933]">
                        {formatAUD(price.unit_amount)}
                        <span className="text-sm font-normal text-gray-400 ml-1">
                          AUD/{price.interval === "year" ? "yr" : "mo"}
                        </span>
                      </p>
                      {billing === "annual" && (
                        <p className="text-xs text-[#466DB5] mt-0.5">
                          {formatAUD(Math.round(price.unit_amount / 12))}/month billed annually
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-400 text-sm">Loading...</p>
                  )}
                </div>

                <ul className="space-y-2 flex-1 mb-6">
                  {(config.features.length ? config.features : ["No features listed"]).map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-[#C5D92D] mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.plan === "free_trial" ? (
                  <Button
                    variant="outline"
                    className="w-full border-gray-200 text-gray-500 cursor-default"
                    disabled
                  >
                    {isCurrent ? "Current plan" : "Free forever"}
                  </Button>
                ) : plan.plan === "enterprise" ? (
                  <Button
                    className="w-full bg-[#0B1933] hover:bg-[#0B1933]/90 text-white"
                    onClick={() => window.open("mailto:enterprise@inspectproof.com.au", "_blank")}
                  >
                    Contact us <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : isCurrent ? (
                  <Button variant="outline" className="w-full border-[#466DB5] text-[#466DB5]" disabled>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Active
                  </Button>
                ) : (
                  <Button
                    className={`w-full ${isPro ? "bg-[#0B1933] hover:bg-[#0B1933]/90 text-white" : "bg-[#466DB5] hover:bg-[#466DB5]/90 text-white"}`}
                    disabled={!price || checkoutMutation.isPending}
                    onClick={() => price && checkoutMutation.mutate(price.id)}
                  >
                    {checkoutMutation.isPending && selectedPriceId === price?.id
                      ? "Loading..."
                      : `Upgrade to ${plan.name}`}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400">
          Prices in AUD. Cancel or change plan at any time via the billing portal. &nbsp;
          <a href="mailto:support@inspectproof.com.au" className="underline hover:text-gray-600">Contact support</a>
        </p>
      </div>
    </AppLayout>
  );
}
