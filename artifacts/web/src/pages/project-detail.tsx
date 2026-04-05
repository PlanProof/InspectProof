import React, { useState, useRef, useCallback, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { AddressAutocomplete, type AddressFields } from "@/components/AddressAutocomplete";
import {
  Button, Badge, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import {
  ArrowLeft, Building, FileText, ClipboardList, CheckSquare, Plus, Upload,
  FolderPlus, Pencil, Trash2, Archive, Eye, EyeOff, File, Folder, FolderOpen,
  ChevronRight, ChevronDown, Calendar, Clock, CheckCircle, CheckCircle2, AlertCircle, XCircle, MoreHorizontal,
  Download, Mail, Loader2, Link2, Unlink, Award, Send, BarChart2,
  Smartphone, X, Info, ZoomIn, User as UserIcon, ShieldCheck, UserCheck, Paperclip
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useListUsers, useCreateInspection, useGetMe, type User } from "@workspace/api-client-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectDoc {
  id: number;
  projectId: number;
  name: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  fileUrl?: string;
  folder: string;
  includedInInspection: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InspectionRecord {
  id: number;
  inspectionType: string;
  status: string;
  scheduledDate: string;
  completedDate?: string;
  notes?: string;
  createdAt: string;
  checklistTemplateId?: number;
  checklistTemplateName?: string;
}

interface InspectionTypeRow {
  templateId: number;
  name: string;
  inspectionType: string;
  folder: string;
  discipline: string;
  itemCount: number;
  isSelected: boolean;
}

interface Project {
  id: number;
  referenceNumber?: string;
  name: string;
  siteAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  clientName: string;
  ownerName?: string;
  builderName?: string;
  designerName?: string;
  daNumber?: string;
  certificationNumber?: string;
  buildingClassification: string;
  projectType: string;
  status: string;
  stage: string;
  notes?: string;
  assignedCertifierId?: number;
  assignedInspectorId?: number;
  startDate?: string;
  expectedCompletionDate?: string;
  totalInspections: number;
  openIssues: number;
  inspections: InspectionRecord[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("inspectproof_token") ?? "";
  const res = await fetch(`${apiBase()}${path}`, {
    ...opts,
    headers: {
      ...(opts?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Strip " Template" suffix from checklist template names when used as inspection type labels
function cleanTypeName(name: string) {
  return name.replace(/\s+template$/i, "").trim();
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inspectionStatusIcon(status: string) {
  if (status === "completed" || status === "passed") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "in_progress") return <Clock className="h-4 w-4 text-amber-500" />;
  return <Calendar className="h-4 w-4 text-blue-500" />;
}

function inspectionStatusBadge(status: string) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    passed: "bg-green-50 text-green-700 border-green-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${map[status] || "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

const TABS = ["Overview", "Inspection Types", "Inspections", "Reports", "Documents", "Contractors", "Inductions", "Activity"] as const;
type Tab = typeof TABS[number];

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("Overview");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/projects/${projectId}`);
      setProject(data);
    } catch {
      setError("Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useState(() => { loadProject(); });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
      navigate("/projects");
    } catch {
      setDeleting(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      });
      navigate("/projects");
    } catch {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading project…
        </div>
      </AppLayout>
    );
  }

  if (error || !project) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">{error || "Project not found"}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-6">
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-sidebar mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-sidebar">{project.name}</h1>
              <StatusBadge status={project.status} />
              {project.name === "Test Project" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide">Test</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5" />
              {project.siteAddress}, {project.suburb} {project.state} {project.postcode}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-medium text-sidebar">{project.totalInspections} Inspections</div>
              <div className="text-muted-foreground">{project.openIssues} open issues</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="text-gray-600 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
                onClick={() => setArchiveOpen(true)}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                Archive
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Project
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b mb-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-secondary text-secondary"
                : "border-transparent text-muted-foreground hover:text-sidebar"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "Overview" && <OverviewTab project={project} onRefresh={loadProject} onGoToContacts={() => setTab("Contractors")} />}
      {tab === "Contractors" && <ContractorsTab projectId={projectId} projectName={project.name} />}
      {tab === "Documents" && <DocumentsTab projectId={projectId} />}
      {tab === "Inspections" && <InspectionsTab project={project} onRefresh={loadProject} />}
      {tab === "Inspection Types" && <InspectionTypesTab projectId={projectId} />}
      {tab === "Reports" && <ReportsTab projectId={projectId} project={project} />}
      {tab === "Inductions" && <InductionsTab projectId={projectId} />}
      {tab === "Activity" && <ActivityTab projectId={projectId} />}

      {/* Archive Confirmation Dialog */}
      <Dialog open={archiveOpen} onOpenChange={open => { if (!archiving) setArchiveOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-700">
              <Archive className="h-5 w-5" />
              Archive Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to archive{" "}
              <span className="font-semibold text-sidebar">"{project.name}"</span>?
            </p>
            <p className="text-sm text-muted-foreground">
              Archived projects are hidden from the active project list. No data will be deleted and the project can be restored at any time.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-gray-700 hover:bg-gray-800 text-white"
              onClick={handleArchive}
              disabled={archiving}
            >
              {archiving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Archive className="h-4 w-4 mr-1.5" />}
              {archiving ? "Archiving…" : "Archive Project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={open => { if (!deleting) setDeleteOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              You are about to permanently delete{" "}
              <span className="font-semibold text-sidebar">"{project.name}"</span>.
            </p>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">This will permanently remove:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>All inspections and their checklist results</li>
                <li>All issues and notes</li>
                <li>All uploaded documents</li>
                <li>All reports and activity history</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting…</> : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete Permanently</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-50 text-green-700 border-green-200",
    on_hold: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-gray-50 text-gray-600 border-gray-200",
    archived: "bg-gray-50 text-gray-400 border-gray-200",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${map[status] || "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Building Classification multi-select ──────────────────────────────────────

const BUILDING_CLASSES = [
  { value: "Class 1a",  label: "Class 1a",  description: "Single dwelling — detached house, townhouse, villa" },
  { value: "Class 1b",  label: "Class 1b",  description: "Small boarding house, hostel, or bed & breakfast" },
  { value: "Class 2",   label: "Class 2",   description: "Apartment / multi-residential (2+ sole-occupancy units above each other)" },
  { value: "Class 3",   label: "Class 3",   description: "Residential — motel, backpacker, dormitory, residential care" },
  { value: "Class 4",   label: "Class 4",   description: "Sole occupancy unit within a non-residential building" },
  { value: "Class 5",   label: "Class 5",   description: "Office building" },
  { value: "Class 6",   label: "Class 6",   description: "Shop, retail, café, or restaurant" },
  { value: "Class 7a",  label: "Class 7a",  description: "Carpark" },
  { value: "Class 7b",  label: "Class 7b",  description: "Storage building or warehouse" },
  { value: "Class 8",   label: "Class 8",   description: "Laboratory, factory, or production facility" },
  { value: "Class 9a",  label: "Class 9a",  description: "Health care building — hospital, day surgery" },
  { value: "Class 9b",  label: "Class 9b",  description: "Assembly — theatre, school, stadium, gym" },
  { value: "Class 9c",  label: "Class 9c",  description: "Aged care residential building" },
  { value: "Class 10a", label: "Class 10a", description: "Private garage, carport, or shed" },
  { value: "Class 10b", label: "Class 10b", description: "Fence, mast, antenna, retaining wall, swimming pool" },
  { value: "Class 10c", label: "Class 10c", description: "Private bushfire shelter" },
];

function BuildingClassSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (cls: string) =>
    onChange(value.includes(cls) ? value.filter(v => v !== cls) : [...value, cls]);

  return (
    <div ref={ref} className="relative">
      {/* Use div (not button) as trigger to avoid nested-button HTML violation */}
      <div
        role="combobox"
        aria-expanded={open}
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
        className={`flex min-h-9 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring select-none ${open ? "ring-2 ring-ring" : ""}`}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {value.length === 0 ? (
            <span className="text-muted-foreground text-sm">Select building class(es)…</span>
          ) : (
            value.map(cls => (
              <span key={cls} className="inline-flex items-center gap-1 bg-secondary/15 text-secondary border border-secondary/30 rounded px-1.5 py-0.5 text-xs font-semibold leading-none">
                {cls}
                <button type="button" onClick={e => { e.stopPropagation(); onChange(value.filter(v => v !== cls)); }} className="hover:text-red-500 transition-colors ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {BUILDING_CLASSES.map(cls => {
              const selected = value.includes(cls.value);
              return (
                <button key={cls.value} type="button" onClick={() => toggle(cls.value)}
                  className={`flex items-start gap-3 w-full px-3 py-2 text-left hover:bg-muted/40 transition-colors ${selected ? "bg-secondary/8" : ""}`}
                >
                  <span className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${selected ? "bg-secondary border-secondary" : "border-muted-foreground/40"}`}>
                    {selected && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3 fill-none stroke-white stroke-[2]">
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
          {value.length > 0 && (
            <div className="border-t border-border/50 px-3 py-2 flex items-center justify-between bg-muted/20">
              <span className="text-xs text-muted-foreground">{value.length} selected</span>
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Type options ──────────────────────────────────────────────────────

const PROJECT_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "industrial", label: "Industrial" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "other", label: "Other" },
];

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project, onRefresh, onGoToContacts }: { project: Project; onRefresh: () => void; onGoToContacts?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [, navigate] = useLocation();
  const [bookOpen, setBookOpen] = useState(false);
  const { data: users } = useListUsers({});
  const [projectContacts, setProjectContacts] = useState<ProjectContractor[]>([]);

  const [editingClasses, setEditingClasses] = useState<string[]>(
    project.buildingClassification ? project.buildingClassification.split(",").map(s => s.trim()).filter(Boolean) : []
  );
  const [editingAddress, setEditingAddress] = useState<AddressFields>({
    siteAddress: project.siteAddress,
    suburb: project.suburb,
    state: project.state,
    postcode: project.postcode,
  });

  const certifiers: User[] = users?.filter((u) => u.role === "certifier" || u.role === "admin") ?? [];
  const inspectors: User[] = users?.filter((u) => u.role === "inspector" || u.role === "admin") ?? [];

  useEffect(() => {
    apiFetch(`/api/projects/${project.id}/contractors`).then(setProjectContacts).catch(() => {});
  }, [project.id]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const data: any = {};
    fd.forEach((v, k) => { data[k] = v === "" ? null : v; });
    data.buildingClassification = editingClasses.join(", ");
    data.siteAddress = editingAddress.siteAddress;
    data.suburb = editingAddress.suburb;
    data.state = editingAddress.state;
    data.postcode = editingAddress.postcode;
    if (data.assignedCertifierId) data.assignedCertifierId = parseInt(data.assignedCertifierId);
    if (data.assignedInspectorId) data.assignedInspectorId = parseInt(data.assignedInspectorId);
    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await onRefresh();
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("handleSave failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const projectTypeLabel = PROJECT_TYPES.find(t => t.value === project.projectType)?.label ?? project.projectType;

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${editing ? "pb-80" : ""}`}>
      {/* Main details */}
      <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-sidebar">Project Details</h2>
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 animate-in fade-in slide-in-from-left-2 duration-200">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1.5,6 4.5,9 10.5,3" /></svg>
                Changes saved
              </span>
            )}
          </div>
          <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => {
            if (editing) {
              setEditingClasses(project.buildingClassification ? project.buildingClassification.split(",").map(s => s.trim()).filter(Boolean) : []);
              setEditingAddress({ siteAddress: project.siteAddress, suburb: project.suburb, state: project.state, postcode: project.postcode });
            }
            setEditing(!editing);
          }}>
            {editing ? "Cancel" : <><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</>}
          </Button>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Project Name</Label>
                <Input name="name" defaultValue={project.name} className="h-8 text-sm" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reference Number</Label>
                <Input name="referenceNumber" defaultValue={project.referenceNumber || ""} className="h-8 text-sm" placeholder="e.g. PRJ-0001" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Name</Label>
                <Input name="clientName" defaultValue={project.clientName} className="h-8 text-sm" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Owner Name</Label>
                <Input name="ownerName" defaultValue={project.ownerName || ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Builder Name</Label>
                <Input name="builderName" defaultValue={project.builderName || ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Designer Name</Label>
                <Input name="designerName" defaultValue={project.designerName || ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">DA Number</Label>
                <Input name="daNumber" defaultValue={project.daNumber || ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Certification Number</Label>
                <Input name="certificationNumber" defaultValue={project.certificationNumber || ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project Type</Label>
                <select name="projectType" defaultValue={project.projectType} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <select name="status" defaultValue={project.status} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stage</Label>
                <select name="stage" defaultValue={project.stage} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="pre_construction">Pre-Construction</option>
                  <option value="footing">Footing</option>
                  <option value="slab">Slab</option>
                  <option value="frame">Frame</option>
                  <option value="lock_up">Lock Up</option>
                  <option value="fit_out">Fit Out</option>
                  <option value="final">Final</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned Certifier</Label>
                <select name="assignedCertifierId" defaultValue={project.assignedCertifierId ?? ""} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">— Unassigned —</option>
                  {certifiers.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned Inspector</Label>
                <select name="assignedInspectorId" defaultValue={project.assignedInspectorId ?? ""} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">— Unassigned —</option>
                  {inspectors.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input name="startDate" type="date" defaultValue={project.startDate || ""} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expected Completion</Label>
                <Input name="expectedCompletionDate" type="date" defaultValue={project.expectedCompletionDate || ""} className="h-8 text-sm" />
              </div>
            </div>

            {/* Building Classification — full width multi-select */}
            <div className="space-y-1.5">
              <Label className="text-xs">Building Classification</Label>
              <BuildingClassSelect value={editingClasses} onChange={setEditingClasses} />
              {editingClasses.length === 0 && (
                <p className="text-xs text-amber-600">Please select at least one classification.</p>
              )}
            </div>

            {/* Address — full width autocomplete */}
            <AddressAutocomplete
              value={editingAddress}
              onChange={setEditingAddress}
              compact
            />

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={project.notes || ""}
                placeholder="Add project notes…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                setEditing(false);
                setEditingClasses(project.buildingClassification ? project.buildingClassification.split(",").map(s => s.trim()).filter(Boolean) : []);
                setEditingAddress({ siteAddress: project.siteAddress, suburb: project.suburb, state: project.state, postcode: project.postcode });
              }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {project.referenceNumber && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Reference Number</div>
                <div className="font-medium text-sidebar font-mono">{project.referenceNumber}</div>
              </div>
            )}
            {/* Client — linked to owner/client contacts */}
            {(() => {
              const linked = projectContacts.filter(c => c.contactRole === "owner");
              return (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Client</div>
                  <div className="font-medium text-sidebar">{project.clientName || "—"}</div>
                  {linked.map(c => (
                    <div key={c.id} className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {c.isPrimary && <span className="text-[9px] font-bold px-1 rounded bg-secondary/15 text-secondary border border-secondary/30 uppercase tracking-wide">Primary</span>}
                      <span className="text-xs text-muted-foreground">{c.name}</span>
                      {c.email && <span className="text-xs text-muted-foreground">· {c.email}</span>}
                      {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
            {project.ownerName && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Owner</div>
                <div className="font-medium text-sidebar">{project.ownerName}</div>
              </div>
            )}
            {/* Builder */}
            {(() => {
              const linked = projectContacts.filter(c => c.contactRole === "builder");
              return (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Builder</div>
                  <div className="font-medium text-sidebar">{project.builderName || "—"}</div>
                  {linked.map(c => (
                    <div key={c.id} className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {c.isPrimary && <span className="text-[9px] font-bold px-1 rounded bg-secondary/15 text-secondary border border-secondary/30 uppercase tracking-wide">Primary</span>}
                      <span className="text-xs text-muted-foreground">{c.name}</span>
                      {c.email && <span className="text-xs text-muted-foreground">· {c.email}</span>}
                      {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
            {/* Designer */}
            {(() => {
              const linked = projectContacts.filter(c => c.contactRole === "designer");
              return (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Designer</div>
                  <div className="font-medium text-sidebar">{project.designerName || "—"}</div>
                  {linked.map(c => (
                    <div key={c.id} className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {c.isPrimary && <span className="text-[9px] font-bold px-1 rounded bg-secondary/15 text-secondary border border-secondary/30 uppercase tracking-wide">Primary</span>}
                      <span className="text-xs text-muted-foreground">{c.name}</span>
                      {c.email && <span className="text-xs text-muted-foreground">· {c.email}</span>}
                      {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
            {[
              { label: "Project Type", value: projectTypeLabel },
              { label: "DA Number", value: project.daNumber || "—" },
              { label: "Certification / DA Number", value: project.certificationNumber || "—" },
              { label: "Stage", value: project.stage?.replace(/_/g, " ") },
              { label: "Start Date", value: project.startDate ? formatDate(project.startDate) : "—" },
              { label: "Expected Completion", value: project.expectedCompletionDate ? formatDate(project.expectedCompletionDate) : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                <div className="font-medium text-sidebar capitalize">{value}</div>
              </div>
            ))}
            {/* Staff assignment */}
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Assigned Certifier</div>
              <div className="font-medium text-sidebar">
                {project.assignedCertifierId
                  ? (() => {
                      const u = certifiers.find((c) => c.id === project.assignedCertifierId);
                      return u ? `${u.firstName} ${u.lastName}` : `ID: ${project.assignedCertifierId}`;
                    })()
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Assigned Inspector</div>
              <div className="font-medium text-sidebar">
                {project.assignedInspectorId
                  ? (() => {
                      const u = inspectors.find((c) => c.id === project.assignedInspectorId);
                      return u ? `${u.firstName} ${u.lastName}` : `ID: ${project.assignedInspectorId}`;
                    })()
                  : "—"}
              </div>
            </div>
            {/* Primary contact summary */}
            {projectContacts.some(c => c.isPrimary) && (
              <div className="col-span-2 pt-1 border-t border-border/50 mt-1">
                <div className="text-xs text-muted-foreground mb-1.5">Primary Contact</div>
                {projectContacts.filter(c => c.isPrimary).map(c => (
                  <div key={c.id} className="flex items-center gap-2 flex-wrap">
                    <UserIcon className="h-3.5 w-3.5 text-secondary" />
                    <span className="text-sm font-medium text-sidebar">{c.name}</span>
                    {c.contactRole && <span className="text-xs text-violet-700">{contactRoleLabel(c.contactRole)}</span>}
                    {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                    {c.phone && <span className="text-xs text-muted-foreground">· {c.phone}</span>}
                    {onGoToContacts && (
                      <button onClick={onGoToContacts} className="text-xs text-secondary hover:underline ml-1">Manage contacts →</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Building Classification — full width row with pill badges */}
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground mb-1.5">Building Classification</div>
              <div className="flex flex-wrap gap-1.5">
                {(project.buildingClassification || "").split(",").map(s => s.trim()).filter(Boolean).map(cls => (
                  <span key={cls} className="inline-flex items-center bg-secondary/15 text-secondary border border-secondary/30 rounded px-2 py-0.5 text-xs font-semibold">
                    {cls}
                  </span>
                ))}
                {!project.buildingClassification && <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            {/* Notes */}
            {project.notes && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <p className="text-sm text-sidebar whitespace-pre-wrap">{project.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats sidebar */}
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-sidebar mb-3">Quick Stats</h3>
          <div className="space-y-3">
            {[
              { label: "Total Inspections", value: project.totalInspections, color: "text-secondary" },
              { label: "Open Issues", value: project.openIssues, color: "text-red-500" },
            ].map(s => (
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-sidebar">Recent Inspections</h3>
            <button
              onClick={() => setBookOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:text-secondary/80 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Book
            </button>
          </div>
          {project.inspections.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">No inspections yet</p>
              <button
                onClick={() => setBookOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sidebar text-white hover:bg-sidebar/90 transition-colors"
              >
                <Calendar className="h-3.5 w-3.5" /> Book First Inspection
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {project.inspections.slice(0, 4).map(i => (
                <button
                  key={i.id}
                  onClick={() => navigate(`/inspections/${i.id}`)}
                  className="w-full flex items-center gap-2 text-sm rounded-lg p-1.5 -mx-1.5 hover:bg-muted/50 transition-colors group text-left"
                >
                  {inspectionStatusIcon(i.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sidebar capitalize truncate group-hover:text-secondary transition-colors">{i.checklistTemplateName ? cleanTypeName(i.checklistTemplateName) : i.inspectionType.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(i.scheduledDate)}</div>
                  </div>
                  {inspectionStatusBadge(i.status)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <BookInspectionDialog
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        projectId={project.id}
        projectName={project.name}
        onCreated={onRefresh}
      />
    </div>
  );
}

// ── Documents Tab ─────────────────────────────────────────────────────────────

function DocumentsTab({ projectId }: { projectId: number }) {
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["General"]));
  const [renamingDoc, setRenamingDoc] = useState<ProjectDoc | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [linkingDoc, setLinkingDoc] = useState<ProjectDoc | null>(null);
  const [docLinkCounts, setDocLinkCounts] = useState<Record<number, number>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ProjectDoc | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/projects/${projectId}/documents`);
      setDocs(data);
      // Load link counts for all docs
      const links = await apiFetch(`/api/projects/${projectId}/documents-with-links`).catch(() => []);
      const counts: Record<number, number> = {};
      for (const d of links) counts[d.id] = d.linkedItemIds?.length ?? 0;
      setDocLinkCounts(counts);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useState(() => { loadDocs(); });

  const folders = Array.from(new Set([
    "General",
    ...docs.map(d => d.folder),
    ...extraFolders,
  ])).sort();

  const toggleFolder = (f: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
    setSelectedFolder(f);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const folder = selectedFolder || "General";
    try {
      for (const file of Array.from(files)) {
        const { objectPath } = await apiFetch("/api/storage/uploads/file", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        await apiFetch(`/api/projects/${projectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            fileUrl: objectPath,
            folder,
            includedInInspection: true,
          }),
        });
      }
      await loadDocs();
    } catch {
    } finally {
      setUploading(false);
    }
  };

  const toggleVisibility = async (doc: ProjectDoc) => {
    try {
      await apiFetch(`/api/projects/${projectId}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includedInInspection: !doc.includedInInspection }),
      });
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, includedInInspection: !d.includedInInspection } : d));
    } catch {}
  };

  const renameDoc = async (doc: ProjectDoc, newName: string) => {
    if (!newName.trim()) return;
    try {
      const updated = await apiFetch(`/api/projects/${projectId}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
    } catch {}
    setRenamingDoc(null);
  };

  const renameFolder = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) { setRenamingFolder(null); return; }
    try {
      await apiFetch(`/api/projects/${projectId}/documents/folders/${encodeURIComponent(oldName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: newName.trim() }),
      });
      setDocs(prev => prev.map(d => d.folder === oldName ? { ...d, folder: newName.trim() } : d));
      setExtraFolders(prev => prev.map(f => f === oldName ? newName.trim() : f));
    } catch {}
    setRenamingFolder(null);
  };

  const deleteDoc = async (doc: ProjectDoc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      await apiFetch(`/api/projects/${projectId}/documents/${doc.id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch {}
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setExtraFolders(prev => [...new Set([...prev, name])]);
    setExpandedFolders(prev => new Set([...prev, name]));
    setSelectedFolder(name);
    setNewFolderDialogOpen(false);
    setNewFolderName("");
  };

  const activeDocs = selectedFolder ? docs.filter(d => d.folder === selectedFolder) : docs;

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  const isImageDoc = (doc: ProjectDoc) => doc.mimeType?.startsWith("image/") ?? false;

  return (
    <div
      className="flex flex-col gap-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Mobile inspection info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-secondary/10 border border-secondary/20 text-sm text-secondary">
        <Smartphone className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>
          Documents uploaded here are available to inspectors in the mobile app during inspections.
          Toggle the <span className="inline-flex items-center gap-1 font-semibold"><Smartphone className="h-3.5 w-3.5" /> In App</span> icon on each document to control visibility.
        </span>
      </div>

      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/20 backdrop-blur-sm pointer-events-none">
          <div className="bg-card border-2 border-dashed border-secondary rounded-2xl px-16 py-12 flex flex-col items-center gap-3 shadow-xl">
            <Upload className="h-10 w-10 text-secondary animate-bounce" />
            <p className="text-lg font-semibold text-sidebar">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">Files will be added to {selectedFolder || "General"}</p>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {previewDoc && isImageDoc(previewDoc) && previewDoc.fileUrl && (
        <Dialog open={true} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/90 border-none">
            <button
              onClick={() => setPreviewDoc(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="absolute top-3 left-3 z-10 text-white/80 text-sm font-medium truncate max-w-xs">{previewDoc.name}</p>
            <img
              src={`${apiBase()}/api/storage${previewDoc.fileUrl}`}
              alt={previewDoc.name}
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
          </DialogContent>
        </Dialog>
      )}

      <div className="flex gap-5 min-h-[500px]">
      {/* Folder tree */}
      <div className="w-56 flex-shrink-0 bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Folders</span>
          <button
            onClick={() => setNewFolderDialogOpen(true)}
            className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-sidebar transition-colors"
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-2">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${!selectedFolder ? "bg-secondary/10 text-secondary font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            <FileText className="h-3.5 w-3.5" />
            All Documents
            <span className="ml-auto text-xs text-muted-foreground">{docs.length}</span>
          </button>
          {folders.map(folder => {
            const count = docs.filter(d => d.folder === folder).length;
            const expanded = expandedFolders.has(folder);
            const active = selectedFolder === folder;
            return (
              <div key={folder}>
                <button
                  onClick={() => toggleFolder(folder)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${active ? "bg-secondary/10 text-secondary font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
                >
                  <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  {expanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 text-amber-500" />}
                  {renamingFolder === folder ? (
                    <input
                      autoFocus
                      defaultValue={folder}
                      className="flex-1 bg-transparent border-b border-secondary outline-none text-sm"
                      onBlur={e => renameFolder(folder, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") renameFolder(folder, (e.target as HTMLInputElement).value);
                        if (e.key === "Escape") setRenamingFolder(null);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 text-left truncate">{folder}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{count}</span>
                  {folder !== "General" && (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-sidebar"
                      onClick={e => { e.stopPropagation(); setRenamingFolder(folder); }}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedFolder ? (
              <>
                <FolderOpen className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-sm text-sidebar">{selectedFolder}</span>
                <button
                  className="ml-1 p-1 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"
                  onClick={() => setRenamingFolder(selectedFolder)}
                  title="Rename folder"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            ) : (
              <span className="font-medium text-sm text-sidebar">All Documents ({docs.length})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => handleUpload(e.target.files)}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Upload
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : activeDocs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 py-12">
            <File className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm">No documents in {selectedFolder || "this project"}</p>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Document
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-center">
                    <span className="flex items-center justify-center gap-1" title="Documents visible in the mobile inspection app">
                      <Smartphone className="h-3.5 w-3.5" /> In App
                    </span>
                  </TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeDocs.map(doc => (
                  <TableRow key={doc.id} className="group">
                    <TableCell>
                      {renamingDoc?.id === doc.id ? (
                        <input
                          autoFocus
                          defaultValue={doc.name}
                          className="border border-secondary rounded px-2 py-0.5 text-sm w-full outline-none"
                          onBlur={e => renameDoc(doc, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") renameDoc(doc, (e.target as HTMLInputElement).value);
                            if (e.key === "Escape") setRenamingDoc(null);
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          {isImageDoc(doc) && doc.fileUrl ? (
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="relative flex-shrink-0 group/thumb"
                              title="Preview image"
                            >
                              <img
                                src={`${apiBase()}/api/storage${doc.fileUrl}`}
                                alt={doc.name}
                                className="h-8 w-8 rounded object-cover border border-border"
                              />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/thumb:opacity-100 rounded transition-opacity">
                                <ZoomIn className="h-3 w-3 text-white" />
                              </span>
                            </button>
                          ) : (
                            <FileTypeIcon mimeType={doc.mimeType} />
                          )}
                          <span className="font-medium text-sm text-sidebar">{doc.name}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <select
                        value={doc.folder}
                        className="text-xs border border-input rounded px-1.5 py-0.5 bg-background"
                        onChange={async e => {
                          const updated = await apiFetch(`/api/projects/${projectId}/documents/${doc.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ folder: e.target.value }),
                          });
                          setDocs(prev => prev.map(d => d.id === doc.id ? updated : d));
                        }}
                      >
                        {folders.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatBytes(doc.fileSize)}</TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => toggleVisibility(doc)}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors"
                        title={doc.includedInInspection ? "Visible in inspection — click to hide" : "Hidden from inspection — click to show"}
                      >
                        {doc.includedInInspection
                          ? <Smartphone className="h-4 w-4 text-green-500" />
                          : <Smartphone className="h-4 w-4 text-muted-foreground/40" />}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Checklist link badge — always visible */}
                        <button
                          onClick={() => setLinkingDoc(doc)}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                            (docLinkCounts[doc.id] ?? 0) > 0
                              ? "bg-secondary/10 text-secondary hover:bg-secondary/20"
                              : "text-muted-foreground/50 hover:text-secondary hover:bg-secondary/10"
                          }`}
                          title="Link to checklist items"
                        >
                          <Link2 className="h-3 w-3" />
                          {(docLinkCounts[doc.id] ?? 0) > 0 && (
                            <span>{docLinkCounts[doc.id]}</span>
                          )}
                        </button>
                        {/* Other actions - fade in on hover */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isImageDoc(doc) && doc.fileUrl && (
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"
                              title="Preview"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {doc.fileUrl && (
                            <a
                              href={`${apiBase()}/api/storage${doc.fileUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"
                              title="Download / Open"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => setRenamingDoc(doc)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteDoc(doc)}
                            className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      </div>{/* end flex gap-5 inner row */}

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createFolder(); }}
            />
            <div className="flex gap-2">
              <Button onClick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
              <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checklist Link Dialog */}
      {linkingDoc && (
        <ChecklistLinkDialog
          projectId={projectId}
          doc={linkingDoc}
          onClose={() => setLinkingDoc(null)}
          onSaved={(docId, count) => {
            setDocLinkCounts(prev => ({ ...prev, [docId]: count }));
            setLinkingDoc(null);
          }}
        />
      )}
    </div>
  );
}

