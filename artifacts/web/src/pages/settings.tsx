import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import {
  User, Lock, Bell, Building2, Palette, Loader2,
  CheckCircle2, ChevronRight, Shield, Database, Download,
  ToggleLeft, Upload, Trash2, PenLine, CreditCard, Zap, BarChart3,
  ArrowRight, Eye, EyeOff, Plus, X, Edit2, Check, Mail, BookUser,
} from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("inspectproof_token") || "";
  const res = await fetch(`${apiBase()}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type Tab = "profile" | "security" | "notifications" | "organisation" | "platform" | "billing";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile",       label: "Profile",        icon: User },
  { id: "security",      label: "Security",       icon: Lock },
  { id: "notifications", label: "Notifications",  icon: Bell },
  { id: "organisation",  label: "Organisation",   icon: Building2 },
  { id: "platform",      label: "Platform",       icon: Palette },
  { id: "billing",       label: "Billing",        icon: CreditCard },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-secondary/40",
        checked ? "bg-secondary border-secondary" : "bg-muted border-muted-foreground/30"
      )}
    >
      <span className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-5" : "translate-x-0.5"
      )} />
    </button>
  );
}

function SaveBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
      <CheckCircle2 className="h-4 w-4" /> Saved
    </div>
  );
}

function SectionCard({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b bg-muted/20">
        <h3 className="font-semibold text-sidebar text-sm">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-sidebar">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function FormField({ label, hint, children }: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-sidebar block">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition",
        props.disabled && "bg-muted/50 text-muted-foreground cursor-not-allowed",
        props.className
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition",
        props.className
      )}
    />
  );
}

function Button({
  children, onClick, type = "button", variant = "primary", disabled, className
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const base = "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-sidebar text-white hover:bg-sidebar/90",
    outline: "border border-border text-sidebar hover:bg-muted/30",
    danger:  "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(base, variants[variant], className)}>
      {children}
    </button>
  );
}

export default function Settings() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const isOnboarding = new URLSearchParams(window.location.search).get("onboarding") === "1";
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [onboardingStep, setOnboardingStep] = useState<"profile" | "organisation" | "done">(
    isOnboarding ? "profile" : "done"
  );
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    apiFetch("/api/auth/me").then(setUser).catch(() => {}).finally(() => setLoadingUser(false));
  }, [token]);

  const handleProfileOnboardingComplete = () => {
    setOnboardingStep("organisation");
    setActiveTab("organisation");
  };

  const handleOrgOnboardingComplete = () => {
    setOnboardingStep("done");
    setLocation("/dashboard");
  };

  const onboardingBanner = isOnboarding && onboardingStep !== "done" ? (
    <div className="mb-4 p-4 rounded-xl bg-secondary/10 border border-secondary/30 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
        {onboardingStep === "profile" ? <User className="h-4 w-4 text-white" /> : <Building2 className="h-4 w-4 text-white" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <h2 className="text-base font-bold text-sidebar">
            {onboardingStep === "profile" ? "Step 1 of 2 — Your Profile" : "Step 2 of 2 — Organisation Setup"}
          </h2>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
            {onboardingStep === "profile" ? "1/2" : "2/2"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {onboardingStep === "profile"
            ? "Complete your profile below — your Profession is required so we can load the right inspection checklists for you."
            : "Set up your organisation details. These appear on all compliance reports and defect notices you generate."
          }
        </p>
      </div>
    </div>
  ) : null;

  return (
    <AppLayout>
      <div className="mb-6">
        {onboardingBanner}
        <h1 className="text-3xl font-bold text-sidebar tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, organisation, and platform preferences.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <nav className="w-52 shrink-0 space-y-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                activeTab === id
                  ? "bg-sidebar text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-sidebar"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {activeTab === id && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-60" />}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {activeTab === "profile"       && <ProfileTab user={user} loading={loadingUser} isOnboarding={isOnboarding && onboardingStep === "profile"} onOnboardingComplete={handleProfileOnboardingComplete} />}
          {activeTab === "security"      && <SecurityTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "organisation"  && <OrganisationTab isOnboarding={isOnboarding && onboardingStep === "organisation"} onOnboardingComplete={handleOrgOnboardingComplete} />}
          {activeTab === "platform"      && <PlatformTab />}
          {activeTab === "billing"       && <BillingTab />}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

const PROFESSION_OPTIONS = [
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

function ProfileTab({ user, loading, isOnboarding = false, onOnboardingComplete }: { user: any; loading: boolean; isOnboarding?: boolean; onOnboardingComplete?: () => void }) {
  const [saved, setSaved] = useState(false);
  const [professionError, setProfessionError] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [profession, setProfession] = useState("");
  const [professionCustom, setProfessionCustom] = useState("");

  // Signature state
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [sigUploading, setSigUploading] = useState(false);
  const [sigError, setSigError] = useState("");
  const [sigSaved, setSigSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim());
      setPhone(user.phone ?? "");
      setLicenceNumber(user.licenceNumber ?? "");
      const p = user.profession ?? "";
      if (PROFESSION_OPTIONS.includes(p) || p === "") {
        setProfession(p);
        setProfessionCustom("");
      } else {
        setProfession("Other");
        setProfessionCustom(p);
      }
      setSignatureUrl(user.signatureUrl ?? null);
    }
  }, [user]);

  const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  const effectiveProfession = profession === "Other" ? professionCustom.trim() : profession;

  const save = async () => {
    // Validate profession is set (mandatory, especially during onboarding)
    if (!effectiveProfession) {
      setProfessionError(true);
      return;
    }
    setProfessionError(false);

    const [firstName, ...rest] = name.trim().split(" ");
    const lastName = rest.join(" ");
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName || name.trim(),
          lastName: lastName || "",
          phone,
          licenceNumber,
          profession: effectiveProfession,
        }),
      });
    } catch {
      // silently continue — save banner still shows
    }
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      if (isOnboarding && onOnboardingComplete) onOnboardingComplete();
    }, 1500);
  };

  const uploadSignature = async (file: File) => {
    setSigError("");
    setSigUploading(true);
    try {
      // 1. Request a pre-signed upload URL
      const { uploadURL, objectPath } = await apiFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });

      // 2. PUT the file to the signed URL
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");

      // 3. Save objectPath on the user record
      await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureUrl: objectPath }),
      });

      setSignatureUrl(objectPath);
      setSigSaved(true);
      setTimeout(() => setSigSaved(false), 3000);
    } catch (err: any) {
      setSigError("Upload failed. Please try again.");
    } finally {
      setSigUploading(false);
    }
  };

  const removeSignature = async () => {
    setSigError("");
    setSigUploading(true);
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureUrl: null }),
      });
      setSignatureUrl(null);
      setSigSaved(true);
      setTimeout(() => setSigSaved(false), 3000);
    } catch {
      setSigError("Could not remove signature. Please try again.");
    } finally {
      setSigUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSigError("Please upload an image file (PNG, JPG, or SVG).");
      return;
    }
    uploadSignature(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadSignature(file);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading profile…
    </div>
  );

  return (
    <>
      <SectionCard title="Personal Information" description="Your name, contact details, and professional credentials">
        {/* Avatar row */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/50">
          <div className="h-16 w-16 rounded-full bg-secondary/20 text-secondary flex items-center justify-center text-xl font-bold shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-semibold text-sidebar">{name || "Your Name"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
            <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-secondary/10 text-secondary border-secondary/30 capitalize">
              {user?.role?.replace(/_/g, " ") ?? "User"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Full Name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </FormField>
          <FormField label="Email Address" hint="Email cannot be changed — contact support if needed.">
            <Input value={user?.email ?? ""} disabled />
          </FormField>
          <FormField label="Phone Number">
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+61 400 000 000" />
          </FormField>
          <FormField label={<span className="flex items-center gap-1">Profession <span className="text-red-500">*</span></span>}>
            <select
              value={profession}
              onChange={e => { setProfession(e.target.value); setProfessionCustom(""); setProfessionError(false); }}
              className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${professionError ? "border-red-400 focus-visible:ring-red-300" : "border-input"}`}
            >
              <option value="">— Select your discipline —</option>
              {PROFESSION_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {profession === "Other" && (
              <input
                type="text"
                value={professionCustom}
                onChange={e => { setProfessionCustom(e.target.value); setProfessionError(false); }}
                placeholder="Enter your discipline…"
                className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            {professionError && (
              <p className="text-xs text-red-500 mt-1">Profession is required — this determines your inspection checklists.</p>
            )}
          </FormField>
          <FormField label="Licence / Registration Number" hint="Your accreditation number as it appears on reports.">
            <Input value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} placeholder="e.g. BPB0002345" />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/50">
          <SaveBanner show={saved} />
          <Button onClick={save}>Save Profile</Button>
        </div>
      </SectionCard>

      {/* ── Digital Signature ─────────────────────────────────────────────── */}
      <SectionCard
        title="Digital Signature"
        description="Your signature is automatically embedded in the certification section of all generated PDF reports."
      >
        <div className="space-y-4">
          {/* Signature preview or upload area */}
          {signatureUrl ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-4">
                {/* Preview box */}
                <div className="flex-1 min-w-0 border border-border rounded-xl bg-white p-4 flex items-center justify-center min-h-[80px]">
                  <img
                    src={`${apiBase()}/api/storage${signatureUrl}`}
                    alt="Your signature"
                    className="max-h-16 max-w-full object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sigUploading}
                    className="text-xs"
                  >
                    {sigUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Replace
                  </Button>
                  <Button
                    variant="danger"
                    onClick={removeSignature}
                    disabled={sigUploading}
                    className="text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
              <p className="text-xs text-green-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Signature saved — it will appear on all future PDF reports.
              </p>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => !sigUploading && fileInputRef.current?.click()}
              onKeyDown={e => e.key === "Enter" && fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                sigUploading
                  ? "border-secondary/30 bg-secondary/5"
                  : "border-border hover:border-secondary/50 hover:bg-secondary/5"
              )}
            >
              {sigUploading ? (
                <div className="flex flex-col items-center gap-2 text-secondary">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm font-medium">Uploading…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
                    <PenLine className="h-6 w-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-sidebar">Upload your signature</p>
                    <p className="text-xs mt-0.5">Drag & drop or click to browse — PNG or JPG recommended</p>
                  </div>
                  <Button variant="outline" className="text-xs pointer-events-none">
                    <Upload className="h-3.5 w-3.5" /> Choose File
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Tips */}
          <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-sidebar">Tips for a clean signature</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Sign on white paper with a dark pen, then photograph or scan it.</li>
              <li>PNG with a transparent background looks best on the PDF.</li>
              <li>Crop tightly around your signature before uploading.</li>
            </ul>
          </div>

          {sigError && <p className="text-sm text-red-500">{sigError}</p>}
          {sigSaved && (
            <p className="text-sm text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {signatureUrl ? "Signature updated successfully." : "Signature removed."}
            </p>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </SectionCard>
    </>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-sidebar transition-colors"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { logout } = useAuth();
  const [, navigate] = useLocation();
  const [deleteStep, setDeleteStep] = useState<0 | 1>(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch("/api/auth/account", { method: "DELETE" });
      logout();
      navigate("/");
    } catch {
      setDeleteError("Failed to delete account. Please try again or contact support@inspectproof.com.au.");
      setDeleting(false);
      setDeleteStep(0);
    }
  };

  const save = async () => {
    setError("");
    if (next.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }
    setSaving(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setSaved(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      let msg = "Failed to update password.";
      try { msg = JSON.parse(err.message)?.message ?? msg; } catch {}
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionCard title="Change Password" description="Use a strong password with a mix of letters, numbers, and symbols">
        <div className="max-w-md space-y-4">
          <FormField label="Current Password">
            <PasswordInput value={current} onChange={setCurrent} placeholder="••••••••" />
          </FormField>
          <FormField label="New Password">
            <PasswordInput value={next} onChange={setNext} placeholder="••••••••" />
          </FormField>
          <FormField label="Confirm New Password">
            <PasswordInput value={confirm} onChange={setConfirm} placeholder="••••••••" />
          </FormField>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <SaveBanner show={saved} />
            <Button onClick={save} disabled={saving} className="flex items-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Updating…" : "Update Password"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Active Sessions" description="Devices currently signed in to your account">
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
            <div>
              <p className="text-sm font-medium text-sidebar">Current browser session</p>
              <p className="text-xs text-muted-foreground">Active now</p>
            </div>
            <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Current</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1 px-1">
            Full session management — including viewing and revoking other devices — will be available in a future update.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Two-Factor Authentication" description="Add an extra layer of security to your account">
        <SettingRow
          label="Authenticator App"
          description="Use an app like Google Authenticator or Authy to generate one-time codes."
        >
          <Button variant="outline" disabled className="opacity-60 cursor-not-allowed">
            Coming soon
          </Button>
        </SettingRow>
      </SectionCard>

      <div className="rounded-xl border border-red-200 bg-red-50/40 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Trash2 className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-700">Delete Account</h3>
            <p className="text-sm text-red-600/80 mt-0.5">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
        </div>

        {deleteError && (
          <p className="text-sm text-red-600 bg-red-100 rounded-lg px-3 py-2">{deleteError}</p>
        )}

        {deleteStep === 0 ? (
          <Button
            variant="danger"
            onClick={() => setDeleteStep(1)}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete My Account
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-700">
              Are you sure? This will permanently erase your profile, projects, and all inspection data linked only to you.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex items-center gap-2"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {deleting ? "Deleting…" : "Yes, Delete Permanently"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setDeleteStep(0); setDeleteError(""); }}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

const NOTIF_DEFAULTS = {
  emailSummary:      true,
  emailDefects:      true,
  emailAssignments:  false,
  pushCritical:      true,
  pushCompletions:   false,
  pushReminders:     true,
  reportReady:       true,
  weeklyDigest:      false,
};

function NotificationsTab() {
  const [prefs, setPrefs] = useState(NOTIF_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/auth/notification-prefs")
      .then(data => setPrefs({ ...NOTIF_DEFAULTS, ...data }))
      .catch(() => {
        try {
          const stored = localStorage.getItem("inspectproof_notif_prefs");
          if (stored) setPrefs({ ...NOTIF_DEFAULTS, ...JSON.parse(stored) });
        } catch {}
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: keyof typeof prefs) => {
    setPrefs((p: typeof prefs) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/auth/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      localStorage.removeItem("inspectproof_notif_prefs");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert("Failed to save notification preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
    </div>
  );

  return (
    <>
      <SectionCard title="Email Notifications" description="Control which events trigger emails to your inbox">
        <div className="divide-y divide-border/50">
          <div className="py-1">
            <SettingRow label="Daily Summary" description="A morning summary of active projects and upcoming inspections.">
              <Toggle checked={prefs.emailSummary} onChange={() => toggle("emailSummary")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Defect Notices & Follow-ups" description="Immediate alert when a defect notice is issued on your project.">
              <Toggle checked={prefs.emailDefects} onChange={() => toggle("emailDefects")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Inspection Assignments" description="Notify me when I'm assigned to an inspection.">
              <Toggle checked={prefs.emailAssignments} onChange={() => toggle("emailAssignments")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Report Ready" description="Email when a compliance report is generated and ready to download.">
              <Toggle checked={prefs.reportReady} onChange={() => toggle("reportReady")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Weekly Activity Digest" description="A summary of completed inspections, pass/fail rates, and open items.">
              <Toggle checked={prefs.weeklyDigest} onChange={() => toggle("weeklyDigest")} />
            </SettingRow>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Push Notifications" description="Real-time alerts sent to your browser or mobile app">
        <div className="divide-y divide-border/50">
          <div className="py-1">
            <SettingRow label="Critical Alerts" description="Failed inspections, overdue items, and compliance issues.">
              <Toggle checked={prefs.pushCritical} onChange={() => toggle("pushCritical")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Inspection Completions" description="When a field inspection is submitted.">
              <Toggle checked={prefs.pushCompletions} onChange={() => toggle("pushCompletions")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Inspection Reminders" description="Reminders 24h before scheduled inspection dates.">
              <Toggle checked={prefs.pushReminders} onChange={() => toggle("pushReminders")} />
            </SettingRow>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <div className="flex items-center gap-3">
          <SaveBanner show={saved} />
          <Button onClick={save} disabled={saving} className="flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Organisation Tab ──────────────────────────────────────────────────────────

const ORG_DEFAULTS = {
  name:            "",
  abn:             "",
  acn:             "",
  phone:           "",
  email:           "",
  address:         "",
  suburb:          "",
  state:           "NSW",
  postcode:        "",
  website:         "",
  accredBody:      "BPB",
  accredNum:       "",
  accredExpiry:    "",
  plInsurer:       "",
  plPolicyNumber:  "",
  plExpiry:        "",
  piInsurer:       "",
  piPolicyNumber:  "",
  piExpiry:        "",
  reportFooterText: "",
};

interface StaffMember {
  id: number;
  name: string;
  role: string;
  email: string | null;
}

interface OrgContractor {
  id: number;
  name: string;
  trade: string;
  email: string | null;
  company: string | null;
  licenceNumber: string | null;
  registrationNumber: string | null;
  licenceExpiry: string | null;
  registrationExpiry: string | null;
  totalProjects: number;
  activeProjects: number;
}

interface OrgContractorDefect {
  id: number;
  defectDescription: string;
  notes: string | null;
  severity: string | null;
  location: string | null;
  status: string;
  projectName: string;
  dateRaised: string;
  tradeAllocated: string | null;
}

interface TradeCategory {
  id: number;
  name: string;
}

function OrgContractorCard({ c, onEdit, onRemove }: {
  c: OrgContractor;
  onEdit: (c: OrgContractor) => void;
  onRemove: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [defects, setDefects] = useState<OrgContractorDefect[]>([]);
  const [defectsLoading, setDefectsLoading] = useState(false);
  const [defectsLoaded, setDefectsLoaded] = useState(false);

  const loadDefects = async () => {
    if (defectsLoaded) return;
    setDefectsLoading(true);
    try {
      const data = await apiFetch(`/api/org-contractors/${c.id}/performance`);
      setDefects(data);
      setDefectsLoaded(true);
    } catch {
      setDefectsLoaded(true);
    } finally {
      setDefectsLoading(false);
    }
  };

  const toggleExpand = () => {
    if (!expanded) loadDefects();
    setExpanded(e => !e);
  };

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="rounded-lg border border-border bg-muted/10 overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-sidebar">{c.name}</p>
            {c.trade && <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded">{c.trade}</span>}
            {c.company && <span className="text-xs text-muted-foreground">· {c.company}</span>}
          </div>
          {c.email && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Mail className="h-3 w-3 shrink-0" />{c.email}
            </p>
          )}
          <div className="flex flex-wrap gap-3 mt-1.5">
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-sidebar">{c.totalProjects}</span> total projects
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-green-700">{c.activeProjects}</span> active
            </span>
            {c.licenceNumber && (
              <span className="text-xs text-muted-foreground">Lic: <span className="font-medium text-sidebar">{c.licenceNumber}</span>
                {c.licenceExpiry && <span className="ml-1 text-amber-600">(exp {fmtDate(c.licenceExpiry)})</span>}
              </span>
            )}
            {c.registrationNumber && (
              <span className="text-xs text-muted-foreground">Reg: <span className="font-medium text-sidebar">{c.registrationNumber}</span>
                {c.registrationExpiry && <span className="ml-1 text-amber-600">(exp {fmtDate(c.registrationExpiry)})</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleExpand}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors text-xs flex items-center gap-1"
            title="View performance"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
          </button>
          <button onClick={() => onEdit(c)} className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors" title="Edit">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={() => onRemove(c.id)} className="shrink-0 p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Remove">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 bg-white space-y-2">
          <p className="text-xs font-semibold text-sidebar uppercase tracking-wide">Defect History</p>
          {defectsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          )}
          {!defectsLoading && defects.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No defects linked to this contractor.</p>
          )}
          {!defectsLoading && defects.map(d => (
            <div key={d.id} className="rounded border border-border p-2 space-y-0.5">
              <p className="text-xs font-medium text-sidebar">{d.defectDescription}</p>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>{d.projectName}</span>
                <span>{fmtDate(d.dateRaised)}</span>
                {d.severity && <span className={cn("px-1.5 py-0.5 rounded font-medium",
                  d.severity === "critical" ? "bg-red-50 text-red-700 border border-red-200" :
                  d.severity === "major" ? "bg-orange-50 text-orange-700 border border-orange-200" :
                  "bg-yellow-50 text-yellow-700 border border-yellow-200"
                )}>{d.severity}</span>}
                <span className={cn("px-1.5 py-0.5 rounded capitalize",
                  d.status === "open" ? "bg-red-50 text-red-700" :
                  d.status === "in_progress" ? "bg-amber-50 text-amber-700" :
                  "bg-gray-50 text-gray-600"
                )}>{d.status.replace("_", " ")}</span>
              </div>
              {d.notes && <p className="text-[11px] text-muted-foreground italic">{d.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractorLibrarySection() {
  const [contractors, setContractors] = useState<OrgContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newLicenceNumber, setNewLicenceNumber] = useState("");
  const [newRegistrationNumber, setNewRegistrationNumber] = useState("");
  const [newLicenceExpiry, setNewLicenceExpiry] = useState("");
  const [newRegistrationExpiry, setNewRegistrationExpiry] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editTrade, setEditTrade] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editLicenceNumber, setEditLicenceNumber] = useState("");
  const [editRegistrationNumber, setEditRegistrationNumber] = useState("");
  const [editLicenceExpiry, setEditLicenceExpiry] = useState("");
  const [editRegistrationExpiry, setEditRegistrationExpiry] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/org-contractors")
      .then(setContractors)
      .catch(() => setContractors([]))
      .finally(() => setLoading(false));
  }, []);

  const add = async () => {
    if (!newName.trim()) { setError("Name is required."); return; }
    setError("");
    setSavingNew(true);
    try {
      const created = await apiFetch("/api/org-contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(), trade: newTrade.trim(),
          email: newEmail.trim() || null, company: newCompany.trim() || null,
          licenceNumber: newLicenceNumber.trim() || null,
          registrationNumber: newRegistrationNumber.trim() || null,
          licenceExpiry: newLicenceExpiry || null,
          registrationExpiry: newRegistrationExpiry || null,
        }),
      });
      setContractors(c => [...c, created]);
      setNewName(""); setNewTrade(""); setNewEmail(""); setNewCompany("");
      setNewLicenceNumber(""); setNewRegistrationNumber(""); setNewLicenceExpiry(""); setNewRegistrationExpiry("");
      setAdding(false);
    } catch {
      setError("Failed to add contractor. Please try again.");
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (c: OrgContractor) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditTrade(c.trade);
    setEditEmail(c.email ?? "");
    setEditCompany(c.company ?? "");
    setEditLicenceNumber(c.licenceNumber ?? "");
    setEditRegistrationNumber(c.registrationNumber ?? "");
    setEditLicenceExpiry(c.licenceExpiry ?? "");
    setEditRegistrationExpiry(c.registrationExpiry ?? "");
    setError("");
  };

  const saveEdit = async () => {
    if (!editName.trim()) { setError("Name is required."); return; }
    setError("");
    setSavingEdit(true);
    try {
      const updated = await apiFetch(`/api/org-contractors/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(), trade: editTrade.trim(),
          email: editEmail.trim() || null, company: editCompany.trim() || null,
          licenceNumber: editLicenceNumber.trim() || null,
          registrationNumber: editRegistrationNumber.trim() || null,
          licenceExpiry: editLicenceExpiry || null,
          registrationExpiry: editRegistrationExpiry || null,
        }),
      });
      setContractors(c => c.map(x => x.id === editingId ? updated : x));
      setEditingId(null);
    } catch {
      setError("Failed to update contractor. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/org-contractors/${id}`, { method: "DELETE" });
      setContractors(c => c.filter(x => x.id !== id));
    } catch {
      setError("Failed to remove contractor.");
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading contractor library…
    </div>
  );

  return (
    <div className="space-y-3">
      {contractors.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground py-1">No contractors in the library yet. Add your first contractor below.</p>
      )}

      {contractors.map(c => editingId === c.id ? (
        <div key={c.id} className="p-3 rounded-lg border border-secondary/40 bg-secondary/5 space-y-2">
          <p className="text-xs font-semibold text-sidebar">Edit Contractor</p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name *" autoFocus />
            <Input value={editTrade} onChange={e => setEditTrade(e.target.value)} placeholder="Trade / Discipline" />
            <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email address" type="email" />
            <Input value={editCompany} onChange={e => setEditCompany(e.target.value)} placeholder="Company" />
            <Input value={editLicenceNumber} onChange={e => setEditLicenceNumber(e.target.value)} placeholder="Licence Number (optional)" />
            <Input value={editRegistrationNumber} onChange={e => setEditRegistrationNumber(e.target.value)} placeholder="Registration Number (optional)" />
            <div>
              <label className="text-xs text-muted-foreground">Licence Expiry</label>
              <Input value={editLicenceExpiry} onChange={e => setEditLicenceExpiry(e.target.value)} type="date" className="mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Registration Expiry</label>
              <Input value={editRegistrationExpiry} onChange={e => setEditRegistrationExpiry(e.target.value)} type="date" className="mt-0.5" />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={saveEdit} disabled={savingEdit} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-white text-xs font-medium disabled:opacity-50">
              {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {savingEdit ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <OrgContractorCard key={c.id} c={c} onEdit={startEdit} onRemove={remove} />
      ))}

      {adding ? (
        <div className="p-3 rounded-lg border border-secondary/40 bg-secondary/5 space-y-2">
          <p className="text-xs font-semibold text-sidebar">New Contractor</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(""); }}
              placeholder="Full name *"
              autoFocus
            />
            <Input
              value={newTrade}
              onChange={e => setNewTrade(e.target.value)}
              placeholder="Trade / Discipline"
            />
            <Input
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="Email address (optional)"
              type="email"
            />
            <Input
              value={newCompany}
              onChange={e => setNewCompany(e.target.value)}
              placeholder="Company (optional)"
            />
            <Input
              value={newLicenceNumber}
              onChange={e => setNewLicenceNumber(e.target.value)}
              placeholder="Licence Number (optional)"
            />
            <Input
              value={newRegistrationNumber}
              onChange={e => setNewRegistrationNumber(e.target.value)}
              placeholder="Registration Number (optional)"
            />
            <div>
              <label className="text-xs text-muted-foreground">Licence Expiry</label>
              <Input value={newLicenceExpiry} onChange={e => setNewLicenceExpiry(e.target.value)} type="date" className="mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Registration Expiry</label>
              <Input value={newRegistrationExpiry} onChange={e => setNewRegistrationExpiry(e.target.value)} type="date" className="mt-0.5" />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <Button onClick={add} disabled={savingNew}>
              {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {savingNew ? "Saving…" : "Add Contractor"}
            </Button>
            <Button variant="outline" onClick={() => {
              setAdding(false); setError("");
              setNewName(""); setNewTrade(""); setNewEmail(""); setNewCompany("");
              setNewLicenceNumber(""); setNewRegistrationNumber(""); setNewLicenceExpiry(""); setNewRegistrationExpiry("");
            }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => { setAdding(true); setError(""); }}>
          <Plus className="h-4 w-4" />
          Add Contractor
        </Button>
      )}

      {error && !adding && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function InternalStaffSection() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [inviteSentIds, setInviteSentIds] = useState<Set<number>>(new Set());
  const [invitingId, setInvitingId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/internal-staff")
      .then(setStaff)
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, []);

  const addStaff = async () => {
    if (!newName.trim()) { setError("Name is required."); return; }
    setError("");
    setSavingNew(true);
    try {
      const created = await apiFetch("/api/internal-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), role: newRole.trim(), email: newEmail.trim() || null }),
      });
      setStaff(s => [...s, created]);
      setNewName("");
      setNewRole("");
      setNewEmail("");
      setAdding(false);
    } catch {
      setError("Failed to add staff member. Please try again.");
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditRole(member.role);
    setEditEmail(member.email ?? "");
    setError("");
  };

  const saveEdit = async () => {
    if (!editName.trim()) { setError("Name is required."); return; }
    setError("");
    setSavingEdit(true);
    try {
      const updated = await apiFetch(`/api/internal-staff/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), role: editRole.trim(), email: editEmail.trim() || null }),
      });
      setStaff(s => s.map(m => m.id === editingId ? updated : m));
      setEditingId(null);
    } catch {
      setError("Failed to update staff member. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const removeStaff = async (id: number) => {
    try {
      await apiFetch(`/api/internal-staff/${id}`, { method: "DELETE" });
      setStaff(s => s.filter(m => m.id !== id));
    } catch {
      setError("Failed to remove staff member.");
    }
  };

  const sendInvite = async (member: StaffMember) => {
    if (!member.email) return;
    setInvitingId(member.id);
    try {
      await apiFetch("/api/app-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: member.email, name: member.name }),
      });
      setInviteSentIds(s => new Set([...s, member.id]));
    } catch {
      setError(`Failed to send invite to ${member.email}. Please try again.`);
    } finally {
      setInvitingId(null);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
    </div>
  );

  return (
    <div className="space-y-3">
      {staff.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground py-1">No internal staff added yet. Add your first team member below.</p>
      )}

      {staff.map(member => (
        <div key={member.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10">
          {editingId === member.id ? (
            <>
              <div className="flex-1 grid grid-cols-3 gap-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
                <Input
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  placeholder="Trade / Role"
                />
                <Input
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder="Email address"
                  type="email"
                />
              </div>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="shrink-0 p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                title="Save"
              >
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar">{member.name}</p>
                {member.role && <p className="text-xs text-muted-foreground mt-0.5">{member.role}</p>}
                {member.email && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" />
                    {member.email}
                  </p>
                )}
              </div>
              {member.email && (
                inviteSentIds.has(member.id) ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs text-green-600 font-medium px-2 py-1 rounded-lg bg-green-50 border border-green-200">
                    <Check className="h-3 w-3" /> Invite Sent
                  </span>
                ) : (
                  <button
                    onClick={() => sendInvite(member)}
                    disabled={invitingId === member.id}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-secondary/40 text-secondary hover:bg-secondary/10 transition-colors disabled:opacity-50"
                    title={`Send invite to ${member.email}`}
                  >
                    {invitingId === member.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Mail className="h-3 w-3" />
                    )}
                    Send Invite
                  </button>
                )
              )}
              <button
                onClick={() => startEdit(member)}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors"
                title="Edit"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => removeStaff(member.id)}
                className="shrink-0 p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ))}

      {adding ? (
        <div className="p-3 rounded-lg border border-secondary/40 bg-secondary/5 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input
              value={newName}
              onChange={e => { setNewName(e.target.value); setError(""); }}
              placeholder="Full name *"
              autoFocus
            />
            <Input
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              placeholder="Trade / Role (e.g. Plumber)"
            />
            <Input
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="Email address (optional)"
              type="email"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <Button onClick={addStaff} disabled={savingNew}>
              {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {savingNew ? "Saving…" : "Add Staff Member"}
            </Button>
            <Button variant="outline" onClick={() => { setAdding(false); setError(""); setNewName(""); setNewRole(""); setNewEmail(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => { setAdding(true); setError(""); }}>
          <Plus className="h-4 w-4" />
          Add Staff Member
        </Button>
      )}

      {error && !adding && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function OrganisationTab({ isOnboarding = false, onOnboardingComplete }: { isOnboarding?: boolean; onOnboardingComplete?: () => void } = {}) {
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(ORG_DEFAULTS);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch("/api/auth/organisation")
      .then(data => {
        setForm({
          name:            data.name            ?? ORG_DEFAULTS.name,
          abn:             data.abn             ?? ORG_DEFAULTS.abn,
          acn:             data.acn             ?? ORG_DEFAULTS.acn,
          phone:           data.phone           ?? ORG_DEFAULTS.phone,
          email:           data.email           ?? ORG_DEFAULTS.email,
          address:         data.address         ?? ORG_DEFAULTS.address,
          suburb:          data.suburb          ?? ORG_DEFAULTS.suburb,
          state:           data.state           ?? ORG_DEFAULTS.state,
          postcode:        data.postcode        ?? ORG_DEFAULTS.postcode,
          website:         data.website         ?? ORG_DEFAULTS.website,
          accredBody:      data.accredBody      ?? ORG_DEFAULTS.accredBody,
          accredNum:       data.accredNum       ?? ORG_DEFAULTS.accredNum,
          accredExpiry:    data.accredExpiry    ?? ORG_DEFAULTS.accredExpiry,
          plInsurer:       data.plInsurer       ?? ORG_DEFAULTS.plInsurer,
          plPolicyNumber:  data.plPolicyNumber  ?? ORG_DEFAULTS.plPolicyNumber,
          plExpiry:        data.plExpiry        ?? ORG_DEFAULTS.plExpiry,
          piInsurer:       data.piInsurer       ?? ORG_DEFAULTS.piInsurer,
          piPolicyNumber:  data.piPolicyNumber  ?? ORG_DEFAULTS.piPolicyNumber,
          piExpiry:        data.piExpiry        ?? ORG_DEFAULTS.piExpiry,
          reportFooterText: data.reportFooterText ?? ORG_DEFAULTS.reportFooterText,
        });
        setLogoUrl(data.logoUrl ?? null);
        setIsAdmin(data.isCompanyAdmin ?? false);
        // Migrate any local data if DB is empty
        if (!data.name && !data.abn) {
          try {
            const stored = localStorage.getItem("inspectproof_org_details");
            if (stored) {
              const local = JSON.parse(stored);
              setForm(f => ({ ...f, ...local }));
            }
          } catch {}
        }
      })
      .catch(() => {
        try {
          const stored = localStorage.getItem("inspectproof_org_details");
          if (stored) setForm(f => ({ ...f, ...JSON.parse(stored) }));
        } catch {}
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f: typeof ORG_DEFAULTS) => ({ ...f, [k]: e.target.value }));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const { uploadURL, objectPath } = await apiFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      await apiFetch("/api/auth/organisation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: objectPath }),
      });
      setLogoUrl(objectPath);
    } catch {
      alert("Logo upload failed. Please try again.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    try {
      await apiFetch("/api/auth/organisation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      setLogoUrl(null);
    } catch {
      alert("Failed to remove logo. Please try again.");
    }
  };

  const save = async (skipToDashboard = false) => {
    if (skipToDashboard && onOnboardingComplete) {
      onOnboardingComplete();
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/auth/organisation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      localStorage.removeItem("inspectproof_org_details");
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        if (isOnboarding && onOnboardingComplete) onOnboardingComplete();
      }, 1200);
    } catch {
      alert("Failed to save organisation details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading organisation details…
    </div>
  );

  const readOnly = !isAdmin;

  return (
    <>
      {readOnly && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-2">
          <Lock className="h-4 w-4 shrink-0 text-amber-600" />
          <span>Organisation settings can only be edited by your company administrator.</span>
        </div>
      )}
      <SectionCard title="Company Logo" description="Your logo appears on generated compliance reports and defect notices">
        <div className="flex items-center gap-5">
          <div className="relative h-20 w-40 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              <img
                src={`${apiBase()}/api/storage${logoUrl}`}
                alt="Company logo"
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <div className="text-center">
                <Building2 className="h-6 w-6 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground mt-1">No logo</p>
              </div>
            )}
            {logoUploading && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-secondary" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
            />
            {!readOnly && (
              <Button
                variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="flex items-center gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                {logoUrl ? "Replace Logo" : "Upload Logo"}
              </Button>
            )}
            {!readOnly && logoUrl && (
              <Button
                variant="danger"
                onClick={removeLogo}
                disabled={logoUploading}
                className="flex items-center gap-2 text-xs"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP. Recommended: 400×120px.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Business Details" description="Details that appear on compliance reports and correspondence">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Organisation Name">
            <Input value={form.name} onChange={set("name")} disabled={readOnly} />
          </FormField>
          <FormField label="ABN" hint="Australian Business Number">
            <Input value={form.abn} onChange={set("abn")} placeholder="12 345 678 901" disabled={readOnly} />
          </FormField>
          <FormField label="ACN" hint="Australian Company Number (if registered as a company)">
            <Input value={form.acn} onChange={set("acn")} placeholder="123 456 789" disabled={readOnly} />
          </FormField>
          <FormField label="Business Phone">
            <Input value={form.phone} onChange={set("phone")} disabled={readOnly} />
          </FormField>
          <FormField label="Business Email">
            <Input value={form.email} onChange={set("email")} type="email" disabled={readOnly} />
          </FormField>
          <FormField label="Website">
            <Input value={form.website} onChange={set("website")} disabled={readOnly} />
          </FormField>
        </div>
        <div className="border-t border-border/50 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <FormField label="Street Address">
              <Input value={form.address} onChange={set("address")} disabled={readOnly} />
            </FormField>
          </div>
          <FormField label="Suburb">
            <Input value={form.suburb} onChange={set("suburb")} disabled={readOnly} />
          </FormField>
          <FormField label="State">
            <Select value={form.state} onChange={set("state") as any} disabled={readOnly}>
              {["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Postcode">
            <Input value={form.postcode} onChange={set("postcode")} maxLength={4} disabled={readOnly} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Accreditation" description="Professional accreditation details printed on reports">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Accreditation Body">
            <Select value={form.accredBody} onChange={set("accredBody") as any} disabled={readOnly}>
              <optgroup label="State &amp; Territory Regulatory Bodies">
                <option value="BPB">NSW Building Professionals Board (BPB)</option>
                <option value="QBCC">Queensland Building and Construction Commission (QBCC)</option>
                <option value="VBA">Victorian Building Authority (VBA)</option>
                <option value="CBS">Consumer and Business Services SA (CBS)</option>
                <option value="SAAA">South Australian Accreditation Authority</option>
                <option value="BC_WA">Building Commission (WA)</option>
                <option value="BSB_WA">Building Services Board (WA)</option>
                <option value="CBOS_TAS">Consumer Building and Occupations Services (Tas)</option>
                <option value="NTBPB">NT Building Practitioners Board (NT)</option>
                <option value="ACTPLA">ACT Planning and Land Authority (ACT)</option>
              </optgroup>
              <optgroup label="Professional Associations">
                <option value="AIBS">Australian Institute of Building Surveyors (AIBS)</option>
                <option value="AIB">Australian Institute of Building</option>
                <option value="EA">Engineers Australia</option>
                <option value="RICS">Royal Institute of Chartered Surveyors</option>
                <option value="APE">The Association of Professional Engineers</option>
              </optgroup>
              <option value="Other">Other</option>
            </Select>
          </FormField>
          <FormField label="Accreditation Number">
            <Input value={form.accredNum} onChange={set("accredNum")} placeholder="e.g. BPB0001234" disabled={readOnly} />
          </FormField>
          <FormField label="Accreditation Expiry Date">
            <Input value={form.accredExpiry} onChange={set("accredExpiry")} type="date" disabled={readOnly} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Insurance" description="Insurance details for compliance reporting. Stored securely, not shared externally.">
        <div className="space-y-4">
          <p className="text-xs font-semibold text-sidebar uppercase tracking-wide">Public Liability Insurance</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Insurer Name">
              <Input value={form.plInsurer} onChange={set("plInsurer")} placeholder="e.g. QBE Insurance" disabled={readOnly} />
            </FormField>
            <FormField label="Policy Number">
              <Input value={form.plPolicyNumber} onChange={set("plPolicyNumber")} placeholder="e.g. PLI-12345678" disabled={readOnly} />
            </FormField>
            <FormField label="Expiry Date">
              <Input value={form.plExpiry} onChange={set("plExpiry")} type="date" disabled={readOnly} />
            </FormField>
          </div>
          <div className="border-t border-border/50 pt-4">
            <p className="text-xs font-semibold text-sidebar uppercase tracking-wide mb-3">Professional Indemnity Insurance</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Insurer Name">
                <Input value={form.piInsurer} onChange={set("piInsurer")} placeholder="e.g. Aon Risk Solutions" disabled={readOnly} />
              </FormField>
              <FormField label="Policy Number">
                <Input value={form.piPolicyNumber} onChange={set("piPolicyNumber")} placeholder="e.g. PII-87654321" disabled={readOnly} />
              </FormField>
              <FormField label="Expiry Date">
                <Input value={form.piExpiry} onChange={set("piExpiry")} type="date" disabled={readOnly} />
              </FormField>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Report Branding" description="Custom text and branding options applied to generated PDF reports">
        <FormField
          label="Custom Footer Text"
          hint="This text appears at the bottom of every generated PDF report — use it for disclaimers, terms, or contact info."
        >
          <textarea
            value={form.reportFooterText}
            onChange={e => setForm((f: typeof ORG_DEFAULTS) => ({ ...f, reportFooterText: e.target.value }))}
            placeholder="e.g. This report is prepared for the exclusive use of the commissioning client. All findings are based on conditions observed at the time of inspection."
            rows={3}
            disabled={readOnly}
            className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </FormField>
      </SectionCard>

      <SectionCard
        title="Internal Staff"
        description="Your organisation's employees who can be assigned as responsible parties on defects. They appear alongside contractors in the trade allocation picker."
      >
        <InternalStaffSection />
      </SectionCard>

      <SectionCard
        title="Contractor Library"
        description="Manage your organisation's shared contractor pool. Contractors added here are automatically available across every project."
      >
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
              <BookUser className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sidebar">Open Contractor Library</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add, edit, and manage your shared contractor pool.</p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/settings/contractor-library")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sidebar text-white text-sm font-semibold hover:bg-sidebar/90 transition-colors shrink-0"
          >
            Open <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </SectionCard>

      {!readOnly && (
        <div className="flex justify-end">
          <div className="flex items-center gap-3">
            {isOnboarding && (
              <button
                onClick={() => save(true)}
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-sidebar transition-colors"
              >
                Skip for now →
              </button>
            )}
            <SaveBanner show={saved} />
            <Button onClick={() => save()} disabled={saving} className="flex items-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : isOnboarding ? "Save & Start Inspecting →" : "Save Organisation"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Platform Tab ──────────────────────────────────────────────────────────────

const PLATFORM_DEFAULTS = {
  defaultView:        "grid",
  autoCompleteInspec: true,
  requirePhotoFail:   false,
  requireNotesFail:   true,
  showNAItems:        true,
  retentionYears:     "7",
  timezone:           "Australia/Sydney",
  dateFormat:         "DD/MM/YYYY",
};

function PlatformTab() {
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem("inspectproof_platform_prefs");
      return stored ? { ...PLATFORM_DEFAULTS, ...JSON.parse(stored) } : PLATFORM_DEFAULTS;
    } catch {
      return PLATFORM_DEFAULTS;
    }
  });

  const toggle = (k: keyof typeof prefs) => setPrefs((p: typeof prefs) => ({ ...p, [k]: !p[k] }));
  const set = (k: keyof typeof prefs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPrefs((p: typeof prefs) => ({ ...p, [k]: e.target.value }));

  const save = () => {
    localStorage.setItem("inspectproof_platform_prefs", JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <SectionCard title="Display Preferences" description="Control how information is presented across the platform">
        <div className="divide-y divide-border/50">
          <div className="py-1">
            <SettingRow label="Show N/A Items in Reports" description="Include N/A checklist items in the printed compliance report.">
              <Toggle checked={prefs.showNAItems as any} onChange={() => toggle("showNAItems")} />
            </SettingRow>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <FormField label="Timezone">
            <Select value={prefs.timezone} onChange={set("timezone")}>
              <option value="Australia/Sydney">Sydney / Melbourne (AEDT)</option>
              <option value="Australia/Brisbane">Brisbane (AEST)</option>
              <option value="Australia/Perth">Perth (AWST)</option>
              <option value="Australia/Adelaide">Adelaide (ACDT)</option>
              <option value="Australia/Darwin">Darwin (ACST)</option>
              <option value="Australia/Hobart">Hobart (AEDT)</option>
            </Select>
          </FormField>
          <FormField label="Date Format">
            <Select value={prefs.dateFormat} onChange={set("dateFormat")}>
              <option value="DD/MM/YYYY">DD/MM/YYYY (Australian standard)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
            </Select>
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Inspection Behaviour" description="Rules that govern how field inspections are conducted and completed">
        <div className="divide-y divide-border/50">
          <div className="py-1">
            <SettingRow label="Auto-complete Inspections" description="Automatically mark an inspection as complete when all checklist items are answered.">
              <Toggle checked={prefs.autoCompleteInspec as any} onChange={() => toggle("autoCompleteInspec")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Require Photo on Fail" description="Inspectors must attach at least one photo when marking an item as failed.">
              <Toggle checked={prefs.requirePhotoFail as any} onChange={() => toggle("requirePhotoFail")} />
            </SettingRow>
          </div>
          <div className="py-1">
            <SettingRow label="Require Notes on Fail" description="Inspectors must add a note when marking an item as failed.">
              <Toggle checked={prefs.requireNotesFail as any} onChange={() => toggle("requireNotesFail")} />
            </SettingRow>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Data & Compliance" description="Data retention and export settings in accordance with Australian record-keeping requirements">
        <SettingRow label="Record Retention Period" description="How long inspection records are kept before being eligible for archiving.">
          <Select value={prefs.retentionYears} onChange={set("retentionYears")} className="w-40">
            <option value="5">5 years</option>
            <option value="7">7 years</option>
            <option value="10">10 years</option>
            <option value="indefinite">Indefinitely</option>
          </Select>
        </SettingRow>

        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-sidebar flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                Export All Data
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Download a full archive of your inspection records, reports, and documents.</p>
            </div>
            <Button variant="outline" disabled className="opacity-60 cursor-not-allowed">
              Coming soon
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
          <Shield className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            InspectProof complies with the <strong>Privacy Act 1988</strong> and Australian data sovereignty requirements. All records are stored on Australian servers.
          </p>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <div className="flex items-center gap-3">
          <SaveBanner show={saved} />
          <Button onClick={save}>Save Platform Settings</Button>
        </div>
      </div>
    </>
  );
}

// ── Billing Tab ────────────────────────────────────────────────────────────────

function BillingTab() {
  const [, setLocation] = useLocation();

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("inspectproof_token") ?? ""}`,
    "Content-Type": "application/json",
  });

  const { data: subData, isLoading } = useQuery({
    queryKey: ["settings-billing-subscription"],
    queryFn: async () => {
      const r = await fetch(`${apiBase()}/api/billing/subscription`, { headers: authHeader() });
      return r.json();
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase()}/api/billing/portal`, { method: "POST", headers: authHeader() });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const plan = subData?.plan ?? "free_trial";
  const limits = subData?.limits ?? {};
  const usage = subData?.usage ?? { projects: 0, inspections: 0 };
  const sub = subData?.subscription;

  const PLAN_LABELS: Record<string, string> = {
    free_trial: "Free Trial",
    starter: "Starter",
    professional: "Professional",
    enterprise: "Enterprise",
  };

  const PLAN_COLORS: Record<string, string> = {
    free_trial: "text-gray-500 bg-gray-100 border-gray-200",
    starter: "text-[#466DB5] bg-blue-50 border-blue-200",
    professional: "text-[#7a5c00] bg-yellow-50 border-yellow-200",
    enterprise: "text-[#0B1933] bg-slate-100 border-slate-200",
  };

  return (
    <>
      <SectionCard title="Current Subscription" description="Your active plan and usage this billing period">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Plan</p>
                <span className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border",
                  PLAN_COLORS[plan] ?? PLAN_COLORS.free_trial
                )}>
                  {PLAN_LABELS[plan] ?? plan}
                </span>
                {sub && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {sub.cancelAtPeriodEnd
                      ? "Cancels at end of billing period"
                      : `Renews ${new Date(sub.currentPeriodEnd * 1000).toLocaleDateString("en-AU")}`}
                  </p>
                )}
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-sidebar">{usage.projects}</p>
                  <p className="text-xs text-muted-foreground">
                    {limits.maxProjects ? `of ${limits.maxProjects} projects` : "projects (unlimited)"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-sidebar">{usage.inspections}</p>
                  <p className="text-xs text-muted-foreground">
                    {limits.maxInspectionsMonthly
                      ? `of ${limits.maxInspectionsMonthly} this month`
                      : limits.maxInspectionsTotal
                      ? `of ${limits.maxInspectionsTotal} total`
                      : "inspections (unlimited)"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1 border-t border-border/50">
              {subData?.stripeCustomerId && (
                <button
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-border text-sidebar hover:bg-muted/30 transition disabled:opacity-50"
                >
                  {portalMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <CreditCard className="h-4 w-4" />}
                  Manage payment & invoices
                </button>
              )}
              <button
                onClick={() => setLocation("/billing")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 transition"
              >
                <Zap className="h-4 w-4" />
                View all plans
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Payment Method" description="Credit card and payment details on file">
        {subData?.stripeCustomerId ? (
          <SettingRow
            label="Manage payment details"
            description="Update your credit card, billing address, or download invoices via the Stripe billing portal."
          >
            <button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border border-border text-sidebar hover:bg-muted/30 transition disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              Open billing portal
            </button>
          </SettingRow>
        ) : (
          <div className="py-2 text-sm text-muted-foreground">
            No payment method on file. <button onClick={() => setLocation("/billing")} className="text-[#466DB5] underline font-medium">Upgrade your plan</button> to add one.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Upgrade Your Plan" description="Unlock more projects, inspections, and team members">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Starter", price: "$59/mo", features: ["10 projects", "50 inspections/month", "3 team members"], color: "border-[#466DB5]", textColor: "text-[#466DB5]" },
            { label: "Professional", price: "$149/mo", features: ["Unlimited projects", "Unlimited inspections", "10 team members"], color: "border-[#C5D92D]", textColor: "text-[#7a5c00]" },
          ].map(p => (
            <div key={p.label} className={cn("rounded-xl border-2 p-4 space-y-2", p.color)}>
              <div className="flex items-center justify-between">
                <p className={cn("font-bold text-sm", p.textColor)}>{p.label}</p>
                <p className="text-sm font-semibold text-sidebar">{p.price}</p>
              </div>
              <ul className="space-y-1">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#C5D92D] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-2">
          <button
            onClick={() => setLocation("/billing")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 transition"
          >
            See all plans & pricing <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </SectionCard>
    </>
  );
}
