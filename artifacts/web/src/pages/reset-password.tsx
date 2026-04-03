import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from "@/components/ui";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, ChevronLeft } from "lucide-react";

const API = (path: string) => `/api${path}`;

export default function ResetPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setStatus("error");
      setErrorMsg("This reset link is missing a token. Please request a new password reset.");
    } else {
      setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    setErrorMsg("");
    setStatus("loading");
    try {
      const res = await fetch(API("/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Unable to reset password. Please request a new reset link.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div className="z-10">
          <a href="/" className="flex items-center gap-3 text-white mb-12 w-fit hover:opacity-80 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}logo-dark.png`} alt="InspectProof" className="h-10 w-auto" />
            <span className="text-white leading-none text-xl" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>InspectProof</span>
          </a>
          <h1 className="text-4xl font-bold text-white max-w-md leading-tight mt-24">
            Reset your<br />password.
          </h1>
          <p className="text-sidebar-foreground/70 mt-6 text-lg max-w-md">
            Choose a strong password to keep your account secure.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 bg-background">
        <div className="w-full max-w-md">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back to login
          </Link>

          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img src={`${import.meta.env.BASE_URL}logo-light.png`} alt="InspectProof" className="h-8 w-auto" />
            <span className="leading-none text-lg text-[#0B1933]" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500 }}>InspectProof</span>
          </div>

          {status === "success" ? (
            <Card className="border-0 shadow-2xl shadow-black/5">
              <CardContent className="pt-10 pb-10 text-center">
                <div className="flex justify-center mb-4">
                  <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-green-600" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Password updated</h2>
                <p className="text-muted-foreground text-sm mb-6">Your password has been reset successfully. You can now sign in with your new password.</p>
                <Link to="/login">
                  <Button className="w-full h-11">Go to Sign In</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-2xl shadow-black/5">
              <CardHeader className="space-y-1 pb-6">
                <CardTitle className="text-2xl font-bold">Set a new password</CardTitle>
                <p className="text-sm text-muted-foreground">Enter your new password below. It must be at least 8 characters.</p>
              </CardHeader>
              <CardContent>
                {(status === "error" && token === null) ? (
                  <div className="text-center py-4">
                    <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-start gap-2 border border-destructive/20 mb-6">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                    <Link to="/login">
                      <Button variant="outline" className="w-full">Request a new reset link</Button>
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {errorMsg && (
                      <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 border border-destructive/20">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {errorMsg}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New password</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showPw ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          minLength={8}
                          className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
                          placeholder="At least 8 characters"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                          tabIndex={-1}
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm new password</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirm ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary pr-10"
                          placeholder="Repeat your new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
                          tabIndex={-1}
                        >
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full mt-6 h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
                      disabled={status === "loading"}
                    >
                      {status === "loading" ? "Updating password…" : "Set new password"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <p className="mt-8 text-xs text-muted-foreground/60 text-center">
          InspectProof &mdash; a product of PlanProof Technologies Pty Ltd
        </p>
      </div>
    </div>
  );
}