// ── Checklist Link Dialog ─────────────────────────────────────────────────────

interface ChecklistItemGroup { templateId: number; templateName: string; inspectionType: string; items: any[]; }

function ChecklistLinkDialog({
  projectId, doc, onClose, onSaved
}: {
  projectId: number;
  doc: ProjectDoc;
  onClose: () => void;
  onSaved: (docId: number, count: number) => void;
}) {
  const [groups, setGroups] = useState<ChecklistItemGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemGroups, linkedIds] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/checklist-items`),
        apiFetch(`/api/projects/${projectId}/documents/${doc.id}/checklist-links`),
      ]);
      setGroups(itemGroups);
      setSelectedIds(new Set(linkedIds));
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId, doc.id]);

  useState(() => { load(); });

  const toggle = (itemId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/projects/${projectId}/documents/${doc.id}/checklist-links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(selectedIds) }),
      });
      onSaved(doc.id, selectedIds.size);
    } catch {
      setSaving(false);
    }
  };

  const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-secondary" />
            Link to Checklist Items
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            <span className="font-medium text-sidebar">{doc.name}</span> — select which checklist items this document supports
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading checklist items…
            </div>
          ) : totalItems === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No checklist items found</p>
              <p className="text-sm mt-1">Go to "Inspection Types" tab to assign templates to this project first.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(group => (
                <div key={group.templateId}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{group.templateName}</span>
                    <span className="flex-1 border-t border-muted/40" />
                    <span className="text-xs text-muted-foreground">
                      {group.items.filter(i => selectedIds.has(i.id)).length}/{group.items.length}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item: any) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedIds.has(item.id)
                            ? "bg-secondary/5 border-secondary/30"
                            : "bg-card border-muted/40 hover:bg-muted/30 hover:border-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggle(item.id)}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-muted-foreground accent-secondary cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-sidebar leading-snug">{item.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.codeReference && (
                              <span className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded text-muted-foreground">
                                {item.codeReference}
                              </span>
                            )}
                            {item.category && (
                              <span className="text-[10px] text-muted-foreground">{item.category}</span>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || loading} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Save Links
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileTypeIcon({ mimeType }: { mimeType?: string }) {
  const cls = "h-4 w-4 text-muted-foreground";
  if (!mimeType) return <File className={cls} />;
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4 text-red-400" />;
  if (mimeType.includes("image")) return <FileText className="h-4 w-4 text-blue-400" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return <FileText className="h-4 w-4 text-green-500" />;
  if (mimeType.includes("word") || mimeType.includes("document")) return <FileText className="h-4 w-4 text-blue-500" />;
  return <File className={cls} />;
}

// ── Inspection Types + Book Dialog ───────────────────────────────────────────

const INSPECTION_TYPES = [
  { value: "footings",      label: "Footings" },
  { value: "slab",          label: "Slab" },
  { value: "frame",         label: "Frame" },
  { value: "pre_plaster",   label: "Pre-Plaster" },
  { value: "waterproofing", label: "Waterproofing" },
  { value: "final",         label: "Final" },
  { value: "pool_barrier",  label: "Pool Barrier" },
  { value: "special",       label: "Special / Other" },
];

// ── Book Inspection Dialog ────────────────────────────────────────────────────

function BookInspectionDialog({
  open,
  onClose,
  projectId,
  projectName,
  onCreated,
  defaultTemplateId,
  defaultTemplateName,
  defaultInspectionType,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
  onCreated: () => void;
  defaultTemplateId?: number;
  defaultTemplateName?: string;
  defaultInspectionType?: string;
}) {
  const { data: users } = useListUsers({});
  const createInspection = useCreateInspection();

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    inspectionType: defaultInspectionType ?? "",
    scheduledDate: today,
    scheduledTime: "",
    inspectorId: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [allocatedTypes, setAllocatedTypes] = useState<InspectionTypeRow[]>([]);

  useEffect(() => {
    if (open) {
      setForm({ inspectionType: defaultInspectionType ?? "", scheduledDate: today, scheduledTime: "", inspectorId: "", notes: "" });
      setError("");
      apiFetch(`/api/projects/${projectId}/inspection-types`)
        .then((data: any) => setAllocatedTypes((data as InspectionTypeRow[]).filter(t => t.isSelected)))
        .catch(() => setAllocatedTypes([]));
    }
  }, [open, projectId, defaultInspectionType]);

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setError("");
  }

  function handleClose() {
    setForm({ inspectionType: defaultInspectionType ?? "", scheduledDate: today, scheduledTime: "", inspectorId: "", notes: "" });
    setError("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inspectionType) { setError("Please select an inspection type."); return; }
    if (!form.scheduledDate) { setError("Please set a scheduled date."); return; }
    setSubmitting(true);
    try {
      // Prefer the explicit defaultTemplateId (from booking a specific card),
      // then fall back to the allocated type's templateId that matches the selected inspectionType
      const matchedTemplateId = defaultTemplateId
        ?? allocatedTypes.find(t => t.inspectionType === form.inspectionType)?.templateId;
      await createInspection.mutateAsync({
        data: {
          projectId,
          inspectionType: form.inspectionType,
          scheduledDate: form.scheduledDate,
          scheduledTime: form.scheduledTime || undefined,
          inspectorId: form.inspectorId ? Number(form.inspectorId) : undefined,
          notes: form.notes || undefined,
          ...(matchedTemplateId ? { checklistTemplateId: matchedTemplateId } : {}),
        } as any,
      });
      onCreated();
      handleClose();
    } catch {
      setError("Failed to book inspection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-secondary" />
            Book Inspection
          </DialogTitle>
        </DialogHeader>

        {/* Project context banner */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/10 border border-secondary/20 text-sm text-secondary font-medium">
          <Building className="h-3.5 w-3.5 shrink-0" />
          {projectName}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Inspection Type — locked when coming from a template */}
          {defaultTemplateName ? (
            <div className="space-y-1.5">
              <Label>Inspection Type</Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/40 text-sm font-medium text-sidebar">
                <ClipboardList className="h-3.5 w-3.5 text-secondary shrink-0" />
                {defaultTemplateName}
              </div>
            </div>
          ) : (
          <div className="space-y-1.5">
            <Label>Inspection Type <span className="text-red-500">*</span></Label>
            <select
              value={form.inspectionType}
              onChange={e => set("inspectionType", e.target.value)}
              className={fieldClass}
              required
            >
              <option value="">— Select type —</option>
              {allocatedTypes.length > 0 ? (
                Array.from(new Set(allocatedTypes.map(t => t.folder))).sort().map(folder => (
                  <optgroup key={folder} label={folder}>
                    {allocatedTypes.filter(t => t.folder === folder).map(t => (
                      <option key={t.templateId} value={t.inspectionType}>{cleanTypeName(t.name)}</option>
                    ))}
                  </optgroup>
                ))
              ) : (
                INSPECTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))
              )}
            </select>
          </div>
          )}

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scheduled Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.scheduledDate}
                onChange={e => set("scheduledDate", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Time
                <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                type="time"
                value={form.scheduledTime}
                onChange={e => set("scheduledTime", e.target.value)}
              />
            </div>
          </div>

          {/* Inspector */}
          <div className="space-y-1.5">
            <Label>
              Assign Inspector
              <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <select
              value={form.inspectorId}
              onChange={e => set("inspectorId", e.target.value)}
              className={fieldClass}
            >
              <option value="">— Unassigned —</option>
              {(users ?? [])
                .map((u: any) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.firstName} {u.lastName}
                    {u.role ? ` (${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>
              Notes
              <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Any special instructions or context…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Booking…</> : <><Calendar className="h-3.5 w-3.5 mr-1.5" /> Book Inspection</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Inspections Tab ───────────────────────────────────────────────────────────

function InspectionsTab({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const inspections = project.inspections || [];
  const [, navigate] = useLocation();
  const [bookOpen, setBookOpen] = useState(false);
  const [bookTemplate, setBookTemplate] = useState<InspectionTypeRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Selected inspection types from Inspection Types tab
  const [selectedTypes, setSelectedTypes] = useState<InspectionTypeRow[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  useEffect(() => {
    apiFetch(`/api/projects/${project.id}/inspection-types`)
      .then((data: InspectionTypeRow[]) => setSelectedTypes(data.filter(t => t.isSelected)))
      .catch(() => {})
      .finally(() => setLoadingTypes(false));
  }, [project.id]);

  // Build a Set of templateIds that already have an inspection booked
  const bookedTemplateIds = new Set(inspections.map(i => i.checklistTemplateId).filter(Boolean));

  // Inspections not linked to any selected template (ad-hoc)
  const adHocInspections = inspections.filter(i => !i.checklistTemplateId || !selectedTypes.find(t => t.templateId === i.checklistTemplateId));

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/inspections/${confirmDeleteId}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err) {
      console.error("Delete inspection failed:", err);
    } finally {
      setDeleting(false);
    }
  };

  const inspectionToDelete = inspections.find(i => i.id === confirmDeleteId);

  const openBookForTemplate = (t: InspectionTypeRow) => {
    setBookTemplate(t);
    setBookOpen(true);
  };
  const closeBook = () => {
    setBookOpen(false);
    setBookTemplate(null);
  };
  const handleCreated = () => {
    onRefresh();
    // Refresh selected types to pick up new checklistTemplateId mapping
    apiFetch(`/api/projects/${project.id}/inspection-types`)
      .then((data: InspectionTypeRow[]) => setSelectedTypes(data.filter(t => t.isSelected)))
      .catch(() => {});
  };

  // Group selected types by folder
  const folders = Array.from(new Set(selectedTypes.map(t => t.folder))).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sidebar">{inspections.length} Inspection{inspections.length !== 1 ? "s" : ""}</h2>
        <Button size="sm" onClick={() => { setBookTemplate(null); setBookOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Book Inspection
        </Button>
      </div>

      <BookInspectionDialog
        open={bookOpen}
        onClose={closeBook}
        projectId={project.id}
        projectName={project.name}
        onCreated={handleCreated}
        defaultTemplateId={bookTemplate?.templateId}
        defaultTemplateName={bookTemplate?.name}
        defaultInspectionType={bookTemplate?.inspectionType}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={open => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4" /> Delete Inspection
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the{" "}
            <span className="font-medium text-sidebar capitalize">
              {inspectionToDelete ? (inspectionToDelete.checklistTemplateName ? cleanTypeName(inspectionToDelete.checklistTemplateName) : inspectionToDelete.inspectionType.replace(/_/g, " ")) : ""}
            </span>{" "}
            inspection? This will also remove all associated checklist results, notes, and issues. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              {deleting ? "Deleting…" : "Delete Inspection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Selected Inspection Types ── */}
      {!loadingTypes && selectedTypes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Required Inspections</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Booked</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30" /> Not yet booked — click to schedule</span>
            </div>
          </div>
          {folders.map(folder => {
            const folderTypes = selectedTypes.filter(t => t.folder === folder);
            return (
              <div key={folder} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-2.5 border-b bg-muted/20 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-sm text-sidebar">{folder}</span>
                </div>
                <div className="divide-y divide-border">
                  {folderTypes.map(t => {
                    const booked = bookedTemplateIds.has(t.templateId);
                    const linkedInspection = booked
                      ? inspections.find(i => i.checklistTemplateId === t.templateId)
                      : null;
                    return (
                      <div key={t.templateId} className="px-5 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {booked
                            ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            : (
                              <button
                                onClick={() => openBookForTemplate(t)}
                                className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 hover:border-secondary hover:bg-secondary/10 shrink-0 transition-colors"
                                title="Click to book this inspection"
                              />
                            )
                          }
                          <div className="min-w-0">
                            <div className="font-medium text-sm text-sidebar truncate">{t.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">{t.inspectionType.replace(/_/g, " ")} · {t.itemCount} checklist item{t.itemCount !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {booked && linkedInspection ? (
                            <button
                              onClick={() => navigate(`/inspections/${linkedInspection.id}`)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 transition-colors text-sidebar"
                            >
                              {inspectionStatusBadge(linkedInspection.status)}
                              <span className="ml-1">{formatDate(linkedInspection.scheduledDate)}</span>
                            </button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => openBookForTemplate(t)}>
                              <Calendar className="h-3 w-3 mr-1" /> Book
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ad-hoc / unlinked booked inspections ── */}
      {adHocInspections.length > 0 && (
        <div className="space-y-3">
          {selectedTypes.length > 0 && (
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Other Inspections</h3>
          )}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adHocInspections.map((insp, idx) => (
                  <TableRow
                    key={insp.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/inspections/${insp.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {inspectionStatusIcon(insp.status)}
                        <div>
                          <div className="font-medium text-sm text-sidebar capitalize group-hover:text-secondary transition-colors">
                            {insp.checklistTemplateName ? cleanTypeName(insp.checklistTemplateName) : insp.inspectionType.replace(/_/g, " ")}
                          </div>
                          <div className="text-xs text-muted-foreground">#{idx + 1}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{inspectionStatusBadge(insp.status)}</TableCell>
                    <TableCell className="text-sm">{formatDate(insp.scheduledDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {insp.completedDate ? formatDate(insp.completedDate) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {insp.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {(insp.status === "completed" || insp.status === "passed") && (
                          <button
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors"
                            title="Send report"
                            onClick={e => e.stopPropagation()}
                          >
                            <Mail className="h-3 w-3" /> Send Report
                          </button>
                        )}
                        <button
                          className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete inspection"
                          onClick={e => { e.stopPropagation(); setConfirmDeleteId(insp.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loadingTypes && selectedTypes.length === 0 && inspections.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center gap-4 text-muted-foreground">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
          <div className="text-center">
            <p className="font-medium text-sidebar">No inspections yet</p>
            <p className="text-sm mt-1">Select inspection types in the "Inspection Types" tab, or book an ad-hoc inspection</p>
          </div>
          <Button size="sm" onClick={() => { setBookTemplate(null); setBookOpen(true); }}>
            <Calendar className="h-3.5 w-3.5 mr-1.5" /> Book Inspection
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Inspection Types Tab ──────────────────────────────────────────────────────

function InspectionTypesTab({ projectId }: { projectId: number }) {
  const { data: me } = useGetMe();
  const discipline = me?.profession ?? null;

  const [types, setTypes] = useState<InspectionTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSubmitting, setCustomSubmitting] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      setLoading(true);
      const url = discipline
        ? `/api/projects/${projectId}/inspection-types?discipline=${encodeURIComponent(discipline)}`
        : `/api/projects/${projectId}/inspection-types`;
      const data = await apiFetch(url);
      setTypes(data);
      // Collapse all folders by default on load
      const allFolders = Array.from(new Set((data as InspectionTypeRow[]).map((t: InspectionTypeRow) => t.folder)));
      setCollapsedFolders(new Set(allFolders));
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId, discipline]);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const toggle = (templateId: number) => {
    setTypes(prev => prev.map(t => t.templateId === templateId ? { ...t, isSelected: !t.isSelected } : t));
    setSaved(false);
  };

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const selectedIds = types.filter(t => t.isSelected).map(t => t.templateId);
    try {
      await apiFetch(`/api/projects/${projectId}/inspection-types`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTemplateIds: selectedIds }),
      });
      setSaved(true);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const addCustomInspection = async () => {
    const name = customName.trim();
    if (!name) return;
    setCustomSubmitting(true);
    try {
      await apiFetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, inspectionType: name }),
      });
      setCustomName("");
      setCustomOpen(false);
    } catch {
    } finally {
      setCustomSubmitting(false);
    }
  };

  const folders = Array.from(new Set(types.map(t => t.folder))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  const selectedCount = types.filter(t => t.isSelected).length;
  const allCollapsed = folders.length > 0 && collapsedFolders.size === folders.length;

  const collapseAll = () => setCollapsedFolders(new Set(folders));
  const expandAll = () => setCollapsedFolders(new Set());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sidebar">Required Inspection Types</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Select which inspection types apply to this project</p>
        </div>
        <div className="flex items-center gap-3">
          {discipline && (
            <span className="flex items-center gap-1.5 text-xs bg-secondary/10 text-secondary px-3 py-1.5 rounded-lg font-medium">
              <Info className="h-3.5 w-3.5" />
              Showing: {discipline}
            </span>
          )}
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : "Save Selection"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCustomName(""); setCustomOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add custom inspection
          </Button>
        </div>
      </div>

      {/* Add Custom Inspection Dialog */}
      <Dialog open={customOpen} onOpenChange={open => { if (!customSubmitting) setCustomOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sidebar">
              <ClipboardList className="h-4 w-4" />
              Add Custom Inspection
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Creates a manual inspection entry for this project with no linked checklist. You can add notes and results freely.
          </p>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Inspection name</Label>
              <Input
                placeholder="e.g. Site visit, Pre-pour inspection, Custom review…"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addCustomInspection(); }}
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCustomOpen(false)} disabled={customSubmitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={addCustomInspection} disabled={customSubmitting || !customName.trim()}>
              {customSubmitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Creating…</> : "Create Inspection"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          <div className="bg-muted/30 rounded-lg px-4 py-2 text-sm text-muted-foreground flex items-center justify-between">
            <span>{selectedCount} of {types.length} inspection types selected</span>
            <button
              onClick={allCollapsed ? expandAll : collapseAll}
              className="text-xs text-secondary hover:text-secondary/80 font-medium transition-colors"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          </div>

          <div className="space-y-3">
            {folders.map(folder => {
              const folderTypes = types.filter(t => t.folder === folder);
              const folderSelected = folderTypes.filter(t => t.isSelected).length;
              const isCollapsed = collapsedFolders.has(folder);
              return (
                <div key={folder} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleFolder(folder)}
                    className="w-full px-5 py-3 border-b bg-muted/20 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`} />
                      {isCollapsed
                        ? <Folder className="h-4 w-4 text-amber-500" />
                        : <FolderOpen className="h-4 w-4 text-amber-500" />
                      }
                      <span className="font-semibold text-sm text-sidebar">{folder}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {folderSelected}/{folderTypes.length} selected
                      {folderSelected > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-secondary/20 text-secondary font-bold text-[10px]">
                          ✓
                        </span>
                      )}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="divide-y">
                      {folderTypes.map(type => (
                        <label
                          key={type.templateId}
                          className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={type.isSelected}
                            onChange={() => toggle(type.templateId)}
                            className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-secondary accent-secondary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-sidebar">{type.name}</div>
                            <div className="text-xs text-muted-foreground capitalize mt-0.5">
                              {type.inspectionType.replace(/_/g, " ")} · {type.itemCount} checklist items
                            </div>
                          </div>
                          {type.isSelected && (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<string, string> = {
  inspection_certificate: "Inspection Certificate",
  compliance_report: "Compliance Report",
  defect_notice: "Defect Notice",
  non_compliance_notice: "Non-Compliance Notice",
  summary: "Inspection Summary",
  quality_control_report: "Quality Control Report",
  non_conformance_report: "Non-Conformance Report",
  safety_inspection_report: "Safety Inspection Report",
  hazard_assessment_report: "Hazard Assessment Report",
  corrective_action_report: "Corrective Action Report",
  pre_purchase_report: "Pre-Purchase Building Report",
  annual_fire_safety: "Annual Fire Safety Statement",
  fire_inspection_report: "Fire Safety Inspection Report",
};

// ── Contractors Tab ───────────────────────────────────────────

interface ProjectContractor {
  id: number;
  projectId: number;
  name: string;
  trade: string;
  email: string | null;
  company: string | null;
  contactRole: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface OrgContractorEntry {
  id: number;
  name: string;
  trade: string;
  email: string | null;
  company: string | null;
  contactRole?: string | null;
  phone?: string | null;
  totalProjects?: number;
  activeProjects?: number;
}

const CONTACT_ROLES = [
  { value: "builder", label: "Builder" },
  { value: "owner", label: "Owner / Client" },
  { value: "contractor", label: "Contractor" },
  { value: "consultant", label: "Consultant" },
  { value: "designer", label: "Designer / Architect" },
  { value: "other", label: "Other" },
] as const;

type ContactRole = typeof CONTACT_ROLES[number]["value"];

function contactRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return CONTACT_ROLES.find(r => r.value === role)?.label ?? role;
}

function OrgContractorCombobox({
  orgContractors,
  assignedOrgIds,
  togglingIds,
  onToggle,
  inductedIds,
}: {
  orgContractors: OrgContractorEntry[];
  assignedOrgIds: Set<number>;
  togglingIds: Set<number>;
  onToggle: (id: number, currentlyAssigned: boolean) => void;
  inductedIds?: Record<number, boolean>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const assignedContractors = orgContractors.filter(c => assignedOrgIds.has(c.id));
  const unassignedContractors = orgContractors.filter(c => !assignedOrgIds.has(c.id));

  const filtered = query.trim()
    ? unassignedContractors.filter(c => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.trade.toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q)
        );
      })
    : unassignedContractors;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-sidebar">Organisation Library</h3>
        {assignedContractors.length > 0 && (
          <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
            {assignedContractors.length} assigned
          </span>
        )}
      </div>

      {/* Assigned chips */}
      {assignedContractors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assignedContractors.map(c => {
            const inducted = inductedIds?.[c.id] ?? false;
            return (
              <div
                key={c.id}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium px-2.5 py-1.5 rounded-full"
              >
                <UserIcon className="h-3 w-3 text-emerald-600 shrink-0" />
                <span>{c.name}</span>
                {c.trade && <span className="text-emerald-600 opacity-80">· {c.trade}</span>}
                {inducted ? (
                  <span className="ml-1 flex items-center gap-0.5 bg-green-100 text-green-700 border border-green-200 px-1 py-0.5 rounded text-[10px] font-semibold">
                    <ShieldCheck className="h-2.5 w-2.5" /> Inducted
                  </span>
                ) : (
                  <span className="ml-1 text-amber-600 text-[10px] font-medium">Not Inducted</span>
                )}
                <button
                  onClick={() => onToggle(c.id, true)}
                  disabled={togglingIds.has(c.id)}
                  className="ml-1 text-emerald-600 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Remove from project"
                >
                  {togglingIds.has(c.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Combobox */}
      {orgContractors.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">
          No contractors in the organisation library yet. Add them in{" "}
          <strong>Settings → Organisation → Contractor Library</strong>.
        </p>
      ) : unassignedContractors.length > 0 ? (
        <div className="relative">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search contractors by name, trade, or company…"
              className="w-full text-sm border border-input rounded-lg pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-secondary/30 bg-background transition"
            />
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {open && (
            <div
              ref={dropdownRef}
              className="absolute z-20 mt-1 w-full bg-white rounded-lg border border-border shadow-lg overflow-hidden"
            >
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-3">No contractors found.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-border/50">
                  {filtered.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onToggle(c.id, false);
                        setQuery("");
                        setOpen(false);
                      }}
                      disabled={togglingIds.has(c.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-sidebar">{c.name}</p>
                          {c.trade && (
                            <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded">{c.trade}</span>
                          )}
                          {c.company && <span className="text-xs text-muted-foreground">{c.company}</span>}
                        </div>
                      </div>
                      {togglingIds.has(c.id) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">All library contractors are assigned to this project.</p>
      )}

      <p className="text-xs text-muted-foreground">
        Search and add contractors from your library. Manage the library in{" "}
        <strong>Settings → Organisation → Contractor Library</strong>.
      </p>
    </div>
  );
}

function ContractorsTab({ projectId, projectName }: { projectId: number; projectName: string }) {
  const [contractors, setContractors] = useState<ProjectContractor[]>([]);
  const [orgContractors, setOrgContractors] = useState<OrgContractorEntry[]>([]);
  const [assignedOrgIds, setAssignedOrgIds] = useState<Set<number>>(new Set());
  const [inductedIds, setInductedIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newRole, setNewRole] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editTrade, setEditTrade] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editRole, setEditRole] = useState<string>("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsPrimary, setEditIsPrimary] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [dupWarning, setDupWarning] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/projects/${projectId}/contractors`).catch(() => []),
      apiFetch("/api/org-contractors").catch(() => []),
      apiFetch(`/api/projects/${projectId}/org-contractor-assignments?format=enriched`).catch(() => []),
    ]).then(([projList, orgList, enrichedAssignments]) => {
      setContractors(projList);
      setOrgContractors(orgList);
      const assignedArr = enrichedAssignments as Array<{ id: number; isInducted: boolean }>;
      setAssignedOrgIds(new Set(assignedArr.map((a) => a.id)));
      const inductionMap: Record<number, boolean> = {};
      for (const a of assignedArr) {
        if (a.isInducted) inductionMap[a.id] = true;
      }
      setInductedIds(inductionMap);
    }).finally(() => setLoading(false));
  }, [projectId]);

  const checkDupEmail = (email: string, excludeId?: number) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setDupWarning(""); return; }
    const dup = contractors.find(c => c.email?.toLowerCase() === trimmed && c.id !== excludeId);
    setDupWarning(dup ? `A contact with this email (${dup.name}) already exists on this project.` : "");
  };

  const toggleOrgContractor = async (orgContractorId: number, currentlyAssigned: boolean) => {
    setTogglingIds(s => new Set([...s, orgContractorId]));
    try {
      if (currentlyAssigned) {
        await apiFetch(`/api/projects/${projectId}/org-contractor-assignments/${orgContractorId}`, { method: "DELETE" });
        setAssignedOrgIds(s => { const n = new Set(s); n.delete(orgContractorId); return n; });
      } else {
        // Duplicate email check for org contractor assignment
        const orgC = orgContractors.find(c => c.id === orgContractorId);
        if (orgC?.email) {
          const dup = contractors.find(c => c.email?.toLowerCase() === orgC.email!.toLowerCase());
          if (dup) {
            if (!confirm(`A contact with the email "${orgC.email}" (${dup.name}) already exists on this project. Assign anyway?`)) {
              return;
            }
          }
        }
        await apiFetch(`/api/projects/${projectId}/org-contractor-assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgContractorId }),
        });
        setAssignedOrgIds(s => new Set([...s, orgContractorId]));
      }
    } catch {
      setError("Failed to update contractor assignment.");
    } finally {
      setTogglingIds(s => { const n = new Set(s); n.delete(orgContractorId); return n; });
    }
  };

  const addContractor = async () => {
    if (!newName.trim()) { setError("Name is required."); return; }
    if (dupWarning) { setError(dupWarning + " Please use a different email or edit the existing contact."); return; }
    setError(""); setSaving(true);
    try {
      const created = await apiFetch(`/api/projects/${projectId}/contractors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(), trade: newTrade.trim(),
          email: newEmail.trim() || null, company: newCompany.trim() || null,
          contactRole: newRole || null, phone: newPhone.trim() || null,
          isPrimary: newIsPrimary,
        }),
      });
      setContractors(c => newIsPrimary ? [...c.map(x => ({ ...x, isPrimary: false })), created] : [...c, created]);
      setNewName(""); setNewTrade(""); setNewEmail(""); setNewCompany(""); setNewRole(""); setNewPhone(""); setNewIsPrimary(false); setAdding(false); setDupWarning("");
    } catch (err: any) {
      const body = await err?.response?.json?.().catch?.(() => null);
      if (body?.error === "duplicate_email") setError(body.message);
      else setError("Failed to add contractor.");
    } finally { setSaving(false); }
  };

  const startEdit = (c: ProjectContractor) => {
    setEditingId(c.id); setEditName(c.name); setEditTrade(c.trade);
    setEditEmail(c.email ?? ""); setEditCompany(c.company ?? "");
    setEditRole(c.contactRole ?? ""); setEditPhone(c.phone ?? "");
    setEditIsPrimary(c.isPrimary); setError(""); setDupWarning("");
  };

  const saveEdit = async () => {
    if (!editName.trim()) { setError("Name is required."); return; }
    if (dupWarning) { setError(dupWarning + " Please use a different email."); return; }
    setError(""); setSavingEdit(true);
    try {
      const updated = await apiFetch(`/api/projects/${projectId}/contractors/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(), trade: editTrade.trim(),
          email: editEmail.trim() || null, company: editCompany.trim() || null,
          contactRole: editRole || null, phone: editPhone.trim() || null,
          isPrimary: editIsPrimary,
        }),
      });
      setContractors(c => (editIsPrimary
        ? c.map(x => ({ ...x, isPrimary: x.id === editingId }))
        : c.map(x => x.id === editingId ? updated : x)
      ));
      setEditingId(null); setDupWarning("");
    } catch (err: any) {
      const body = await err?.response?.json?.().catch?.(() => null);
      if (body?.error === "duplicate_email") setError(body.message);
      else setError("Failed to update contractor.");
    } finally { setSavingEdit(false); }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`/api/projects/${projectId}/contractors/${id}`, { method: "DELETE" });
      setContractors(c => c.filter(x => x.id !== id));
    } catch { setError("Failed to remove contractor."); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading contractors…
    </div>
  );

  const ContractorCard = ({ c }: { c: ProjectContractor }) => (
    <div className={cn("rounded-lg border bg-white", c.isPrimary ? "border-secondary/40 ring-1 ring-secondary/20" : "border-border")}>
      {editingId === c.id ? (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Name *</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" autoFocus className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Role</label>
              <select value={editRole} onChange={e => setEditRole(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select role…</option>
                {CONTACT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Trade / Discipline</label>
              <Input value={editTrade} onChange={e => setEditTrade(e.target.value)} placeholder="e.g. Plumber, Electrician" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Company</label>
              <Input value={editCompany} onChange={e => setEditCompany(e.target.value)} placeholder="Company name" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Email</label>
              <Input value={editEmail}
                onChange={e => { setEditEmail(e.target.value); checkDupEmail(e.target.value, c.id); }}
                placeholder="email@example.com" type="email" className="mt-1" />
              {dupWarning && <p className="text-xs text-amber-600 mt-1">{dupWarning}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Phone</label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+61 4XX XXX XXX" className="mt-1" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
            <input type="checkbox" checked={editIsPrimary} onChange={e => setEditIsPrimary(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-secondary" />
            <span className="text-xs font-medium text-sidebar">Set as primary contact</span>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {savingEdit ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDupWarning(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-secondary/10">
              <UserIcon className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-sidebar">{c.name}</p>
                {c.isPrimary && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30 uppercase tracking-wide">Primary</span>
                )}
                {c.contactRole && (
                  <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded font-medium">{contactRoleLabel(c.contactRole)}</span>
                )}
                {c.trade && <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded font-medium">{c.trade}</span>}
                {c.company && <span className="text-xs text-muted-foreground">{c.company}</span>}
              </div>
              <div className="mt-0.5 flex flex-col gap-0.5">
                {c.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />{c.email}
                  </p>
                )}
                {c.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="h-3 w-3 text-center text-[10px]">📞</span>{c.phone}
                  </p>
                )}
                {!c.email && (
                  <p className="text-xs text-amber-600 italic">No email address — add one to enable defect report sending.</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEdit(c)} className="p-1.5 rounded text-muted-foreground hover:bg-muted/40 transition-colors" title="Edit">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(c.id)} className="p-1.5 rounded text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 mt-4">
      <OrgContractorCombobox
        orgContractors={orgContractors}
        assignedOrgIds={assignedOrgIds}
        togglingIds={togglingIds}
        onToggle={toggleOrgContractor}
        inductedIds={inductedIds}
      />

      {/* Project-specific contractors */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-sidebar">Project Contacts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Contacts specific to this project — owners, builders, designers, etc.</p>
          </div>
          {!adding && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(true); setError(""); setDupWarning(""); }}>
              <Plus className="h-4 w-4" /> Add Contact
            </Button>
          )}
        </div>

        {contractors.length === 0 && !adding && (
          <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground text-sm">
            No contacts added yet. Add builders, owners, designers and other parties here.
          </div>
        )}

        <div className="space-y-2">
          {contractors.map(c => <ContractorCard key={`proj-${c.id}`} c={c} />)}
        </div>

        {adding && (
          <div className="p-4 rounded-lg border border-secondary/40 bg-secondary/5 space-y-3">
            <p className="text-sm font-medium text-sidebar">New Contact</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground font-medium">Name *</label>
                <Input value={newName} onChange={e => { setNewName(e.target.value); setError(""); }} placeholder="Full name" autoFocus className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">Select role…</option>
                  {CONTACT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Trade / Discipline</label>
                <Input value={newTrade} onChange={e => setNewTrade(e.target.value)} placeholder="e.g. Plumber, Electrician" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Company</label>
                <Input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Company name" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Email</label>
                <Input value={newEmail}
                  onChange={e => { setNewEmail(e.target.value); checkDupEmail(e.target.value); setError(""); }}
                  placeholder="email@example.com" type="email" className="mt-1" />
                {dupWarning && <p className="text-xs text-amber-600 mt-1">{dupWarning}</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Phone</label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+61 4XX XXX XXX" className="mt-1" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={newIsPrimary} onChange={e => setNewIsPrimary(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-secondary" />
              <span className="text-xs font-medium text-sidebar">Set as primary contact</span>
            </label>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={addContractor} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {saving ? "Adding…" : "Add Contact"}
              </Button>
              <Button variant="outline" onClick={() => {
                setAdding(false); setError(""); setDupWarning("");
                setNewName(""); setNewTrade(""); setNewEmail(""); setNewCompany(""); setNewRole(""); setNewPhone(""); setNewIsPrimary(false);
              }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && !adding && editingId === null && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

function ReportResultBadge({ result }: { result: string }) {
  if (result === "pass") return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 shrink-0">PASS</span>;
  if (result === "fail") return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 shrink-0">FAIL</span>;
  if (result === "monitor") return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">MONITOR</span>;
  if (result === "pending") return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200 shrink-0">PENDING</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-400 border border-gray-200 shrink-0">N/A</span>;
}

function ReportHTMLViewer({ report, inspection, project }: { report: any; inspection: any | null; project: any | null }) {
  const items: any[] = inspection?.checklistResults ?? [];
  const passItems   = items.filter(i => i.result === "pass");
  const failItems   = items.filter(i => i.result === "fail");
  const naItems     = items.filter(i => i.result === "na");
  const monitorItems = items.filter(i => i.result === "monitor");
  const total = items.length;
  const passRate = total > 0 ? Math.round((passItems.length / Math.max(total - naItems.length, 1)) * 100) : null;
  const overallResult = failItems.length > 0 ? "FAIL" : passItems.length > 0 ? "PASS" : total > 0 ? "PENDING" : "—";

  // Group non-N/A items by category
  const grouped: Record<string, any[]> = {};
  items.filter(i => i.result !== "na").forEach(item => {
    const cat = item.category || "General";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—";

  const inspType = (inspection?.inspectionType || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div className="text-sm rounded-xl overflow-hidden border border-border">
      {/* Branded header */}
      <div className="bg-[#0B1933] px-6 py-4 flex items-center gap-3">
        <div className="bg-[#C5D92D] rounded-lg w-9 h-9 flex items-center justify-center shrink-0">
          <ClipboardList className="h-5 w-5 text-[#0B1933]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base leading-tight">InspectProof</p>
          <p className="text-white/50 text-[10px] uppercase tracking-widest mt-0.5">{report.reportTypeLabel || REPORT_TYPE_LABELS[report.reportType] || report.reportType}</p>
        </div>
        <span className={cn(
          "shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold",
          report.status === "approved" ? "bg-[#466DB5] text-white" :
          report.status === "sent" ? "bg-green-500 text-white" :
          report.status === "pending_review" ? "bg-amber-500 text-white" :
          "bg-white/20 text-white/80"
        )}>
          {report.status === "pending_review" ? "Pending Review" : report.status === "approved" ? "Approved" : report.status === "sent" ? "Sent to Client" : "Draft"}
        </span>
      </div>
      <div className="h-1 bg-[#C5D92D]" />

      {/* Body */}
      <div className="px-5 py-5 space-y-5 bg-gray-50">
        {/* Report title + meta */}
        <div className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-bold text-[#0B1933] mb-2 leading-snug">{report.title}</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Prepared by <strong className="text-sidebar">{inspection?.inspectorName || report.generatedByName}</strong></span>
            <span>Issued <strong className="text-sidebar">{fmtDate(report.createdAt)}</strong></span>
            <span>Ref <strong className="text-sidebar font-mono">IP-{String(report.id).padStart(6, "0")}</strong></span>
          </div>
        </div>

        {/* Project + Inspection Details side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="bg-[#E8ECF2] border-b border-border px-4 py-2 flex items-center gap-2">
              <div className="w-0.5 h-4 bg-[#466DB5] rounded-full" />
              <span className="text-[10px] font-bold text-[#0B1933] uppercase tracking-wider">Project Details</span>
            </div>
            <div className="p-4 space-y-2">
              {([
                ["Project", project?.name],
                ["Address", project ? `${project.siteAddress}, ${project.suburb} ${project.state} ${project.postcode}` : null],
                ["DA / Approval No", project?.daNumber],
                ["Cert No", project?.certificationNumber],
                ["Building Class", project?.buildingClassification],
                ["Client", project?.clientName],
                ["Builder", project?.builderName],
                ["Designer", project?.designerName],
              ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid gap-1 text-xs" style={{ gridTemplateColumns: "110px 1fr" }}>
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-sidebar font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="bg-[#E8ECF2] border-b border-border px-4 py-2 flex items-center gap-2">
              <div className="w-0.5 h-4 bg-[#466DB5] rounded-full" />
              <span className="text-[10px] font-bold text-[#0B1933] uppercase tracking-wider">Inspection Details</span>
            </div>
            <div className="p-4 space-y-2">
              {([
                ["Type", inspType || null],
                ["Inspector", inspection?.inspectorName || null],
                ["Scheduled", fmtDate(inspection?.scheduledDate)],
                ["Completed", fmtDate(inspection?.completedDate)],
                ["Weather", inspection?.weatherConditions || null],
                ["Duration", inspection?.duration ? `${inspection.duration} min` : null],
                ["Site Notes", inspection?.siteNotes || null],
              ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid gap-1 text-xs" style={{ gridTemplateColumns: "110px 1fr" }}>
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-sidebar font-medium capitalize">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary stats */}
        {total > 0 && (
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="bg-[#E8ECF2] border-b border-border px-4 py-2 flex items-center gap-2">
              <div className="w-0.5 h-4 bg-[#466DB5] rounded-full" />
              <span className="text-[10px] font-bold text-[#0B1933] uppercase tracking-wider">Results Summary</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-5 gap-2 mb-4">
                {([
                  { label: "Total", value: total, cls: "bg-[#0B1933] text-white" },
                  { label: "Pass",    value: passItems.length,    cls: "bg-green-50 text-green-700 border border-green-200" },
                  { label: "Fail",    value: failItems.length,    cls: failItems.length > 0 ? "bg-red-100 text-red-700 border border-red-300" : "bg-gray-50 text-gray-400 border border-gray-200" },
                  { label: "Monitor", value: monitorItems.length, cls: "bg-amber-50 text-amber-700 border border-amber-200" },
                  { label: "N/A",     value: naItems.length,      cls: "bg-gray-50 text-gray-500 border border-gray-200" },
                ] as { label: string; value: number; cls: string }[]).map(s => (
                  <div key={s.label} className={cn("rounded-xl p-3 text-center", s.cls)}>
                    <div className="text-xl font-bold">{s.value}</div>
                    <div className="text-[10px] mt-0.5 opacity-70 uppercase tracking-wide">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground shrink-0">Pass Rate</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${passRate ?? 0}%` }} />
                </div>
                <span className="text-xs font-bold text-sidebar shrink-0">{passRate !== null ? `${passRate}%` : "—"}</span>
                <span className={cn(
                  "text-xs font-bold px-3 py-1 rounded-full shrink-0",
                  overallResult === "PASS" ? "bg-green-100 text-green-700" :
                  overallResult === "FAIL" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {overallResult}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Checklist items grouped by category */}
        {Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="bg-[#E8ECF2] border-b border-border px-4 py-2.5 flex items-center gap-2">
              <div className="w-0.5 h-4 bg-[#466DB5] rounded-full" />
              <span className="text-[10px] font-bold text-[#0B1933] uppercase tracking-wider">{cat}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{catItems.length} item{catItems.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="divide-y divide-border">
              {catItems.map((item, idx) => (
                <div key={item.id ?? idx} className={cn(
                  "p-4",
                  item.result === "fail" ? "bg-red-50/50" :
                  item.result === "monitor" ? "bg-amber-50/50" : ""
                )}>
                  <div className="flex items-start gap-3">
                    <ReportResultBadge result={item.result} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-sidebar leading-snug">{item.description}</p>
                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {item.codeReference && (
                          <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium">§ {item.codeReference}</span>
                        )}
                        {item.severity && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize",
                            item.severity === "critical" ? "bg-red-50 text-red-700 border-red-200" :
                            item.severity === "major" ? "bg-orange-50 text-orange-700 border-orange-200" :
                            item.severity === "minor" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                            "bg-gray-50 text-gray-500 border-gray-200"
                          )}>{item.severity}</span>
                        )}
                        {item.location && (
                          <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">📍 {item.location}</span>
                        )}
                        {item.tradeAllocated && (
                          <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded font-medium">🔧 {item.tradeAllocated}</span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 italic">"{item.notes}"</p>
                      )}
                      {item.recommendedAction && (
                        <p className="text-[10px] text-amber-700 mt-1 font-medium">→ {item.recommendedAction}</p>
                      )}
                      {/* Photos grid — aligned to item */}
                      {item.photoUrls?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          {item.photoUrls.map((photoPath: string, pi: number) => (
                            <a
                              key={pi}
                              href={`${apiBase()}/api/storage${photoPath}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative block rounded-lg overflow-hidden border-2 border-border hover:border-[#466DB5] transition-colors shrink-0"
                              style={{ width: 88, height: 88 }}
                            >
                              <img
                                src={`${apiBase()}/api/storage${photoPath}?w=400`}
                                alt={`Photo ${pi + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[9px] text-center py-0.5 font-medium">
                                Photo {pi + 1}
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Footer / Certification */}
        <div className="bg-[#0B1933] rounded-xl p-5">
          <p className="text-[10px] text-white/50 leading-relaxed">
            This document was prepared and issued by InspectProof — a product of PlanProof Technologies Pty Ltd. The findings contained herein are based on conditions observed at the time of inspection only. This report is prepared for the exclusive use of the parties named above.
          </p>
          <div className="mt-4 border-t border-white/10 pt-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wide">Inspector</p>
              <p className="text-xs font-semibold text-white">{inspection?.inspectorName || report.generatedByName}</p>
              <p className="text-[10px] text-white/40 mt-0.5">{fmtDate(inspection?.completedDate || report.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/40 mb-1 uppercase tracking-wide">Reference</p>
              <p className="text-xs font-mono text-white/60">IP-{String(report.id).padStart(6, "0")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const REPORT_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  sent: "bg-green-50 text-green-700 border-green-200",
};

const REPORT_TYPE_ICONS: Record<string, React.ElementType> = {
  inspection_certificate: Award,
  compliance_report: BarChart2,
  defect_notice: AlertCircle,
  non_compliance_notice: XCircle,
  summary: FileText,
};

function ReportsTab({ projectId, project }: { projectId: number; project: any }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [reportInspection, setReportInspection] = useState<any | null>(null);
  const [reportViewLoading, setReportViewLoading] = useState(false);
  const [pdfViewUrl, setPdfViewUrl] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Send dialog state
  const [sendDialogReport, setSendDialogReport] = useState<any | null>(null);
  const [sendContacts, setSendContacts] = useState<ProjectContractor[]>([]);
  const [sendSelectedIds, setSendSelectedIds] = useState<Set<number>>(new Set());
  const [sendCustomEmail, setSendCustomEmail] = useState("");
  const [sendCustomName, setSendCustomName] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/reports?projectId=${projectId}`);
      setReports(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useState(() => { load(); });

  const openReport = async (report: any) => {
    setSelectedReport(report);
    setReportInspection(null);
    setPdfViewUrl(null);
    setViewOpen(true);
    setReportViewLoading(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`/api/reports/${report.id}/pdf?includeMarkup=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        setPdfViewUrl(URL.createObjectURL(blob));
      }
    } catch {
    } finally {
      setReportViewLoading(false);
    }
  };

  const closeReport = () => {
    if (pdfViewUrl) URL.revokeObjectURL(pdfViewUrl);
    setPdfViewUrl(null);
    setViewOpen(false);
  };

  const approveReport = async (report: any) => {
    setActionBusy(true);
    try {
      await apiFetch(`/api/reports/${report.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" } });
      await load();
      closeReport();
    } catch {
    } finally {
      setActionBusy(false);
    }
  };

  const downloadPdf = async (report: any) => {
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`/api/reports/${report.id}/pdf?includeMarkup=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title?.replace(/[^a-z0-9\s\-_]/gi, "").replace(/\s+/g, "_") || "report"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const deleteReport = async (id: number) => {
    setDeleting(true);
    try {
      await apiFetch(`/api/reports/${id}`, { method: "DELETE" });
      setConfirmDeleteId(null);
      await load();
    } catch {
    } finally {
      setDeleting(false);
    }
  };

  const openSendDialog = async (report: any) => {
    setSendDialogReport(report);
    setSendSelectedIds(new Set());
    setSendCustomEmail("");
    setSendCustomName("");
    setSendError("");
    setSendSuccess(false);
    try {
      const contacts: ProjectContractor[] = await apiFetch(`/api/projects/${projectId}/contractors`).catch(() => []);
      setSendContacts(contacts);
      // Pre-select primary contact if any
      const primary = contacts.find(c => c.isPrimary && c.email);
      if (primary) setSendSelectedIds(new Set([primary.id]));
    } catch {
      setSendContacts([]);
    }
  };

  const closeSendDialog = () => { setSendDialogReport(null); setSendSuccess(false); };

  const sendReport = async () => {
    if (sendSelectedIds.size === 0 && !sendCustomEmail.trim()) {
      setSendError("Please select at least one recipient or enter a custom email.");
      return;
    }
    setSendError(""); setSending(true);
    try {
      const selectedContacts = sendContacts.filter(c => sendSelectedIds.has(c.id) && c.email);
      const recipients = [
        ...selectedContacts.map(c => ({ email: c.email!, name: c.name })),
        ...(sendCustomEmail.trim() ? [{ email: sendCustomEmail.trim(), name: sendCustomName.trim() || undefined }] : []),
      ];
      for (const r of recipients) {
        await apiFetch(`/api/reports/${sendDialogReport!.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentTo: r.email, recipientName: r.name }),
        });
      }
      setSendSuccess(true);
      await load();
    } catch (err: any) {
      setSendError("Failed to send the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading reports…
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-20">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
        <p className="font-semibold text-sidebar">No reports yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Reports are generated by inspectors on the mobile app after completing an inspection.
        </p>
      </div>
    );
  }

  const pendingCount = reports.filter(r => r.status === "pending_review").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sidebar">Generated Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {reports.length} report{reports.length !== 1 ? "s" : ""} generated
            {pendingCount > 0 && ` · ${pendingCount} pending review`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {reports.map(report => {
          const Icon = REPORT_TYPE_ICONS[report.reportType] || FileText;
          const statusLabel = report.status === "pending_review" ? "Pending Review"
            : report.status === "approved" ? "Approved"
            : report.status === "sent" ? "Sent to Client"
            : "Draft";

          return (
            <div
              key={report.id}
              className={cn(
                "p-4 bg-card border rounded-xl transition-colors",
                confirmDeleteId === report.id
                  ? "border-red-300 bg-red-50/30"
                  : "border-border hover:border-sidebar/30",
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  report.reportType === "inspection_certificate" && "bg-green-100",
                  report.reportType === "compliance_report" && "bg-blue-100",
                  report.reportType === "defect_notice" && "bg-amber-100",
                  report.reportType === "non_compliance_notice" && "bg-red-100",
                  !["inspection_certificate", "compliance_report", "defect_notice", "non_compliance_notice"].includes(report.reportType) && "bg-muted",
                )}>
                  <Icon className={cn(
                    "h-5 w-5",
                    report.reportType === "inspection_certificate" && "text-green-700",
                    report.reportType === "compliance_report" && "text-blue-700",
                    report.reportType === "defect_notice" && "text-amber-700",
                    report.reportType === "non_compliance_notice" && "text-red-700",
                    !["inspection_certificate", "compliance_report", "defect_notice", "non_compliance_notice"].includes(report.reportType) && "text-muted-foreground",
                  )} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sidebar text-sm leading-snug">{report.title}</p>
                    <span className={cn(
                      "shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium capitalize",
                      REPORT_STATUS_STYLES[report.status] || "bg-gray-50 text-gray-600 border-gray-200",
                    )}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      {REPORT_TYPE_LABELS[report.reportType] || report.reportType}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(report.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {report.generatedByName}
                    </span>
                    {report.sentTo && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Send className="h-3 w-3" />
                        {report.sentTo}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {report.status === "pending_review" && confirmDeleteId !== report.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => approveReport(report)}
                      disabled={actionBusy}
                      className="text-xs"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                      Approve
                    </Button>
                  )}
                  {confirmDeleteId !== report.id && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReport(report)}
                        className="text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPdf(report)}
                        className="text-xs gap-1.5"
                        title="Download PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openSendDialog(report)}
                        className="text-xs gap-1.5"
                        title="Send report to contacts"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDeleteId(report.id)}
                        className="text-xs text-red-500 border-red-200 hover:bg-red-50 hover:border-red-400"
                        title="Delete report"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline delete confirmation */}
              {confirmDeleteId === report.id && (
                <div className="mt-3 pt-3 border-t border-red-200 flex items-center justify-between gap-3">
                  <p className="text-sm text-red-700">
                    <span className="font-semibold">Delete this report?</span>
                    <span className="text-red-500 ml-1.5">This cannot be undone.</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => deleteReport(report.id)}
                      disabled={deleting}
                      className="text-xs bg-red-600 hover:bg-red-700 text-white border-0"
                    >
                      {deleting
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting…</>
                        : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete Report</>}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Report viewer dialog */}
      <Dialog open={viewOpen} onOpenChange={o => { if (!o) closeReport(); }}>
        <DialogContent className="max-w-4xl w-full flex flex-col p-0 gap-0 overflow-hidden" style={{ maxHeight: "92vh" }}>
          {/* Sticky toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-sidebar shrink-0" />
              <span className="text-sm font-semibold text-sidebar truncate">{selectedReport?.title}</span>
              {selectedReport?.sentTo && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                  <Send className="h-3 w-3" /> {selectedReport.sentTo}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedReport && downloadPdf(selectedReport)}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </Button>
              {selectedReport?.status === "pending_review" && (
                <Button
                  onClick={async () => {
                    await approveReport(selectedReport);
                    closeReport();
                  }}
                  disabled={actionBusy}
                  size="sm"
                  className="text-xs"
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                  {actionBusy ? "Approving…" : "Approve & Mark as Final"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={closeReport} className="text-xs px-2">✕</Button>
            </div>
          </div>

          {/* PDF iframe viewer */}
          <div className="flex-1 bg-muted/20" style={{ height: "75vh" }}>
            {reportViewLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Loading PDF…</span>
              </div>
            ) : pdfViewUrl ? (
              <iframe
                src={pdfViewUrl}
                className="w-full h-full"
                title={selectedReport?.title ?? "Report PDF"}
                style={{ border: "none" }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <FileText className="h-8 w-8 opacity-30" />
                <span className="text-sm">Could not load PDF preview</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Report Dialog */}
      <Dialog open={!!sendDialogReport} onOpenChange={o => { if (!o) closeSendDialog(); }}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-secondary" /> Send Report
            </DialogTitle>
            <DialogDescription>
              Select recipients from project contacts or enter a custom email.
            </DialogDescription>
          </DialogHeader>

          {sendSuccess ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
              <p className="font-semibold text-sidebar">Report sent successfully!</p>
              <p className="text-sm text-muted-foreground">The report has been emailed to the selected recipients.</p>
              <Button onClick={closeSendDialog} variant="outline">Close</Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Contact checkboxes */}
              {sendContacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project Contacts</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {sendContacts.filter(c => c.email).map(c => (
                      <label key={c.id} className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors">
                        <input
                          type="checkbox"
                          checked={sendSelectedIds.has(c.id)}
                          onChange={e => {
                            setSendSelectedIds(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(c.id) : next.delete(c.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 accent-secondary rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-sidebar">{c.name}</span>
                            {c.isPrimary && (
                              <span className="text-[10px] font-bold px-1 py-0 rounded bg-secondary/15 text-secondary border border-secondary/30 uppercase tracking-wide">Primary</span>
                            )}
                            {c.contactRole && (
                              <span className="text-xs text-violet-700">{contactRoleLabel(c.contactRole)}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {sendContacts.filter(c => !c.email).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {sendContacts.filter(c => !c.email).length} contact(s) have no email and are not shown.
                    </p>
                  )}
                </div>
              )}

              {/* Custom email */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional Recipient</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Input value={sendCustomEmail} onChange={e => setSendCustomEmail(e.target.value)} placeholder="email@example.com" type="email" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Name (optional)</label>
                    <Input value={sendCustomName} onChange={e => setSendCustomName(e.target.value)} placeholder="Full name" className="mt-1" />
                  </div>
                </div>
              </div>

              {sendError && <p className="text-xs text-red-500">{sendError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={closeSendDialog} disabled={sending}>Cancel</Button>
                <Button onClick={sendReport} disabled={sending} className="gap-1.5">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sending ? "Sending…" : `Send to ${sendSelectedIds.size + (sendCustomEmail.trim() ? 1 : 0)} recipient${sendSelectedIds.size + (sendCustomEmail.trim() ? 1 : 0) !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Inductions Tab ─────────────────────────────────────────────────────────────

interface InductionAttendee {
  id: number;
  inductionId: number;
  orgContractorId: number | null;
  internalStaffId: number | null;
  attendeeType: "contractor" | "staff";
  contractorName: string;
  contractorEmail: string | null;
  contractorTrade: string | null;
  attended: boolean;
  signedOff: boolean;
  signatureData: string | null;
  acknowledgedAt: string | null;
}

interface Induction {
  id: number;
  projectId: number;
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  location: string | null;
  conductedById: number | null;
  conductedByName: string | null;
  status: string;
  notes: string | null;
  checklistData: Record<string, Record<number, boolean>> | null;
  completedAt: string | null;
  attendees: InductionAttendee[];
  attendeeCount: number;
  createdAt: string;
}

type InductionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

function inductionStatusBadge(status: string) {
  const now = new Date();
  const map: Record<string, string> = {
    scheduled: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  };
  const label: Record<string, string> = {
    scheduled: "Scheduled",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${map[status] || "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {label[status] || status}
    </span>
  );
}

function isOverdue(induction: Induction) {
  if (induction.status !== "scheduled") return false;
  const today = new Date().toISOString().split("T")[0];
  return induction.scheduledDate < today;
}

interface StaffEntry {
  id: number;
  name: string;
  role: string;
  email: string | null;
}

interface BookAttendee {
  orgContractorId?: number;
  internalStaffId?: number;
  attendeeType: "contractor" | "staff";
  contractorName: string;
  contractorEmail?: string;
  contractorTrade?: string;
}

function InductionsTab({ projectId }: { projectId: number }) {
  const [inductions, setInductions] = useState<Induction[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [viewInduction, setViewInduction] = useState<Induction | null>(null);
  const [orgContractors, setOrgContractors] = useState<OrgContractorEntry[]>([]);
  const [assignedOrgIds, setAssignedOrgIds] = useState<number[]>([]);
  const [staffList, setStaffList] = useState<StaffEntry[]>([]);
  const [attendeeTab, setAttendeeTab] = useState<"contractors" | "staff">("contractors");

  // Book form state
  const [bookTitle, setBookTitle] = useState("Site Induction");
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("");
  const [bookLocation, setBookLocation] = useState("");
  const [bookConductorName, setBookConductorName] = useState("");
  const [bookAttendees, setBookAttendees] = useState<BookAttendee[]>([]);
  const [bookError, setBookError] = useState("");
  const [booking, setBooking] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [inds, orgList, assigned, staff] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/inductions`).catch(() => []),
        apiFetch("/api/org-contractors").catch(() => []),
        apiFetch(`/api/projects/${projectId}/org-contractor-assignments`).catch(() => []),
        apiFetch("/api/internal-staff").catch(() => []),
      ]);
      setInductions(inds);
      setOrgContractors(orgList);
      setAssignedOrgIds(assigned as number[]);
      setStaffList(staff);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const assignedContractors = orgContractors.filter(c => assignedOrgIds.includes(c.id));

  const toggleContractorAttendee = (contractor: OrgContractorEntry) => {
    const exists = bookAttendees.find(a => a.orgContractorId === contractor.id);
    if (exists) {
      setBookAttendees(prev => prev.filter(a => a.orgContractorId !== contractor.id));
    } else {
      setBookAttendees(prev => [...prev, {
        orgContractorId: contractor.id,
        attendeeType: "contractor",
        contractorName: contractor.name,
        contractorEmail: contractor.email ?? undefined,
        contractorTrade: contractor.trade ?? undefined,
      }]);
    }
  };

  const toggleStaffAttendee = (staff: StaffEntry) => {
    const exists = bookAttendees.find(a => a.internalStaffId === staff.id);
    if (exists) {
      setBookAttendees(prev => prev.filter(a => a.internalStaffId !== staff.id));
    } else {
      setBookAttendees(prev => [...prev, {
        internalStaffId: staff.id,
        attendeeType: "staff",
        contractorName: staff.name,
        contractorEmail: staff.email ?? undefined,
        contractorTrade: staff.role || undefined,
      }]);
    }
  };

  const handleBook = async () => {
    if (!bookDate.trim()) { setBookError("Please select a date."); return; }
    setBookError(""); setBooking(true);
    try {
      const created = await apiFetch(`/api/projects/${projectId}/inductions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookTitle.trim() || "Site Induction",
          scheduledDate: bookDate,
          scheduledTime: bookTime || null,
          location: bookLocation || null,
          conductedByName: bookConductorName || null,
          attendees: bookAttendees,
        }),
      });
      setInductions(prev => [created, ...prev]);
      setBookOpen(false);
      setBookTitle("Site Induction"); setBookDate(""); setBookTime(""); setBookLocation(""); setBookConductorName(""); setBookAttendees([]); setAttendeeTab("contractors");
    } catch {
      setBookError("Failed to book induction. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/api/inductions/${id}`, { method: "DELETE" });
      setInductions(prev => prev.filter(i => i.id !== id));
    } catch {} finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading inductions…
      </div>
    );
  }

  const upcoming = inductions.filter(i => i.status === "scheduled" || i.status === "in_progress");
  const completed = inductions.filter(i => i.status === "completed");
  const cancelled = inductions.filter(i => i.status === "cancelled");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sidebar">Site Inductions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {inductions.length} induction{inductions.length !== 1 ? "s" : ""} recorded
            {completed.length > 0 && ` · ${completed.length} completed`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={() => setBookOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Book Induction
          </Button>
        </div>
      </div>

      {inductions.length === 0 && (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-semibold text-sidebar">No inductions yet</p>
          <p className="text-sm mt-1">Book a site induction session to get started.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-sidebar border-b pb-2">Upcoming & Active</h3>
          {upcoming.map(ind => (
            <InductionCard key={ind.id} induction={ind} onView={setViewInduction} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-sidebar border-b pb-2">Completed</h3>
          {completed.map(ind => (
            <InductionCard key={ind.id} induction={ind} onView={setViewInduction} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground border-b pb-2">Cancelled</h3>
          {cancelled.map(ind => (
            <InductionCard key={ind.id} induction={ind} onView={setViewInduction} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      )}

      {/* Book Induction Dialog */}
      <Dialog open={bookOpen} onOpenChange={open => { if (!booking) setBookOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-secondary" />
              Book Site Induction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={bookTitle} onChange={e => setBookTitle(e.target.value)} placeholder="Site Induction" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Date *</label>
                <Input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Time</label>
                <Input type="time" value={bookTime} onChange={e => setBookTime(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input value={bookLocation} onChange={e => setBookLocation(e.target.value)} placeholder="e.g. Site office, main entrance" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Conductor Name</label>
              <Input value={bookConductorName} onChange={e => setBookConductorName(e.target.value)} placeholder="Name of person conducting the induction" className="mt-1" />
            </div>

            {(assignedContractors.length > 0 || staffList.length > 0) && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Attendees</label>
                <div className="flex gap-1 mb-2">
                  <button type="button" onClick={() => setAttendeeTab("contractors")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${attendeeTab === "contractors" ? "bg-secondary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    Contractors
                  </button>
                  <button type="button" onClick={() => setAttendeeTab("staff")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${attendeeTab === "staff" ? "bg-secondary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    Internal Staff
                  </button>
                </div>
                {attendeeTab === "contractors" && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {assignedContractors.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">No contractors assigned to this project.</p>
                    ) : (
                      assignedContractors.map(c => {
                        const selected = bookAttendees.some(a => a.orgContractorId === c.id);
                        return (
                          <button key={c.id} type="button" onClick={() => toggleContractorAttendee(c)}
                            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg border text-left transition-colors ${selected ? "bg-secondary/10 border-secondary/40" : "border-border hover:bg-muted/40"}`}>
                            <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${selected ? "bg-secondary border-secondary" : "border-muted-foreground/40"}`}>
                              {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-sidebar">{c.name}</p>
                              {c.trade && <p className="text-xs text-muted-foreground">{c.trade}</p>}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                {attendeeTab === "staff" && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {staffList.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">No internal staff found. Add staff members first.</p>
                    ) : (
                      staffList.map(s => {
                        const selected = bookAttendees.some(a => a.internalStaffId === s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => toggleStaffAttendee(s)}
                            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg border text-left transition-colors ${selected ? "bg-secondary/10 border-secondary/40" : "border-border hover:bg-muted/40"}`}>
                            <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${selected ? "bg-secondary border-secondary" : "border-muted-foreground/40"}`}>
                              {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-sidebar">{s.name}</p>
                              {s.role && <p className="text-xs text-muted-foreground">{s.role}</p>}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                {bookAttendees.length > 0 && (
                  <p className="text-xs text-secondary mt-1">{bookAttendees.length} attendee{bookAttendees.length !== 1 ? "s" : ""} selected</p>
                )}
              </div>
            )}

            {bookError && <p className="text-xs text-red-500">{bookError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setBookOpen(false)} disabled={booking}>Cancel</Button>
            <Button size="sm" onClick={handleBook} disabled={booking}>
              {booking ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
              {booking ? "Booking…" : "Book Induction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Induction Dialog */}
      {viewInduction && (
        <InductionDetailDialog
          induction={viewInduction}
          onClose={() => setViewInduction(null)}
          onRefresh={async () => {
            await load();
            const updated = await apiFetch(`/api/inductions/${viewInduction.id}`).catch(() => null);
            if (updated) setViewInduction(updated);
          }}
        />
      )}
    </div>
  );
}

function InductionCard({ induction, onView, onDelete, deleting }: {
  induction: Induction;
  onView: (ind: Induction) => void;
  onDelete: (id: number) => void;
  deleting: number | null;
}) {
  const overdue = isOverdue(induction);
  const signedCount = induction.attendees.filter(a => a.signedOff).length;

  return (
    <div className={`rounded-xl border bg-white p-4 transition-colors ${overdue ? "border-red-300 bg-red-50/30" : "border-border"}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          induction.status === "completed" ? "bg-green-100" :
          overdue ? "bg-red-100" :
          induction.status === "in_progress" ? "bg-amber-100" :
          "bg-blue-50"
        }`}>
          <ShieldCheck className={`h-5 w-5 ${
            induction.status === "completed" ? "text-green-700" :
            overdue ? "text-red-600" :
            induction.status === "in_progress" ? "text-amber-700" :
            "text-blue-700"
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-semibold text-sidebar text-sm">{induction.title}</p>
            {inductionStatusBadge(induction.status)}
            {overdue && (
              <span className="text-xs font-medium px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                Overdue
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(induction.scheduledDate)}
              {induction.scheduledTime && ` at ${induction.scheduledTime}`}
            </span>
            {induction.location && (
              <span className="flex items-center gap-1">
                <Building className="h-3 w-3" />
                {induction.location}
              </span>
            )}
            {induction.conductedByName && (
              <span className="flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                {induction.conductedByName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <UserCheck className="h-3 w-3" />
              {induction.attendeeCount} attendee{induction.attendeeCount !== 1 ? "s" : ""}
              {induction.attendeeCount > 0 && ` · ${signedCount} signed off`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => onView(induction)} className="text-xs">
            <Eye className="h-3.5 w-3.5 mr-1.5" /> View
          </Button>
          <button
            onClick={() => onDelete(induction.id)}
            disabled={deleting === induction.id}
            className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            title="Delete induction"
          >
            {deleting === induction.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface InductionAttachment {
  id: number;
  name: string;
  fileName: string;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
}

function InductionDetailDialog({ induction, onClose, onRefresh }: {
  induction: Induction;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(induction.notes || "");
  const [completing, setCompleting] = useState(false);
  const [attachments, setAttachments] = useState<InductionAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");

  useEffect(() => {
    setLoadingAttachments(true);
    apiFetch(`/api/inductions/${induction.id}/attachments`)
      .then(data => setAttachments(data))
      .catch(() => {})
      .finally(() => setLoadingAttachments(false));
  }, [induction.id]);

  const handleAddAttachment = async () => {
    if (!newFileName.trim()) return;
    setAddingFile(true);
    try {
      const doc = await apiFetch(`/api/inductions/${induction.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFileName.trim(),
          fileName: newFileName.trim(),
          fileUrl: newFileUrl.trim() || null,
        }),
      });
      setAttachments(prev => [doc, ...prev]);
      setNewFileName(""); setNewFileUrl(""); setAddingFile(false);
    } catch {
      setAddingFile(false);
    }
  };

  const handleDeleteAttachment = async (docId: number) => {
    try {
      await apiFetch(`/api/inductions/${induction.id}/attachments/${docId}`, { method: "DELETE" });
      setAttachments(prev => prev.filter(d => d.id !== docId));
    } catch {}
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/inductions/${induction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      await onRefresh();
    } finally { setSaving(false); }
  };

  const handleComplete = async () => {
    if (!confirm("Mark this induction as Completed?")) return;
    setCompleting(true);
    try {
      await apiFetch(`/api/inductions/${induction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      await onRefresh();
    } finally { setCompleting(false); }
  };

  const toggleAttendeeSignOff = async (att: InductionAttendee) => {
    try {
      await apiFetch(`/api/inductions/${induction.id}/attendees/${att.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attended: true, signedOff: !att.signedOff }),
      });
      await onRefresh();
    } catch {}
  };

  const allSignedOff = induction.attendees.length > 0 && induction.attendees.every(a => a.signedOff);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-secondary" />
            {induction.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Date</span>
              <p className="font-medium text-sidebar">{formatDate(induction.scheduledDate)}{induction.scheduledTime && ` at ${induction.scheduledTime}`}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <div className="mt-0.5">{inductionStatusBadge(induction.status)}</div>
            </div>
            {induction.location && (
              <div>
                <span className="text-xs text-muted-foreground">Location</span>
                <p className="font-medium text-sidebar">{induction.location}</p>
              </div>
            )}
            {induction.conductedByName && (
              <div>
                <span className="text-xs text-muted-foreground">Conductor</span>
                <p className="font-medium text-sidebar">{induction.conductedByName}</p>
              </div>
            )}
            {induction.completedAt && (
              <div>
                <span className="text-xs text-muted-foreground">Completed</span>
                <p className="font-medium text-sidebar">{formatDate(induction.completedAt)}</p>
              </div>
            )}
          </div>

          {/* Attendees */}
          <div>
            <h4 className="text-sm font-semibold text-sidebar mb-2">
              Attendees ({induction.attendees.length})
            </h4>
            {induction.attendees.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attendees recorded.</p>
            ) : (
              <div className="space-y-2">
                {induction.attendees.map(att => (
                  <div key={att.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${att.signedOff ? "bg-green-50 border-green-200" : "border-border bg-white"}`}>
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar">{att.contractorName}</p>
                      {att.contractorTrade && <p className="text-xs text-muted-foreground">{att.contractorTrade}</p>}
                    </div>
                    {att.signedOff ? (
                      <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium shrink-0">
                        <CheckCircle className="h-4 w-4" />
                        Signed off
                      </div>
                    ) : (
                      induction.status !== "completed" && (
                        <button
                          onClick={() => toggleAttendeeSignOff(att)}
                          className="text-xs border border-secondary/40 text-secondary hover:bg-secondary/10 px-2 py-1 rounded transition-colors shrink-0"
                        >
                          Sign off
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Session Notes</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this induction session…"
              disabled={induction.status === "completed"}
            />
            {induction.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={saving} className="mt-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save Notes
              </Button>
            )}
          </div>

          {/* Attachments */}
          <div>
            <h4 className="text-sm font-semibold text-sidebar mb-2 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              Attachments
            </h4>
            {loadingAttachments ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attachments yet.</p>
            ) : (
              <div className="space-y-2 mb-2">
                {attachments.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      {doc.fileUrl ? (
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-medium text-secondary hover:underline truncate block">{doc.name}</a>
                      ) : (
                        <span className="text-xs font-medium text-sidebar truncate block">{doc.name}</span>
                      )}
                    </div>
                    {induction.status !== "completed" && (
                      <button
                        onClick={() => handleDeleteAttachment(doc.id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                        title="Remove attachment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {induction.status !== "completed" && (
              <div className="space-y-1.5 border border-dashed rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground">Add attachment</p>
                <Input
                  placeholder="File name or description"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  className="text-xs h-7"
                />
                <Input
                  placeholder="File URL (optional)"
                  value={newFileUrl}
                  onChange={e => setNewFileUrl(e.target.value)}
                  className="text-xs h-7"
                />
                <Button size="sm" variant="outline" onClick={handleAddAttachment} disabled={addingFile || !newFileName.trim()} className="h-7 text-xs">
                  {addingFile ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {induction.status !== "completed" && induction.status !== "cancelled" && (
            <Button
              onClick={handleComplete}
              disabled={completing}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {completing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
              Mark as Completed
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

  // ── Activity Tab ─────────────────────────────────────────────────────────────

  interface ActivityEntry {
    id: number;
    action: string;
    description: string;
    userId: number;
    userName: string;
    createdAt: string;
  }

  function ActivityTab({ projectId }: { projectId: number }) {
    const [logs, setLogs] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const loadActivity = useCallback(async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/projects/${projectId}/activity`);
        setLogs(data);
      } catch {
      } finally {
        setLoading(false);
      }
    }, [projectId]);

    useEffect(() => { void loadActivity(); }, [loadActivity]);

    function actionIcon(action: string) {
      if (action === "created") return <span className="h-2.5 w-2.5 rounded-full bg-green-500 mt-1 shrink-0 block" />;
      if (action === "updated") return <span className="h-2.5 w-2.5 rounded-full bg-blue-500 mt-1 shrink-0 block" />;
      if (action === "deleted") return <span className="h-2.5 w-2.5 rounded-full bg-red-500 mt-1 shrink-0 block" />;
      return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 mt-1 shrink-0 block" />;
    }

    function formatRelative(iso: string) {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 7) return `${days}d ago`;
      return d.toLocaleDateString();
    }

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-sidebar">Activity Timeline</h2>
            <button
              onClick={loadActivity}
              className="text-xs text-secondary hover:text-secondary/80 font-medium transition-colors"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading activity…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No activity logged yet.</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-5">
                {logs.map(entry => (
                  <div key={entry.id} className="flex gap-3 relative">
                    <div className="absolute -left-[19px] top-1.5">
                      {actionIcon(entry.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-sidebar leading-snug">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <UserIcon className="h-3 w-3" />
                        <span>{entry.userName}</span>
                        <span>·</span>
                        <span title={new Date(entry.createdAt).toLocaleString()}>{formatRelative(entry.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }