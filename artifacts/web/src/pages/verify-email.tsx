import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, AlertTriangle, Loader2, ChevronLeft } from "lucide-react";

const API = (path: string) => `/api${path}`;

export default function VerifyEmail() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setErrorMsg("Verification link is invalid or missing a token. Please check your email and try again.");
      setStatus("error");
      return;
    }

    fetch(API("/auth/verify-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setStatus("success");
        } else {
          setErrorMsg(data.message ?? "Verification failed. Please request a new verification email.");
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMsg("Something went wrong. Please try again.");
        setStatus("error");
      });
  }, []);

  return (
    <div className="min-h-screen w-full flex">
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div className="z-10">
          <a href="/" className="flex items-center gap-3 text-white mb-12 w-fit hover:opacity-80 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}logo-dark.png`} alt="InspectProof" className="h-10 w-auto" />
            <span className="text-white leading-none text-xl" style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>InspectProof</span>
          </a>
          <h1 className="text-4xl font-bold text-white max-w-md leading-tight mt-24">
            Verify your<br />email address.
          </h1>
          <p className="text-sidebar-foreground/70 mt-6 text-lg max-w-md">
            Confirming your email keeps your account secure and ensures you receive important notifications.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 bg-background">
        <div className="w-full max-w-md">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ChevronLeft className="h-4 w-4" />
            Back to login
          </Link>

          <div className="border border-border rounded-2xl bg-white p-8 text-center shadow-sm">
            {status === "loading" && (
              <>
                <Loader2 className="w-12 h-12 text-[#466DB5] mx-auto mb-4 animate-spin" />
                <h2 className="text-xl font-bold text-[#0B1933] mb-2">Verifying your email…</h2>
                <p className="text-sm text-gray-500">Please wait a moment.</p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-[#0B1933] mb-2">Email verified!</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Your email address has been confirmed. You can now continue using InspectProof.
                </p>
                <Link to="/dashboard">
                  <button className="w-full py-2.5 px-4 bg-[#0B1933] text-white font-semibold rounded-lg hover:bg-[#0B1933]/90 transition text-sm">
                    Go to dashboard →
                  </button>
                </Link>
              </>
            )}

            {status === "error" && (
              <>
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-[#0B1933] mb-2">Verification failed</h2>
                <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
                <Link to="/login">
                  <button className="w-full py-2.5 px-4 bg-[#0B1933] text-white font-semibold rounded-lg hover:bg-[#0B1933]/90 transition text-sm">
                    Back to login
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
