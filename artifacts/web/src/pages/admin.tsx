import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, BarChart3, Shield, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Edit2, Search, Trash2, UserPlus,
  Package, X, Plus, GripVertical, Save,
  DollarSign, TrendingUp, TrendingDown, CreditCard,
  Calendar, ExternalLink, AlertOctagon, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("inspectproof_token") ?? ""}`,
  "Content-Type": "application/json",
});

const PLAN_LABELS: Record<string, string> = {
  free_trial: "Free Trial",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  free_trial: "bg-gray-100 text-gray-700",
  starter: "bg-blue-100 text-blue-700",
  professional: "bg-[#C5D92D]/20 text-[#6b7a00]",
  enterprise: "bg-[#0B1933]/10 text-[#0B1933]",
};

const ROLES = [
  "inspector", "certifier", "engineer", "plumber",
  "project_manager", "supervisor", "whs", "pre_purchase",
  "fire_engineer", "builder", "staff",
];

interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  plan: string;
  isAdmin: boolean;
  isActive: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planOverrideProjects: string | null;
  planOverrideInspections: string | null;
  usage: { projects: number; inspections: number };
  limits: { maxProjects: number | null; maxInspectionsMonthly: number | null; maxInspectionsTotal: number | null; label: string };
  createdAt: string;
}

interface PlanConfig {
  id: number;
  planKey: string;
  label: string;
  description: string | null;
  features: string[];
  maxProjects: string | null;
  maxInspectionsMonthly: string | null;
  maxInspectionsTotal: string | null;
  maxTeamMembers: string | null;
  isPopular: boolean;
  isBestValue: boolean;
  sortOrder: string;
}

// ── Shared Form Components ─────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-gray-600 mb-1 block uppercase tracking-wide">{children}</label>;
}

function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#466DB5]/40 bg-white transition"
    />
  );
}

function FormSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#466DB5]/40 bg-white transition"
    />
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────

function ConfirmDeleteModal({ name, onConfirm, onClose, loading }: {
  name: string; onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-5 h-5 text-red-500" />
        </div>
        <h3 className="font-bold text-[#0B1933] text-lg text-center mb-1">Delete user?</h3>
        <p className="text-sm text-gray-500 text-center mb-6">
          <strong>{name}</strong> will be permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit User Modal ──────────────────────────────────────────────────────

function UserModal({ user, onClose, onSave, saving }: {
  user: AdminUser | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const isNew = !user;
  const [form, setForm] = useState({
    firstName:             user?.firstName ?? "",
    lastName:              user?.lastName ?? "",
    email:                 user?.email ?? "",
    role:                  user?.role ?? "inspector",
    plan:                  user?.plan ?? "free_trial",
    password:              "",
    isAdmin:               user?.isAdmin ?? false,
    isActive:              user?.isActive ?? true,
    planOverrideProjects:  user?.planOverrideProjects ?? "",
    planOverrideInspections: user?.planOverrideInspections ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = () => {
    const payload: any = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      role: form.role,
      plan: form.plan,
      isAdmin: form.isAdmin,
      isActive: form.isActive,
      planOverrideProjects: form.planOverrideProjects || null,
      planOverrideInspections: form.planOverrideInspections || null,
    };
    if (form.password) payload.password = form.password;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-[#0B1933] text-lg">
            {isNew ? "Add new user" : `Edit ${user.firstName} ${user.lastName}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>First name *</FieldLabel>
              <FormInput value={form.firstName} onChange={set("firstName")} placeholder="Jane" />
            </div>
            <div>
              <FieldLabel>Last name *</FieldLabel>
              <FormInput value={form.lastName} onChange={set("lastName")} placeholder="Smith" />
            </div>
          </div>

          <div>
            <FieldLabel>Email address *</FieldLabel>
            <FormInput type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com.au" />
          </div>

          <div>
            <FieldLabel>{isNew ? "Password *" : "New password (leave blank to keep current)"}</FieldLabel>
            <FormInput type="password" value={form.password} onChange={set("password")} placeholder={isNew ? "Min. 8 characters" : "Leave blank to keep current"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Role</FieldLabel>
              <FormSelect value={form.role} onChange={set("role")}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </FormSelect>
            </div>
            <div>
              <FieldLabel>Plan</FieldLabel>
              <FormSelect value={form.plan} onChange={set("plan")}>
                {Object.entries(PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </FormSelect>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Project override</FieldLabel>
              <FormInput
                placeholder="e.g. 20 (blank = plan default)"
                value={form.planOverrideProjects}
                onChange={set("planOverrideProjects")}
              />
            </div>
            <div>
              <FieldLabel>Inspection override</FieldLabel>
              <FormInput
                placeholder="e.g. 100 (blank = plan default)"
                value={form.planOverrideInspections}
                onChange={set("planOverrideInspections")}
              />
            </div>
          </div>

          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={form.isAdmin} onChange={set("isAdmin")} className="rounded accent-[#466DB5]" />
              Admin access
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={form.isActive} onChange={set("isActive")} className="rounded accent-[#466DB5]" />
              Active account
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="flex-1 bg-[#0B1933] hover:bg-[#0B1933]/90 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : isNew ? "Create user" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── User Row ───────────────────────────────────────────────────────────────────

function UserRow({ user, onEdit, onDelete }: { user: AdminUser; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const projectPct = user.limits.maxProjects
    ? Math.min(100, (user.usage.projects / user.limits.maxProjects) * 100)
    : null;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <td className="px-4 py-3">
          <div>
            <p className="font-medium text-[#0B1933] text-sm">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 capitalize">{user.role.replace(/_/g, " ")}</td>
        <td className="px-4 py-3">
          <Badge className={`${PLAN_COLORS[user.plan] ?? PLAN_COLORS.free_trial} text-xs font-medium border-0`}>
            {PLAN_LABELS[user.plan] ?? user.plan}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm text-gray-600">
          {user.usage.projects} proj · {user.usage.inspections} insp
        </td>
        <td className="px-4 py-3">
          {user.isActive
            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
            : <AlertCircle className="w-4 h-4 text-red-400" />}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {new Date(user.createdAt).toLocaleDateString("en-AU")}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-[#466DB5] transition">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-blue-50/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-1">Stripe Customer</p>
                <p className="font-mono text-xs truncate">{user.stripeCustomerId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Subscription</p>
                <p className="font-mono text-xs truncate">{user.stripeSubscriptionId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Project limit</p>
                <p className="text-xs">
                  {user.planOverrideProjects
                    ? `${user.planOverrideProjects} (override)`
                    : user.limits.maxProjects != null
                    ? String(user.limits.maxProjects)
                    : "Unlimited"}
                </p>
                {projectPct !== null && (
                  <div className="mt-1 w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${projectPct >= 90 ? "bg-red-400" : "bg-[#466DB5]"}`}
                      style={{ width: `${projectPct}%` }}
                    />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Roles & flags</p>
                <p className="text-xs">{user.role}{user.isAdmin ? " · Admin" : ""}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Plan Config Editor ─────────────────────────────────────────────────────────

function PlanEditor({ plan, onSave, saving }: { plan: PlanConfig; onSave: (data: any) => void; saving: boolean }) {
  const [form, setForm] = useState({
    label: plan.label,
    description: plan.description ?? "",
    features: Array.isArray(plan.features) ? [...plan.features] : [],
    maxProjects: plan.maxProjects ?? "",
    maxInspectionsMonthly: plan.maxInspectionsMonthly ?? "",
    maxInspectionsTotal: plan.maxInspectionsTotal ?? "",
    maxTeamMembers: plan.maxTeamMembers ?? "",
    isPopular: plan.isPopular,
    isBestValue: plan.isBestValue,
  });

  const [newFeature, setNewFeature] = useState("");

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setForm(f => ({ ...f, features: [...f.features, newFeature.trim()] }));
    setNewFeature("");
  };

  const removeFeature = (i: number) =>
    setForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));

  const updateFeature = (i: number, val: string) =>
    setForm(f => ({ ...f, features: f.features.map((feat, idx) => idx === i ? val : feat) }));

  const planColorMap: Record<string, string> = {
    free_trial: "border-gray-300",
    starter: "border-[#466DB5]",
    professional: "border-[#C5D92D]",
    enterprise: "border-[#0B1933]",
  };

  return (
    <div className={`bg-white rounded-2xl border-2 ${planColorMap[plan.planKey] ?? "border-gray-200"} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{plan.planKey}</span>
          {form.isPopular && <span className="text-xs bg-[#466DB5] text-white px-2 py-0.5 rounded-full font-semibold">Popular</span>}
          {form.isBestValue && <span className="text-xs bg-[#C5D92D] text-[#0B1933] px-2 py-0.5 rounded-full font-semibold">Best Value</span>}
        </div>
        <button
          onClick={() => onSave({ ...form, features: form.features })}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1933] text-white text-xs font-semibold rounded-lg hover:bg-[#0B1933]/90 transition disabled:opacity-50"
        >
          <Save className="w-3 h-3" />
          {saving ? "Saving…" : "Save plan"}
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Display name</FieldLabel>
            <FormInput value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-2">
              <input type="checkbox" checked={form.isPopular} onChange={e => setForm(f => ({ ...f, isPopular: e.target.checked }))} className="rounded accent-[#466DB5]" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Popular</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none pb-2">
              <input type="checkbox" checked={form.isBestValue} onChange={e => setForm(f => ({ ...f, isBestValue: e.target.checked }))} className="rounded accent-[#C5D92D]" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Best Value</span>
            </label>
          </div>
        </div>

        <div>
          <FieldLabel>Description</FieldLabel>
          <FormInput value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short plan description" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <FieldLabel>Max projects</FieldLabel>
            <FormInput value={form.maxProjects} onChange={e => setForm(f => ({ ...f, maxProjects: e.target.value }))} placeholder="blank = unlimited" />
          </div>
          <div>
            <FieldLabel>Inspections/month</FieldLabel>
            <FormInput value={form.maxInspectionsMonthly} onChange={e => setForm(f => ({ ...f, maxInspectionsMonthly: e.target.value }))} placeholder="blank = unlimited" />
          </div>
          <div>
            <FieldLabel>Total inspections</FieldLabel>
            <FormInput value={form.maxInspectionsTotal} onChange={e => setForm(f => ({ ...f, maxInspectionsTotal: e.target.value }))} placeholder="blank = unlimited" />
          </div>
          <div>
            <FieldLabel>Team members</FieldLabel>
            <FormInput value={form.maxTeamMembers} onChange={e => setForm(f => ({ ...f, maxTeamMembers: e.target.value }))} placeholder="blank = unlimited" />
          </div>
        </div>

        <div>
          <FieldLabel>Features (what's included)</FieldLabel>
          <div className="space-y-2 mb-2">
            {form.features.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                <input
                  value={f}
                  onChange={e => updateFeature(i, e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#466DB5]/40"
                />
                <button onClick={() => removeFeature(i)} className="text-gray-300 hover:text-red-400 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newFeature}
              onChange={e => setNewFeature(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addFeature()}
              placeholder="Add a feature and press Enter or +"
              className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#466DB5]/40 bg-gray-50"
            />
            <button
              onClick={addFeature}
              className="px-3 py-1.5 bg-[#466DB5] text-white rounded-lg hover:bg-[#466DB5]/90 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-[#0B1933]">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────────

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "plans" | "stats" | "revenue">("users");

  const [userModal, setUserModal] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const r = await fetch(API("/admin/users"), { headers: authHeaders() });
      if (!r.ok) throw new Error("Admin access required");
      return r.json();
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const r = await fetch(API("/admin/stats"), { headers: authHeaders() });
      return r.json();
    },
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: async () => {
      const r = await fetch(API("/admin/revenue"), { headers: authHeaders() });
      if (!r.ok) throw new Error("Failed to load revenue data");
      return r.json();
    },
    staleTime: 60_000,
    enabled: tab === "revenue",
  });

  const { data: plansData, refetch: refetchPlans } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const r = await fetch(API("/admin/plans"), { headers: authHeaders() });
      return r.json();
    },
  });

  const createUser = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(API("/admin/users"), {
        method: "POST", headers: authHeaders(), body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Failed to create user");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setUserModal({ open: false, user: null });
      toast({ title: "User created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(API(`/admin/users/${id}`), {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setUserModal({ open: false, user: null });
      toast({ title: "User updated" });
    },
    onError: () => toast({ title: "Error saving user", variant: "destructive" }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(API(`/admin/users/${id}`), { method: "DELETE", headers: authHeaders() });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    },
    onError: (e: any) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const [savingPlan, setSavingPlan] = useState<string | null>(null);

  const savePlan = async (planKey: string, data: any) => {
    setSavingPlan(planKey);
    try {
      const r = await fetch(API(`/admin/plans/${planKey}`), {
        method: "PUT", headers: authHeaders(), body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      await refetchPlans();
      qc.invalidateQueries({ queryKey: ["billing-plan-configs"] });
      toast({ title: `${data.label} plan saved`, description: "Changes are live on the billing pages." });
    } catch {
      toast({ title: "Error saving plan", variant: "destructive" });
    } finally {
      setSavingPlan(null);
    }
  };

  const users: AdminUser[] = usersData?.users ?? [];
  const filtered = users.filter(u =>
    search === "" ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const planConfigs: PlanConfig[] = (plansData?.plans ?? []).map((p: any) => ({
    ...p,
    features: typeof p.features === "string" ? JSON.parse(p.features) : (p.features ?? []),
  }));

  const stats = statsData ?? {};

  if (usersData === undefined && !usersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-[#0B1933] mb-2">Admin access required</h2>
          <p className="text-gray-500 text-sm mb-4">You don't have permission to view this page.</p>
          <Button onClick={() => setLocation("/dashboard")}>Back to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0B1933] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="6" fill="#466DB5"/>
              <rect x="7" y="11" width="26" height="25" rx="2" fill="#F2F3F4"/>
              <rect x="15" y="7" width="10" height="7" rx="2" fill="#F2F3F4"/>
              <rect x="10" y="16" width="20" height="2" rx="1" fill="#466DB5"/>
              <rect x="10" y="21" width="20" height="2" rx="1" fill="#466DB5"/>
              <rect x="10" y="26" width="20" height="2" rx="1" fill="#466DB5"/>
            </svg>
            <span style={{ fontFamily: "'OddliniUX', sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>
              InspectProof Admin
            </span>
          </div>
          <div className="flex gap-1">
            {(["users", "plans", "revenue", "stats"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t ? "bg-white/15 text-white" : "text-gray-300 hover:text-white"
                }`}
              >
                {t === "users" ? "Users" : t === "plans" ? "Plans" : t === "revenue" ? "Revenue" : "Stats"}
              </button>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white" onClick={() => setLocation("/dashboard")}>
          Exit admin
        </Button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">

        {/* ── Users Tab ── */}
        {tab === "users" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#0B1933]">All users</h2>
                <p className="text-sm text-gray-500">{users.length} total accounts</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search users..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 w-56 text-sm"
                  />
                </div>
                <button
                  onClick={() => setUserModal({ open: true, user: null })}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B1933] text-white text-sm font-semibold rounded-lg hover:bg-[#0B1933]/90 transition"
                >
                  <UserPlus className="w-4 h-4" />
                  Add user
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {usersLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading users...</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(user => (
                      <UserRow
                        key={user.id}
                        user={user}
                        onEdit={() => setUserModal({ open: true, user })}
                        onDelete={() => setDeleteTarget(user)}
                      />
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No users found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Plans Tab ── */}
        {tab === "plans" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#0B1933]">Plan & Package Management</h2>
              <p className="text-sm text-gray-500 mt-1">
                Edit plan features, limits, and labels. Changes are immediately reflected on the desktop billing page and mobile app.
              </p>
            </div>
            {planConfigs.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Loading plans...</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {planConfigs.map(plan => (
                  <PlanEditor
                    key={plan.planKey}
                    plan={plan}
                    onSave={data => savePlan(plan.planKey, data)}
                    saving={savingPlan === plan.planKey}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Stats Tab ── */}
        {tab === "stats" && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total users" value={stats.totalUsers ?? "—"} icon={Users} color="bg-blue-50 text-blue-600" />
              <StatCard label="Total projects" value={stats.totalProjects ?? "—"} icon={BarChart3} color="bg-[#C5D92D]/20 text-[#6b7a00]" />
              <StatCard label="Total inspections" value={stats.totalInspections ?? "—"} icon={Shield} color="bg-[#466DB5]/10 text-[#466DB5]" />
              <StatCard
                label="Paid users"
                value={stats.planBreakdown?.filter((p: any) => p.plan !== "free_trial").reduce((a: number, p: any) => a + Number(p.cnt), 0) ?? "—"}
                icon={CheckCircle2}
                color="bg-green-50 text-green-600"
              />
            </div>

            {stats.planBreakdown && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                <h3 className="font-bold text-[#0B1933] mb-4">Users by plan</h3>
                <div className="space-y-3">
                  {stats.planBreakdown.map((p: any) => (
                    <div key={p.plan} className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 w-28">{PLAN_LABELS[p.plan] ?? p.plan}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#466DB5] rounded-full"
                          style={{ width: `${Math.min(100, (Number(p.cnt) / (stats.totalUsers || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-[#0B1933] w-6 text-right">{p.cnt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.recentUsers && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="font-bold text-[#0B1933] mb-4">Recent sign-ups</h3>
                <div className="space-y-2">
                  {stats.recentUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#0B1933]">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={`${PLAN_COLORS[u.plan] ?? PLAN_COLORS.free_trial} text-xs border-0`}>
                          {PLAN_LABELS[u.plan] ?? u.plan}
                        </Badge>
                        <span className="text-xs text-gray-400">
                          {new Date(u.createdAt).toLocaleDateString("en-AU")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Revenue Tab ── */}
        {tab === "revenue" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-[#0B1933]">Revenue & Billing</h2>
                <p className="text-sm text-gray-500 mt-0.5">Live financial data pulled from Stripe · AUD</p>
              </div>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ["admin-revenue"] })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <Activity className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            {revenueLoading ? (
              <div className="text-center py-24 text-gray-400 text-sm">Loading Stripe data…</div>
            ) : revenueData?.error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-600 font-medium">Failed to load revenue data</p>
                <p className="text-xs text-red-400 mt-1">{revenueData.message}</p>
              </div>
            ) : revenueData && (
              <div className="space-y-6">

                {/* ── Alerts ── */}
                {(revenueData.pastDueCount > 0 || revenueData.failedPaymentCount > 0) && (
                  <div className="flex gap-3 flex-wrap">
                    {revenueData.pastDueCount > 0 && (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                        <AlertOctagon className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-medium text-amber-700">
                          {revenueData.pastDueCount} past-due invoice{revenueData.pastDueCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {revenueData.failedPaymentCount > 0 && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-medium text-red-700">
                          {revenueData.failedPaymentCount} failed payment{revenueData.failedPaymentCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── KPI Cards ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {
                      label: "Monthly Recurring Revenue",
                      sublabel: "MRR",
                      value: `$${revenueData.mrr?.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      icon: DollarSign,
                      color: "bg-green-50 text-green-600",
                      badge: revenueData.mrr > 0 ? "Live" : null,
                    },
                    {
                      label: "Annual Recurring Revenue",
                      sublabel: "ARR (MRR × 12)",
                      value: `$${revenueData.arr?.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      icon: TrendingUp,
                      color: "bg-[#466DB5]/10 text-[#466DB5]",
                      badge: null,
                    },
                    {
                      label: "Revenue this month",
                      sublabel: new Date().toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
                      value: `$${revenueData.currentMonthRevenue?.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      icon: Calendar,
                      color: "bg-[#C5D92D]/20 text-[#6b7a00]",
                      badge: null,
                    },
                    {
                      label: "Revenue last 12 months",
                      sublabel: "Paid invoices only",
                      value: `$${revenueData.totalRevenue12m?.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      icon: CreditCard,
                      color: "bg-purple-50 text-purple-600",
                      badge: null,
                    },
                  ].map(card => (
                    <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center`}>
                          <card.icon className="w-4 h-4" />
                        </div>
                        {card.badge && (
                          <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{card.badge}</span>
                        )}
                      </div>
                      <p className="text-2xl font-bold text-[#0B1933]">{card.value}</p>
                      <p className="text-xs font-semibold text-gray-500 mt-0.5">{card.sublabel}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{card.label}</p>
                    </div>
                  ))}
                </div>

                {/* ── Secondary KPIs ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {
                      label: "Active subscriptions",
                      value: revenueData.activeSubscriptions,
                      icon: CheckCircle2,
                      color: "text-green-600",
                    },
                    {
                      label: "Avg revenue / paid user",
                      value: revenueData.avgRevenuePerUser > 0
                        ? `$${revenueData.avgRevenuePerUser.toFixed(2)}/mo`
                        : "—",
                      icon: Users,
                      color: "text-[#466DB5]",
                    },
                    {
                      label: "Cancelled (last 90 days)",
                      value: revenueData.cancelledLast90Days,
                      icon: TrendingDown,
                      color: "text-red-500",
                    },
                    {
                      label: "Trial conversion rate",
                      value: revenueData.totalUsers > 0
                        ? `${Math.round((revenueData.paidUsers / Math.max(revenueData.totalUsers, 1)) * 100)}%`
                        : "—",
                      icon: Activity,
                      color: "text-purple-600",
                    },
                  ].map(card => (
                    <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <card.icon className={`w-4 h-4 ${card.color}`} />
                        <span className="text-xs text-gray-500 font-medium">{card.label}</span>
                      </div>
                      <p className="text-xl font-bold text-[#0B1933]">{card.value ?? "—"}</p>
                    </div>
                  ))}
                </div>

                {/* ── Revenue Chart (12 months) ── */}
                {revenueData.monthlyRevenue?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="font-bold text-[#0B1933] mb-1">Monthly Revenue — Last 12 Months</h3>
                    <p className="text-xs text-gray-400 mb-5">Paid invoices in AUD</p>
                    {(() => {
                      const months = revenueData.monthlyRevenue as { month: string; revenue: number }[];
                      const maxVal = Math.max(...months.map(m => m.revenue), 1);
                      const total = months.reduce((a, m) => a + m.revenue, 0);
                      return (
                        <div>
                          <div className="flex items-end gap-1 h-40 mb-2">
                            {months.map((m, i) => {
                              const pct = (m.revenue / maxVal) * 100;
                              const isThisMonth = i === months.length - 1;
                              return (
                                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                                  <div className="relative w-full flex items-end justify-center h-36">
                                    {m.revenue > 0 && (
                                      <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition bg-[#0B1933] text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none z-10">
                                        ${m.revenue.toFixed(2)}
                                      </div>
                                    )}
                                    <div
                                      className={`w-full rounded-t-sm transition-all ${isThisMonth ? "bg-[#C5D92D]" : "bg-[#466DB5]/70 group-hover:bg-[#466DB5]"}`}
                                      style={{ height: `${Math.max(pct, m.revenue > 0 ? 2 : 0)}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-gray-400 truncate w-full text-center">{m.month}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between items-center border-t border-gray-100 pt-3 mt-1">
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#466DB5]/70 inline-block"></span> Past months</span>
                              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#C5D92D] inline-block"></span> This month</span>
                            </div>
                            <span className="text-xs text-gray-400">Total: <strong className="text-[#0B1933]">${total.toFixed(2)}</strong></span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── Revenue by Plan ── */}
                {revenueData.revenueByPlan?.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="font-bold text-[#0B1933] mb-4">MRR by Plan</h3>
                    <div className="space-y-3">
                      {revenueData.revenueByPlan.map((p: any) => {
                        const pct = revenueData.mrr > 0 ? Math.min(100, (p.mrr / revenueData.mrr) * 100) : 0;
                        return (
                          <div key={p.plan} className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 w-28 shrink-0 capitalize">{PLAN_LABELS[p.plan] ?? p.plan}</span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#466DB5] rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm font-semibold text-[#0B1933] w-24 text-right">
                              ${p.mrr.toFixed(2)}/mo
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── User Funnel ── */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="font-bold text-[#0B1933] mb-4">Subscription Funnel</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Free Trial", value: revenueData.freeTrialUsers, color: "bg-gray-100 text-gray-600", icon: Users },
                      { label: "Paying", value: revenueData.paidUsers, color: "bg-green-100 text-green-700", icon: CheckCircle2 },
                      { label: "Cancelled (90d)", value: revenueData.cancelledLast90Days, color: "bg-red-50 text-red-600", icon: TrendingDown },
                    ].map(f => (
                      <div key={f.label} className={`rounded-xl p-4 ${f.color.split(" ")[0]}`}>
                        <f.icon className={`w-4 h-4 mb-2 ${f.color.split(" ")[1]}`} />
                        <p className={`text-2xl font-bold ${f.color.split(" ")[1]}`}>{f.value ?? 0}</p>
                        <p className={`text-xs font-medium ${f.color.split(" ")[1]} opacity-80`}>{f.label}</p>
                      </div>
                    ))}
                  </div>
                  {revenueData.totalUsers > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Free → Paid conversion</span>
                        <span className="font-semibold text-[#0B1933]">
                          {Math.round((revenueData.paidUsers / revenueData.totalUsers) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C5D92D] rounded-full"
                          style={{ width: `${Math.round((revenueData.paidUsers / revenueData.totalUsers) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Recent Payments ── */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-[#0B1933]">Recent Payments</h3>
                    <span className="text-xs text-gray-400">Last 10 successful invoices</span>
                  </div>
                  {revenueData.recentPayments?.length > 0 ? (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                          <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueData.recentPayments.map((payment: any) => (
                          <tr key={payment.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-[#0B1933]">{payment.customerName ?? "—"}</p>
                              <p className="text-xs text-gray-400">{payment.customerEmail ?? "—"}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 max-w-48 truncate">{payment.description}</td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold text-green-600">
                                ${payment.amount.toFixed(2)} {payment.currency}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {new Date(payment.date).toLocaleDateString("en-AU")}
                            </td>
                            <td className="px-4 py-3">
                              {payment.hostedUrl && (
                                <a
                                  href={payment.hostedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-400 hover:text-[#466DB5] transition"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="px-6 py-10 text-center">
                      <CreditCard className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No payments yet</p>
                      <p className="text-xs text-gray-300 mt-1">Successful invoices from Stripe will appear here</p>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {userModal.open && (
        <UserModal
          user={userModal.user}
          onClose={() => setUserModal({ open: false, user: null })}
          onSave={data =>
            userModal.user
              ? updateUser.mutate({ id: userModal.user.id, data })
              : createUser.mutate(data)
          }
          saving={createUser.isPending || updateUser.isPending}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          name={`${deleteTarget.firstName} ${deleteTarget.lastName}`}
          onConfirm={() => deleteUser.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          loading={deleteUser.isPending}
        />
      )}
    </div>
  );
}
