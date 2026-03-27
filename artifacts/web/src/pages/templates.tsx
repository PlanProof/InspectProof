import { useState, useCallback, useRef, useEffect } from "react";
import { useListChecklistTemplates, useGetChecklistTemplate, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, Button } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  FolderOpen, Folder, FileText, ChevronRight, ChevronDown,
  ClipboardList, CheckSquare, Plus, Search, X,
  ChevronUp, Copy, ArrowUpDown, Loader2, Pencil, Trash2,
  Save, AlertCircle, GripVertical, Heading, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── NCC Classifications ───────────────────────────────────────────────────────
const NCC_CLASSES: Record<string, string> = {
  "Class 1a":  "Class 1a — Dwelling",
  "Class 1b":  "Class 1b — Boarding house / Guest house / Hostel (>300m² or >12Pax)",
  "Class 2":   "Class 2 — Building containing two or more sole-occupancy units",
  "Class 3":   "Class 3 — Residential building (other than Class 1 or 2)",
  "Class 4":   "Class 4 — Dwelling in Class 5, 6, 7, 8 or 9 building",
  "Class 5":   "Class 5 — Office building",
  "Class 6":   "Class 6 — Shop or commercial premises",
  "Class 7a":  "Class 7a — Carpark",
  "Class 7b":  "Class 7b — Storage or display of goods by wholesale",
  "Class 7c":  "Class 7c — Storage or display of goods by retail",
  "Class 8":   "Class 8 — Laboratory or production/assembly building",
  "Class 9a":  "Class 9a — Health-care building",
  "Class 9b":  "Class 9b — Assembly building",
  "Class 9c":  "Class 9c — Residential care building",
  "Class 10a": "Class 10a — Non-habitable building (garage, carport, shed)",
  "Class 10b": "Class 10b — Fence, mast, antenna, retaining wall, swimming pool",
  "Class 10c": "Class 10c — Private bushfire shelter",
};

const DISCIPLINE_ORDER = [
  "Building Surveyor",
  "Structural Engineer",
  "Plumbing Officer",
  "Builder / QC",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
  "Custom",
];
const DISCIPLINE_META: Record<string, { active: string; accent: string }> = {
  "Building Surveyor":     { active: "bg-sidebar text-white",    accent: "text-secondary border-secondary" },
  "Structural Engineer":   { active: "bg-blue-700 text-white",   accent: "text-blue-700 border-blue-700" },
  "Plumbing Officer":      { active: "bg-teal-700 text-white",   accent: "text-teal-700 border-teal-700" },
  "Builder / QC":          { active: "bg-amber-700 text-white",  accent: "text-amber-700 border-amber-700" },
  "Site Supervisor":       { active: "bg-orange-600 text-white", accent: "text-orange-600 border-orange-600" },
  "WHS Officer":           { active: "bg-red-700 text-white",    accent: "text-red-700 border-red-700" },
  "Pre-Purchase Inspector":{ active: "bg-purple-700 text-white", accent: "text-purple-700 border-purple-700" },
  "Fire Safety Engineer":  { active: "bg-rose-700 text-white",   accent: "text-rose-700 border-rose-700" },
  "Custom":                { active: "bg-slate-700 text-white",  accent: "text-slate-700 border-slate-400" },
};

