import { useState, useMemo, useCallback } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, Button } from "@/components/ui";
import {
  Users, Smartphone, Monitor, Mail, Phone,
  UserPlus, Send, Pencil, X, Check, Loader2, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("inspectproof_token") ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ── Inspector type ─────────────────────────────────────────────────────────────
type Inspector = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  appAccess: string;
  platformAccess: boolean;
  lastActive: string;
  inspectionsCompleted: number;
  initials: string;
  color: string;
};

const AVATAR_COLORS = [
  "bg-teal-500", "bg-blue-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-400", "bg-emerald-500", "bg-sky-500", "bg-orange-500",
];

const ROLE_MAP: Record<string, string> = {
  admin:             "Administrator",
  certifier:         "Building Certifier",
  inspector:         "Site Inspector",
  building_inspector:"Building Inspector",
  engineer:          "Structural Engineer",
  plumber:           "Plumbing Inspector",
  project_manager:   "Project Manager",
  builder:           "Builder",
  supervisor:        "Site Supervisor",
  whs:               "WHS Officer",
  pre_purchase:      "Pre-Purchase Inspector",
  fire_engineer:     "Fire Safety Engineer",
  staff:             "Staff",
};

function apiUserToInspector(u: any): Inspector {
  const initials = `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase();
  const color = AVATAR_COLORS[u.id % AVATAR_COLORS.length];
  return {
    id: u.id,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    email: u.email ?? "",
    phone: u.phone ?? "",
    role: ROLE_MAP[u.role] ?? u.role,
    status: u.isActive ? "active" : "invited",
    appAccess: "app_only",
    platformAccess: u.isActive ?? true,
    lastActive: "—",
    inspectionsCompleted: 0,
    initials,
    color,
  };
}

const ROLES = ["Inspector", "Certifier", "Staff"];

const ROLE_REVERSE: Record<string, string> = {
  Inspector: "inspector",
  Certifier: "certifier",
  Staff: "staff",
};

const ROLE_BADGE: Record<string, string> = {
  Inspector: "bg-blue-50 text-blue-700 border-blue-200",
  Certifier: "bg-violet-50 text-violet-700 border-violet-200",
  Staff: "bg-muted text-muted-foreground border-muted/60",
  Admin: "bg-sidebar/10 text-sidebar border-sidebar/20",
};

// ── Edit Inspector Modal ──────────────────────────────────────────────────────

function EditInspectorModal({
  inspector,
  onSave,
  onClose,
}: {
  inspector: Inspector;
  onSave: (updated: Inspector) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    firstName: inspector.firstName,
    lastName:  inspector.lastName,
    email:     inspector.email,
    phone:     inspector.phone,
    role:      inspector.role,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const dbRole = ROLE_REVERSE[form.role] ?? form.role.toLowerCase();
      const res = await fetch(`${base}/api/users/${inspector.id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          role: dbRole,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        setError(body?.message ?? "Failed to save changes");
        return;
      }
      const initials = (form.firstName[0] ?? "") + (form.lastName[0] ?? "");
      onSave({ ...inspector, ...form, initials: initials.toUpperCase() });
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-sidebar text-base">Edit Inspector</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {inspector.firstName} {inspector.lastName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-sidebar transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">First Name</label>
              <input
                value={form.firstName}
                onChange={set("firstName")}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                placeholder="First name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Last Name</label>
              <input
                value={form.lastName}
                onChange={set("lastName")}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set("phone")}
              className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
              placeholder="04xx xxx xxx"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Role</label>
            <select
              value={form.role}
              onChange={set("role")}
              className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl space-y-3">
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <X className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inspector Row ─────────────────────────────────────────────────────────────

