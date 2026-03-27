import { useState, useEffect } from "react";
import { useListInspections, useListProjects, useListUsers, useCreateInspection } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui";
import { Search, Calendar as CalendarIcon, CheckCircle2, XCircle, Clock, Plus, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useLocation } from "wouter";

const INSPECTION_TYPES = [
  { group: "Building Certification", items: [
    { value: "footings",        label: "Footings" },
    { value: "slab",            label: "Slab" },
    { value: "frame",           label: "Frame" },
    { value: "pre_plaster",     label: "Pre-Plaster" },
    { value: "waterproofing",   label: "Waterproofing" },
    { value: "lock_up",         label: "Lock-Up" },
    { value: "pool_barrier",    label: "Pool Barrier" },
    { value: "final",           label: "Final" },
    { value: "special",         label: "Special" },
  ]},
  { group: "Builder / Quality Control", items: [
    { value: "qc_footing",      label: "QC — Footings" },
    { value: "qc_frame",        label: "QC — Frame" },
    { value: "qc_fitout",       label: "QC — Fit-Out" },
    { value: "qc_pre_handover", label: "QC — Pre-Handover" },
    { value: "non_conformance", label: "Non-Conformance" },
  ]},
  { group: "Site Supervision", items: [
    { value: "hold_point",      label: "Hold Point" },
    { value: "daily_site",      label: "Daily Site Diary" },
    { value: "trade_inspection",label: "Trade Inspection" },
  ]},
  { group: "WHS", items: [
    { value: "safety_inspection",  label: "Safety Inspection" },
    { value: "hazard_assessment",  label: "Hazard Assessment" },
    { value: "incident_inspection",label: "Incident Investigation" },
    { value: "toolbox",            label: "Toolbox Talk Record" },
  ]},
  { group: "Pre-Purchase", items: [
    { value: "pre_purchase_building", label: "Building Inspection" },
    { value: "pre_purchase_pest",     label: "Pest Inspection" },
    { value: "pre_purchase_combined", label: "Combined Building & Pest" },
  ]},
  { group: "Fire Safety", items: [
    { value: "fire_active",     label: "Active Systems Inspection" },
    { value: "fire_passive",    label: "Passive Systems Inspection" },
    { value: "annual_fire_safety", label: "Annual Fire Safety Statement" },
    { value: "fire_egress",     label: "Egress & Evacuation" },
  ]},
  { group: "Structural Engineering", items: [
    { value: "structural_footing", label: "Structural — Footings" },
    { value: "structural_frame",   label: "Structural — Frame" },
    { value: "structural_final",   label: "Structural — Final" },
  ]},
  { group: "Plumbing", items: [
    { value: "plumbing",        label: "Plumbing" },
    { value: "drainage",        label: "Drainage" },
    { value: "pressure_test",   label: "Pressure Test" },
  ]},
];

