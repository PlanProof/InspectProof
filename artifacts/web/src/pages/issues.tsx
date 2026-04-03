import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListIssues, useListProjects, useCreateIssue } from "@workspace/api-client-react";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Search, Plus, ExternalLink, Camera, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, X, CheckCircle2, Upload, Bell, AlertTriangle, Image } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
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

export default function Issues() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const { data: issues, isLoading } = useListIssues({});
  const { data: projects } = useListProjects({});
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [sortCol, setSortCol] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({
    title: "",
    description: "",
    severity: "medium",
    projectId: "",
    location: "",
  });
  const [createError, setCreateError] = useState("");
  const createIssue = useCreateIssue();

  // Close-out state
  const [showCloseout, setShowCloseout] = useState(false);
  const [closeoutNotes, setCloseoutNotes] = useState("");
  const [closeoutPhotos, setCloseoutPhotos] = useState<{ name: string; previewUrl: string; objectPath?: string }[]>([]);
  const [closingOut, setClosingOut] = useState(false);
  const [closeoutError, setCloseoutError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Overdue reminders
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ sent: number; overdue: number } | null>(null);

  const handleCreate = async () => {
    setCreateError("");
    if (!newForm.title.trim()) { setCreateError("Title is required."); return; }
    try {
      await createIssue.mutateAsync({
        data: {
          title: newForm.title.trim(),
          description: newForm.description.trim() || "",
          severity: newForm.severity as any,
          projectId: (newForm.projectId ? parseInt(newForm.projectId) : null) as any,
          location: newForm.location.trim() || null,
        } as any,
      });
      queryClient.invalidateQueries({ queryKey: ["listIssues"] });
      setShowCreate(false);
      setNewForm({ title: "", description: "", severity: "medium", projectId: "", location: "" });
    } catch (err: any) {
      setCreateError(err?.message ?? "Failed to create issue.");
    }
  };

  const handleCloseoutPhotoAdd = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      setCloseoutPhotos(prev => [...prev, { name: file.name, previewUrl }]);
      try {
        const token = localStorage.getItem("inspectproof_token") || "";
        const uploadRes = await fetch(`${apiBase()}/api/storage/uploads/file`, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "image/jpeg",
            "X-File-Content-Type": file.type || "image/jpeg",
            Authorization: `Bearer ${token}`,
          },
          body: file,
        });
        if (uploadRes.ok) {
          const { objectPath } = await uploadRes.json();
          setCloseoutPhotos(prev =>
            prev.map(p => p.previewUrl === previewUrl ? { ...p, objectPath } : p)
          );
        }
      } catch {
      }
    }
  };

  const handleCloseout = async () => {
    if (!selectedIssue) return;
    setCloseoutError("");
    setClosingOut(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const photoPaths = closeoutPhotos.filter(p => p.objectPath).map(p => p.objectPath!);
      const res = await fetch(`${apiBase()}/api/issues/${selectedIssue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: "resolved",
          closeoutNotes,
          closeoutPhotos: JSON.stringify(photoPaths),
        }),
      });
      if (!res.ok) throw new Error("Failed to close out issue");
      queryClient.invalidateQueries({ queryKey: ["listIssues"] });
      setShowCloseout(false);
      setSelectedIssue(null);
      setCloseoutNotes("");
      setCloseoutPhotos([]);
    } catch (err: any) {
      setCloseoutError(err.message ?? "Failed to close issue");
    } finally {
      setClosingOut(false);
    }
  };

  const handleSendReminders = async () => {
    setSendingReminders(true);
    setReminderResult(null);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/send-overdue-reminders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReminderResult({ sent: data.remindersSent, overdue: data.overdueCount });
      }
    } catch {
    } finally {
      setSendingReminders(false);
    }
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filtered = issues?.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(search.toLowerCase()) || issue.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || issue.status === statusFilter.toLowerCase().replace(" ", "_");
    const matchesSeverity = severityFilter === "All" || issue.severity === severityFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...(filtered ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortCol) {
      case "id":           return (a.id - b.id) * dir;
      case "title":        return a.title.localeCompare(b.title) * dir;
      case "severity":     return ((SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4)) * dir;
      case "status":       return a.status.localeCompare(b.status) * dir;
      case "projectName":  return (a.projectName ?? "").localeCompare(b.projectName ?? "") * dir;
      case "assigneeName": return ((a as any).assigneeName ?? "").localeCompare((b as any).assigneeName ?? "") * dir;
      case "createdAt":    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") * dir;
      default: return 0;
    }
  });

  const openCount = issues?.filter(i => i.status === "open").length ?? 0;
  const overdueCount = issues?.filter(i => {
    if (!i.dueDate || i.status === "resolved") return false;
    return new Date(i.dueDate) < new Date();
  }).length ?? 0;

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Issues & Defects</h1>
          <p className="text-muted-foreground mt-1">Track and manage non-compliances and defects.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendReminders}
            disabled={sendingReminders}
            className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
          >
            {sendingReminders
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Bell className="h-3.5 w-3.5" />}
            Send Overdue Reminders
          </Button>
          <Button className="shadow-lg shadow-primary/20" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Issue
          </Button>
        </div>
      </div>

      {/* Stat bar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="flex-1 min-w-[140px] bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-red-700">{openCount}</p>
          <p className="text-xs text-red-500 font-medium">Open Issues</p>
        </div>
        <div className={`flex-1 min-w-[140px] rounded-xl px-4 py-3 ${overdueCount > 0 ? "bg-orange-50 border border-orange-100" : "bg-muted/30 border border-border"}`}>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-orange-700" : "text-muted-foreground"}`}>{overdueCount}</p>
          <p className={`text-xs font-medium ${overdueCount > 0 ? "text-orange-500" : "text-muted-foreground"}`}>Overdue</p>
        </div>
        <div className="flex-1 min-w-[140px] bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-green-700">{issues?.filter(i => i.status === "resolved").length ?? 0}</p>
          <p className="text-xs text-green-500 font-medium">Resolved</p>
        </div>
      </div>

      {reminderResult && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Sent {reminderResult.sent} reminder{reminderResult.sent !== 1 ? "s" : ""} for {reminderResult.overdue} overdue issue{reminderResult.overdue !== 1 ? "s" : ""}.
          <button onClick={() => setReminderResult(null)} className="ml-auto text-green-600 hover:text-green-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b flex flex-wrap items-center gap-4 bg-muted/20">
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          <div className="flex items-center gap-2">
            {["All", "Open", "In Progress", "Resolved"].map(status => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={statusFilter === status ? "bg-sidebar text-white hover:bg-sidebar/90" : ""}
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="flex h-9 w-[150px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="All">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading issues...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col="id" label="ID" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="title" label="Title" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="severity" label="Severity" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="projectName" label="Project" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="assigneeName" label="Assigned To" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="createdAt" label="Created" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((issue) => (
                <TableRow key={issue.id} className="group cursor-pointer hover:bg-muted/50" onClick={() => setSelectedIssue(issue)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{issue.id}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sidebar">{issue.title}</div>
                    {issue.dueDate && new Date(issue.dueDate) < new Date() && issue.status !== "resolved" && (
                      <span className="text-[10px] text-orange-600 font-semibold flex items-center gap-0.5 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> Overdue
                      </span>
                    )}
                  </TableCell>
                  <TableCell><SeverityBadge severity={issue.severity} /></TableCell>
                  <TableCell><StatusBadge status={issue.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{issue.projectName}</TableCell>
                  <TableCell>{(issue as any).assigneeName || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{formatDate(issue.createdAt)}</TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center p-8 text-muted-foreground">
                    No issues found matching filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Issue Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setCreateError(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Brief description of the issue"
                value={newForm.title}
                onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Severity <span className="text-red-500">*</span></Label>
                <select
                  value={newForm.severity}
                  onChange={e => setNewForm(f => ({ ...f, severity: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <select
                  value={newForm.projectId}
                  onChange={e => setNewForm(f => ({ ...f, projectId: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">No project</option>
                  {(projects as any[] ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Location / Element</Label>
              <Input
                placeholder="e.g. Level 2, South wall"
                value={newForm.location}
                onChange={e => setNewForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                placeholder="Detailed description of the defect or non-compliance"
                value={newForm.description}
                onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            {createError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <X className="h-3.5 w-3.5 shrink-0" />{createError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreateError(""); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createIssue.isPending} className="gap-2">
              {createIssue.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {createIssue.isPending ? "Creating…" : "Create Issue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Issue Detail Dialog */}
      <Dialog open={!!selectedIssue && !showCloseout} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-muted-foreground">#{selectedIssue?.id}</span>
              <DialogTitle>{selectedIssue?.title}</DialogTitle>
            </div>
          </DialogHeader>

          {selectedIssue && (
            <div className="space-y-5 mt-2">
              <div className="flex flex-wrap gap-3 items-center">
                <SeverityBadge severity={selectedIssue.severity} />
                <StatusBadge status={selectedIssue.status} />
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" />
                  {selectedIssue.projectName}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</Label>
                <div className="bg-muted/30 p-4 rounded-md border text-sm text-sidebar">
                  {selectedIssue.description || "No description provided."}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Assigned To</Label>
                  <div className="font-medium">{selectedIssue.assigneeName || "Unassigned"}</div>
                </div>
                {selectedIssue.location && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Location</Label>
                    <div>{selectedIssue.location}</div>
                  </div>
                )}
                {selectedIssue.dueDate && (
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Due Date</Label>
                    <div className={new Date(selectedIssue.dueDate) < new Date() && selectedIssue.status !== "resolved" ? "text-orange-600 font-semibold" : ""}>
                      {selectedIssue.dueDate}
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Created</Label>
                  <div>{formatDate(selectedIssue.createdAt)}</div>
                </div>
              </div>

              {selectedIssue.closeoutNotes && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Close-out Notes</Label>
                  <div className="bg-green-50 border border-green-100 p-3 rounded-md text-sm text-green-800">
                    {selectedIssue.closeoutNotes}
                  </div>
                </div>
              )}

              {selectedIssue.status !== "resolved" && (
                <div className="pt-2 border-t border-border flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedIssue(null)}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => setShowCloseout(true)}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Close Out Issue
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close-out Dialog */}
      <Dialog open={showCloseout} onOpenChange={(open) => { if (!open) { setShowCloseout(false); setCloseoutError(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Close Out: {selectedIssue?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-sm text-green-800">
              Closing out this issue will mark it as resolved and record the evidence.
            </div>
            <div className="space-y-1.5">
              <Label>Close-out Notes</Label>
              <textarea
                placeholder="Describe the remediation work completed and how the defect was resolved…"
                value={closeoutNotes}
                onChange={e => setCloseoutNotes(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Evidence Photos
              </Label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleCloseoutPhotoAdd(e.target.files)}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-4 text-center text-sm text-muted-foreground hover:border-secondary/50 hover:bg-muted/20 transition-colors flex flex-col items-center gap-2"
              >
                <Upload className="h-6 w-6 text-muted-foreground/50" />
                <span>Tap to upload evidence photos</span>
                <span className="text-xs">JPG, PNG, HEIC accepted</span>
              </button>
              {closeoutPhotos.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {closeoutPhotos.map((p, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={p.previewUrl}
                        alt={p.name}
                        className="w-16 h-16 object-cover rounded-md border border-border"
                      />
                      {!p.objectPath && (
                        <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
                          <Loader2 className="h-4 w-4 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        onClick={() => setCloseoutPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full items-center justify-center hidden group-hover:flex text-xs"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {closeoutError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />{closeoutError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setShowCloseout(false); setCloseoutError(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCloseout}
              disabled={closingOut}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              {closingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {closingOut ? "Closing…" : "Confirm Close Out"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const getStyles = () => {
    switch(normalized) {
      case "critical": return "bg-red-500 text-white border-transparent";
      case "high": return "bg-orange-500 text-white border-transparent";
      case "medium": return "bg-yellow-500 text-white border-transparent";
      case "low": return "bg-blue-500 text-white border-transparent";
      default: return "bg-gray-500 text-white border-transparent";
    }
  };
  return <Badge className={`capitalize ${getStyles()}`}>{severity}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace('_', ' ');
  const getStyles = () => {
    switch(normalized) {
      case "open": return "border-red-200 bg-red-50 text-red-700";
      case "in progress": return "border-blue-200 bg-blue-50 text-blue-700";
      case "resolved": return "border-green-200 bg-green-50 text-green-700";
      default: return "border-gray-200 bg-gray-50 text-gray-700";
    }
  };
  return <Badge variant="outline" className={`capitalize ${getStyles()}`}>{normalized}</Badge>;
}
