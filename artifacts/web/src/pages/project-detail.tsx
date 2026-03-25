import React, { useState, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Button, Badge, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui";
import {
  ArrowLeft, Building, FileText, ClipboardList, CheckSquare, Plus, Upload,
  FolderPlus, Pencil, Trash2, Eye, EyeOff, File, Folder, FolderOpen,
  ChevronRight, Calendar, Clock, CheckCircle, AlertCircle, XCircle, MoreHorizontal,
  Download, Mail, Loader2, Link2, Unlink, Award, Send, BarChart2
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

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
}

interface InspectionTypeRow {
  templateId: number;
  name: string;
  inspectionType: string;
  folder: string;
  itemCount: number;
  isSelected: boolean;
}

interface Project {
  id: number;
  name: string;
  siteAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  clientName: string;
  builderName?: string;
  designerName?: string;
  daNumber?: string;
  certificationNumber?: string;
  buildingClassification: string;
  projectType: string;
  status: string;
  stage: string;
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
  const res = await fetch(`${apiBase()}${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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

const TABS = ["Overview", "Documents", "Inspections", "Inspection Types", "Reports"] as const;
type Tab = typeof TABS[number];

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [tab, setTab] = useState<Tab>("Overview");
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5" />
              {project.siteAddress}, {project.suburb} {project.state} {project.postcode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right text-sm">
              <div className="font-medium text-sidebar">{project.totalInspections} Inspections</div>
              <div className="text-muted-foreground">{project.openIssues} open issues</div>
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
      {tab === "Overview" && <OverviewTab project={project} onRefresh={loadProject} />}
      {tab === "Documents" && <DocumentsTab projectId={projectId} />}
      {tab === "Inspections" && <InspectionsTab project={project} />}
      {tab === "Inspection Types" && <InspectionTypesTab projectId={projectId} />}
      {tab === "Reports" && <ReportsTab projectId={projectId} />}
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

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, navigate] = useLocation();

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const data: any = {};
    fd.forEach((v, k) => { data[k] = v; });
    try {
      await apiFetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      onRefresh();
      setEditing(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main details */}
      <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-sidebar">Project Details</h2>
          <Button size="sm" variant={editing ? "outline" : "default"} onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : <><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</>}
          </Button>
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Project Name", name: "name", defaultValue: project.name },
                { label: "Client Name", name: "clientName", defaultValue: project.clientName },
                { label: "Builder Name", name: "builderName", defaultValue: project.builderName },
                { label: "Designer Name", name: "designerName", defaultValue: project.designerName },
                { label: "DA Number", name: "daNumber", defaultValue: project.daNumber },
                { label: "Certification Number", name: "certificationNumber", defaultValue: project.certificationNumber },
                { label: "Building Classification", name: "buildingClassification", defaultValue: project.buildingClassification },
                { label: "Start Date", name: "startDate", defaultValue: project.startDate, type: "date" },
              ].map(f => (
                <div key={f.name} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input name={f.name} type={f.type || "text"} defaultValue={f.defaultValue || ""} className="h-8 text-sm" />
                </div>
              ))}
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
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              { label: "Client", value: project.clientName },
              { label: "Builder", value: project.builderName || "—" },
              { label: "Designer", value: project.designerName || "—" },
              { label: "Project Type", value: project.projectType },
              { label: "Building Classification", value: project.buildingClassification },
              { label: "DA Number", value: project.daNumber || "—" },
              { label: "Certification Number", value: project.certificationNumber || "—" },
              { label: "Stage", value: project.stage?.replace("_", " ") },
              { label: "Start Date", value: project.startDate ? formatDate(project.startDate) : "—" },
              { label: "Expected Completion", value: project.expectedCompletionDate ? formatDate(project.expectedCompletionDate) : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                <div className="font-medium text-sidebar capitalize">{value}</div>
              </div>
            ))}
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
          <h3 className="text-sm font-semibold text-sidebar mb-3">Recent Inspections</h3>
          {project.inspections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections yet</p>
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
                    <div className="font-medium text-sidebar capitalize truncate group-hover:text-secondary transition-colors">{i.inspectionType.replace("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(i.scheduledDate)}</div>
                  </div>
                  {inspectionStatusBadge(i.status)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const { uploadURL, objectPath } = await apiFetch("/api/storage/uploads/request-url", { method: "POST" });
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
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

  return (
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
                  <TableHead className="text-center">In Inspection</TableHead>
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
                          <FileTypeIcon mimeType={doc.mimeType} />
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
                          ? <Eye className="h-4 w-4 text-green-500" />
                          : <EyeOff className="h-4 w-4 text-muted-foreground" />}
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
                          {doc.fileUrl && (
                            <a
                              href={`${apiBase()}/api/storage/objects${doc.fileUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-sidebar"
                              title="Download"
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

// ── Inspections Tab ───────────────────────────────────────────────────────────

function InspectionsTab({ project }: { project: Project }) {
  const inspections = project.inspections || [];
  const [, navigate] = useLocation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sidebar">{inspections.length} Inspection{inspections.length !== 1 ? "s" : ""}</h2>
        <Link href="/inspections">
          <Button size="sm">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Book Inspection
          </Button>
        </Link>
      </div>

      {inspections.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center gap-4 text-muted-foreground">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
          <div className="text-center">
            <p className="font-medium text-sidebar">No inspections yet</p>
            <p className="text-sm mt-1">Book the first inspection for this project</p>
          </div>
          <Link href="/inspections">
            <Button size="sm">Book Inspection</Button>
          </Link>
        </div>
      ) : (
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
              {inspections.map((insp, idx) => (
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
                          {insp.inspectionType.replace(/_/g, " ")}
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
                        >
                          <Mail className="h-3 w-3" /> Send Report
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Inspection Types Tab ──────────────────────────────────────────────────────

function InspectionTypesTab({ projectId }: { projectId: number }) {
  const [types, setTypes] = useState<InspectionTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/projects/${projectId}/inspection-types`);
      setTypes(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useState(() => { loadTypes(); });

  const toggle = (templateId: number) => {
    setTypes(prev => prev.map(t => t.templateId === templateId ? { ...t, isSelected: !t.isSelected } : t));
    setSaved(false);
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

  const folders = Array.from(new Set(types.map(t => t.folder))).sort();
  const selectedCount = types.filter(t => t.isSelected).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sidebar">Required Inspection Types</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Select which inspection types apply to this project</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 font-medium">Saved</span>}
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Saving…</> : "Save Selection"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          <div className="bg-muted/30 rounded-lg px-4 py-2 text-sm text-muted-foreground">
            {selectedCount} of {types.length} inspection types selected
          </div>

          <div className="space-y-5">
            {folders.map(folder => {
              const folderTypes = types.filter(t => t.folder === folder);
              const folderSelected = folderTypes.filter(t => t.isSelected).length;
              return (
                <div key={folder} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-sm text-sidebar">{folder}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{folderSelected}/{folderTypes.length} selected</span>
                  </div>
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
};

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

function ReportsTab({ projectId }: { projectId: number }) {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

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

  const openReport = (report: any) => {
    setSelectedReport(report);
    setViewOpen(true);
  };

  const approveReport = async (report: any) => {
    setActionBusy(true);
    try {
      await apiFetch(`/api/reports/${report.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" } });
      await load();
      setViewOpen(false);
    } catch {
    } finally {
      setActionBusy(false);
    }
  };

  const downloadPdf = async (report: any) => {
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`/api/reports/${report.id}/pdf`, {
        headers: { Authorization: `Basic ${token}` },
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
              className="flex items-start gap-4 p-4 bg-card border border-border rounded-xl hover:border-sidebar/30 transition-colors"
            >
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
                {report.status === "pending_review" && (
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Report viewer dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sidebar" />
              {selectedReport?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full border font-medium",
              REPORT_STATUS_STYLES[selectedReport?.status] || "bg-gray-50 text-gray-600 border-gray-200",
            )}>
              {selectedReport?.status === "pending_review" ? "Pending Review"
                : selectedReport?.status === "approved" ? "Approved"
                : selectedReport?.status === "sent" ? "Sent to Client"
                : "Draft"}
            </span>
            <span className="text-xs text-muted-foreground">By {selectedReport?.generatedByName}</span>
            <span className="text-xs text-muted-foreground">{formatDate(selectedReport?.createdAt)}</span>
            {selectedReport?.sentTo && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Send className="h-3 w-3" /> {selectedReport.sentTo}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {selectedReport?.content ? (
              <pre className="text-xs font-mono leading-relaxed p-4 bg-muted/30 rounded-lg whitespace-pre-wrap text-sidebar">
                {selectedReport.content}
              </pre>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No report content available</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedReport && downloadPdf(selectedReport)}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
            {selectedReport?.status === "pending_review" && (
              <Button
                onClick={async () => {
                  await approveReport(selectedReport);
                  setViewOpen(false);
                }}
                disabled={actionBusy}
                size="sm"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                {actionBusy ? "Approving…" : "Approve & Mark as Final"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
