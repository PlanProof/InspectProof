import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from "@/components/ui";
import { AlertTriangle, Check, ChevronLeft, Loader2, Eye, EyeOff, Smartphone } from "lucide-react";

const API = (path: string) => `/api${path}`;

interface ValidateResponse {
  email: string;
  companyName: string | null;
  role: string;
  message?: string;
}

interface AcceptResponse {
  token?: string;
  mobileOnly?: boolean;
  message?: string;
}

export default function JoinPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "valid" | "error" | "done">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [invite, setInvite] = useState<{ email: string; companyName: string | null; role: string } | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", password: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mobileOnly, setMobileOnly] = useState(false);

  const { login } = useAuth();

  useEffect(() => {
    if (!token) {
      setErrorMessage("No invitation token found in the link.");
      setStatus("error");
      return;
    }
    fetch(API(`/invites/validate/${token}`))
      .then(async r => {
        const body = await r.json().catch((): ValidateResponse => ({ email: "", companyName: null, role: "" })) as ValidateResponse;
        if (!r.ok) {
          setErrorMessage(body?.message ?? "This invitation link is invalid or has expired.");
          setStatus("error");
        } else {
          setInvite({ email: body.email, companyName: body.companyName, role: body.role });
          setStatus("valid");
        }
      })
      .catch(() => {
        setErrorMessage("Failed to validate invitation. Please try again.");
        setStatus("error");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.firstName.trim() || !form.lastName.trim()) { setFormError("First and last name are required."); return; }
    if (form.password.length < 8) { setFormError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirmPassword) { setFormError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(API("/invites/accept"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, firstName: form.firstName.trim(), lastName: form.lastName.trim(), password: form.password }),
      });
      const body = await res.json().catch((): AcceptResponse => ({})) as AcceptResponse;
      if (!res.ok) {
        setFormError(body?.message ?? "Failed to create account. Please try again.");
        return;
      }
      setMobileOnly(body.mobileOnly ?? false);
      setStatus("done");
      if (!body.mobileOnly && body.token) {
        login(body.token);
      }
    } catch {
      setFormError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div className="z-10">
          <a href="/" className="flex items-center gap-3 text-white mb-12 w-fit hover:opacity-80 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}logo-dark.png`} alt="InspectProof" className="h-10 w-auto" />
            <span className="text-white leading-none text-xl" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>InspectProof</span>
          </a>
          <h1 className="text-4xl font-bold text-white max-w-md leading-tight mt-24">
            Join your team.<br />Start inspecting.<br /><span className="text-[#C5D92D]">Together.</span>
          </h1>
          <p className="text-sidebar-foreground/70 mt-6 text-lg max-w-md">
            You've been invited to join InspectProof — Australia's built environment inspection and compliance platform.
          </p>
        </div>
        <div className="absolute inset-0 opacity-20 mix-blend-overlay">
          <img src={`${import.meta.env.BASE_URL}images/login-bg.png`} alt="" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 bg-background overflow-y-auto">
        <div className="w-full max-w-md">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back to home
          </a>

          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img src={`${import.meta.env.BASE_URL}logo-light.png`} alt="InspectProof" className="h-8 w-auto" />
            <span className="leading-none text-lg text-[#0B1933]" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em", lineHeight: 1 }}>InspectProof</span>
          </div>

          {status === "loading" && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {status === "error" && (
            <Card className="border-0 shadow-2xl shadow-black/5">
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Invitation Invalid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">{errorMessage}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ask your administrator to resend the invitation or send a new one.
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  <a href="/login" className="text-sm text-secondary hover:underline">Already have an account? Sign in</a>
                </div>
              </CardContent>
            </Card>
          )}

          {status === "done" && (
            <Card className="border-0 shadow-2xl shadow-black/5">
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Account Created!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Welcome to InspectProof!</p>
                    <p className="text-xs text-green-700 mt-1">
                      Your account has been created and linked to {invite?.companyName ?? "your team"}.
                    </p>
                  </div>
                </div>
                {mobileOnly ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <Smartphone className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-blue-800">Mobile App Access</p>
                        <p className="text-xs text-blue-700 mt-1">
                          Your account is set up for mobile use only. Download the InspectProof app and sign in with your email and password. Ask your administrator to upgrade the plan for full web access.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <a
                        href="https://apps.apple.com/au/app/inspectproof"
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-[#0B1933] text-white rounded-xl py-3 px-4 text-sm font-semibold hover:bg-[#0B1933]/90 transition-colors"
                      >
                        App Store
                      </a>
                      <a
                        href="https://play.google.com/store/apps/details?id=com.inspectproof"
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-[#0B1933] text-white rounded-xl py-3 px-4 text-sm font-semibold hover:bg-[#0B1933]/90 transition-colors"
                      >
                        Google Play
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Redirecting you to your dashboard...</p>
                )}
              </CardContent>
            </Card>
          )}

          {status === "valid" && invite && (
            <Card className="border-0 shadow-2xl shadow-black/5">
              <CardHeader className="space-y-1 pb-6">
                <CardTitle className="text-2xl font-bold">Accept Invitation</CardTitle>
                {invite.companyName && (
                  <p className="text-sm text-muted-foreground">
                    You're joining <span className="font-semibold text-foreground">{invite.companyName}</span>
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {formError && (
                    <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 border border-destructive/20">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {formError}
                    </div>
                  )}

                  {/* Email (read-only) */}
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      value={invite.email}
                      readOnly
                      className="bg-muted/50 border-muted-foreground/20 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">This email is pre-filled from your invitation</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="firstName"
                        value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        required
                        disabled={submitting}
                        className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="lastName"
                        value={form.lastName}
                        onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        required
                        disabled={submitting}
                        className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPw ? "text" : "password"}
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        required
                        disabled={submitting}
                        className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
                      />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                        tabIndex={-1}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPw ? "text" : "password"}
                        value={form.confirmPassword}
                        onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                        required
                        disabled={submitting}
                        className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
                      />
                      <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                        tabIndex={-1}>
                        {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full mt-2 h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
                    disabled={submitting}
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating Account…</> : "Create Account & Join Team"}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <a href="/login" className="text-secondary hover:underline font-medium">Sign in</a>
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
