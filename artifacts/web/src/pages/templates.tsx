import { useState } from "react";
import { useListChecklistTemplates, useGetChecklistTemplate } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import {
  FolderOpen, Folder, FileText, ChevronRight, ChevronDown,
  ClipboardList, AlertTriangle, CheckSquare, Plus, Search, X
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── colours per inspection type ────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; color: string; dot: string }> = {
  footing:      { label: "Footing",      color: "bg-amber-100 text-amber-800 border-amber-200",  dot: "bg-amber-500" },
  slab:         { label: "Slab",         color: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  frame:        { label: "Frame",        color: "bg-blue-100 text-blue-800 border-blue-200",      dot: "bg-blue-500" },
  waterproofing:{ label: "Waterproofing",color: "bg-cyan-100 text-cyan-800 border-cyan-200",      dot: "bg-cyan-500" },
  occupancy:    { label: "Occupancy",    color: "bg-purple-100 text-purple-800 border-purple-200",dot: "bg-purple-500" },
  final:        { label: "Final",        color: "bg-green-100 text-green-800 border-green-200",   dot: "bg-green-500" },
  fire_safety:  { label: "Fire Safety",  color: "bg-red-100 text-red-800 border-red-200",         dot: "bg-red-500" },
  pool_barrier: { label: "Pool Barrier", color: "bg-teal-100 text-teal-800 border-teal-200",      dot: "bg-teal-500" },
};
function typeMeta(type: string) {
  const key = Object.keys(TYPE_META).find(k => type?.toLowerCase().includes(k)) ?? "";
  return TYPE_META[key] ?? { label: type, color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
}

const RISK_COLORS: Record<string, string> = {
  high:   "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low:    "bg-green-50 text-green-700 border-green-200",
};

// ─── Template detail panel ───────────────────────────────────────────────────
function TemplateDetail({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const { data, isLoading } = useGetChecklistTemplate(templateId);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading template…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Template not found.
      </div>
    );
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
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.label}
            </span>
            <span className="text-xs text-muted-foreground">{data.itemCount} items</span>
          </div>
          <h2 className="text-xl font-bold text-sidebar">{data.name}</h2>
          {data.description && (
            <p className="text-sm text-muted-foreground mt-1">{data.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
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
              {items.map((item: any, idx: number) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-muted/50 bg-card hover:bg-muted/20 transition-colors group"
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
                        {item.riskLevel} risk
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

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Templates() {
  const { data: templates, isLoading } = useListChecklistTemplates();
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["Dwelling", "Shed"]));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  function toggleFolder(folder: string) {
    setOpenFolders(prev => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }

  // Group templates by folder
  const grouped: Record<string, typeof templates> = {};
  (templates ?? [])
    .filter(t =>
      !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.inspectionType.toLowerCase().includes(search.toLowerCase())
    )
    .forEach(t => {
      const f = t.folder ?? "Other";
      if (!grouped[f]) grouped[f] = [];
      grouped[f]!.push(t);
    });

  const FOLDER_ORDER = ["Dwelling", "Shed"];
  const folderKeys = [
    ...FOLDER_ORDER.filter(f => grouped[f]),
    ...Object.keys(grouped).filter(f => !FOLDER_ORDER.includes(f)),
  ];

  const FOLDER_ICONS: Record<string, any> = {
    Dwelling: FolderOpen,
    Shed: FolderOpen,
  };

  return (
    <AppLayout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage inspection checklist templates organised by building type.
          </p>
        </div>
        <Button className="shadow-lg shadow-primary/20 gap-2">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Content: 2-panel layout */}
      <Card className="shadow-md border-muted/60 overflow-hidden">
        <div className="flex divide-x divide-muted/50" style={{ minHeight: 560 }}>

          {/* ── Left: folder tree ── */}
          <div className="w-72 shrink-0 flex flex-col">
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
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
              )}
              {!isLoading && folderKeys.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No templates found.</div>
              )}

              {folderKeys.map(folder => {
                const isOpen = openFolders.has(folder);
                const FolderIcon = isOpen ? FolderOpen : Folder;
                const items = grouped[folder] ?? [];

                return (
                  <div key={folder}>
                    {/* Folder row */}
                    <button
                      onClick={() => toggleFolder(folder)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-sidebar hover:bg-muted/40 transition-colors group"
                    >
                      {isOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                      <FolderIcon className="h-4 w-4 text-amber-500" />
                      <span className="flex-1 text-left">{folder}</span>
                      <span className="text-xs font-normal text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
                        {items.length}
                      </span>
                    </button>

                    {/* Template rows */}
                    {isOpen && items.map(t => {
                      const meta = typeMeta(t.inspectionType);
                      const isSelected = selectedId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedId(isSelected ? null : t.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 pl-10 pr-3 py-2 text-sm transition-colors text-left",
                            isSelected
                              ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                              : "text-muted-foreground hover:bg-muted/30 hover:text-sidebar"
                          )}
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                          <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          <span className="flex-1 truncate">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{t.itemCount}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer count */}
            <div className="border-t border-muted/50 px-4 py-2 text-xs text-muted-foreground">
              {(templates ?? []).length} templates total
            </div>
          </div>

          {/* ── Right: detail panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedId ? (
              <TemplateDetail
                templateId={selectedId}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 px-8">
                <ClipboardList className="h-14 w-14 opacity-20" />
                <div className="text-center">
                  <p className="font-semibold text-sidebar">Select a template</p>
                  <p className="text-sm mt-1">Click any template in the folder tree to view its checklist items.</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </Card>
    </AppLayout>
  );
}
