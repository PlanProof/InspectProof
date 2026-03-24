import { useState, useCallback } from "react";
import { useListChecklistTemplates, useGetChecklistTemplate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, Button } from "@/components/ui";
import {
  FolderOpen, Folder, FileText, ChevronRight, ChevronDown,
  ClipboardList, CheckSquare, Plus, Search, X,
  ChevronUp, Copy, ArrowUpDown, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── NCC Building Classifications ─────────────────────────────────────────────

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
  "Class 8":   "Class 8 — Laboratory or building for production/assembly/altering/repairing/packing",
  "Class 9a":  "Class 9a — Health-care building",
  "Class 9b":  "Class 9b — Assembly building",
  "Class 9c":  "Class 9c — Residential care building",
  "Class 10a": "Class 10a — Non-habitable building (garage, carport, shed)",
  "Class 10b": "Class 10b — Fence, mast, antenna, retaining wall, swimming pool",
  "Class 10c": "Class 10c — Private bushfire shelter",
};

const DISCIPLINE_ORDER = ["Building Surveyor", "Structural Engineer", "Plumbing Officer"];

const DISCIPLINE_META: Record<string, { color: string; accent: string }> = {
  "Building Surveyor":  { color: "bg-sidebar text-white", accent: "text-secondary border-secondary" },
  "Structural Engineer":{ color: "bg-blue-700 text-white", accent: "text-blue-700 border-blue-700" },
  "Plumbing Officer":   { color: "bg-teal-700 text-white", accent: "text-teal-700 border-teal-700" },
};

// ── colours per inspection type ────────────────────────────────────────────────
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
  high:   "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low:    "bg-green-50 text-green-700 border-green-200",
  critical:"bg-orange-50 text-orange-700 border-orange-200",
};