const TYPE_META: Record<string, { label: string; color: string; dot: string }> = {
  footing:      { label: "Footing",       color: "bg-amber-100 text-amber-800 border-amber-200",    dot: "bg-amber-500" },
  slab:         { label: "Slab",          color: "bg-orange-100 text-orange-800 border-orange-200",  dot: "bg-orange-500" },
  frame:        { label: "Frame",         color: "bg-blue-100 text-blue-800 border-blue-200",         dot: "bg-blue-500" },
  waterproofing:{ label: "Waterproofing", color: "bg-cyan-100 text-cyan-800 border-cyan-200",         dot: "bg-cyan-500" },
  occupancy:    { label: "Occupancy",     color: "bg-purple-100 text-purple-800 border-purple-200",   dot: "bg-purple-500" },
  final:        { label: "Final",         color: "bg-green-100 text-green-800 border-green-200",      dot: "bg-green-500" },
  fire_safety:  { label: "Fire Safety",   color: "bg-red-100 text-red-800 border-red-200",            dot: "bg-red-500" },
  pool_barrier: { label: "Pool Barrier",  color: "bg-teal-100 text-teal-800 border-teal-200",         dot: "bg-teal-500" },
  lock_up:      { label: "Lock-Up",       color: "bg-indigo-100 text-indigo-800 border-indigo-200",   dot: "bg-indigo-500" },
  fit_out:      { label: "Fit-Out",       color: "bg-pink-100 text-pink-800 border-pink-200",         dot: "bg-pink-500" },
};
function typeMeta(type: string) {
  const key = Object.keys(TYPE_META).find(k => type?.toLowerCase().includes(k)) ?? "";
  return TYPE_META[key] ?? { label: type, color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-orange-50 text-orange-700 border-orange-200",
  high:     "bg-red-50 text-red-700 border-red-200",
  medium:   "bg-amber-50 text-amber-700 border-amber-200",
  low:      "bg-green-50 text-green-700 border-green-200",
};

function apiBase() { return import.meta.env.BASE_URL.replace(/\/$/, ""); }
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Local types for editing ───────────────────────────────────────────────────
interface LocalItem {
  id?: number;          // undefined = new (unsaved)
  tempId: string;       // stable key for react
  category: string;
  description: string;
  reason: string;
  codeReference: string;
  riskLevel: string;
  isRequired: boolean;
  orderIndex: number;
  dirty: boolean;
  isNew: boolean;
}

// ── Template Detail Panel ─────────────────────────────────────────────────────
function TemplateDetail({
  templateId,
  discipline,
  onClose,
  onCopied,
  onSaved,
}: {
  templateId: number;
  discipline: string;
  onClose: () => void;
  onCopied: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useGetChecklistTemplate(templateId);
  const [editMode, setEditMode] = useState(false);
  const [localItems, setLocalItems] = useState<LocalItem[]>([]);
  const [savedItems, setSavedItems] = useState<any[] | null>(null); // override after save
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSectionFor, setAddingSectionFor] = useState<string | null>(null); // which category we're adding item to
  const [newItem, setNewItem] = useState<Partial<LocalItem>>({});
  const [showAddSection, setShowAddSection] = useState(false);
  const dm = DISCIPLINE_META[discipline] ?? DISCIPLINE_META["Custom"];

  const enterEdit = () => {
    if (!data) return;
    const sourceItems = savedItems ?? data.items ?? [];
    setTemplateName(data.name);
    setTemplateDesc(data.description ?? "");
    setSavedItems(null); // clear override, will reload from sourceItems
    setLocalItems(
      sourceItems.map((i: any, idx: number) => ({
        id: i.id,
        tempId: `existing-${i.id}`,
        category: i.category,
        description: i.description,
        reason: i.reason ?? "",
        codeReference: i.codeReference ?? "",
        riskLevel: i.riskLevel,
        isRequired: i.isRequired,
        orderIndex: i.orderIndex,
        dirty: false,
        isNew: false,
      }))
    );
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setLocalItems([]);
    setAddingSectionFor(null);
    setNewItem({});
    setShowAddSection(false);
  };

  const updateItem = (tempId: string, patch: Partial<LocalItem>) => {
    setLocalItems(prev =>
      prev.map(i => i.tempId === tempId ? { ...i, ...patch, dirty: true } : i)
    );
  };

  const deleteItem = (tempId: string) => {
    setLocalItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  const moveItem = (tempId: string, dir: -1 | 1) => {
    setLocalItems(prev => {
      const idx = prev.findIndex(i => i.tempId === tempId);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((item, i) => ({ ...item, orderIndex: i }));
    });
  };

  const addItemToCategory = () => {
    if (!addingSectionFor || !newItem.description?.trim()) return;
    const maxOrder = localItems.length;
    setLocalItems(prev => [
      ...prev,
      {
        tempId: `new-${Date.now()}`,
        category: addingSectionFor,
        description: newItem.description?.trim() ?? "New item",
        reason: newItem.reason ?? "",
        codeReference: newItem.codeReference ?? "",
        riskLevel: newItem.riskLevel ?? "medium",
        isRequired: newItem.isRequired ?? true,
        orderIndex: maxOrder,
        dirty: true,
        isNew: true,
      }
    ]);
    setNewItem({});
    setAddingSectionFor(null);
  };

  const addSection = () => {
    if (!newSectionName.trim()) return;
    const maxOrder = localItems.length;
    setLocalItems(prev => [
      ...prev,
      {
        tempId: `new-section-${Date.now()}`,
        category: newSectionName.trim(),
        description: "Add first item to this section",
        reason: "",
        codeReference: "",
        riskLevel: "medium",
        isRequired: true,
        orderIndex: maxOrder,
        dirty: true,
        isNew: true,
      }
    ]);
    setNewSectionName("");
    setShowAddSection(false);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Auto-commit in-progress inline form if description is filled
      let itemsToSave = localItems;
      if (addingSectionFor && newItem.description?.trim()) {
        const maxOrder = localItems.length;
        const autoItem: LocalItem = {
          tempId: `new-auto-${Date.now()}`,
          category: addingSectionFor,
          description: newItem.description.trim(),
          reason: newItem.reason ?? "",
          codeReference: newItem.codeReference ?? "",
          riskLevel: newItem.riskLevel ?? "medium",
          isRequired: newItem.isRequired ?? true,
          orderIndex: maxOrder,
          dirty: true,
          isNew: true,
        };
        itemsToSave = [...localItems, autoItem];
        setNewItem({});
        setAddingSectionFor(null);
      }

      // Save template metadata if changed
      if (templateName !== data?.name || templateDesc !== (data?.description ?? "")) {
        await apiFetch(`/api/checklist-templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: templateName, description: templateDesc }),
        });
      }

      // Upsert items
      for (const item of itemsToSave) {
        if (item.isNew) {
          await apiFetch(`/api/checklist-templates/${templateId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: item.category,
              description: item.description,
              reason: item.reason || null,
              codeReference: item.codeReference || null,
              riskLevel: item.riskLevel,
              isRequired: item.isRequired,
            }),
          });
        } else if (item.dirty && item.id) {
          await apiFetch(`/api/checklist-templates/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: item.category,
              description: item.description,
              reason: item.reason || null,
              codeReference: item.codeReference || null,
              riskLevel: item.riskLevel,
              isRequired: item.isRequired,
              orderIndex: item.orderIndex,
            }),
          });
        }
      }

      // Delete removed items (items in data.items but not in localItems)
      const localIds = new Set(itemsToSave.filter(i => !i.isNew).map(i => i.id));
      for (const orig of (data?.items ?? [])) {
        if (!localIds.has((orig as any).id)) {
          await apiFetch(`/api/checklist-templates/items/${(orig as any).id}`, { method: "DELETE" });
        }
      }

      // Set savedItems directly from what we just saved (bypass RQ cache timing)
      setSavedItems(itemsToSave.map(i => ({
        id: i.id,
        templateId,
        orderIndex: i.orderIndex,
        category: i.category,
        description: i.description,
        reason: i.reason || null,
        codeReference: i.codeReference || null,
        riskLevel: i.riskLevel,
        isRequired: i.isRequired,
      })));
      setEditMode(false);
      onSaved();
      // Invalidate cache in background so subsequent opens are fresh
      queryClient.invalidateQueries({ queryKey: [`/api/checklist-templates/${templateId}`] });
    } catch (err) {
      console.error("Save failed:", err);
    }
    setSaving(false);
  };

  const handleCopy = async () => {
    setCopying(true);
    try {
      await apiFetch(`/api/checklist-templates/${templateId}/copy`, { method: "POST" });
      onCopied();
    } catch {}
    setCopying(false);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (!data) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Checklist not found.</div>;
  }

  const meta = typeMeta(data.inspectionType);
  const displayItems = editMode ? localItems : (savedItems ?? data?.items ?? []);

  // Group by category in display order
  const categories: string[] = [];
  const grouped: Record<string, typeof displayItems> = {};
  displayItems.forEach((i: any) => {
    if (!grouped[i.category]) { grouped[i.category] = []; categories.push(i.category); }
    grouped[i.category].push(i);
  });
  const uniqueCategories = Array.from(new Set(categories));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="sticky top-0 bg-background border-b border-muted/60 px-6 py-4 flex items-start justify-between gap-4 z-10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
            <span className="text-xs text-muted-foreground">{data.itemCount} items</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${dm.accent}`}>{data.discipline}</span>
            <span className="text-xs text-muted-foreground border border-muted/60 rounded-full px-2 py-0.5">{data.folder}</span>
          </div>
          {editMode ? (
            <div className="space-y-1.5">
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="w-full text-xl font-bold text-sidebar bg-transparent border-b-2 border-secondary outline-none py-0.5"
                placeholder="Checklist name"
              />
              <input
                value={templateDesc}
                onChange={e => setTemplateDesc(e.target.value)}
                className="w-full text-sm text-muted-foreground bg-transparent border-b border-muted/60 outline-none py-0.5"
                placeholder="Description (optional)"
              />
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-sidebar">{data.name}</h2>
              {data.description && <p className="text-sm text-muted-foreground mt-1">{data.description}</p>}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {editMode ? (
            <>
              <Button size="sm" onClick={saveAll} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Changes
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>Cancel</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={enterEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopy} disabled={copying} className="gap-1.5">
                {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                Duplicate
              </Button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Items ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {uniqueCategories.length === 0 && !editMode && (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No checklist items yet</p>
            <p className="text-sm mt-1">Click <strong>Edit</strong> to add sections and items.</p>
          </div>
        )}

        {uniqueCategories.map(category => {
          const isCollapsed = collapsedSections.has(category);
          const toggleCollapse = () => setCollapsedSections(prev => {
            const next = new Set(prev);
            next.has(category) ? next.delete(category) : next.add(category);
            return next;
          });
          const itemCount = (grouped[category] ?? []).length;

          return (
            <div key={category}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="flex-1 border-t border-muted/50" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={toggleCollapse}
                    className="flex items-center gap-1.5 group"
                    title={isCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-sidebar transition-colors" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-sidebar transition-colors" />
                    }
                    {editMode ? (
                      <input
                        value={category}
                        onChange={e => {
                          const newCat = e.target.value;
                          setLocalItems(prev => prev.map(i => i.category === category ? { ...i, category: newCat, dirty: true } : i));
                        }}
                        onClick={e => e.stopPropagation()}
                        className="text-xs font-bold uppercase tracking-widest text-muted-foreground bg-transparent border-b border-secondary outline-none text-center min-w-20"
                      />
                    ) : (
                      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-sidebar transition-colors">
                        {category}
                      </h3>
                    )}
                  </button>
                  {isCollapsed && (
                    <span className="text-xs text-muted-foreground/60 ml-1">({itemCount})</span>
                  )}
                </div>
                <span className="flex-1 border-t border-muted/50" />
                {editMode && (
                  <button
                    onClick={() => { setAddingSectionFor(category); setNewItem({}); }}
                    className="text-xs text-secondary hover:text-secondary/80 flex items-center gap-1 font-medium"
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                )}
              </div>

              {/* Items — hidden when collapsed */}
              {!isCollapsed && (
                <>
                  <div className="space-y-2">
                    {(grouped[category] ?? []).map((item: any, idx: number) => (
                      editMode
                        ? <EditableItem
                            key={item.tempId}
                            item={item}
                            idx={idx}
                            total={(grouped[category] ?? []).length}
                            onChange={patch => updateItem(item.tempId, patch)}
                            onDelete={() => deleteItem(item.tempId)}
                            onMoveUp={() => moveItem(item.tempId, -1)}
                            onMoveDown={() => moveItem(item.tempId, 1)}
                          />
                        : <ReadItem key={item.id ?? `idx-${idx}`} item={item} idx={idx} />
                    ))}
                  </div>

                  {/* Inline add item form for this category */}
                  {editMode && addingSectionFor === category && (
                    <AddItemForm
                      category={category}
                      value={newItem}
                      onChange={setNewItem}
                      onAdd={addItemToCategory}
                      onCancel={() => { setAddingSectionFor(null); setNewItem({}); }}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Add section / Add item to new category */}
        {editMode && (
          <div className="pt-2 border-t border-muted/50 space-y-3">
            {showAddSection ? (
              <div className="flex items-center gap-2">
                <Heading className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addSection(); if (e.key === "Escape") setShowAddSection(false); }}
                  placeholder="Section / header name (e.g. Reinforcement)"
                  className="flex-1 text-sm border border-input rounded-md px-3 py-1.5 outline-none focus:ring-2 focus:ring-secondary/30"
                />
                <Button size="sm" onClick={addSection} disabled={!newSectionName.trim()}>Add Header</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddSection(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-sidebar border border-dashed border-muted rounded-lg px-4 py-2 transition-colors hover:border-sidebar/40"
                >
                  <Heading className="h-3.5 w-3.5" /> Add Section Header
                </button>
                {uniqueCategories.length > 0 && (
                  <button
                    onClick={() => { setAddingSectionFor(uniqueCategories[uniqueCategories.length - 1]); setNewItem({}); }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-sidebar border border-dashed border-muted rounded-lg px-4 py-2 transition-colors hover:border-sidebar/40"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </button>
                )}
                {uniqueCategories.length === 0 && (
                  <button
                    onClick={() => { setShowAddSection(true); }}
                    className="flex items-center gap-1.5 text-sm text-secondary hover:text-secondary/80 border border-secondary/40 rounded-lg px-4 py-2 transition-colors hover:border-secondary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Start by adding a section
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Read-only item ────────────────────────────────────────────────────────────
function ReadItem({ item, idx }: { item: any; idx: number }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-lg border border-muted/50 bg-card hover:bg-muted/10 transition-colors">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
        {idx + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-sidebar font-medium leading-snug">{item.description}</p>
        {item.reason && (
          <p className="text-xs text-blue-600/80 mt-1 flex items-start gap-1 italic">
            <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
            {item.reason}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {item.codeReference && (
            <span className="text-[10px] font-mono bg-sidebar/10 text-sidebar px-1.5 py-0.5 rounded border border-sidebar/20">
              {item.codeReference}
            </span>
          )}
          {!item.isRequired && (
            <span className="text-[10px] text-muted-foreground border border-muted/60 rounded px-1.5 py-0.5">Optional</span>
          )}
        </div>
      </div>
      {item.isRequired && <CheckSquare className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />}
    </div>
  );
}

// ── Editable item ─────────────────────────────────────────────────────────────
function EditableItem({
  item, idx, total, onChange, onDelete, onMoveUp, onMoveDown,
}: {
  item: LocalItem;
  idx: number;
  total: number;
  onChange: (patch: Partial<LocalItem>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-3 space-y-2 group">
      <div className="flex items-start gap-2">
        {/* Reorder arrows */}
        <div className="flex flex-col gap-0.5 mt-1 shrink-0">
          <button
            onClick={onMoveUp} disabled={idx === 0}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar disabled:opacity-20"
            title="Move up"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={onMoveDown} disabled={idx === total - 1}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar disabled:opacity-20"
            title="Move down"
          >
            <ChevronRight className="h-3 w-3 rotate-90" />
          </button>
        </div>

        {/* Main fields */}
        <div className="flex-1 space-y-2">
          {/* Description */}
          <textarea
            value={item.description}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Checklist item description…"
            rows={2}
            className="w-full text-sm text-sidebar bg-white border border-input rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-secondary/30 resize-none"
          />
          {/* Reason */}
          <div className="flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-400 mt-1.5 shrink-0" />
            <textarea
              value={item.reason}
              onChange={e => onChange({ reason: e.target.value })}
              placeholder="Reason — why is this item required? (NCC intent, safety concern…)"
              rows={1}
              className="flex-1 text-xs text-blue-700 italic bg-blue-50 border border-blue-100 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-blue-300 resize-none placeholder:text-blue-300"
            />
          </div>

          {/* Code ref + risk + required in a row */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={item.codeReference}
              onChange={e => onChange({ codeReference: e.target.value })}
              placeholder="Code ref (e.g. AS 1684.2 Cl 9)"
              className="flex-1 min-w-[140px] text-xs font-mono bg-white border border-input rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-secondary/40"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={item.isRequired}
                onChange={e => onChange({ isRequired: e.target.checked })}
                className="h-3.5 w-3.5 accent-secondary"
              />
              Required
            </label>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
          title="Delete item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Add item inline form ──────────────────────────────────────────────────────
function AddItemForm({
  category, value, onChange, onAdd, onCancel,
}: {
  category: string;
  value: Partial<LocalItem>;
  onChange: (v: Partial<LocalItem>) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border-2 border-dashed border-secondary/40 bg-secondary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-secondary flex items-center gap-1">
        <Plus className="h-3 w-3" /> New item in <em>"{category}"</em>
      </p>
      <textarea
        autoFocus
        value={value.description ?? ""}
        onChange={e => onChange({ ...value, description: e.target.value })}
        placeholder="Item description (required)…"
        rows={2}
        className="w-full text-sm bg-white border border-input rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-secondary/30 resize-none"
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAdd(); } }}
      />
      <div className="flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 text-blue-400 mt-1.5 shrink-0" />
        <textarea
          value={value.reason ?? ""}
          onChange={e => onChange({ ...value, reason: e.target.value })}
          placeholder="Reason — why is this required?"
          rows={1}
          className="flex-1 text-xs italic bg-blue-50 border border-blue-100 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-blue-300 resize-none placeholder:text-blue-300"
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={value.codeReference ?? ""}
          onChange={e => onChange({ ...value, codeReference: e.target.value })}
          placeholder="Code reference"
          className="flex-1 min-w-[120px] text-xs font-mono bg-white border border-input rounded-md px-2 py-1 outline-none"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={value.isRequired ?? true}
            onChange={e => onChange({ ...value, isRequired: e.target.checked })}
            className="h-3.5 w-3.5 accent-secondary"
          />
          Required
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onAdd}
          disabled={!value.description?.trim()}
          aria-label="Save new checklist item"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-secondary text-white hover:bg-secondary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add to Checklist
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Templates Page ───────────────────────────────────────────────────────
export default function Templates() {
  const { data: me } = useGetMe({});
  const isAdmin = (me as any)?.isAdmin ?? false;
  const userProfession: string = (me as any)?.profession ?? "";

  // Which disciplines are visible for this user
  // Admins see everything; others see only their discipline + Custom
  const KNOWN_DISCIPLINES = DISCIPLINE_ORDER.filter(d => d !== "Custom");
  const userDisciplineInList = KNOWN_DISCIPLINES.includes(userProfession);
  const visibleDisciplines: string[] = isAdmin
    ? DISCIPLINE_ORDER
    : userDisciplineInList
      ? [userProfession, "Custom"]
      : DISCIPLINE_ORDER; // profession not set or "Other" → show all

  // "Custom" discipline rename
  const [customDisciplineName, setCustomDisciplineName] = useState<string>(
    () => localStorage.getItem("customDisciplineName") ?? "Custom"
  );
  const [renamingCustom, setRenamingCustom] = useState(false);
  const [customNameDraft, setCustomNameDraft] = useState("");

  const saveCustomName = () => {
    const n = customNameDraft.trim() || "Custom";
    setCustomDisciplineName(n);
    localStorage.setItem("customDisciplineName", n);
    setRenamingCustom(false);
  };

  // The actual discipline key sent to the API for "Custom" tab
  const customApiDiscipline = customDisciplineName;

  const defaultDiscipline = !isAdmin && userDisciplineInList ? userProfession : "Building Surveyor";
  const [discipline, setDiscipline] = useState(defaultDiscipline);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["Class 1a"]));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [reordering, setReordering] = useState(false);
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [dragFolderIdx, setDragFolderIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);

  // Sync default discipline when user data loads
  useEffect(() => {
    if (me && !isAdmin && userDisciplineInList) {
      setDiscipline(userProfession);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(me as any)?.id]);

  // New Checklist modal state
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("final");
  const [newFolderMode, setNewFolderMode] = useState<"existing" | "new">("existing");
  const [newFolder, setNewFolder] = useState("");
  const [newFolderText, setNewFolderText] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  // When "Custom" tab is selected, we query using the user-defined name
  const activeDisciplineKey = discipline === "Custom" ? customApiDiscipline : discipline;

  const { data: allTemplates, isLoading, refetch } = useListChecklistTemplates(
    { discipline: activeDisciplineKey },
    { query: { queryKey: ["templates", activeDisciplineKey] } }
  );

  const templates = allTemplates ?? [];

  function toggleFolder(folder: string) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }

  const grouped: Record<string, typeof templates> = {};
  templates
    .filter(t => !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.inspectionType.toLowerCase().includes(search.toLowerCase()) ||
      t.folder.toLowerCase().includes(search.toLowerCase())
    )
    .forEach(t => {
      if (!grouped[t.folder]) grouped[t.folder] = [];
      grouped[t.folder].push(t);
    });

  const classOrder = discipline === "Building Surveyor" ? Object.keys(NCC_CLASSES) : [];

  // Derive canonical folder list from API data (alphabetical initially)
  const apiGroupedKeys = Object.keys(grouped).filter(f => !classOrder.includes(f));

  // folderOrder is the user-set order for non-BS disciplines; sync from API keys when discipline changes
  useEffect(() => {
    const saved = localStorage.getItem(`folderOrder_${activeDisciplineKey}`);
    if (saved) {
      try {
        const parsed: string[] = JSON.parse(saved);
        // Merge: keep saved order, add any new folders from API at the end
        const merged = [
          ...parsed.filter(f => apiGroupedKeys.includes(f)),
          ...apiGroupedKeys.filter(f => !parsed.includes(f)),
        ];
        setFolderOrder(merged);
        return;
      } catch {}
    }
    setFolderOrder(apiGroupedKeys);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discipline, templates.length]);

  const activeFolderKeys = discipline === "Building Surveyor"
    ? [
        ...classOrder.filter(f => !search || grouped[f] || NCC_CLASSES[f]?.toLowerCase().includes(search.toLowerCase())),
        ...apiGroupedKeys.filter(f => !classOrder.includes(f)),
      ]
    : (search
        ? folderOrder.filter(f => grouped[f])  // only folders with matching templates when searching
        : folderOrder.filter(f => apiGroupedKeys.includes(f))  // only folders that exist in DB
      );

  const folderKeys = activeFolderKeys;

  const moveTemplate = async (folder: string, idx: number, dir: -1 | 1) => {
    const items = grouped[folder] ?? [];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const updated = [...items];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setReordering(true);
    try {
      await apiFetch("/api/checklist-templates/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updated.map((t, i) => ({ id: t.id, sortOrder: i + 1 })) }),
      });
      refetch();
    } catch {}
    setReordering(false);
  };

  const moveFolder = async (fi: number, dir: -1 | 1) => {
    const newFi = fi + dir;
    if (newFi < 0 || newFi >= folderOrder.length) return;
    const next = [...folderOrder];
    [next[fi], next[newFi]] = [next[newFi], next[fi]];
    setFolderOrder(next);
    localStorage.setItem(`folderOrder_${activeDisciplineKey}`, JSON.stringify(next));
    try {
      await apiFetch("/api/checklist-templates/folder-reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discipline: activeDisciplineKey, folders: next }),
      });
    } catch {}
  };

  const dropFolder = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...folderOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setFolderOrder(next);
    localStorage.setItem(`folderOrder_${activeDisciplineKey}`, JSON.stringify(next));
    try {
      await apiFetch("/api/checklist-templates/folder-reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discipline: activeDisciplineKey, folders: next }),
      });
    } catch {}
  };

  const openNewChecklist = () => {
    setNewName("");
    setNewType("final");
    setNewFolderMode("existing");
    setNewFolder(folderKeys[0] ?? "");
    setNewFolderText("");
    setNewOpen(true);
  };

  const createChecklist = async () => {
    const chosenFolder = newFolderMode === "new" ? newFolderText.trim() : newFolder;
    if (!newName.trim() || !chosenFolder) return;
    setNewSaving(true);
    try {
      const created = await apiFetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          inspectionType: newType,
          folder: chosenFolder,
          discipline: activeDisciplineKey,
        }),
      });
      setNewOpen(false);
      // If a brand-new folder was created, add it to folderOrder
      if (newFolderMode === "new" && !folderOrder.includes(chosenFolder)) {
        const next = [...folderOrder, chosenFolder];
        setFolderOrder(next);
        localStorage.setItem(`folderOrder_${activeDisciplineKey}`, JSON.stringify(next));
      }
      refetch();
      setSelectedId(created.id);
      setOpenFolders(prev => new Set([...prev, chosenFolder]));
    } catch {
      alert("Failed to create checklist. Please try again.");
    }
    setNewSaving(false);
  };

  const deleteFolder = async (folder: string) => {
    setDeletingFolder(true);
    try {
      await apiFetch(`/api/checklist-templates/folder?discipline=${encodeURIComponent(activeDisciplineKey)}&folder=${encodeURIComponent(folder)}`, {
        method: "DELETE",
      });
      const next = folderOrder.filter(f => f !== folder);
      setFolderOrder(next);
      localStorage.setItem(`folderOrder_${activeDisciplineKey}`, JSON.stringify(next));
      if (selectedId && (grouped[folder] ?? []).some(t => t.id === selectedId)) setSelectedId(null);
      refetch();
    } catch {}
    setDeletingFolder(false);
    setConfirmDeleteFolder(null);
  };

  const dm = DISCIPLINE_META[discipline] ?? DISCIPLINE_META["Custom"];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Checklists</h1>
          <p className="text-muted-foreground mt-1">Manage inspection checklists organised by NCC building classification.</p>
        </div>
        <Button className="shadow-lg shadow-primary/20 gap-2" onClick={openNewChecklist}>
          <Plus className="h-4 w-4" /> New Checklist
        </Button>
      </div>

      {/* Discipline selector */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-sm font-medium text-muted-foreground mr-1">Discipline:</span>
        {visibleDisciplines.map(d => {
          const meta = DISCIPLINE_META[d] ?? DISCIPLINE_META["Building Surveyor"];
          const label = d === "Custom" ? customDisciplineName : d;
          const isActive = discipline === d;
          return (
            <div key={d} className="relative flex items-center gap-0.5">
              <button
                onClick={() => { setDiscipline(d); setSelectedId(null); setOpenFolders(new Set(d === "Building Surveyor" ? ["Class 1a"] : [])); }}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
                  isActive
                    ? `${meta.active} border-transparent shadow-md`
                    : "bg-card text-muted-foreground border-muted/60 hover:border-muted hover:text-sidebar"
                )}
              >
                {label}
              </button>
              {d === "Custom" && isActive && (
                <button
                  title="Rename this discipline"
                  onClick={() => { setCustomNameDraft(customDisciplineName); setRenamingCustom(true); }}
                  className="ml-1 p-1 rounded text-muted-foreground hover:text-sidebar transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {reordering && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />}
      </div>

      {/* Custom discipline rename modal */}
      {renamingCustom && (
        <Dialog open={renamingCustom} onOpenChange={v => { if (!v) setRenamingCustom(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Rename Custom Discipline</DialogTitle></DialogHeader>
            <div className="py-2 space-y-3">
              <label className="text-sm font-medium">Name</label>
              <input
                autoFocus
                value={customNameDraft}
                onChange={e => setCustomNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveCustomName(); }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="e.g. Hydraulic Engineer"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenamingCustom(false)}>Cancel</Button>
              <Button onClick={saveCustomName}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card className="shadow-md border-muted/60 overflow-hidden">
        <div className="flex divide-x divide-muted/50" style={{ minHeight: 580 }}>

          {/* ── Left: folder tree ── */}
          <div className="w-80 shrink-0 flex flex-col">
            <div className="p-3 border-b border-muted/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search checklists…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-muted/60 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {isLoading && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
                </div>
              )}
              {!isLoading && folderKeys.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No checklists found.</div>
              )}

              {folderKeys.map((folder, fi) => {
                const isOpen = openFolders.has(folder);
                const FolderIcon = isOpen ? FolderOpen : Folder;
                const items = grouped[folder] ?? [];
                const canReorder = discipline !== "Building Surveyor" && !search;
                const isConfirmingDelete = confirmDeleteFolder === folder;

                const isDragging = dragFolderIdx === fi;
                const isDragOver = dragOverIdx === fi && dragFolderIdx !== null && dragFolderIdx !== fi;

                return (
                  <div
                    key={folder}
                    className={cn("group/folder transition-all", isDragging && "opacity-40")}
                    draggable={canReorder}
                    onDragStart={canReorder ? e => {
                      setDragFolderIdx(fi);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(fi));
                    } : undefined}
                    onDragOver={canReorder ? e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverIdx(fi);
                    } : undefined}
                    onDragLeave={canReorder ? () => setDragOverIdx(null) : undefined}
                    onDrop={canReorder ? e => {
                      e.preventDefault();
                      if (dragFolderIdx !== null) dropFolder(dragFolderIdx, fi);
                      setDragFolderIdx(null);
                      setDragOverIdx(null);
                    } : undefined}
                    onDragEnd={canReorder ? () => {
                      setDragFolderIdx(null);
                      setDragOverIdx(null);
                    } : undefined}
                  >
                    {/* Drop indicator line */}
                    {isDragOver && (
                      <div className="h-0.5 mx-3 bg-secondary rounded-full mb-0.5" />
                    )}
                    <div className="flex items-center">
                      {/* Drag handle — visible on hover for non-BS disciplines */}
                      {canReorder && (
                        <div
                          className="pl-2 opacity-0 group-hover/folder:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0"
                          title="Drag to reorder"
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                      )}
                      <button
                        onClick={() => toggleFolder(folder)}
                        className={cn(
                          "flex-1 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-sidebar hover:bg-muted/40 transition-colors min-w-0",
                          canReorder && "pl-1.5",
                        )}
                      >
                        {isOpen
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                        <FolderIcon className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="flex-1 text-left truncate">{folder}</span>
                        <span className="text-xs font-normal text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full shrink-0">
                          {items.length}
                        </span>
                      </button>

                      {/* Folder controls — delete only (non-BS; reorder is now drag-and-drop) */}
                      {canReorder && (
                        <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => deleteFolder(folder)}
                                disabled={deletingFolder}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 font-semibold"
                                title="Confirm delete"
                              >
                                {deletingFolder ? "…" : "Delete"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteFolder(null)}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteFolder(folder)}
                              className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors ml-0.5"
                              title="Delete folder"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isOpen && NCC_CLASSES[folder] && (
                      <div className="mx-4 mb-1 px-2 py-1 text-[10px] text-muted-foreground bg-muted/30 rounded italic leading-snug">
                        {NCC_CLASSES[folder]}
                      </div>
                    )}

                    {isOpen && items.length === 0 && (
                      <div className="pl-10 pr-4 py-2 text-xs text-muted-foreground/60 italic">
                        No checklists — create one above
                      </div>
                    )}

                    {isOpen && items.map((t, idx) => {
                      const meta = typeMeta(t.inspectionType);
                      const isSelected = selectedId === t.id;
                      return (
                        <div key={t.id} className="group/row flex items-center">
                          <button
                            onClick={() => setSelectedId(isSelected ? null : t.id)}
                            className={cn(
                              "flex-1 flex items-center gap-2.5 pl-10 pr-1 py-2 text-sm transition-colors text-left min-w-0",
                              isSelected
                                ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                                : "text-muted-foreground hover:bg-muted/30 hover:text-sidebar"
                            )}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                            <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            <span className="flex-1 truncate">{t.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0 mr-1">{t.itemCount}</span>
                          </button>
                          <div className="flex flex-col items-center opacity-0 group-hover/row:opacity-100 transition-opacity pr-0.5">
                            <button disabled={idx === 0} onClick={() => moveTemplate(folder, idx, -1)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar disabled:opacity-20" title="Move up">
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button disabled={idx === items.length - 1} onClick={() => moveTemplate(folder, idx, 1)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar disabled:opacity-20" title="Move down">
                              <ChevronRight className="h-3 w-3 rotate-90" />
                            </button>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await apiFetch(`/api/checklist-templates/${t.id}/copy`, { method: "POST" });
                                refetch();
                              } catch {}
                            }}
                            className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 mr-1 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"
                            title="Duplicate"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-muted/50 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <span>{templates.length} checklists</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{folderKeys.length} classes</span>
              <span className="text-muted-foreground/40">·</span>
              <ArrowUpDown className="h-3 w-3" />
              <span>hover to reorder</span>
            </div>
          </div>

          {/* ── Right: detail panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedId ? (
              <TemplateDetail
                key={selectedId}
                templateId={selectedId}
                discipline={discipline}
                onClose={() => setSelectedId(null)}
                onCopied={() => refetch()}
                onSaved={() => refetch()}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 px-8">
                <ClipboardList className="h-14 w-14 opacity-20" />
                <div className="text-center">
                  <p className="font-semibold text-sidebar">Select a checklist</p>
                  <p className="text-sm mt-1">Click any checklist to view and edit its items.</p>
                  <p className="text-xs mt-3 text-muted-foreground/70">Hover a row to reorder (↑↓) or duplicate it</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── New Checklist Dialog ── */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Checklist</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div>
              <label className="text-sm font-medium text-sidebar mb-1.5 block">Checklist Name <span className="text-red-500">*</span></label>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createChecklist()}
                placeholder="e.g. Frame Stage Inspection"
                className="w-full px-3 py-2 text-sm border border-muted/60 rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Inspection Type */}
            <div>
              <label className="text-sm font-medium text-sidebar mb-1.5 block">Inspection Type</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-muted/60 rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {Object.entries(TYPE_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>

            {/* Folder assignment */}
            <div>
              <label className="text-sm font-medium text-sidebar mb-2 block">Assign to Folder <span className="text-red-500">*</span></label>
              <div className="flex gap-3 mb-2.5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    checked={newFolderMode === "existing"}
                    onChange={() => setNewFolderMode("existing")}
                    className="accent-primary"
                  />
                  Existing folder
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    checked={newFolderMode === "new"}
                    onChange={() => setNewFolderMode("new")}
                    className="accent-primary"
                  />
                  Create new folder
                </label>
              </div>

              {newFolderMode === "existing" ? (
                folderKeys.length > 0 ? (
                  <select
                    value={newFolder}
                    onChange={e => setNewFolder(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-muted/60 rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {folderKeys.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No folders yet — create a new one.</p>
                )
              ) : (
                <input
                  type="text"
                  value={newFolderText}
                  onChange={e => setNewFolderText(e.target.value)}
                  placeholder="e.g. Swimming Pool Inspections"
                  className="w-full px-3 py-2 text-sm border border-muted/60 rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setNewOpen(false)}
              className="px-4 py-2 text-sm rounded-lg border border-muted/60 text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createChecklist}
              disabled={newSaving || !newName.trim() || (newFolderMode === "existing" ? !newFolder : !newFolderText.trim())}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {newSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {newSaving ? "Creating…" : "Create Checklist"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
