import { useState, useEffect } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from "@/components/ui";
import { AlertTriangle, Check, ChevronLeft, Loader2, Zap, Rocket, Building2, Eye, EyeOff, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const API = (path: string) => `/api${path}`;

function extractHttpStatus(err: unknown): number {
  if (err === null || typeof err !== "object") return 0;
  const e = err as Record<string, unknown>;
  if (typeof e["response"] === "object" && e["response"] !== null) {
    const resp = e["response"] as Record<string, unknown>;
    if (typeof resp["status"] === "number") return resp["status"];
  }
  if (typeof e["status"] === "number") return e["status"];
  return 0;
}

type Plan = {
  id: string;
  plan: string;
  name: string;
  description: string;
  prices: { id: string; unit_amount: number; currency: string; interval: string }[];
  limits: {
    maxProjects: number | null;
    maxInspectionsMonthly: number | null;
    label: string;
    monthlyPriceAud: number | null;
    annualPriceAud: number | null;
    maxTeamMembers: number;
    customTemplates: boolean;
  };
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const urlMode = params.get("mode");
  const [mode, setMode] = useState<"signin" | "signup">(urlMode === "signup" ? "signup" : "signin");

  return (
    <div className="min-h-screen w-full flex">
      {/* Left side */}
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div className="z-10">
          <a href="/" className="flex items-center gap-3 text-white mb-12 w-fit hover:opacity-80 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}logo-dark.png`} alt="InspectProof" className="h-10 w-auto" />
            <span className="text-white leading-none text-xl" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>InspectProof</span>
          </a>
          <h1 className="text-4xl font-bold text-white max-w-md leading-tight mt-24">
            Faster inspections.<br />Clear compliance.<br /><span className="text-[#C5D92D]">Better</span> outcomes.
          </h1>
          <p className="text-sidebar-foreground/70 mt-6 text-lg max-w-md">
            All your inspection workflows in one streamlined platform.
          </p>
        </div>
        <div className="absolute inset-0 opacity-20 mix-blend-overlay">
          <img
            src={`${import.meta.env.BASE_URL}images/login-bg.png`}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 bg-background overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Back to home */}
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to home
          </a>

          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img src={`${import.meta.env.BASE_URL}logo-light.png`} alt="InspectProof" className="h-8 w-auto" />
            <span className="leading-none text-lg text-[#0B1933]" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>InspectProof</span>
          </div>

          {/* Tab toggle */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 mb-6">
            <button
              onClick={() => setMode("signin")}
              className={cn(
                "flex-1 text-sm font-medium py-2 rounded-md transition-all",
                mode === "signin"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={cn(
                "flex-1 text-sm font-medium py-2 rounded-md transition-all",
                mode === "signup"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Create account
            </button>
          </div>

          {mode === "signin" ? <SignInForm /> : <SignUpFlow />}
        </div>
        <p className="mt-8 text-xs text-muted-foreground/60 text-center">
          InspectProof &mdash; a product of PlanProof Technologies Pty Ltd
        </p>
      </div>
    </div>
  );
}

/* ── Sign In ─────────────────────────────────────────────── */
function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotError, setForgotError] = useState("");
  const { login } = useAuth();

  const loginMutation = useLogin({
    mutation: { onSuccess: (data) => login(data.token) },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

  function getLoginError(): string {
    if (!loginMutation.error) return "";
    const status = extractHttpStatus(loginMutation.error);
    if (status === 401) return "Invalid email or password.";
    if (status === 429) return "Too many login attempts. Please wait a few minutes and try again.";
    return "Something went wrong. Please try again.";
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    setForgotStatus("loading");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotStatus("sent");
      } else {
        const data = await res.json().catch(() => ({}));
        setForgotError(data.message || "Something went wrong. Please try again.");
        setForgotStatus("error");
      }
    } catch {
      setForgotError("Something went wrong. Please try again.");
      setForgotStatus("error");
    }
  };

  if (forgotMode) {
    return (
      <Card className="border-0 shadow-2xl shadow-black/5">
        <CardHeader className="space-y-1 pb-6">
          <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email address and we'll send you a link to set a new password.
          </p>
        </CardHeader>
        <CardContent>
          {forgotStatus === "sent" ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <p className="text-sm text-foreground font-medium mb-1">Check your email</p>
              <p className="text-sm text-muted-foreground mb-6">
                If an account exists for <strong>{forgotEmail}</strong>, you'll receive a reset link shortly. Check your spam folder if it doesn't arrive within a few minutes.
              </p>
              <button
                onClick={() => { setForgotMode(false); setForgotStatus("idle"); setForgotEmail(""); }}
                className="text-sm text-secondary hover:text-secondary/80 font-medium"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              {forgotStatus === "error" && forgotError && (
                <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {forgotError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email address</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoFocus
                  className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
                  placeholder="you@example.com"
                />
              </div>
              <Button
                type="submit"
                className="w-full mt-6 h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
                disabled={forgotStatus === "loading"}
              >
                {forgotStatus === "loading" ? "Sending…" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setForgotStatus("idle"); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                Back to sign in
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-2xl shadow-black/5">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
        <p className="text-sm text-muted-foreground">Enter your credentials to access the portal</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {loginMutation.isError && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {getLoginError()}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                className="text-xs text-secondary hover:text-secondary/80 font-medium"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full mt-6 h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ── Sign Up flow ─────────────────────────────────────────── */
const SIGNUP_DISCIPLINES = [
  "Building Surveyor",
  "Structural Engineer",
  "Plumbing Officer",
  "Builder / QC",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
  "Other",
];

type AccountDetails = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  organization: string;
  marketingOptIn: boolean;
  profession: string;
};

function SignUpFlow() {
  const [step, setStep] = useState<1 | 2>(1);
  const [account, setAccount] = useState<AccountDetails>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    organization: "",
    marketingOptIn: false,
    profession: "",
  });

  return step === 1 ? (
    <AccountStep account={account} setAccount={setAccount} onNext={() => setStep(2)} />
  ) : (
    <PlanStep account={account} onBack={() => setStep(1)} />
  );
}

/* Step 1 – account details */
function AccountStep({
  account,
  setAccount,
  onNext,
}: {
  account: AccountDetails;
  setAccount: React.Dispatch<React.SetStateAction<AccountDetails>>;
  onNext: () => void;
}) {
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const handle = (field: keyof AccountDetails) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAccount((a) => ({ ...a, [field]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!account.organization.trim()) { setError("Company or organisation name is required."); return; }
    if (!account.profession) { setError("Please select your professional discipline."); return; }
    if (account.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (account.password !== account.confirmPassword) { setError("Passwords do not match."); return; }
    onNext();
  };

  return (
    <Card className="border-0 shadow-2xl shadow-black/5">
      <CardHeader className="space-y-1 pb-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">1</span>
          <span className="font-medium text-foreground">Account details</span>
          <span className="mx-1 text-muted-foreground/40">→</span>
          <span className="bg-muted rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-muted-foreground">2</span>
          <span>Choose plan</span>
        </div>
        <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
        <p className="text-sm text-muted-foreground">Free 14-day trial — no credit card required to start</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 flex items-start gap-2">
            <Check className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
            <span>This creates a new organisation account. If you were invited to join an existing team, use the link in your invitation email instead.</span>
          </div>
          {error && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="su-org">Company / Organisation <span className="text-destructive">*</span></Label>
            <Input
              id="su-org"
              placeholder="e.g. SA Building Certifications Pty Ltd"
              value={account.organization}
              onChange={handle("organization")}
              required
              className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={account.firstName}
                onChange={handle("firstName")}
                required
                className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={account.lastName}
                onChange={handle("lastName")}
                required
                className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-discipline">
              Your Discipline <span className="text-destructive">*</span>
            </Label>
            <select
              id="su-discipline"
              value={account.profession}
              onChange={e => setAccount(a => ({ ...a, profession: e.target.value }))}
              required
              className="w-full h-9 rounded-md border border-input bg-muted/50 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>Select your discipline…</option>
              {SIGNUP_DISCIPLINES.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {account.profession === "Other" && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <span>
                  No problem — you can still sign up and explore the platform. Once you're in, please reach out to our support team at{" "}
                  <a href="mailto:support@inspectproof.com.au" className="underline font-semibold hover:text-amber-900">
                    support@inspectproof.com.au
                  </a>{" "}
                  and we'll work with you to create checklists tailored to your discipline.
                </span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-email">Work email</Label>
            <Input
              id="su-email"
              type="email"
              value={account.email}
              onChange={handle("email")}
              required
              className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-password">Password</Label>
            <div className="relative">
              <Input
                id="su-password"
                type={showPw ? "text" : "password"}
                value={account.password}
                onChange={handle("password")}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="su-confirm">Confirm password</Label>
            <div className="relative">
              <Input
                id="su-confirm"
                type={showConfirmPw ? "text" : "password"}
                value={account.confirmPassword}
                onChange={handle("confirmPassword")}
                required
                className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                tabIndex={-1}
                aria-label={showConfirmPw ? "Hide password" : "Show password"}
              >
                {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {/* Marketing opt-in */}
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={account.marketingOptIn}
              onChange={e => setAccount(a => ({ ...a, marketingOptIn: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-muted-foreground/30 accent-primary cursor-pointer shrink-0"
            />
            <span className="text-xs text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
              I'd like to receive product updates, inspection tips, and compliance news from InspectProof and PlanProof Technologies. You can update this preference at any time in your account settings.
            </span>
          </label>

          <Button
            type="submit"
            className="w-full mt-2 h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
          >
            Continue to plan selection
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By creating an account you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground">Terms of Service</a> and{" "}
            <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/* Step 2 – plan selection */
const PLAN_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="h-5 w-5" />,
  professional: <Rocket className="h-5 w-5" />,
  enterprise: <Building2 className="h-5 w-5" />,
};

type PlanConfig = {
  planKey: string;
  label: string;
  description: string;
  features: string[];
  isPopular: boolean;
  isBestValue: boolean;
  monthlyPriceAud: number | null;
  annualPriceAud: number | null;
};

function PlanStep({ account, onBack }: { account: AccountDetails; onBack: () => void }) {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [selected, setSelected] = useState<string>("free_trial");
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planConfigs, setPlanConfigs] = useState<Record<string, PlanConfig>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();

  useEffect(() => {
    let done = 0;
    const finish = () => { done++; if (done === 2) setLoading(false); };

    fetch(API("/billing/plans"))
      .then((r) => r.json())
      .then((d) => { setPlans(d.plans ?? []); })
      .catch(() => {})
      .finally(finish);

    fetch(API("/billing/plan-configs"))
      .then((r) => r.json())
      .then((d) => {
        const configs: Record<string, PlanConfig> = {};
        for (const p of d.plans ?? []) {
          configs[p.planKey] = {
            planKey: p.planKey,
            label: p.label,
            description: p.description ?? "",
            features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || "[]"),
            isPopular: p.isPopular,
            isBestValue: p.isBestValue,
            monthlyPriceAud: p.monthlyPriceAud ?? null,
            annualPriceAud: p.annualPriceAud ?? null,
          };
        }
        setPlanConfigs(configs);
      })
      .catch(() => {})
      .finally(finish);
  }, []);

  const getPriceId = (plan: Plan, interval: "month" | "year") => {
    return plan.prices.find((p) => p.interval === interval)?.id ?? null;
  };

  const handleSelect = (planKey: string, plan?: Plan) => {
    setSelected(planKey);
    if (plan) {
      setSelectedPriceId(getPriceId(plan, billingInterval));
    } else {
      setSelectedPriceId(null);
    }
  };

  const handleIntervalChange = (interval: "month" | "year") => {
    setBillingInterval(interval);
    if (selected !== "free_trial" && selected !== "enterprise") {
      const plan = plans.find((p) => p.plan === selected);
      if (plan) setSelectedPriceId(getPriceId(plan, interval));
    }
  };

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      // 1. Register account
      const regRes = await fetch(API("/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: account.firstName,
          lastName: account.lastName,
          email: account.email,
          password: account.password,
          organization: account.organization,
          plan: selected,
          profession: account.profession === "Other" ? null : (account.profession || null),
          marketingEmailOptIn: account.marketingOptIn,
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) {
        setError(regData.message ?? "Registration failed. Please try again.");
        setSubmitting(false);
        return;
      }

      const token = regData.token;

      // Mark this as a brand-new self-registration so the dashboard shows a welcome banner
      // We use the user id from the registration response to scope the key
      const newUserId = regData.user?.id;
      if (newUserId) {
        localStorage.setItem(`ip_show_welcome_${newUserId}`, "1");
      }

      // 2. If free trial or enterprise contact, just log in
      if (selected === "free_trial" || selected === "enterprise") {
        login(token);
        return;
      }

      // 3. For paid plans, create a Stripe checkout session and redirect
      if (selectedPriceId) {
        const checkoutRes = await fetch(API("/billing/checkout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ priceId: selectedPriceId }),
        });
        const checkoutData = await checkoutRes.json();
        if (checkoutData.url) {
          // Store token so we come back logged in after Stripe redirects
          localStorage.setItem("inspectproof_token", token);
          window.location.href = checkoutData.url;
          return;
        }
      }

      // Fallback – just log in without payment
      login(token);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const annualSavings: Record<string, number> = {};
  plans.forEach((p) => {
    const monthly = p.prices.find((pr) => pr.interval === "month")?.unit_amount ?? 0;
    const annual = p.prices.find((pr) => pr.interval === "year")?.unit_amount ?? 0;
    annualSavings[p.plan] = monthly * 12 - annual;
  });

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-2xl shadow-black/5">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="bg-muted rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold text-muted-foreground">1</span>
            <span>Account details</span>
            <span className="mx-1 text-muted-foreground/40">→</span>
            <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">2</span>
            <span className="font-medium text-foreground">Choose plan</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <CardTitle className="text-xl font-bold">Choose your plan</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 border border-destructive/20">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Billing toggle */}
          <div className="flex items-center justify-center gap-1 bg-muted/40 rounded-lg border border-border p-1">
            <button
              onClick={() => handleIntervalChange("month")}
              className={cn(
                "flex-1 text-sm py-1.5 rounded-md transition-all font-medium",
                billingInterval === "month"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => handleIntervalChange("year")}
              className={cn(
                "flex-1 text-sm py-1.5 rounded-md transition-all font-medium flex items-center justify-center gap-1.5",
                billingInterval === "year"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Annual
              <span className="text-[10px] font-semibold bg-[#C5D92D] text-[#0B1933] px-1.5 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading plans…
            </div>
          ) : (
            <div className="space-y-2">
              {/* Free Trial */}
              <PlanCard
                planKey="free_trial"
                name={planConfigs["free_trial"]?.label || "Free Trial"}
                description={planConfigs["free_trial"]?.description || "Try InspectProof free for 14 days."}
                price={null}
                interval={billingInterval}
                features={planConfigs["free_trial"]?.features ?? []}
                selected={selected === "free_trial"}
                onSelect={() => handleSelect("free_trial")}
                icon={null}
                badge={null}
              />

              {/* Paid plans — sourced from DB configs; Stripe prices take precedence, planLimits prices as fallback */}
              {Object.values(planConfigs)
                .filter(cfg => cfg.planKey !== "free_trial" && cfg.planKey !== "enterprise")
                .map((cfg) => {
                  const stripePlan = plans.find((p) => p.plan === cfg.planKey);
                  const stripePrice = stripePlan?.prices.find((p) => p.interval === billingInterval);
                  // Fall back to planLimits prices (from server) when Stripe isn't configured
                  const fallbackPrice = billingInterval === "month" ? cfg.monthlyPriceAud : cfg.annualPriceAud;
                  const displayPrice = stripePrice?.unit_amount ?? fallbackPrice ?? null;
                  // Savings badge — use Stripe data when available, otherwise calculate from planLimits prices
                  const savings = stripePlan
                    ? (annualSavings[cfg.planKey] ?? 0)
                    : cfg.monthlyPriceAud != null && cfg.annualPriceAud != null
                      ? cfg.monthlyPriceAud * 12 - cfg.annualPriceAud
                      : 0;
                  return (
                    <PlanCard
                      key={cfg.planKey}
                      planKey={cfg.planKey}
                      name={cfg.label}
                      description={cfg.description}
                      price={displayPrice}
                      interval={billingInterval}
                      features={cfg.features ?? []}
                      selected={selected === cfg.planKey}
                      onSelect={() => handleSelect(cfg.planKey, stripePlan)}
                      icon={PLAN_ICONS[cfg.planKey] ?? null}
                      badge={billingInterval === "year" && savings > 0 ? `Save ${fmt(savings)}/yr` : null}
                      highlighted={cfg.planKey === "professional"}
                    />
                  );
                })}

              {/* Enterprise */}
              <PlanCard
                planKey="enterprise"
                name={planConfigs["enterprise"]?.label || "Enterprise"}
                description={planConfigs["enterprise"]?.description || "Custom solutions for large organisations."}
                price={null}
                interval={billingInterval}
                features={planConfigs["enterprise"]?.features ?? []}
                selected={selected === "enterprise"}
                onSelect={() => handleSelect("enterprise")}
                icon={PLAN_ICONS.enterprise}
                badge={null}
                enterpriseLabel="Contact us"
              />
            </div>
          )}

          <Button
            onClick={submit}
            disabled={submitting || loading}
            className="w-full h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all mt-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting up your account…</>
            ) : selected === "free_trial" ? (
              "Start free trial"
            ) : selected === "enterprise" ? (
              "Create account & contact us"
            ) : (
              "Create account & pay"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanCard({
  planKey,
  name,
  description,
  price,
  interval,
  features,
  selected,
  onSelect,
  icon,
  badge,
  highlighted = false,
  enterpriseLabel,
  noPrice = false,
}: {
  planKey: string;
  name: string;
  description: string;
  price: number | null;
  interval: "month" | "year";
  features: string[];
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  badge: string | null;
  highlighted?: boolean;
  enterpriseLabel?: string;
  noPrice?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border-2 p-4 transition-all",
        selected
          ? "border-primary bg-primary/5"
          : highlighted
            ? "border-secondary/40 bg-secondary/5 hover:border-secondary/60"
            : "border-border hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {icon && (
              <span className={cn("shrink-0", selected ? "text-primary" : "text-muted-foreground")}>
                {icon}
              </span>
            )}
            <span className="font-semibold text-sm">{name}</span>
            {highlighted && (
              <span className="text-[10px] font-bold bg-secondary text-white px-1.5 py-0.5 rounded-full">
                Popular
              </span>
            )}
            {badge && (
              <span className="text-[10px] font-semibold bg-[#C5D92D] text-[#0B1933] px-1.5 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">{description}</p>
          <ul className="space-y-0.5">
            {features.slice(0, 3).map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-primary shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-right">
          {enterpriseLabel ? (
            <span className="text-sm font-semibold text-muted-foreground">{enterpriseLabel}</span>
          ) : noPrice ? (
            <span className="text-xs font-medium text-muted-foreground text-right leading-snug">Contact<br />us</span>
          ) : price !== null ? (
            <>
              <div className="text-lg font-bold leading-none">
                {fmt(price)}
                <span className="text-xs font-normal text-muted-foreground">
                  /{interval === "month" ? "mo" : "yr"}
                </span>
              </div>
              {interval === "year" && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {fmt(Math.round(price / 12))}/mo
                </div>
              )}
            </>
          ) : planKey === "free_trial" ? (
            <span className="text-lg font-bold">Free</span>
          ) : null}
          <div
            className={cn(
              "mt-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ml-auto",
              selected ? "border-primary bg-primary" : "border-muted-foreground/30"
            )}
          >
            {selected && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        </div>
      </div>
    </button>
  );
}