function apiBase() { return import.meta.env.BASE_URL.replace(/\/$/, ""); }
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${apiBase()}${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Template detail panel ─────────────────────────────────────────────────────
function TemplateDetail({
  templateId,
  discipline,
  onClose,
  onCopied,
}: {
  templateId: number;
  discipline: string;
  onClose: () => void;
  onCopied: () => void;
}) {
  const { data, isLoading } = useGetChecklistTemplate(templateId);
  const [copying, setCopying] = useState(false);
  const dm = DISCIPLINE_META[discipline] ?? DISCIPLINE_META["Building Surveyor"];

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
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading template…
      </div>
    );
  }
  if (!data) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Template not found.</div>;
  }

  const meta = typeMeta(data.inspectionType);

  // Group items by category
  const categories: Record<string, typeof data.items> = {};
  (data.items ?? []).forEach((item: any) => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b border-muted/60 px-6 py-4 flex items-start justify-between gap-4 z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-xs text-muted-foreground">{data.itemCount} items</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${dm.accent}`}>
              {data.discipline}
            </span>
            <span className="text-xs text-muted-foreground border border-muted/60 rounded-full px-2 py-0.5">{data.folder}</span>
          </div>
          <h2 className="text-xl font-bold text-sidebar">{data.name}</h2>
          {data.description && (
            <p className="text-sm text-muted-foreground mt-1">{data.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={copying}
            className="gap-1.5"
          >
            {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Duplicate
          </Button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Items by category */}
      <div className="px-6 py-5 space-y-6">
        {Object.keys(categories).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No checklist items yet</p>
            <p className="text-sm mt-1">Items will appear here once added to this template.</p>
          </div>
        )}

        {Object.entries(categories).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <span className="flex-1 border-t border-muted/50" />
              {category}
              <span className="flex-1 border-t border-muted/50" />
            </h3>
            <div className="space-y-2">
              {(items ?? []).map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-muted/50 bg-card hover:bg-muted/20 transition-colors"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-sidebar font-medium leading-snug">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {item.codeReference && (
                        <span className="text-[10px] font-mono bg-sidebar/10 text-sidebar px-1.5 py-0.5 rounded border border-sidebar/20">
                          {item.codeReference}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${RISK_COLORS[item.riskLevel] ?? RISK_COLORS.medium}`}>
                        {item.riskLevel === "critical" ? "Critical Risk" : `${item.riskLevel} Risk`}
                      </span>
                      {!item.isRequired && (
                        <span className="text-[10px] text-muted-foreground">Optional</span>
                      )}
                    </div>
                  </div>
                  {item.isRequired && (
                    <CheckSquare className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Templates() {
  const [discipline, setDiscipline] = useState("Building Surveyor");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["Class 1a"]));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [reordering, setReordering] = useState(false);
  const queryClient = useQueryClient();

  const { data: allTemplates, isLoading, refetch } = useListChecklistTemplates(
    { discipline },
    { query: { queryKey: ["templates", discipline] } }
  );

  const templates = allTemplates ?? [];

  function toggleFolder(folder: string) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }

  // Group templates by NCC classification folder, keeping sortOrder
  const grouped: Record<string, typeof templates> = {};
  templates
    .filter(t => !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.inspectionType.toLowerCase().includes(search.toLowerCase()) ||
      t.folder.toLowerCase().includes(search.toLowerCase())
    )
    .forEach(t => {
      const f = t.folder ?? "Other";
      if (!grouped[f]) grouped[f] = [];
      grouped[f]!.push(t);
    });

  // Order folders by NCC class number
  const classOrder = Object.keys(NCC_CLASSES);
  const folderKeys = [
    ...classOrder.filter(f => grouped[f]),
    ...Object.keys(grouped).filter(f => !classOrder.includes(f)),
  ];

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
        body: JSON.stringify({
          items: updated.map((t, i) => ({ id: t.id, sortOrder: i + 1 })),
        }),
      });
      refetch();
    } catch {}
    setReordering(false);
  };

  const dm = DISCIPLINE_META[discipline] ?? DISCIPLINE_META["Building Surveyor"];
  const totalCount = templates.length;

  return (
    <AppLayout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage inspection checklist templates organised by NCC building classification.
          </p>
        </div>
        <Button className="shadow-lg shadow-primary/20 gap-2">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Discipline selector */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-sm font-medium text-muted-foreground mr-1">Discipline:</span>
        {DISCIPLINE_ORDER.map(d => (
          <button
            key={d}
            onClick={() => { setDiscipline(d); setSelectedId(null); setOpenFolders(new Set(["Class 1a"])); }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
              discipline === d
                ? `${dm.color} border-transparent shadow-md`
                : "bg-card text-muted-foreground border-muted/60 hover:border-muted hover:text-sidebar"
            )}
          >
            {d}
          </button>
        ))}
        {reordering && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />}
      </div>

      {/* Content: 2-panel layout */}
      <Card className="shadow-md border-muted/60 overflow-hidden">
        <div className="flex divide-x divide-muted/50" style={{ minHeight: 580 }}>

          {/* ── Left: folder tree ── */}
          <div className="w-80 shrink-0 flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-muted/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search templates…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-muted/60 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            {/* Folder tree */}
            <div className="flex-1 overflow-y-auto py-2">
              {isLoading && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
                </div>
              )}
              {!isLoading && folderKeys.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No templates found.</div>
              )}

              {folderKeys.map(folder => {
                const isOpen = openFolders.has(folder);
                const FolderIcon = isOpen ? FolderOpen : Folder;
                const items = grouped[folder] ?? [];
                const nccDesc = NCC_CLASSES[folder];

                return (
                  <div key={folder}>
                    {/* Folder row */}
                    <button
                      onClick={() => toggleFolder(folder)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-sidebar hover:bg-muted/40 transition-colors group"
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

                    {/* NCC description shown when folder open */}
                    {isOpen && nccDesc && (
                      <div className="mx-4 mb-1 px-2 py-1 text-[10px] text-muted-foreground bg-muted/30 rounded italic leading-snug">
                        {nccDesc}
                      </div>
                    )}

                    {/* Template rows */}
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
                          {/* Move up/down + copy controls */}
                          <div className="flex flex-col items-center opacity-0 group-hover/row:opacity-100 transition-opacity pr-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => moveTemplate(folder, idx, -1)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar disabled:opacity-20"
                              title="Move up"
                            >
                              <ChevronUp className="h-3 w-3" />
                            </button>
                            <button
                              disabled={idx === items.length - 1}
                              onClick={() => moveTemplate(folder, idx, 1)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar disabled:opacity-20"
                              title="Move down"
                            >
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
                            title="Duplicate template"
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

            {/* Footer */}
            <div className="border-t border-muted/50 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <span>{totalCount} templates</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{folderKeys.length} classifications</span>
              <span className="text-muted-foreground/40">·</span>
              <ArrowUpDown className="h-3 w-3" />
              <span>hover row to reorder</span>
            </div>
          </div>

          {/* ── Right: detail panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedId ? (
              <TemplateDetail
                templateId={selectedId}
                discipline={discipline}
                onClose={() => setSelectedId(null)}
                onCopied={() => { refetch(); }}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 px-8">
                <ClipboardList className="h-14 w-14 opacity-20" />
                <div className="text-center">
                  <p className="font-semibold text-sidebar">Select a template</p>
                  <p className="text-sm mt-1">Click any template in the folder tree to view its checklist items.</p>
                  <p className="text-xs mt-3 text-muted-foreground/70">
                    Hover a template row to reorder (↑↓) or duplicate it
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </Card>
    </AppLayout>
  );
}
