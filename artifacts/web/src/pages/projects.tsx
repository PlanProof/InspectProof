import { useState, useRef, useEffect } from "react";
import { useListProjects, useCreateProject } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Search, Plus, Building, ChevronDown, ChevronUp, ChevronsUpDown, X } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

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

// ── Multi-select Building Classification ─────────────────────────────────────

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
      {/* Trigger */}
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

      {/* Dropdown — inline (no absolute) so dialog overflow doesn't clip it */}
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

export default function Projects() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();
  const { data: projects, isLoading, refetch } = useListProjects({});
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filtered = projects?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.siteAddress.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage construction projects and certifications.</p>
        </div>
        <Button onClick={() => setIsNewOpen(true)} className="shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center gap-4 bg-muted/20">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading projects...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col="name" label="Project" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="stage" label="Stage" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="clientName" label="Client" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="totalInspections" label="Inspections" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((project) => (
                <TableRow
                  key={project.id}
                  className="group cursor-pointer hover:bg-muted/50"
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
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="capitalize text-sm">{project.stage.replace('_', ' ')}</TableCell>
                  <TableCell>{project.clientName}</TableCell>
                  <TableCell className="text-right font-medium">{project.totalInspections}</TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                    No projects found matching "{search}"
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <NewProjectDialog open={isNewOpen} onOpenChange={setIsNewOpen} onSuccess={refetch} />
    </AppLayout>
  );
}

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

function NewProjectDialog({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (o: boolean) => void, onSuccess: () => void }) {
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [classError, setClassError] = useState(false);

  const mutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        onSuccess();
        onOpenChange(false);
        setSelectedClasses([]);
        setClassError(false);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedClasses.length === 0) {
      setClassError(true);
      return;
    }
    setClassError(false);
    const fd = new FormData(e.currentTarget);
    const daNumber = (fd.get('daNumber') as string)?.trim();
    mutation.mutate({
      data: {
        name: fd.get('name') as string,
        siteAddress: fd.get('siteAddress') as string,
        suburb: fd.get('suburb') as string,
        state: fd.get('state') as string,
        postcode: fd.get('postcode') as string,
        clientName: fd.get('clientName') as string,
        buildingClassification: selectedClasses.join(", "),
        projectType: fd.get('projectType') as any,
        ...(daNumber ? { daNumber } : {}),
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setSelectedClasses([]); setClassError(false); } }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input name="name" required placeholder="e.g. Smith Residence" />
            </div>
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input name="clientName" required />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Site Address</Label>
              <Input name="siteAddress" required />
            </div>
            <div className="space-y-2">
              <Label>Suburb</Label>
              <Input name="suburb" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>State</Label>
                <Input name="state" required defaultValue="NSW" />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input name="postcode" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input name="projectType" placeholder="e.g. Dwelling, Shed" />
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

          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Application Details</p>
            <div className="space-y-2 max-w-sm">
              <Label>
                Development Application Number
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input name="daNumber" placeholder="e.g. DA2024/1234" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