function InspectorRow({
  inspector,
  onTogglePlatform,
  onSendInvite,
  onEdit,
  isInviting,
  justSent,
}: {
  inspector: Inspector;
  onTogglePlatform: (id: number) => void;
  onSendInvite: (id: number) => void;
  onEdit: (inspector: Inspector) => void;
  isInviting?: boolean;
  justSent?: boolean;
}) {
  const roleBadge = ROLE_BADGE[inspector.role] ?? ROLE_BADGE.Staff;
  const isInvited = inspector.status === "invited";

  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors group">
      {/* Avatar */}
      <div className={`h-10 w-10 rounded-full ${inspector.color} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
        {inspector.initials}
      </div>

      {/* Name / email */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sidebar text-sm">
            {inspector.firstName} {inspector.lastName}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleBadge}`}>
            {inspector.role}
          </span>
          {isInvited && (
            <span className="text-[10px] text-amber-600 italic">(pending)</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" />{inspector.email}
          </span>
          {inspector.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />{inspector.phone}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="hidden md:flex flex-col items-center min-w-[70px]">
        <span className="text-sm font-bold text-sidebar">{inspector.inspectionsCompleted}</span>
        <span className="text-[10px] text-muted-foreground text-center">Inspections</span>
      </div>

      {/* Last active */}
      <div className="hidden lg:flex flex-col items-center min-w-[90px]">
        <span className="text-xs text-muted-foreground text-center leading-snug">{inspector.lastActive}</span>
        <span className="text-[10px] text-muted-foreground/60">Last active</span>
      </div>

      {/* APP Access */}
      <div className="flex flex-col items-center min-w-[110px] gap-1">
        {justSent ? (
          <span className="flex items-center gap-1 text-[10px] text-green-700 font-semibold">
            <Check className="h-2.5 w-2.5" /> Sent ✓
          </span>
        ) : isInviting ? (
          <span className="flex items-center gap-1 text-[10px] text-secondary font-medium">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending…
          </span>
        ) : (inspector.appAccess === "app_only" || inspector.appAccess === "none") ? (
          <button
            onClick={() => onSendInvite(inspector.id)}
            className="flex items-center gap-1 text-[10px] text-secondary hover:underline font-medium"
          >
            <Send className="h-2.5 w-2.5" /> Send APP Invite
          </button>
        ) : inspector.appAccess === "invited" ? (
          <button
            onClick={() => onSendInvite(inspector.id)}
            className="flex items-center gap-1 text-[10px] text-amber-600 hover:underline font-medium"
          >
            <Send className="h-2.5 w-2.5" /> Resend Invite
          </button>
        ) : null}
      </div>

      {/* Platform Access */}
      <div className="flex flex-col items-center min-w-[100px] gap-1">
        <div className="flex items-center gap-2">
          <button
            role="checkbox"
            aria-checked={inspector.platformAccess}
            onClick={() => onTogglePlatform(inspector.id)}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-secondary/40",
              inspector.platformAccess
                ? "bg-secondary border-secondary"
                : "bg-muted border-muted-foreground/30"
            )}
          >
            <span className={cn(
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
              inspector.platformAccess ? "translate-x-4" : "translate-x-0.5"
            )} />
          </button>
          <span className="text-xs font-medium text-muted-foreground">Platform</span>
        </div>
        <div className="flex items-center gap-1">
          <Monitor className={cn("h-2.5 w-2.5", inspector.platformAccess ? "text-secondary" : "text-muted-foreground/40")} />
          <span className={cn("text-[10px]", inspector.platformAccess ? "text-secondary font-semibold" : "text-muted-foreground/50")}>
            {inspector.platformAccess ? "Access granted" : "No access"}
          </span>
        </div>
      </div>

      {/* Edit button — visible on hover */}
      <button
        onClick={() => onEdit(inspector)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-secondary/10 text-muted-foreground hover:text-secondary shrink-0"
        title="Edit inspector"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

// ── Inspectors Page ───────────────────────────────────────────────────────────

const ADD_MEMBER_ROLES = ["Inspector", "Certifier", "Staff", "Admin"];

export default function Inspectors() {
  const { data: rawUsers, isLoading, refetch } = useListUsers({});
  const [overrides, setOverrides] = useState<Record<number, Partial<Inspector>>>({});
  const [inviteSentFor, setInviteSentFor] = useState<number | null>(null);
  const [invitingId, setInvitingId] = useState<number | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [formSending, setFormSending] = useState(false);
  const [formResult, setFormResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editingInspector, setEditingInspector] = useState<Inspector | null>(null);

  // Add Team Member modal state
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "Inspector" });
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [addMemberResult, setAddMemberResult] = useState<{ ok: boolean; msg: string; tempPassword?: string } | null>(null);

  const inspectors: Inspector[] = useMemo(() => {
    if (!rawUsers) return [];
    return (rawUsers as any[]).map(u => ({ ...apiUserToInspector(u), ...(overrides[u.id] ?? {}) }));
  }, [rawUsers, overrides]);

  const togglePlatform = useCallback(async (id: number) => {
    const current = inspectors.find(i => i.id === id)?.platformAccess ?? false;
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], platformAccess: !current } }));
    try {
      await fetch(`${apiBase()}/api/users/${id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ isActive: !current }),
      });
    } catch {
      setOverrides(prev => ({ ...prev, [id]: { ...prev[id], platformAccess: current } }));
    }
  }, [inspectors]);

  const sendInvite = useCallback(async (id: number) => {
    const inspector = inspectors.find(i => i.id === id);
    if (!inspector) return;
    setInvitingId(id);
    setInviteError(null);
    try {
      const res = await fetch(`${apiBase()}/api/invites/app-invite`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ email: inspector.email, userId: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        const msg = body?.message || "Failed to send invite";
        setInviteError(msg);
        setTimeout(() => setInviteError(null), 5000);
        return;
      }
      setInviteSentFor(id);
      setOverrides(prev => ({ ...prev, [id]: { ...prev[id], appAccess: "invited", status: "invited" } }));
      setTimeout(() => setInviteSentFor(null), 4000);
    } catch {
      setInviteError("Network error — please try again");
      setTimeout(() => setInviteError(null), 5000);
    } finally {
      setInvitingId(null);
    }
  }, [inspectors]);

  const sendFormInvite = useCallback(async () => {
    if (!newEmail.trim()) return;
    setFormSending(true);
    setFormResult(null);
    try {
      const res = await fetch(`${apiBase()}/api/invites/app-invite`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const body = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        setFormResult({ ok: false, msg: body?.message || "Failed to send invite" });
      } else {
        setFormResult({ ok: true, msg: `Invite sent to ${newEmail.trim()}` });
        setNewEmail("");
        setTimeout(() => { setShowInviteForm(false); setFormResult(null); }, 3000);
      }
    } catch {
      setFormResult({ ok: false, msg: "Network error — please try again" });
    } finally {
      setFormSending(false);
    }
  }, [newEmail]);

  const saveInspector = (updated: Inspector) => {
    setOverrides(prev => ({ ...prev, [updated.id]: updated }));
  };

  const addMember = useCallback(async () => {
    if (!addMemberForm.firstName || !addMemberForm.lastName || !addMemberForm.email) return;
    setAddMemberSaving(true);
    setAddMemberResult(null);
    try {
      const currentUser = JSON.parse(localStorage.getItem("inspectproof_user") ?? "{}");
      const inviterName = currentUser.firstName && currentUser.lastName
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : "Your administrator";
      const dbRole = ROLE_REVERSE[addMemberForm.role] ?? addMemberForm.role.toLowerCase();
      const res = await fetch(`${apiBase()}/api/users`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          firstName: addMemberForm.firstName,
          lastName: addMemberForm.lastName,
          email: addMemberForm.email,
          phone: addMemberForm.phone || undefined,
          role: dbRole,
          sendWelcomeEmail: true,
          inviterName,
        }),
      });
      const body = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        setAddMemberResult({ ok: false, msg: body?.message || "Failed to create account" });
        return;
      }
      setAddMemberResult({
        ok: true,
        msg: `Account created for ${addMemberForm.firstName} ${addMemberForm.lastName}`,
        tempPassword: body.temporaryPassword,
      });
      setAddMemberForm({ firstName: "", lastName: "", email: "", phone: "", role: "Inspector" });
      refetch();
    } catch {
      setAddMemberResult({ ok: false, msg: "Network error — please try again" });
    } finally {
      setAddMemberSaving(false);
    }
  }, [addMemberForm, refetch]);

  const activeCount = inspectors.filter(i => i.status === "active").length;
  const appCount = inspectors.filter(i => i.appAccess === "app_only" || i.appAccess === "full").length;

  return (
    <AppLayout>
      {/* Add Team Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!addMemberSaving) { setShowAddMember(false); setAddMemberResult(null); } }}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="font-bold text-sidebar text-base">Add Team Member</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Create an account and send login credentials</p>
              </div>
              <button
                onClick={() => { if (!addMemberSaving) { setShowAddMember(false); setAddMemberResult(null); } }}
                className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-sidebar transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {addMemberResult?.ok ? (
              <div className="px-6 py-6 space-y-4">
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <Check className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">{addMemberResult.msg}</p>
                    <p className="text-xs text-green-700 mt-1">A welcome email with login instructions has been sent.</p>
                  </div>
                </div>
                {addMemberResult.tempPassword && (
                  <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-sidebar uppercase tracking-wide">Temporary Password</p>
                    <p className="font-mono text-sm bg-white border border-border rounded-lg px-3 py-2 select-all text-sidebar">
                      {addMemberResult.tempPassword}
                    </p>
                    <p className="text-xs text-muted-foreground">Share this with the team member so they can log in and change their password.</p>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => { setShowAddMember(false); setAddMemberResult(null); }}>Done</Button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">First Name <span className="text-red-500">*</span></label>
                    <input
                      value={addMemberForm.firstName}
                      onChange={e => setAddMemberForm(f => ({ ...f, firstName: e.target.value }))}
                      className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                      placeholder="First name"
                      disabled={addMemberSaving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Last Name <span className="text-red-500">*</span></label>
                    <input
                      value={addMemberForm.lastName}
                      onChange={e => setAddMemberForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                      placeholder="Last name"
                      disabled={addMemberSaving}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Email Address <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={addMemberForm.email}
                    onChange={e => setAddMemberForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                    placeholder="inspector@example.com"
                    disabled={addMemberSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Phone <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
                  <input
                    type="tel"
                    value={addMemberForm.phone}
                    onChange={e => setAddMemberForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                    placeholder="04xx xxx xxx"
                    disabled={addMemberSaving}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Role</label>
                  <select
                    value={addMemberForm.role}
                    onChange={e => setAddMemberForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                    disabled={addMemberSaving}
                  >
                    {ADD_MEMBER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  A temporary password will be auto-generated and emailed to the team member along with instructions to download the app.
                </p>
                {addMemberResult && !addMemberResult.ok && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <X className="h-3.5 w-3.5 shrink-0" />
                    {addMemberResult.msg}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => { setShowAddMember(false); setAddMemberResult(null); }}
                    disabled={addMemberSaving}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addMember}
                    disabled={addMemberSaving || !addMemberForm.firstName || !addMemberForm.lastName || !addMemberForm.email}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {addMemberSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    {addMemberSaving ? "Creating…" : "Create Account & Send Email"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Inspectors</h1>
          <p className="text-muted-foreground mt-1">
            Manage your inspection team, app access, and platform permissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="gap-2"
          >
            <Send className="h-4 w-4" /> Send App Invite
          </Button>
          <Button
            onClick={() => { setShowAddMember(true); setAddMemberResult(null); }}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <UserPlus className="h-4 w-4" /> Add Team Member
          </Button>
        </div>
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <Card className="mb-6 border-secondary/30 bg-secondary/5 shadow-sm">
          <div className="p-5 flex items-center gap-3 flex-wrap">
            <Send className="h-4 w-4 text-secondary shrink-0" />
            <p className="text-sm font-semibold text-sidebar">Send APP Invitation</p>
            <input
              type="email"
              placeholder="inspector@email.com.au"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendFormInvite(); }}
              disabled={formSending}
              className="flex-1 min-w-48 text-sm border border-input rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-60"
            />
            <Button size="sm" onClick={sendFormInvite} disabled={formSending || !newEmail.trim()} className="gap-1.5">
              {formSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {formSending ? "Sending…" : "Send Invite"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowInviteForm(false); setFormResult(null); setNewEmail(""); }}>Cancel</Button>
          </div>
          {formResult && (
            <div className={`px-5 pb-4 text-sm font-medium flex items-center gap-2 ${formResult.ok ? "text-green-700" : "text-red-600"}`}>
              {formResult.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {formResult.msg}
            </div>
          )}
        </Card>
      )}

      {/* Global invite error banner */}
      {inviteError && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <X className="h-3.5 w-3.5 shrink-0" />
          {inviteError}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="shadow-sm border-muted/60">
          <div className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-sidebar">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar">{inspectors.length}</p>
              <p className="text-xs text-muted-foreground font-medium">Total Team</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm border-muted/60">
          <div className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-100 text-green-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar">{appCount}</p>
              <p className="text-xs text-muted-foreground font-medium">APP Active</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm border-muted/60">
          <div className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-secondary/10 text-secondary">
              <Monitor className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar">
                {inspectors.filter(i => i.platformAccess).length}
              </p>
              <p className="text-xs text-muted-foreground font-medium">Platform Access</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Toast for invite sent */}
      {inviteSentFor !== null && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-700 font-medium shadow-sm">
          <Send className="h-3.5 w-3.5" />
          APP invitation sent to {inspectors.find(i => i.id === inviteSentFor)?.firstName}!
        </div>
      )}

      {/* Inspector table */}
      <Card className="shadow-md border-muted/60 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-1 px-6 py-3 bg-muted/30 border-b border-muted/50">
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="flex-1">Inspector</span>
            <span className="hidden md:block w-[70px] text-center">Inspections</span>
            <span className="hidden lg:block w-[90px] text-center">Last Active</span>
            <span className="w-[110px] text-center">APP Access</span>
            <span className="w-[100px] text-center">Platform Access</span>
            <span className="w-8" />
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-muted/40">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          )}
          {!isLoading && inspectors.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">No team members found.</div>
          )}
          {inspectors.map(inspector => (
            <InspectorRow
              key={inspector.id}
              inspector={inspector}
              onTogglePlatform={togglePlatform}
              onSendInvite={sendInvite}
              onEdit={setEditingInspector}
              isInviting={invitingId === inspector.id}
              justSent={inviteSentFor === inspector.id}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-muted/50 bg-muted/10 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {activeCount} active · {inspectors.filter(i => i.status === "invited").length} pending · {inspectors.length} total
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Platform access allows editing templates and viewing all projects
          </p>
        </div>
      </Card>

      {/* Info card */}
      <Card className="mt-6 border-secondary/20 bg-secondary/5 shadow-sm">
        <div className="p-5 flex gap-4">
          <Smartphone className="h-8 w-8 text-secondary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sidebar text-sm mb-1">InspectProof Mobile App</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Inspectors with <strong>APP access</strong> can receive assigned inspections on their device, complete checklists in the field with photos, and sync results directly back to this platform in real time.
              <br /><br />
              Enabling <strong>Platform Access</strong> additionally allows them to log in to this web portal to view reports, edit templates, and manage project documents.
            </p>
          </div>
        </div>
      </Card>

      {/* Edit Modal */}
      {editingInspector && (
        <EditInspectorModal
          inspector={editingInspector}
          onSave={saveInspector}
          onClose={() => setEditingInspector(null)}
        />
      )}
    </AppLayout>
  );
}
