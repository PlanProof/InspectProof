import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users, BarChart3, Shield, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Edit2, RefreshCw, Search
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
  limits: {
    maxProjects: number | null;
    maxInspectionsMonthly: number | null;
    maxInspectionsTotal: number | null;
    label: string;
  };
  createdAt: string;
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-[#0B1933]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function EditUserModal({ user, onClose, onSave }: { user: AdminUser; onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({
    plan: user.plan,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    planOverrideProjects: user.planOverrideProjects ?? "",
    planOverrideInspections: user.planOverrideInspections ?? "",
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-[#0B1933] text-lg mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Edit User
        </h3>
        <p className="text-sm text-gray-500 mb-5">{user.firstName} {user.lastName} · {user.email}</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Plan</label>
            <select
              value={form.plan}
              onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#466DB5]"
            >
              {Object.entries(PLAN_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Project override</label>
              <Input
                placeholder="e.g. 20 (blank = use plan)"
                value={form.planOverrideProjects}
                onChange={e => setForm(f => ({ ...f, planOverrideProjects: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Inspection override</label>
              <Input
                placeholder="e.g. 100 (blank = use plan)"
                value={form.planOverrideInspections}
                onChange={e => setForm(f => ({ ...f, planOverrideInspections: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                className="rounded"
              />
              Admin access
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="rounded"
              />
              Active account
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 bg-[#0B1933] hover:bg-[#0B1933]/90 text-white"
            onClick={() => onSave({
              plan: form.plan,
              isAdmin: form.isAdmin,
              isActive: form.isActive,
              planOverrideProjects: form.planOverrideProjects || null,
              planOverrideInspections: form.planOverrideInspections || null,
            })}
          >
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, onEdit }: { user: AdminUser; onEdit: () => void }) {
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
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={onEdit} className="h-7 px-2">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(e => !e)} className="h-7 px-2">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
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
                <p className="text-xs text-gray-500 mb-1">Roles</p>
                <p className="text-xs">{user.role}{user.isAdmin ? " · Admin" : ""}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<"users" | "stats">("users");

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

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(API(`/admin/users/${id}`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      setEditingUser(null);
      toast({ title: "User updated" });
    },
  });

  const users: AdminUser[] = usersData?.users ?? [];
  const filtered = users.filter(u =>
    search === "" ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

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
          <span className="font-bold text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            InspectProof Admin
          </span>
          <div className="flex gap-1">
            {(["users", "stats"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t ? "bg-white/15 text-white" : "text-gray-300 hover:text-white"
                }`}
              >
                {t === "users" ? "Users" : "Stats"}
              </button>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white" onClick={() => setLocation("/dashboard")}>
          Exit admin
        </Button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
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
                <h3 className="font-bold text-[#0B1933] mb-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Users by plan
                </h3>
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
                <h3 className="font-bold text-[#0B1933] mb-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Recent sign-ups
                </h3>
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

        {tab === "users" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-[#0B1933]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                All users
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 w-64 text-sm"
                />
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
                        onEdit={() => setEditingUser(user)}
                      />
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No users found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={data => updateUser.mutate({ id: editingUser.id, data })}
        />
      )}
    </div>
  );
}