const STATUS_FILTERS = ["all", "scheduled", "in_progress", "completed"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// ── New Inspection Dialog ──────────────────────────────────────────────────────
function NewInspectionDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: projects } = useListProjects({});
  const { data: users } = useListUsers({});
  const createInspection = useCreateInspection();

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    projectId: "",
    inspectionType: "",
    scheduledDate: today,
    scheduledTime: "",
    inspectorId: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [allocatedTypes, setAllocatedTypes] = useState<{ templateId: number; name: string; inspectionType: string; folder: string }[]>([]);

  const isCustom = form.projectId === "custom";

  useEffect(() => {
    if (!form.projectId || isCustom) { setAllocatedTypes([]); return; }
    const token = localStorage.getItem("inspectproof_token");
    fetch(`/api/projects/${form.projectId}/inspection-types`, {
      headers: token ? { Authorization: `Basic ${token}` } : {},
    })
      .then(r => r.json())
      .then((data: any[]) => setAllocatedTypes(data.filter(t => t.isSelected)))
      .catch(() => setAllocatedTypes([]));
  }, [form.projectId]);

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val, ...(key === "projectId" ? { inspectionType: "" } : {}) }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.projectId) { setError("Please select a project or Custom."); return; }
    if (!form.inspectionType) { setError("Please select an inspection type."); return; }
    if (!form.scheduledDate) { setError("Please set a scheduled date."); return; }
    setSubmitting(true);
    try {
      await createInspection.mutateAsync({
        data: {
          ...(isCustom ? {} : { projectId: Number(form.projectId) }),
          inspectionType: form.inspectionType,
          scheduledDate: form.scheduledDate,
          scheduledTime: form.scheduledTime || undefined,
          inspectorId: form.inspectorId ? Number(form.inspectorId) : undefined,
          notes: form.notes || undefined,
        } as any,
      });
      onCreated();
      handleClose();
    } catch {
      setError("Failed to create inspection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm({ projectId: "", inspectionType: "", scheduledDate: today, scheduledTime: "", inspectorId: "", notes: "" });
    setError("");
    onClose();
  }

  const INSPECTOR_ROLES = ["inspector", "building_inspector", "certifier", "admin"];
  const inspectors = users?.filter((u: any) => INSPECTOR_ROLES.includes(u.role)) ?? [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sidebar text-lg font-bold flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-secondary/10 text-secondary">
              <Plus className="h-4 w-4" />
            </span>
            New Inspection
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-1 space-y-4">
          {/* Project */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Project <span className="text-red-500">*</span></label>
            <div className="relative">
              <select
                value={form.projectId}
                onChange={e => set("projectId", e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50 pr-9"
              >
                <option value="">Select a project…</option>
                <option value="custom">Custom (no project)</option>
                {projects?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Inspection Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Inspection Type <span className="text-red-500">*</span></label>
            <div className="relative">
              <select
                value={form.inspectionType}
                onChange={e => set("inspectionType", e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50 pr-9"
              >
                <option value="">Select type…</option>
                {form.projectId && allocatedTypes.length > 0 ? (
                  Array.from(new Set(allocatedTypes.map(t => t.folder))).sort().map(folder => (
                    <optgroup key={folder} label={folder}>
                      {allocatedTypes.filter(t => t.folder === folder).map(t => (
                        <option key={t.templateId} value={t.inspectionType}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))
                ) : (
                  INSPECTION_TYPES.map(group => (
                    <optgroup key={group.group} label={group.group}>
                      {group.items.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.scheduledDate}
                onChange={e => set("scheduledDate", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Time <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
              <input
                type="time"
                value={form.scheduledTime}
                onChange={e => set("scheduledTime", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50"
              />
            </div>
          </div>

          {/* Inspector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Inspector <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
            <div className="relative">
              <select
                value={form.inspectorId}
                onChange={e => set("inspectorId", e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar focus:outline-none focus:ring-2 focus:ring-secondary/50 pr-9"
              >
                <option value="">Unassigned</option>
                {inspectors.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-sidebar uppercase tracking-wide">Notes <span className="text-muted-foreground font-normal normal-case">(optional)</span></label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Any notes for this inspection…"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-sidebar placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-secondary/50 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 gap-2 bg-secondary hover:bg-secondary/90 text-white"
            >
              {submitting ? "Creating…" : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Inspection
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Inspections() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [, navigate] = useLocation();
  const { data: inspections, isLoading, refetch } = useListInspections({});

  const filtered = inspections?.filter(i => {
    const matchesSearch =
      i.projectName.toLowerCase().includes(search.toLowerCase()) ||
      i.inspectionType.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Inspections Register</h1>
          <p className="text-muted-foreground mt-1">Track and manage all field inspections.</p>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          className="gap-2 bg-secondary hover:bg-secondary/90 text-white shadow-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New Inspection
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center gap-4 bg-muted/20">
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by project or type..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "scheduled", "in_progress", "completed"] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s
                    ? "bg-secondary text-white border-secondary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading inspections...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date / Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Inspector</TableHead>
                <TableHead className="text-right">Results</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No inspections found.
                  </TableCell>
                </TableRow>
              ) : filtered?.map((insp) => (
                <TableRow
                  key={insp.id}
                  className="cursor-pointer hover:bg-muted/50 group"
                  onClick={() => navigate(`/inspections/${insp.id}`)}
                >
                  <TableCell className="font-medium text-sidebar group-hover:text-secondary transition-colors">{insp.projectName}</TableCell>
                  <TableCell className="capitalize">{insp.inspectionType.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(insp.scheduledDate)}
                      {insp.scheduledTime && <span className="text-muted-foreground ml-1">at {insp.scheduledTime}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <InspectionStatusBadge status={insp.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{insp.inspectorName || "Unassigned"}</TableCell>
                  <TableCell className="text-right">
                    {insp.status === 'completed' ? (
                      <div className="flex items-center justify-end gap-2 text-xs font-medium">
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> {insp.passCount}</span>
                        <span className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3"/> {insp.failCount}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs flex items-center justify-end gap-1"><Clock className="h-3 w-3"/> Pending</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <NewInspectionDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => { refetch(); }}
      />
    </AppLayout>
  );
}

function InspectionStatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "success" | "warning" | "secondary" | "destructive"> = {
    scheduled: "secondary",
    in_progress: "warning",
    completed: "success",
    follow_up_required: "destructive",
    cancelled: "default"
  };
  return (
    <Badge variant={map[status] || "default"} className="capitalize shadow-sm">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
