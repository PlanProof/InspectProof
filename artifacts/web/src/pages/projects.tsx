import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListProjects, useCreateProject, CreateProjectRequestProjectType } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Search, Plus, Building, ChevronDown, ChevronUp, ChevronsUpDown, X, AlertTriangle, TrendingUp, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { AddressAutocomplete, type AddressFields } from "@/components/AddressAutocomplete";
import { useAuth } from "@/hooks/use-auth";

// ── NCC Building Classifications ─────────────────────────────────────────────

const BUILDING_CLASSES = [
  { value: "Class 1a", label: "Class 1a", description: "Single dwelling — detached house, townhouse, villa" },
  { value: "Class 1b", label: "Class 1b", description: "Small boarding house, hostel, or bed & breakfast" },
  { value: "Class 2",  label: "Class 2",  description: "Apartment / multi-residential (2+ sole-occupancy units above each other)" },
  { value: "Class 3",  label: "Class 3",  description: "Residential — motel, backpacker, dormitory, residential care" },
  { value: "Class 4",  label: "Class 4",  description: "Sole occupancy unit within a non-residential building" },
  { value: "Class 5",  label: "Class 5",  description: "Office building" },
  { value: "Class 6",  label: "Class 6",  description: "Shop, retail, café, or restaurant" },
  { value: "Class 7a", label: "Class 7a", description: "Carpark" },
  { value: "Class 7b", label: "Class 7b", description: "Storage building or warehouse" },
  { value: "Class 8",  label: "Class 8",  description: "Laboratory, factory, or production facility" },
  { value: "Class 9a", label: "Class 9a", description: "Health care building — hospital, day surgery" },
  { value: "Class 9b", label: "Class 9b", description: "Assembly — theatre, school, stadium, gym" },
  { value: "Class 9c", label: "Class 9c", description: "Aged care residential building" },
  { value: "Class 10a", label: "Class 10a", description: "Private garage, carport, or shed" },
  { value: "Class 10b", label: "Class 10b", description: "Fence, mast, antenna, retaining wall, swimming pool" },
  { value: "Class 10c", label: "Class 10c", description: "Private bushfire shelter" },
];

// ── API helpers ───────────────────────────────────────────────────────────────

