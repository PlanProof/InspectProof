import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import {
  User, Lock, Bell, Building2, Palette, Loader2,
  CheckCircle2, ChevronRight, Shield, Database, Download,
  ToggleLeft,
} from "lucide-react";
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

type Tab = "profile" | "security" | "notifications" | "organisation" | "platform";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile",       label: "Profile",        icon: User },
  { id: "security",      label: "Security",       icon: Lock },
  { id: "notifications", label: "Notifications",  icon: Bell },
  { id: "organisation",  label: "Organisation",   icon: Building2 },
  { id: "platform",      label: "Platform",       icon: Palette },
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
  label: string;
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
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    apiFetch("/api/auth/me").then(setUser).catch(() => {}).finally(() => setLoadingUser(false));
  }, [token]);

  return (
    <AppLayout>
      <div className="mb-6">
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
          {activeTab === "profile"       && <ProfileTab user={user} loading={loadingUser} />}
          {activeTab === "security"      && <SecurityTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "organisation"  && <OrganisationTab />}
          {activeTab === "platform"      && <PlatformTab />}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, loading }: { user: any; loading: boolean }) {
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setPhone(user.phone ?? "");
      setLicenceNumber(user.licenceNumber ?? "");
      setTitle(user.title ?? "");
    }
  }, [user]);

  const initials = name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "U";

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
          <FormField label="Professional Title">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Principal Certifier" />
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
    </>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = () => {
    setError("");
    if (next.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }
    setSaved(true);
    setCurrent(""); setNext(""); setConfirm("");
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <SectionCard title="Change Password" description="Use a strong password with a mix of letters, numbers, and symbols">
        <div className="max-w-md space-y-4">
          <FormField label="Current Password">
            <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="••••••••" />
          </FormField>
          <FormField label="New Password">
            <Input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="••••••••" />
          </FormField>
          <FormField label="Confirm New Password">
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" />
          </FormField>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <SaveBanner show={saved} />
            <Button onClick={save}>Update Password</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Active Sessions" description="Devices currently signed in to your account">
        <div className="space-y-2">
          {[
            { device: "Chrome on macOS", location: "Sydney, NSW", time: "Active now", current: true },
            { device: "InspectProof Mobile App", location: "Sydney, NSW", time: "2 hours ago", current: false },
          ].map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
              <div>
                <p className="text-sm font-medium text-sidebar">{s.device}</p>
                <p className="text-xs text-muted-foreground">{s.location} · {s.time}</p>
              </div>
              {s.current
                ? <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Current</span>
                : <Button variant="outline" className="text-xs py-1 px-2">Revoke</Button>
              }
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Two-Factor Authentication" description="Add an extra layer of security to your account">
        <SettingRow
          label="Authenticator App"
          description="Use an app like Google Authenticator or Authy to generate one-time codes."
        >
          <Button variant="outline">Set up 2FA</Button>
        </SettingRow>
      </SectionCard>
    </>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    emailSummary:      true,
    emailDefects:      true,
    emailAssignments:  false,
    pushCritical:      true,
    pushCompletions:   false,
    pushReminders:     true,
    reportReady:       true,
    weeklyDigest:      false,
  });
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof typeof prefs) => {
    setPrefs(p => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  };

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

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
          <Button onClick={save}>Save Preferences</Button>
        </div>
      </div>
    </>
  );
}

// ── Organisation Tab ──────────────────────────────────────────────────────────

function OrganisationTab() {
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name:       "InspectProof Certification Services",
    abn:        "12 345 678 901",
    phone:      "+61 2 9000 0000",
    email:      "admin@inspectproof.com.au",
    address:    "Level 5, 123 Pacific Highway",
    suburb:     "North Sydney",
    state:      "NSW",
    postcode:   "2060",
    website:    "www.inspectproof.com.au",
    accredBody: "BPB",
    accredNum:  "BPB0001234",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <SectionCard title="Organisation Details" description="Details that appear on compliance reports and correspondence">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Organisation Name">
            <Input value={form.name} onChange={set("name")} />
          </FormField>
          <FormField label="ABN" hint="Australian Business Number">
            <Input value={form.abn} onChange={set("abn")} placeholder="12 345 678 901" />
          </FormField>
          <FormField label="Business Phone">
            <Input value={form.phone} onChange={set("phone")} />
          </FormField>
          <FormField label="Business Email">
            <Input value={form.email} onChange={set("email")} type="email" />
          </FormField>
          <FormField label="Website">
            <Input value={form.website} onChange={set("website")} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Business Address" description="Address printed on compliance certificates and defect notices">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <FormField label="Street Address">
              <Input value={form.address} onChange={set("address")} />
            </FormField>
          </div>
          <FormField label="Suburb">
            <Input value={form.suburb} onChange={set("suburb")} />
          </FormField>
          <FormField label="State">
            <Select value={form.state} onChange={set("state") as any}>
              {["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Postcode">
            <Input value={form.postcode} onChange={set("postcode")} maxLength={4} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Accreditation" description="Professional accreditation details printed on reports">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Accreditation Body">
            <Select value={form.accredBody} onChange={set("accredBody") as any}>
              <option value="BPB">NSW Building Professionals Board (BPB)</option>
              <option value="QBCC">Queensland Building and Construction Commission (QBCC)</option>
              <option value="VBA">Victorian Building Authority (VBA)</option>
              <option value="CBOS">Consumer and Business Services SA (CBS)</option>
              <option value="Other">Other</option>
            </Select>
          </FormField>
          <FormField label="Accreditation Number">
            <Input value={form.accredNum} onChange={set("accredNum")} placeholder="e.g. BPB0001234" />
          </FormField>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <div className="flex items-center gap-3">
          <SaveBanner show={saved} />
          <Button onClick={save}>Save Organisation</Button>
        </div>
      </div>
    </>
  );
}

// ── Platform Tab ──────────────────────────────────────────────────────────────

function PlatformTab() {
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState({
    defaultView:        "grid",
    autoCompleteInspec: true,
    requirePhotoFail:   false,
    requireNotesFail:   true,
    showNAItems:        true,
    retentionYears:     "7",
    timezone:           "Australia/Sydney",
    dateFormat:         "DD/MM/YYYY",
  });

  const toggle = (k: keyof typeof prefs) => setPrefs(p => ({ ...p, [k]: !p[k] }));
  const set = (k: keyof typeof prefs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPrefs(p => ({ ...p, [k]: e.target.value }));

  const save = () => {
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
            <Button variant="outline">Request Export</Button>
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
