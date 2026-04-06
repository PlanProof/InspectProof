import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Loader2, Plus, X, Check, Mail, Edit2, Trash2, ArrowLeft, Users, Search,
} from "lucide-react";
import { useLocation } from "wouter";
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

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition",
        props.disabled && "bg-muted/50 text-muted-foreground cursor-not-allowed",
        props.className,
      )}
    />
  );
}

function Button({
  children, onClick, type = "button", variant = "primary", disabled, className, size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "outline" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const base = "inline-flex items-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-sidebar text-white hover:bg-sidebar/90",
    outline: "border border-border text-sidebar hover:bg-muted/30",
    danger:  "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
    ghost:   "text-muted-foreground hover:bg-muted/40",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(base, sizes[size], variants[variant], className)}>
      {children}
    </button>
  );
}

interface StaffMember {
  id: number;
  name: string;
  role: string;
  email: string | null;
}

export default function InternalStaff() {
  const [, setLocation] = useLocation();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.role?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q),
    );
  }, [staff, search]);

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

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/settings?tab=organisation")}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-sidebar transition-colors"
            aria-label="Back to Organisation settings"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-sidebar tracking-tight flex items-center gap-2">
              <Users className="h-5 w-5 text-secondary" />
              Internal Staff
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Employees who can be assigned as responsible parties on defects. They appear alongside contractors in the trade allocation picker.
            </p>
          </div>
          {!adding && (
            <Button onClick={() => { setAdding(true); setError(""); }}>
              <Plus className="h-4 w-4" />
              Add Staff Member
            </Button>
          )}
        </div>

        {/* Add form */}
        {adding && (
          <div className="rounded-xl border border-secondary/40 bg-secondary/5 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-sidebar">New Staff Member</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        )}

        {/* Search */}
        {staff.length > 4 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, role, or email…"
              className="w-full text-sm border border-input rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition"
            />
          </div>
        )}

        {/* Staff list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-12">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
            </div>
          ) : staff.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
                <Users className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No internal staff added yet</p>
              <p className="text-xs text-muted-foreground/70">Add your first team member using the button above.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No staff match your search.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map(member => (
                <div key={member.id} className="flex items-start gap-3 p-4 hover:bg-muted/10 transition-colors">
                  {editingId === member.id ? (
                    <>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 text-xs font-bold text-secondary">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
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
            </div>
          )}
        </div>

        {error && !adding && <p className="text-xs text-red-500">{error}</p>}

        <p className="text-xs text-muted-foreground">
          Staff count: {staff.length} member{staff.length !== 1 ? "s" : ""}
          {search && filtered.length !== staff.length ? ` · ${filtered.length} shown` : ""}
        </p>
      </div>
    </AppLayout>
  );
}