function baseUrl() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("inspectproof_token") ?? "";
  return fetch(`${baseUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  }).then(async r => {
    const body = await r.json();
    if (!r.ok) throw body;
    return body;
  });
}

// ── Subscription hook ─────────────────────────────────────────────────────────

function useSubscription() {
  return useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => apiFetch("/api/billing/subscription"),
    staleTime: 30_000,
  });
}

// ── Status tabs ───────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "active",    label: "Active" },
  { key: "on_hold",  label: "On Hold" },
  { key: "completed",label: "Completed" },
  { key: "archived", label: "Archived" },
  { key: "all",      label: "All" },
] as const;

type StatusTab = typeof STATUS_TABS[number]["key"];

// ── Multi-select Building Classification ──────────────────────────────────────

function BuildingClassSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (cls: string) => {
    onChange(value.includes(cls) ? value.filter(v => v !== cls) : [...value, cls]);
  };

  const remove = (cls: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== cls));
  };

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${open ? "ring-2 ring-ring" : ""}`}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {value.length === 0 ? (
            <span className="text-muted-foreground">Select building class(es)…</span>
          ) : (
            value.map(cls => (
              <span
                key={cls}
                className="inline-flex items-center gap-1 bg-secondary/15 text-secondary border border-secondary/30 rounded px-1.5 py-0.5 text-xs font-semibold leading-none"
              >
                {cls}
                <button
                  type="button"
                  onClick={e => remove(cls, e)}
                  className="hover:text-red-500 transition-colors ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1 w-full rounded-lg border border-border bg-popover shadow-md overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {BUILDING_CLASSES.map(cls => {
              const selected = value.includes(cls.value);
              return (
                <button
                  key={cls.value}
                  type="button"
                  onClick={() => toggle(cls.value)}
                  className={`flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors ${selected ? "bg-secondary/8" : ""}`}
                >
                  <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    selected ? "bg-secondary border-secondary" : "border-muted-foreground/40"
                  }`}>
                    {selected && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3 text-white fill-none stroke-white stroke-[2]">
                        <polyline points="1.5,6 4.5,9 10.5,3" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-sidebar">{cls.label}</span>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5">{cls.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/50 px-3 py-2 flex items-center justify-between bg-muted/20">
            <span className="text-xs text-muted-foreground">{value.length > 0 ? `${value.length} selected` : "None selected"}</span>
            <div className="flex items-center gap-3">
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-secondary hover:text-secondary/80 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────

function ProjectUsageBar({ current, max, planLabel }: { current: number; max: number | null; planLabel: string }) {
  const [, navigate] = useLocation();
  if (max === null) return null;

  const pct = Math.min((current / max) * 100, 100);
  const atLimit = current >= max;
  const nearLimit = pct >= 80 && !atLimit;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2.5 border-b text-sm",
      atLimit ? "bg-red-50 border-red-200" : nearLimit ? "bg-amber-50 border-amber-200" : "bg-muted/10 border-border"
    )}>
      <div className={cn(
        "flex items-center gap-1.5 shrink-0 font-medium",
        atLimit ? "text-red-700" : nearLimit ? "text-amber-700" : "text-muted-foreground"
      )}>
        {atLimit || nearLimit ? <AlertTriangle className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
        <span>Projects used:</span>
      </div>
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 max-w-32 bg-muted/40 rounded-full h-1.5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              atLimit ? "bg-red-500" : nearLimit ? "bg-amber-400" : "bg-secondary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn(
          "font-semibold tabular-nums",
          atLimit ? "text-red-700" : nearLimit ? "text-amber-700" : "text-sidebar"
        )}>
          {current} / {max}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        <span>{planLabel} plan</span>
        {atLimit && (
          <>
            <span>·</span>
            <button
              onClick={() => navigate("/billing")}
              className="text-secondary font-semibold hover:underline"
            >
              upgrade plan
            </button>
          </>
        )}
        {nearLimit && !atLimit && (
          <>
            <span>·</span>
            <button
              onClick={() => navigate("/billing")}
              className="text-amber-700 font-semibold hover:underline"
            >
              upgrade plan
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Projects() {
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("all");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: projects, isLoading, refetch } = useListProjects({});
  const { data: subscription } = useSubscription();
  const [isNewOpen, setIsNewOpen] = useState(false);

  const canCreateProject = !user || user.isAdmin || user.isCompanyAdmin || (user.permissions?.createProjects ?? false);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const maxProjects: number | null = subscription?.limits?.maxProjects ?? null;
  const activeCount: number = subscription?.usage?.projects ?? 0;
  const atLimit = maxProjects !== null && activeCount >= maxProjects;
  const planLabel: string = subscription?.limits?.label ?? "";

  // Derive unique orgs from project data for filter dropdown
  const orgOptions = (() => {
    const seen = new Map<string, string>();
    for (const p of projects ?? []) {
      const key = p.orgAdminId != null ? String(p.orgAdminId) : null;
      const name = p.orgName ?? null;
      if (key && name && !seen.has(key)) seen.set(key, name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  })();
  const isMultiOrg = orgOptions.length > 1;

  const tabFiltered = projects?.filter(p => {
    if (statusTab === "all") return true;
    return p.status === statusTab;
  });

  const filtered = tabFiltered?.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.siteAddress.toLowerCase().includes(search.toLowerCase());
    const matchesOrg = selectedOrgId === "all" || String(p.orgAdminId) === selectedOrgId;
    return matchesSearch && matchesOrg;
  });

  const sorted = [...(filtered ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "name":             return a.name.localeCompare(b.name) * dir;
      case "projectType":      return a.projectType.localeCompare(b.projectType) * dir;
      case "status":           return a.status.localeCompare(b.status) * dir;
      case "stage":            return a.stage.localeCompare(b.stage) * dir;
      case "clientName":       return (a.clientName ?? "").localeCompare(b.clientName ?? "") * dir;
      case "totalInspections": return ((a.totalInspections ?? 0) - (b.totalInspections ?? 0)) * dir;
      default: return 0;
    }
  });

  const tabCounts = projects ? {
    active:    projects.filter(p => p.status === "active").length,
    on_hold:   projects.filter(p => p.status === "on_hold").length,
    completed: projects.filter(p => p.status === "completed").length,
    archived:  projects.filter(p => p.status === "archived").length,
    all:       projects.length,
  } : null;

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage construction projects and certifications.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateProject && (
            atLimit ? (
              <div className="relative group">
                <Button disabled className="shadow-lg shadow-primary/20 opacity-50 cursor-not-allowed">
                  <Plus className="mr-2 h-4 w-4" /> New Project
                </Button>
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-popover border border-border rounded-lg shadow-lg p-3 text-sm hidden group-hover:block z-10">
                  <p className="font-medium text-sidebar mb-1">Project limit reached</p>
                  <p className="text-muted-foreground text-xs mb-2">
                    Your {planLabel} plan allows up to {maxProjects} project{maxProjects === 1 ? "" : "s"}.
                    Upgrade your plan to create more.
                  </p>
                  <button
                    onClick={() => navigate("/billing")}
                    className="text-xs text-secondary font-semibold hover:underline"
                  >
                    View upgrade options →
                  </button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setIsNewOpen(true)} className="shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" /> New Project
              </Button>
            )
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Usage bar */}
        {subscription && (
          <ProjectUsageBar
            current={activeCount}
            max={maxProjects}
            planLabel={planLabel}
          />
        )}

        {/* Status tabs */}
        <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-border/60 bg-muted/10 overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tabCounts?.[tab.key];
            const isActive = statusTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px",
                  isActive
                    ? "border-secondary text-secondary"
                    : "border-transparent text-muted-foreground hover:text-sidebar hover:border-border"
                )}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className={cn(
                    "text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none",
                    isActive ? "bg-secondary/15 text-secondary" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search bar */}
        <div className="p-4 border-b flex flex-wrap items-center gap-3 bg-muted/10">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          {isMultiOrg && (
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground shrink-0" />
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="text-sm border border-input rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-secondary/30 transition"
              >
                <option value="all">All Organisations</option>
                {orgOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading projects...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col="name" label="Project" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                {statusTab === "all" && (
                  <SortableHead col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                )}
                <SortableHead col="stage" label="Stage" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="clientName" label="Client" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="totalInspections" label="Inspections" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                {isMultiOrg && selectedOrgId === "all" && (
                  <TableHead className="text-xs text-muted-foreground">Organisation</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((project) => {
                const isInactive = project.status === "archived" || project.status === "completed";
                return (
                  <TableRow
                    key={project.id}
                    className={cn(
                      "group cursor-pointer hover:bg-muted/50",
                      isInactive && "opacity-50"
                    )}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <TableCell>
                      <Link href={`/projects/${project.id}`} className="block" onClick={e => e.stopPropagation()}>
                        <div className="font-semibold text-sidebar group-hover:text-secondary transition-colors flex items-center gap-2">
                          {project.name}
                          {project.name === "Test Project" && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide">Test</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {project.siteAddress}, {project.suburb}
                        </div>
                      </Link>
                    </TableCell>
                    {statusTab === "all" && (
                      <TableCell>
                        <StatusBadge status={project.status} />
                      </TableCell>
                    )}
                    <TableCell className="capitalize text-sm">{project.stage.replace('_', ' ')}</TableCell>
                    <TableCell>{project.clientName}</TableCell>
                    <TableCell className="text-right font-medium">{project.totalInspections}</TableCell>
                    {isMultiOrg && selectedOrgId === "all" && (
                      <TableCell>
                        {project.orgName && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted border border-border/60 text-muted-foreground">
                            <Network className="h-2.5 w-2.5" />
                            {project.orgName}
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                    {search
                      ? `No projects found matching "${search}"`
                      : statusTab === "archived"
                        ? "No archived projects yet. Archive a project from its detail page to hide it from the active list."
                        : statusTab === "completed"
                          ? "No completed projects yet."
                          : statusTab === "on_hold"
                            ? "No projects currently on hold."
                            : "No active projects. Create your first project to get started."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <NewProjectDialog
        open={isNewOpen}
        onOpenChange={setIsNewOpen}
        onSuccess={() => { refetch(); }}
        atLimit={atLimit}
        maxProjects={maxProjects}
        planLabel={planLabel}
      />
    </AppLayout>
  );
}

// ── Sortable table header ─────────────────────────────────────────────────────

function SortableHead({ col, label, sortCol, sortDir, onSort, className }: {
  col: string; label: string; sortCol: string; sortDir: "asc" | "desc";
  onSort: (col: string) => void; className?: string;
}) {
  const active = sortCol === col;
  return (
    <TableHead className={cn("cursor-pointer select-none group", className)} onClick={() => onSort(col)}>
      <div className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === "asc"
            ? <ChevronUp className="h-3.5 w-3.5 text-secondary" />
            : <ChevronDown className="h-3.5 w-3.5 text-secondary" />
          : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />}
      </div>
    </TableHead>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "success" | "warning" | "secondary"> = {
    active: "success",
    on_hold: "warning",
    completed: "default",
    archived: "secondary"
  };
  return (
    <Badge variant={map[status] || "default"} className="capitalize">
      {status.replace('_', ' ')}
    </Badge>
  );
}

// ── New project dialog ────────────────────────────────────────────────────────

const PROJECT_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "other", label: "Other" },
];

function NewProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  atLimit,
  maxProjects,
  planLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
  atLimit: boolean;
  maxProjects: number | null;
  planLabel: string;
}) {
  const [, navigate] = useLocation();
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classError, setClassError] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [address, setAddress] = useState<AddressFields>({ siteAddress: "", suburb: "", state: "", postcode: "" });
  const [addressError, setAddressError] = useState(false);

  const resetForm = () => {
    setSelectedClasses([]);
    setClassError(false);
    setLimitError(null);
    setAddressError(false);
    setAddress({ siteAddress: "", suburb: "", state: "", postcode: "" });
  };

  const mutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        onSuccess();
        onOpenChange(false);
        resetForm();
      },
      onError: (err: any) => {
        const body = err?.data ?? err;
        if (body?.error === "project_limit_reached") {
          setLimitError(body.message ?? "Project limit reached. Upgrade your plan to create more.");
        }
      }
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedClasses.length === 0) {
      setClassError(true);
      return;
    }
    if (!address.siteAddress.trim()) {
      setAddressError(true);
      return;
    }
    setClassError(false);
    setAddressError(false);
    setLimitError(null);
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string)?.trim() || undefined;
    mutation.mutate({
      data: {
        name: fd.get('name') as string,
        siteAddress: address.siteAddress,
        suburb: address.suburb,
        state: address.state,
        postcode: address.postcode,
        clientName: fd.get('clientName') as string,
        ownerName: get('ownerName') ?? null,
        buildingClassification: selectedClasses.join(", "),
        projectType: ((fd.get('projectType') as string) || "residential") as CreateProjectRequestProjectType,
        referenceNumber: get('referenceNumber') ?? null,
        daNumber: get('daNumber') ?? null,
        builderName: get('builderName') ?? null,
        designerName: get('designerName') ?? null,
        startDate: get('startDate') ?? null,
        expectedCompletionDate: get('expectedCompletionDate') ?? null,
        notes: get('notes') ?? null,
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>

        {/* Limit warning banner inside dialog */}
        {(atLimit || limitError) && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-700">
                {limitError ?? `Project limit reached on your ${planLabel} plan`}
              </p>
              {maxProjects !== null && (
                <p className="text-xs text-red-600 mt-0.5">
                  Your plan allows up to {maxProjects} project{maxProjects === 1 ? "" : "s"} total.
                  Upgrade your plan to create more.
                </p>
              )}
              <button
                onClick={() => { onOpenChange(false); navigate("/billing"); }}
                className="text-xs font-semibold text-secondary hover:underline mt-1 block"
              >
                View upgrade options →
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Core details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project Name <span className="text-red-500">*</span></Label>
              <Input name="name" required placeholder="e.g. Smith Residence" />
            </div>
            <div className="space-y-2">
              <Label>
                Reference Number
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(auto-generated if blank)</span>
              </Label>
              <Input name="referenceNumber" placeholder="e.g. PRJ-0001" />
            </div>
            <div className="space-y-2">
              <Label>Client Name <span className="text-red-500">*</span></Label>
              <Input name="clientName" required />
            </div>
            <div className="space-y-2">
              <Label>Owner Name <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input name="ownerName" placeholder="Property owner" />
            </div>
            <div className="space-y-2">
              <Label>Builder Name <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input name="builderName" />
            </div>
            <div className="space-y-2">
              <Label>Designer Name <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input name="designerName" />
            </div>
            <div className="col-span-2">
              <AddressAutocomplete
                value={address}
                onChange={(f) => { setAddress(f); if (f.siteAddress.trim()) setAddressError(false); }}
              />
              {addressError && !address.siteAddress.trim() && (
                <p className="text-xs text-red-500 mt-1">Please enter a site address.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Project Type</Label>
              <select name="projectType" defaultValue="residential" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {PROJECT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>
                Building Classification
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">Select all that apply</span>
              </Label>
              <BuildingClassSelect value={selectedClasses} onChange={v => { setSelectedClasses(v); if (v.length > 0) setClassError(false); }} />
              {classError && (
                <p className="text-xs text-red-500 mt-1">Please select at least one building classification.</p>
              )}
            </div>
          </div>

          {/* Application details */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Application Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Development Application Number <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input name="daNumber" placeholder="e.g. DA2024/1234" />
              </div>
              <div className="space-y-2">
                <Label>Start Date <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input name="startDate" type="date" />
              </div>
              <div className="space-y-2">
                <Label>Expected Completion <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <Input name="expectedCompletionDate" type="date" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t pt-4">
            <div className="space-y-2">
              <Label>Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <textarea
                name="notes"
                rows={3}
                placeholder="Add any project notes here…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || atLimit}>
              {mutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
