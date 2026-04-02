import { useState, useMemo, useCallback, useEffect } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, Button } from "@/components/ui";
import {
  Users, Smartphone, Monitor, Mail, Phone,
  UserPlus, Send, Pencil, X, Check, Loader2, Shield, Building2,
  Crown, Lock, Unlock, Clock, Trash2, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("inspectproof_token") ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

type Permissions = {
  editTemplates: boolean;
  addInspectors: boolean;
  createProjects: boolean;
};

type TeamMember = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  userType: string;
  isCompanyAdmin: boolean;
  permissions: Permissions;
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
  admin:              "Administrator",
  certifier:          "Building Certifier",
  inspector:          "Site Inspector",
  building_inspector: "Building Inspector",
  engineer:           "Structural Engineer",
  plumber:            "Plumbing Inspector",
  project_manager:    "Project Manager",
  builder:            "Builder",
  supervisor:         "Site Supervisor",
  whs:                "WHS Officer",
  pre_purchase:       "Pre-Purchase Inspector",
  fire_engineer:      "Fire Safety Engineer",
  staff:              "Staff",
};

function parseRoleDisplay(rawRole: string): string {
  return ROLE_MAP[rawRole] ?? rawRole;
}

function apiUserToMember(u: any): TeamMember {
  const initials = `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase();
  const color = AVATAR_COLORS[u.id % AVATAR_COLORS.length];
  const perms: Permissions = u.permissions ?? { editTemplates: false, addInspectors: false, createProjects: false };
  return {
    id: u.id,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    email: u.email ?? "",
    phone: u.phone ?? "",
    role: parseRoleDisplay(u.role),
    status: u.isActive ? "active" : "invited",
    userType: u.userType ?? "inspector",
    isCompanyAdmin: u.isCompanyAdmin ?? false,
    permissions: perms,
    platformAccess: u.isActive ?? true,
    lastActive: "—",
    inspectionsCompleted: 0,
    initials,
    color,
  };
}

const ROLES = ["Inspector", "Certifier", "Staff", "Admin"];
const ADD_MEMBER_ROLES = ["Inspector", "Certifier", "Staff", "Admin"];

const ROLE_REVERSE: Record<string, string> = {
  Inspector: "inspector",
  Certifier: "certifier",
  Staff: "staff",
  Admin: "admin",
};

const ROLE_BADGE: Record<string, string> = {
  Inspector:           "bg-blue-50 text-blue-700 border-blue-200",
  Certifier:           "bg-violet-50 text-violet-700 border-violet-200",
  Staff:               "bg-muted text-muted-foreground border-muted/60",
  Administrator:       "bg-sidebar/10 text-sidebar border-sidebar/20",
  "Site Inspector":    "bg-blue-50 text-blue-700 border-blue-200",
  "Building Certifier":"bg-violet-50 text-violet-700 border-violet-200",
  "Building Inspector":"bg-blue-50 text-blue-700 border-blue-200",
};

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

// ── userType helpers ──────────────────────────────────────────────────────────
// userType: "inspector" = mobile only | "user" = web only | "both" = both

function hasMobile(userType: string) { return userType === "inspector" || userType === "both"; }
function hasWeb(userType: string)    { return userType === "user"      || userType === "both"; }
function mergeAccess(mobile: boolean, web: boolean): string {
  if (mobile && web) return "both";
  if (mobile)        return "inspector";
  return "user";
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-secondary/40 disabled:opacity-40",
        on ? "bg-secondary border-secondary" : "bg-muted border-muted-foreground/30"
      )}
    >
      <span className={cn(
        "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
        on ? "translate-x-4" : "translate-x-0.5"
      )} />
    </button>
  );
}

// ── Edit Member Modal ─────────────────────────────────────────────────────────

function EditMemberModal({
  member,
  onSave,
  onClose,
}: {
  member: TeamMember;
  onSave: (updated: TeamMember) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    firstName: member.firstName,
    lastName:  member.lastName,
    phone:     member.phone,
    role:      member.role,
    userType:  member.userType,
    isCompanyAdmin: member.isCompanyAdmin,
    permissions: { ...member.permissions },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const togglePerm = (k: keyof Permissions) =>
    setForm(f => ({ ...f, permissions: { ...f.permissions, [k]: !f.permissions[k] } }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const dbRole = ROLE_REVERSE[form.role] ?? form.role.toLowerCase().replace(/ /g, "_");
      const res = await fetch(`${apiBase()}/api/users/${member.id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          role: dbRole,
          userType: form.userType,
          isCompanyAdmin: form.isCompanyAdmin,
          permissions: form.permissions,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        setError(body?.message ?? "Failed to save changes");
        return;
      }
      const updated = await res.json();
      const initials = (form.firstName[0] ?? "") + (form.lastName[0] ?? "");
      onSave({
        ...member,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        role: parseRoleDisplay(updated.role),
        userType: form.userType,
        isCompanyAdmin: form.isCompanyAdmin,
        permissions: form.permissions,
        initials: initials.toUpperCase(),
      });
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
        className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h2 className="font-bold text-sidebar text-base">Edit Team Member</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {member.firstName} {member.lastName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-sidebar transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">First Name</label>
              <input value={form.firstName} onChange={setField("firstName")}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Last Name</label>
              <input value={form.lastName} onChange={setField("lastName")}
                className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Phone Number</label>
            <input type="tel" value={form.phone} onChange={setField("phone")} placeholder="04xx xxx xxx"
              className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Role</label>
            <select value={form.role} onChange={setField("role")}
              className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* User type — multi-select: can have both */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Account Type <span className="text-[10px] font-normal normal-case text-muted-foreground">(select one or both)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "mobile", label: "Field Inspector", icon: Smartphone, desc: "Uses mobile app",    active: hasMobile(form.userType) },
                { key: "web",    label: "Office User",     icon: Monitor,    desc: "Uses web platform",  active: hasWeb(form.userType) },
              ] as const).map(({ key, label, icon: Icon, desc, active }) => (
                <button
                  key={key}
                  onClick={() => {
                    const curMobile = hasMobile(form.userType);
                    const curWeb    = hasWeb(form.userType);
                    const nextMobile = key === "mobile" ? !curMobile : curMobile;
                    const nextWeb    = key === "web"    ? !curWeb    : curWeb;
                    if (!nextMobile && !nextWeb) return; // keep at least one
                    setForm(f => ({ ...f, userType: mergeAccess(nextMobile, nextWeb) }));
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all relative",
                    active
                      ? "border-secondary bg-secondary/8 text-secondary"
                      : "border-muted/60 bg-background text-muted-foreground hover:border-secondary/40"
                  )}
                >
                  {active && <Check className="absolute top-1.5 right-1.5 h-3 w-3 text-secondary" />}
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Company admin toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-sidebar/5 rounded-xl">
            <div className="flex items-center gap-2.5">
              <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-sidebar">Company Admin</p>
                <p className="text-[11px] text-muted-foreground">Full access to all settings and team management</p>
              </div>
            </div>
            <Toggle on={form.isCompanyAdmin} onChange={() => setForm(f => ({
              ...f,
              isCompanyAdmin: !f.isCompanyAdmin,
              permissions: !f.isCompanyAdmin
                ? { editTemplates: true, addInspectors: true, createProjects: true }
                : f.permissions,
            }))} />
          </div>

          {/* Permissions */}
          {!form.isCompanyAdmin && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide flex items-center gap-1.5">
                <Shield className="h-3 w-3" /> Permissions
              </label>
              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                {([
                  { key: "editTemplates",  label: "Edit Inspection Templates", desc: "Create and modify inspection templates" },
                  { key: "addInspectors",  label: "Add Team Members",           desc: "Invite and manage team accounts" },
                  { key: "createProjects", label: "Create Projects",            desc: "Start new building projects" },
                ] as { key: keyof Permissions; label: string; desc: string }[]).map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/20">
                    <div>
                      <p className="text-sm font-medium text-sidebar">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <Toggle on={form.permissions[key]} onChange={() => togglePerm(key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <X className="h-3.5 w-3.5 shrink-0" />{error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted/30 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 transition-colors flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Member Row ────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  onTogglePlatform,
  onSendInvite,
  onEdit,
  isInviting,
  justSent,
}: {
  member: TeamMember;
  onTogglePlatform: (id: number) => void;
  onSendInvite: (id: number) => void;
  onEdit: (m: TeamMember) => void;
  isInviting?: boolean;
  justSent?: boolean;
}) {
  const rawRole = member.role;
  const roleBadge = ROLE_BADGE[rawRole] ?? "bg-muted text-muted-foreground border-muted/60";
  const isInvited = member.status === "invited";
  const memberHasMobile = hasMobile(member.userType);
  const memberHasWeb    = hasWeb(member.userType);

  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors group">
      {/* Avatar */}
      <div className={`relative h-10 w-10 rounded-full ${member.color} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
        {member.initials}
        {member.isCompanyAdmin && (
          <Crown className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-amber-400 bg-card rounded-full p-0.5 shadow" />
        )}
      </div>

      {/* Name / email */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sidebar text-sm">
            {member.firstName} {member.lastName}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleBadge}`}>
            {rawRole}
          </span>
          {member.isCompanyAdmin && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-0.5">
              <Crown className="h-2.5 w-2.5" /> Admin
            </span>
          )}
          {memberHasMobile && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-0.5">
              <Smartphone className="h-2.5 w-2.5" /> Inspector
            </span>
          )}
          {memberHasWeb && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-200 flex items-center gap-0.5">
              <Monitor className="h-2.5 w-2.5" /> Office User
            </span>
          )}
          {isInvited && (
            <span className="text-[10px] text-amber-600 italic">(pending)</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" />{member.email}
          </span>
          {member.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />{member.phone}
            </span>
          )}
        </div>
        {/* Permission pills */}
        {!member.isCompanyAdmin && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {(Object.entries(member.permissions) as [keyof Permissions, boolean][]).map(([key, enabled]) => {
              const labels: Record<keyof Permissions, string> = {
                editTemplates:  "Edit Templates",
                addInspectors:  "Add Members",
                createProjects: "Create Projects",
              };
              return (
                <span key={key} className={cn(
                  "text-[9px] px-1 py-0.5 rounded-full border flex items-center gap-0.5",
                  enabled
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-muted/50 text-muted-foreground/50 border-muted/30"
                )}>
                  {enabled ? <Unlock className="h-2 w-2" /> : <Lock className="h-2 w-2" />}
                  {labels[key]}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* APP Invite */}
      <div className="flex flex-col items-center min-w-[110px] gap-1">
        {justSent ? (
          <span className="flex items-center gap-1 text-[10px] text-green-700 font-semibold">
            <Check className="h-2.5 w-2.5" /> Sent ✓
          </span>
        ) : isInviting ? (
          <span className="flex items-center gap-1 text-[10px] text-secondary font-medium">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending…
          </span>
        ) : memberHasMobile ? (
          <button
            onClick={() => onSendInvite(member.id)}
            className="flex items-center gap-1 text-[10px] text-secondary hover:underline font-medium"
          >
            <Send className="h-2.5 w-2.5" />
            {member.status === "invited" ? "Resend App Invite" : "Send App Invite"}
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">Web only</span>
        )}
      </div>

      {/* Platform Access */}
      <div className="flex flex-col items-center min-w-[100px] gap-1">
        <div className="flex items-center gap-2">
          <Toggle on={member.platformAccess} onChange={() => onTogglePlatform(member.id)} />
          <span className="text-xs font-medium text-muted-foreground">Platform</span>
        </div>
        <div className="flex items-center gap-1">
          <Monitor className={cn("h-2.5 w-2.5", member.platformAccess ? "text-secondary" : "text-muted-foreground/40")} />
          <span className={cn("text-[10px]", member.platformAccess ? "text-secondary font-semibold" : "text-muted-foreground/50")}>
            {member.platformAccess ? "Access granted" : "No access"}
          </span>
        </div>
      </div>

      {/* Edit */}
      <button
        onClick={() => onEdit(member)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-secondary/10 text-muted-foreground hover:text-secondary shrink-0"
        title="Edit member"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Plan Limits ───────────────────────────────────────────────────────────────

const PLAN_TEAM_LIMITS: Record<string, number | null> = {
  free_trial:   1,
  starter:      3,
  professional: 10,
  enterprise:   null,
};

const PLAN_LABELS: Record<string, string> = {
  free_trial:   "Free Trial",
  starter:      "Starter",
  professional: "Professional",
  enterprise:   "Enterprise",
};

// ── Team Page ─────────────────────────────────────────────────────────────────

export default function Inspectors() {
  const { data: rawUsers, isLoading, refetch } = useListUsers({});
  const { user: currentUser } = useAuth();
  const currentUserCompany = currentUser?.companyName ?? null;
  const currentPlan: string = (currentUser as any)?.plan ?? "free_trial";
  const planLimit = PLAN_TEAM_LIMITS[currentPlan] ?? null;

  const [overrides, setOverrides] = useState<Record<number, Partial<TeamMember>>>({});
  const [inviteSentFor, setInviteSentFor] = useState<number | null>(null);
  const [invitingId, setInvitingId] = useState<number | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [formSending, setFormSending] = useState(false);
  const [formResult, setFormResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  // Pending invites state
  type PendingInvite = { token: string; email: string; role: string; createdAt: string; expiresAt: string };
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [resendingToken, setResendingToken] = useState<string | null>(null);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [inviteActionMsg, setInviteActionMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchPendingInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const res = await fetch(`${apiBase()}/api/invites/pending`, { headers: authHeader() });
      if (res.ok) {
        const body = await res.json();
        setPendingInvites(body.invites ?? []);
      }
    } catch {}
    setLoadingInvites(false);
  }, []);

  useEffect(() => { fetchPendingInvites(); }, [fetchPendingInvites]);

  const [addMemberForm, setAddMemberForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", role: "Inspector", userType: "inspector",
  });
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [addMemberResult, setAddMemberResult] = useState<{ ok: boolean; msg: string; tempPassword?: string } | null>(null);

  const members: TeamMember[] = useMemo(() => {
    if (!rawUsers) return [];
    return (rawUsers as any[]).map(u => ({ ...apiUserToMember(u), ...(overrides[u.id] ?? {}) }));
  }, [rawUsers, overrides]);

  const atLimit = planLimit !== null && members.length >= planLimit;

  const togglePlatform = useCallback(async (id: number) => {
    const current = members.find(i => i.id === id)?.platformAccess ?? false;
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
  }, [members]);

  const sendInvite = useCallback(async (id: number) => {
    const member = members.find(i => i.id === id);
    if (!member) return;
    setInvitingId(id);
    setInviteError(null);
    try {
      const res = await fetch(`${apiBase()}/api/invites/app-invite`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ email: member.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        setInviteError(body?.message || "Failed to send invite");
        setTimeout(() => setInviteError(null), 5000);
        return;
      }
      setInviteSentFor(id);
      fetchPendingInvites();
      setTimeout(() => setInviteSentFor(null), 4000);
    } catch {
      setInviteError("Network error — please try again");
      setTimeout(() => setInviteError(null), 5000);
    } finally {
      setInvitingId(null);
    }
  }, [members, fetchPendingInvites]);

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
        setNewCompany("");
        fetchPendingInvites();
        setTimeout(() => { setShowInviteForm(false); setFormResult(null); }, 3000);
      }
    } catch {
      setFormResult({ ok: false, msg: "Network error — please try again" });
    } finally {
      setFormSending(false);
    }
  }, [newEmail, newCompany, fetchPendingInvites]);

  const resendInvite = useCallback(async (token: string, email: string) => {
    setResendingToken(token);
    setInviteActionMsg(null);
    try {
      const res = await fetch(`${apiBase()}/api/invites/${token}/resend`, {
        method: "POST",
        headers: authHeader(),
      });
      const body = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        setInviteActionMsg({ ok: false, msg: body?.message || "Failed to resend invite" });
      } else {
        setInviteActionMsg({ ok: true, msg: `Invite resent to ${email}` });
        fetchPendingInvites();
        setTimeout(() => setInviteActionMsg(null), 4000);
      }
    } catch {
      setInviteActionMsg({ ok: false, msg: "Network error — please try again" });
    } finally {
      setResendingToken(null);
    }
  }, [fetchPendingInvites]);

  const revokeInvite = useCallback(async (token: string) => {
    setRevokingToken(token);
    setInviteActionMsg(null);
    try {
      const res = await fetch(`${apiBase()}/api/invites/${token}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      const body = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        setInviteActionMsg({ ok: false, msg: body?.message || "Failed to revoke invite" });
      } else {
        setInviteActionMsg({ ok: true, msg: "Invitation revoked" });
        fetchPendingInvites();
        setTimeout(() => setInviteActionMsg(null), 3000);
      }
    } catch {
      setInviteActionMsg({ ok: false, msg: "Network error — please try again" });
    } finally {
      setRevokingToken(null);
    }
  }, [fetchPendingInvites]);

  const saveMember = (updated: TeamMember) => {
    setOverrides(prev => ({ ...prev, [updated.id]: updated }));
  };

  const addMember = useCallback(async () => {
    if (!addMemberForm.firstName || !addMemberForm.lastName || !addMemberForm.email) return;
    setAddMemberSaving(true);
    setAddMemberResult(null);
    try {
      const inviterName = currentUser?.firstName && currentUser?.lastName
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
          userType: addMemberForm.userType,
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
      setAddMemberForm({ firstName: "", lastName: "", email: "", phone: "", role: "Inspector", userType: "inspector" });
      refetch();
    } catch {
      setAddMemberResult({ ok: false, msg: "Network error — please try again" });
    } finally {
      setAddMemberSaving(false);
    }
  }, [addMemberForm, currentUser, refetch]);

  const adminCount = members.filter(m => m.isCompanyAdmin).length;
  const inspectorCount = members.filter(m => hasMobile(m.userType)).length;
  const officeCount = members.filter(m => hasWeb(m.userType)).length;

  return (
    <AppLayout>
      {/* Edit Modal */}
      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onSave={saveMember}
          onClose={() => setEditingMember(null)}
        />
      )}

      {/* Add Team Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!addMemberSaving) { setShowAddMember(false); setAddMemberResult(null); } }}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h2 className="font-bold text-sidebar text-base">Add Team Member</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Linked to <span className="font-semibold text-sidebar">{currentUserCompany ?? "your company"}</span>
                </p>
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
                      placeholder="First name" disabled={addMemberSaving}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Last Name <span className="text-red-500">*</span></label>
                    <input
                      value={addMemberForm.lastName}
                      onChange={e => setAddMemberForm(f => ({ ...f, lastName: e.target.value }))}
                      className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                      placeholder="Last name" disabled={addMemberSaving}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Email Address <span className="text-red-500">*</span></label>
                  <input
                    type="email" value={addMemberForm.email}
                    onChange={e => setAddMemberForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                    placeholder="member@example.com" disabled={addMemberSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Phone <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
                  <input
                    type="tel" value={addMemberForm.phone}
                    onChange={e => setAddMemberForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                    placeholder="04xx xxx xxx" disabled={addMemberSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Role</label>
                  <select value={addMemberForm.role} onChange={e => setAddMemberForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background"
                    disabled={addMemberSaving}>
                    {ADD_MEMBER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>

                {/* Account type — multi-select */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Account Type <span className="text-[10px] font-normal normal-case text-muted-foreground">(select one or both)</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "mobile", label: "Field Inspector", icon: Smartphone, desc: "Uses mobile app",   active: hasMobile(addMemberForm.userType) },
                      { key: "web",    label: "Office User",     icon: Monitor,    desc: "Uses web platform", active: hasWeb(addMemberForm.userType) },
                    ] as const).map(({ key, label, icon: Icon, desc, active }) => (
                      <button
                        key={key}
                        type="button"
                        disabled={addMemberSaving}
                        onClick={() => {
                          const curMobile = hasMobile(addMemberForm.userType);
                          const curWeb    = hasWeb(addMemberForm.userType);
                          const nextMobile = key === "mobile" ? !curMobile : curMobile;
                          const nextWeb    = key === "web"    ? !curWeb    : curWeb;
                          if (!nextMobile && !nextWeb) return;
                          setAddMemberForm(f => ({ ...f, userType: mergeAccess(nextMobile, nextWeb) }));
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all relative",
                          active
                            ? "border-secondary bg-secondary/8 text-secondary"
                            : "border-muted/60 bg-background text-muted-foreground hover:border-secondary/40"
                        )}
                      >
                        {active && <Check className="absolute top-1.5 right-1.5 h-3 w-3 text-secondary" />}
                        <Icon className="h-4 w-4" />
                        <span className="text-xs font-semibold">{label}</span>
                        <span className="text-[10px] opacity-70">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {currentUserCompany && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-secondary/5 border border-secondary/20 rounded-lg">
                    <Building2 className="h-3.5 w-3.5 text-secondary shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      This member will be linked to <span className="font-semibold text-sidebar">{currentUserCompany}</span>.
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  A temporary password will be generated and emailed with setup instructions.
                </p>

                {addMemberResult && !addMemberResult.ok && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <X className="h-3.5 w-3.5 shrink-0" />{addMemberResult.msg}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => { setShowAddMember(false); setAddMemberResult(null); }} disabled={addMemberSaving}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:bg-muted/30 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    onClick={addMember}
                    disabled={addMemberSaving || !addMemberForm.firstName || !addMemberForm.lastName || !addMemberForm.email}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-sidebar text-white hover:bg-sidebar/90 transition-colors flex items-center gap-2 disabled:opacity-50">
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
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Team Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team, permissions, app access and platform roles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowInviteForm(!showInviteForm)} className="gap-2">
            <Send className="h-4 w-4" /> Send App Invite
          </Button>
          <Button
            onClick={() => {
              if (atLimit) return;
              setShowAddMember(true);
              setAddMemberResult(null);
            }}
            disabled={atLimit}
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <UserPlus className="h-4 w-4" /> Add Team Member
          </Button>
        </div>
      </div>

      {/* Upgrade banner when at plan limit */}
      {atLimit && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
          <Crown className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              Team limit reached — {members.length} / {planLimit} members on {PLAN_LABELS[currentPlan] ?? currentPlan} plan
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              To add more team members, upgrade your plan.{" "}
              <a href="mailto:contact@inspectproof.com.au" className="underline font-semibold hover:text-amber-900">
                Contact us to upgrade
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <Card className="mb-6 border-secondary/30 bg-secondary/5 shadow-sm">
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-secondary shrink-0" />
              <p className="text-sm font-semibold text-sidebar">Send Secure Invitation</p>
              <p className="text-xs text-muted-foreground">A unique invite link will be emailed to the invitee</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="email" placeholder="inspector@email.com.au" value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendFormInvite(); }}
                disabled={formSending}
                className="flex-1 min-w-48 text-sm border border-input rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-60"
              />
              <Button size="sm" onClick={sendFormInvite} disabled={formSending || !newEmail.trim()} className="gap-1.5">
                {formSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {formSending ? "Sending…" : "Send Invite"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowInviteForm(false); setFormResult(null); setNewEmail(""); setNewCompany(""); }}>
                Cancel
              </Button>
            </div>
          </div>
          {formResult && (
            <div className={`px-5 pb-4 text-sm font-medium flex items-center gap-2 ${formResult.ok ? "text-green-700" : "text-red-600"}`}>
              {formResult.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {formResult.msg}
            </div>
          )}
        </Card>
      )}

      {/* Pending Invites section */}
      {(pendingInvites.length > 0 || loadingInvites) && (
        <Card className="mb-6 shadow-sm border-muted/60">
          <div className="px-5 py-3.5 border-b border-muted/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-sidebar">
                Pending Invitations {pendingInvites.length > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({pendingInvites.length})</span>}
              </span>
            </div>
            <button onClick={fetchPendingInvites} disabled={loadingInvites}
              className="p-1 rounded text-muted-foreground hover:text-sidebar transition-colors disabled:opacity-50" title="Refresh">
              <RefreshCw className={cn("h-3.5 w-3.5", loadingInvites && "animate-spin")} />
            </button>
          </div>
          {inviteActionMsg && (
            <div className={`px-5 py-2.5 text-xs font-medium flex items-center gap-2 border-b border-muted/50 ${inviteActionMsg.ok ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
              {inviteActionMsg.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {inviteActionMsg.msg}
            </div>
          )}
          {loadingInvites ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="divide-y divide-muted/40">
              {pendingInvites.map(inv => {
                const expiry = new Date(inv.expiresAt);
                const created = new Date(inv.createdAt);
                const expiryStr = expiry.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
                const sentStr = created.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
                const isExpiringSoon = (expiry.getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000;
                return (
                  <div key={inv.token} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar truncate">{inv.email}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>Sent {sentStr}</span>
                        <span className={cn("flex items-center gap-0.5", isExpiringSoon ? "text-amber-600 font-medium" : "")}>
                          <Clock className="h-2.5 w-2.5" />
                          Expires {expiryStr}
                          {isExpiringSoon && " ⚠"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => resendInvite(inv.token, inv.email)}
                        disabled={resendingToken === inv.token}
                        className="flex items-center gap-1 text-xs text-secondary hover:underline font-medium disabled:opacity-50 px-2 py-1 rounded hover:bg-secondary/10 transition-colors"
                      >
                        {resendingToken === inv.token
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RefreshCw className="h-3 w-3" />}
                        Resend
                      </button>
                      <button
                        onClick={() => revokeInvite(inv.token)}
                        disabled={revokingToken === inv.token}
                        className="flex items-center gap-1 text-xs text-red-600 hover:underline font-medium disabled:opacity-50 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      >
                        {revokingToken === inv.token
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />}
                        Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Error banner */}
      {inviteError && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <X className="h-3.5 w-3.5 shrink-0" />{inviteError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className={cn("shadow-sm", atLimit ? "border-amber-300 bg-amber-50/40" : "border-muted/60")}>
          <div className="p-4 flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", atLimit ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-sidebar")}>
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar leading-none">
                {members.length}
                <span className="text-sm font-normal text-muted-foreground">
                  /{planLimit !== null ? planLimit : "∞"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Total Team</p>
              <p className="text-[10px] text-muted-foreground/70 font-medium mt-0.5 uppercase tracking-wide">
                {PLAN_LABELS[currentPlan] ?? currentPlan} plan
              </p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm border-muted/60">
          <div className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar">{inspectorCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Field Inspectors</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm border-muted/60">
          <div className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-100 text-sky-700">
              <Monitor className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar">{officeCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Office Users</p>
            </div>
          </div>
        </Card>
        <Card className="shadow-sm border-muted/60">
          <div className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-sidebar">{adminCount}</p>
              <p className="text-xs text-muted-foreground font-medium">Company Admins</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Invite sent toast */}
      {inviteSentFor !== null && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-700 font-medium shadow-sm">
          <Send className="h-3.5 w-3.5" />
          APP invitation sent to {members.find(i => i.id === inviteSentFor)?.firstName}!
        </div>
      )}

      {/* Member table */}
      <Card className="shadow-md border-muted/60 overflow-hidden">
        <div className="px-6 py-3 bg-muted/30 border-b border-muted/50">
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="flex-1">Team Member</span>
            <span className="w-[110px] text-center">APP Access</span>
            <span className="w-[100px] text-center">Platform</span>
            <span className="w-8" />
          </div>
        </div>

        <div className="divide-y divide-muted/40">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          )}
          {!isLoading && members.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No team members yet</p>
              <p className="text-xs opacity-60">Add your first team member to get started.</p>
            </div>
          )}
          {members.map(member => (
            <MemberRow
              key={member.id}
              member={member}
              onTogglePlatform={togglePlatform}
              onSendInvite={sendInvite}
              onEdit={setEditingMember}
              isInviting={invitingId === member.id}
              justSent={inviteSentFor === member.id}
            />
          ))}
        </div>
      </Card>
    </AppLayout>
  );
}
