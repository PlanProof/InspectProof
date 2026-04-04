import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Loader2, Plus, X, Check, Mail, ChevronRight, Edit2, Trash2,
  Building2, ArrowLeft, Tag,
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
        props.className
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

interface TradeCategory {
  id: number;
  name: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
}

interface OrgContractor {
  id: number;
  name: string;
  trade: string;
  tradeCategoryId: number | null;
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

function OrgContractorCard({
  c, categories, onEdit, onRemove,
}: {
  c: OrgContractor;
  categories: TradeCategory[];
  onEdit: (c: OrgContractor) => void;
  onRemove: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [defects, setDefects] = useState<OrgContractorDefect[]>([]);
  const [defectsLoading, setDefectsLoading] = useState(false);
  const [defectsLoaded, setDefectsLoaded] = useState(false);

  const category = categories.find(cat => cat.id === c.tradeCategoryId);

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
            {c.trade && (
              <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded">{c.trade}</span>
            )}
            {category && (
              <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Tag className="h-2.5 w-2.5" />{category.name}
              </span>
            )}
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

function ContractorForm({
  title,
  initialValues,
  categories,
  onSave,
  onCancel,
  saving,
  error,
}: {
  title: string;
  initialValues: {
    name: string; trade: string; tradeCategoryId: number | null;
    email: string; company: string; licenceNumber: string;
    registrationNumber: string; licenceExpiry: string; registrationExpiry: string;
  };
  categories: TradeCategory[];
  onSave: (vals: typeof initialValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [vals, setVals] = useState(initialValues);
  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setVals(v => ({ ...v, [k]: e.target.value }));

  return (
    <div className="p-4 rounded-lg border border-secondary/40 bg-secondary/5 space-y-3">
      <p className="text-xs font-semibold text-sidebar">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium">Full Name *</label>
          <Input value={vals.name} onChange={e => setVals(v => ({ ...v, name: e.target.value }))} placeholder="Full name" autoFocus className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Trade / Discipline</label>
          <Input value={vals.trade} onChange={set("trade")} placeholder="e.g. Plumber, Electrician" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Trade Category</label>
          <select
            value={vals.tradeCategoryId ?? ""}
            onChange={e => setVals(v => ({ ...v, tradeCategoryId: e.target.value ? parseInt(e.target.value, 10) : null }))}
            className="mt-1 w-full text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition"
          >
            <option value="">No category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Email</label>
          <Input value={vals.email} onChange={set("email")} placeholder="contractor@email.com" type="email" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Company</label>
          <Input value={vals.company} onChange={set("company")} placeholder="Company name" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Licence Number</label>
          <Input value={vals.licenceNumber} onChange={set("licenceNumber")} placeholder="Optional" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Registration Number</label>
          <Input value={vals.registrationNumber} onChange={set("registrationNumber")} placeholder="Optional" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Licence Expiry</label>
          <Input value={vals.licenceExpiry} onChange={set("licenceExpiry")} type="date" className="mt-1" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Registration Expiry</label>
          <Input value={vals.registrationExpiry} onChange={set("registrationExpiry")} type="date" className="mt-1" />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center gap-2">
        <Button onClick={() => onSave(vals)} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function TradeCategoriesSection({
  categories,
  onCategoriesChange,
}: {
  categories: TradeCategory[];
  onCategoriesChange: (categories: TradeCategory[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    if (!newName.trim()) { setError("Category name is required."); return; }
    setError("");
    setSavingNew(true);
    try {
      const created = await apiFetch("/api/org-contractors/trade-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      onCategoriesChange([...categories, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setAdding(false);
    } catch {
      setError("Failed to add category.");
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (cat: TradeCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setError("");
  };

  const saveEdit = async () => {
    if (!editName.trim()) { setError("Category name is required."); return; }
    setError("");
    setSavingEdit(true);
    try {
      const updated = await apiFetch(`/api/org-contractors/trade-categories/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      onCategoriesChange(categories.map(x => x.id === editingId ? updated : x).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
    } catch {
      setError("Failed to update category.");
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/org-contractors/trade-categories/${id}`, { method: "DELETE" });
      onCategoriesChange(categories.filter(x => x.id !== id));
    } catch {
      setError("Failed to remove category.");
    }
  };

  return (
    <div className="space-y-2">
      {categories.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No categories yet. Add one to group trades (e.g. "Structural", "Hydraulic", "Electrical").</p>
      )}
      <div className="space-y-1.5">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-white">
            {editingId === cat.id ? (
              <>
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                  className="flex-1"
                  onKeyDown={e => e.key === "Enter" && saveEdit()}
                />
                <button onClick={saveEdit} disabled={savingEdit} className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50">
                  {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setEditingId(null)} className="p-1.5 rounded text-muted-foreground hover:bg-muted/40 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-sidebar flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  {cat.name}
                </span>
                <button onClick={() => startEdit(cat)} className="p-1.5 rounded text-muted-foreground hover:bg-muted/40 transition-colors" title="Rename">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(cat.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="flex items-center gap-2 mt-2">
          <Input
            value={newName}
            onChange={e => { setNewName(e.target.value); setError(""); }}
            placeholder="Category name (e.g. Structural)"
            autoFocus
            onKeyDown={e => e.key === "Enter" && add()}
            className="flex-1"
          />
          <button onClick={add} disabled={savingNew} className="p-2 rounded-lg bg-sidebar text-white hover:bg-sidebar/90 disabled:opacity-50 transition-colors">
            {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setAdding(false); setNewName(""); setError(""); }} className="p-2 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setError(""); }}
          className="flex items-center gap-1.5 text-xs font-medium text-secondary hover:text-secondary/80 transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add Category
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const EMPTY_FORM = {
  name: "", trade: "", tradeCategoryId: null as number | null,
  email: "", company: "", licenceNumber: "",
  registrationNumber: "", licenceExpiry: "", registrationExpiry: "",
};

export default function ContractorLibrary() {
  const [, setLocation] = useLocation();
  const [contractors, setContractors] = useState<OrgContractor[]>([]);
  const [categories, setCategories] = useState<TradeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingContractor, setEditingContractor] = useState<OrgContractor | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<number | "">("");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/org-contractors").catch(() => []),
      apiFetch("/api/org-contractors/trade-categories").catch(() => []),
    ]).then(([contractorList, categoryList]) => {
      setContractors(contractorList);
      setCategories(categoryList);
    }).finally(() => setLoading(false));
  }, []);

  const add = async (vals: typeof EMPTY_FORM) => {
    if (!vals.name.trim()) { setError("Name is required."); return; }
    setError("");
    setSavingNew(true);
    try {
      const created = await apiFetch("/api/org-contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vals.name.trim(),
          trade: vals.trade.trim(),
          tradeCategoryId: vals.tradeCategoryId,
          email: vals.email.trim() || null,
          company: vals.company.trim() || null,
          licenceNumber: vals.licenceNumber.trim() || null,
          registrationNumber: vals.registrationNumber.trim() || null,
          licenceExpiry: vals.licenceExpiry || null,
          registrationExpiry: vals.registrationExpiry || null,
        }),
      });
      setContractors(c => [...c, created]);
      setAdding(false);
    } catch {
      setError("Failed to add contractor.");
    } finally {
      setSavingNew(false);
    }
  };

  const saveEdit = async (vals: typeof EMPTY_FORM) => {
    if (!editingContractor) return;
    if (!vals.name.trim()) { setError("Name is required."); return; }
    setError("");
    setSavingEdit(true);
    try {
      const updated = await apiFetch(`/api/org-contractors/${editingContractor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vals.name.trim(),
          trade: vals.trade.trim(),
          tradeCategoryId: vals.tradeCategoryId,
          email: vals.email.trim() || null,
          company: vals.company.trim() || null,
          licenceNumber: vals.licenceNumber.trim() || null,
          registrationNumber: vals.registrationNumber.trim() || null,
          licenceExpiry: vals.licenceExpiry || null,
          registrationExpiry: vals.registrationExpiry || null,
        }),
      });
      setContractors(c => c.map(x => x.id === editingContractor.id ? updated : x));
      setEditingContractor(null);
    } catch {
      setError("Failed to update contractor.");
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

  const filtered = contractors.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.trade.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q);
    const matchesCategory = filterCategory === "" || c.tradeCategoryId === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const grouped = filterCategory !== "" || search
    ? null
    : categories.length > 0
      ? (() => {
          const withCategory: Record<number, OrgContractor[]> = {};
          const uncategorised: OrgContractor[] = [];
          for (const c of filtered) {
            if (c.tradeCategoryId && categories.find(cat => cat.id === c.tradeCategoryId)) {
              if (!withCategory[c.tradeCategoryId]) withCategory[c.tradeCategoryId] = [];
              withCategory[c.tradeCategoryId].push(c);
            } else {
              uncategorised.push(c);
            }
          }
          return { withCategory, uncategorised };
        })()
      : null;

  return (
    <AppLayout>
      <div className="mb-6">
        <button
          onClick={() => setLocation("/settings")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-sidebar transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Settings
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-sidebar tracking-tight">Contractor Library</h1>
            <p className="text-muted-foreground mt-1">Manage your organisation's shared contractor pool. These contractors are available across every project.</p>
          </div>
          {!adding && !editingContractor && (
            <Button onClick={() => { setAdding(true); setError(""); }}>
              <Plus className="h-4 w-4" /> Add Contractor
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main contractor list */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading contractor library…
            </div>
          ) : (
            <>
              {/* Add form */}
              {adding && (
                <ContractorForm
                  title="New Contractor"
                  initialValues={EMPTY_FORM}
                  categories={categories}
                  onSave={add}
                  onCancel={() => { setAdding(false); setError(""); }}
                  saving={savingNew}
                  error={error}
                />
              )}

              {/* Edit form */}
              {editingContractor && (
                <ContractorForm
                  title="Edit Contractor"
                  initialValues={{
                    name: editingContractor.name,
                    trade: editingContractor.trade,
                    tradeCategoryId: editingContractor.tradeCategoryId,
                    email: editingContractor.email ?? "",
                    company: editingContractor.company ?? "",
                    licenceNumber: editingContractor.licenceNumber ?? "",
                    registrationNumber: editingContractor.registrationNumber ?? "",
                    licenceExpiry: editingContractor.licenceExpiry ?? "",
                    registrationExpiry: editingContractor.registrationExpiry ?? "",
                  }}
                  categories={categories}
                  onSave={saveEdit}
                  onCancel={() => { setEditingContractor(null); setError(""); }}
                  saving={savingEdit}
                  error={error}
                />
              )}

              {/* Filters */}
              {contractors.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name, trade, or company…"
                    className="flex-1 min-w-48 text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition"
                  />
                  {categories.length > 0 && (
                    <select
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value ? parseInt(e.target.value, 10) : "")}
                      className="text-sm border border-input rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition"
                    >
                      <option value="">All categories</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* No contractors */}
              {contractors.length === 0 && !adding && (
                <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-10 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-sidebar">No contractors yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Add your first contractor to get started.</p>
                </div>
              )}

              {/* Filtered but no results */}
              {contractors.length > 0 && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">No contractors match your search.</p>
              )}

              {/* Grouped list (when no active filter/search) */}
              {grouped ? (
                <div className="space-y-5">
                  {categories.map(cat => {
                    const items = grouped.withCategory[cat.id] ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="h-3.5 w-3.5 text-violet-500" />
                          <h3 className="text-xs font-semibold text-violet-700 uppercase tracking-wider">{cat.name}</h3>
                          <span className="text-xs text-muted-foreground">({items.length})</span>
                        </div>
                        <div className="space-y-2">
                          {items.map(c => (
                            <OrgContractorCard
                              key={c.id}
                              c={c}
                              categories={categories}
                              onEdit={setEditingContractor}
                              onRemove={remove}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {grouped.uncategorised.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Uncategorised</h3>
                        <span className="text-xs text-muted-foreground">({grouped.uncategorised.length})</span>
                      </div>
                      <div className="space-y-2">
                        {grouped.uncategorised.map(c => (
                          <OrgContractorCard
                            key={c.id}
                            c={c}
                            categories={categories}
                            onEdit={setEditingContractor}
                            onRemove={remove}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(c => (
                    <OrgContractorCard
                      key={c.id}
                      c={c}
                      categories={categories}
                      onEdit={setEditingContractor}
                      onRemove={remove}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Trade Categories sidebar */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/20">
              <h3 className="font-semibold text-sidebar text-sm flex items-center gap-2">
                <Tag className="h-4 w-4 text-violet-500" />
                Trade Categories
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Group contractors by trade type. Assign categories when adding or editing a contractor.</p>
            </div>
            <div className="p-4">
              <TradeCategoriesSection categories={categories} onCategoriesChange={setCategories} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
