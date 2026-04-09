import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListIssues, useListProjects, useListUsers, useCreateIssue } from "@workspace/api-client-react";
import type { Issue, CreateIssueRequestSeverity, CreateIssueRequestPriority, CreateIssueRequestStatus } from "@workspace/api-client-react";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Search, Plus, ExternalLink, Camera, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, X, CheckCircle2, Upload, Bell, AlertTriangle, Image, MessageSquare, Clock, User, ArrowRight, Ban, Square, CheckSquare, Users, Tag, Archive } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

const ISSUE_CATEGORIES = [
  "Structural",
  "Electrical",
  "Plumbing",
  "Fire Safety",
  "Waterproofing",
  "Roofing",
  "Cladding",
  "HVAC",
  "Accessibility",
  "Finishes",
  "Site Safety",
  "Documentation",
  "Other",
];

const ISSUE_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending_review", label: "Pending Review" },
  { value: "closed", label: "Closed" },
  { value: "rejected", label: "Rejected / Not Required" },
];

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

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getActionIcon(action: string) {
  switch (action) {
    case "created": return <Plus className="h-3.5 w-3.5 text-blue-500" />;
    case "closed": return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case "rejected": return <Ban className="h-3.5 w-3.5 text-red-500" />;
    case "assigned": return <User className="h-3.5 w-3.5 text-purple-500" />;
    case "status_changed": return <ArrowRight className="h-3.5 w-3.5 text-orange-500" />;
    case "commented": return <MessageSquare className="h-3.5 w-3.5 text-secondary" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export default function Issues() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const { data: issues, isLoading } = useListIssues({});
  const { data: projects } = useListProjects({});
  const { data: users } = useListUsers({});
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [sortCol, setSortCol] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailTab, setDetailTab] = useState<"details" | "history">("details");

  // Staff for assignee picker
  const [staffList, setStaffList] = useState<{ id: number; name: string; role: string; email?: string | null }[]>([]);
  useEffect(() => {
    const token = localStorage.getItem("inspectproof_token") || "";
    fetch(`${apiBase()}/api/internal-staff`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setStaffList)
      .catch(() => {});
  }, []);

  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState({
    title: "",
    description: "",
    severity: "medium",
    category: "",
    priority: "normal",
    projectId: "",
    location: "",
    dueDate: "",
    assignedToId: "",
    status: "open",
  });
  const [createPhotos, setCreatePhotos] = useState<{ name: string; previewUrl: string; objectPath?: string }[]>([]);
  const createPhotoInputRef = useRef<HTMLInputElement>(null);
  const [createError, setCreateError] = useState("");
  const createIssue = useCreateIssue();

  // Close-out state
  const [showCloseout, setShowCloseout] = useState(false);
  const [closeoutNotes, setCloseoutNotes] = useState("");
  const [closeoutPhotos, setCloseoutPhotos] = useState<{ name: string; previewUrl: string; objectPath?: string }[]>([]);
  const [closingOut, setClosingOut] = useState(false);
  const [closeoutError, setCloseoutError] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Reject state
  const [showReject, setShowReject] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState("");

  // Detail panel state
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingAssignee, setUpdatingAssignee] = useState(false);

  // History/comments
  const [historyFeed, setHistoryFeed] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Overdue reminders
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ sent: number; overdue: number } | null>(null);

  const loadHistory = async (issueId: number) => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/${issueId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistoryFeed(await res.json());
      }
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectIssue = (issue: any) => {
    setSelectedIssue(issue);
    setDetailTab("details");
    setHistoryFeed([]);
    setCommentText("");
    loadHistory(issue.id);
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !selectedIssue) return;
    setPostingComment(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/${selectedIssue.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText("");
        loadHistory(selectedIssue.id);
      }
    } catch {
    } finally {
      setPostingComment(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedIssue || updatingStatus) return;
    if (newStatus === "closed") { setShowCloseout(true); return; }
    if (newStatus === "rejected") { setShowReject(true); return; }
    setUpdatingStatus(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/${selectedIssue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedIssue(updated);
        queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
        loadHistory(selectedIssue.id);
      }
    } catch {
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssigneeChange = async (assignedToId: string) => {
    if (!selectedIssue) return;
    setUpdatingAssignee(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/${selectedIssue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignedToId: assignedToId ? parseInt(assignedToId) : null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedIssue(updated);
        queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      }
    } catch {
    } finally {
      setUpdatingAssignee(false);
    }
  };

  const handleCreatePhotoAdd = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const previewUrl = URL.createObjectURL(file);
      setCreatePhotos(prev => [...prev, { name: file.name, previewUrl }]);
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
          setCreatePhotos(prev =>
            prev.map(p => p.previewUrl === previewUrl ? { ...p, objectPath } : p)
          );
        }
      } catch {
      }
    }
  };

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [bulkActionResult, setBulkActionResult] = useState<string | null>(null);

  // Bulk action dialogs
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignId, setBulkAssignId] = useState<string>("");
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");

  const handleCreate = async () => {
    setCreateError("");
    if (!newForm.title.trim()) { setCreateError("Title is required."); return; }
    if (!newForm.severity) { setCreateError("Severity is required."); return; }
    try {
      const photoPaths = createPhotos.filter(p => p.objectPath).map(p => p.objectPath!);
      await createIssue.mutateAsync({
        data: {
          title: newForm.title.trim(),
          description: newForm.description.trim() || "",
          severity: newForm.severity as CreateIssueRequestSeverity,
          category: newForm.category || null,
          priority: (newForm.priority || null) as CreateIssueRequestPriority | null,
          photos: photoPaths.length > 0 ? JSON.stringify(photoPaths) : null,
          projectId: newForm.projectId ? parseInt(newForm.projectId) : null,
          location: newForm.location.trim() || null,
          dueDate: newForm.dueDate || null,
          assignedToId: newForm.assignedToId ? parseInt(newForm.assignedToId) : null,
          status: (newForm.status || "open") as CreateIssueRequestStatus,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      setShowCreate(false);
      setNewForm({ title: "", description: "", severity: "medium", category: "", priority: "normal", projectId: "", location: "", dueDate: "", assignedToId: "", status: "open" });
      setCreatePhotos([]);
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
    if (!closeoutNotes.trim()) { setCloseoutError("Close-out notes are required."); return; }
    setCloseoutError("");
    setClosingOut(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const photoPaths = closeoutPhotos.filter(p => p.objectPath).map(p => p.objectPath!);
      const res = await fetch(`${apiBase()}/api/issues/${selectedIssue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: "closed",
          closeoutNotes,
          closeoutPhotos: JSON.stringify(photoPaths),
        }),
      });
      if (!res.ok) throw new Error("Failed to close out issue");
      const updated = await res.json();
      setSelectedIssue(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      setShowCloseout(false);
      setCloseoutNotes("");
      setCloseoutPhotos([]);
      loadHistory(selectedIssue.id);
    } catch (err: any) {
      setCloseoutError(err.message ?? "Failed to close issue");
    } finally {
      setClosingOut(false);
    }
  };

  const handleReject = async () => {
    if (!selectedIssue) return;
    if (!rejectNotes.trim()) { setRejectError("Reason is required."); return; }
    setRejectError("");
    setRejecting(true);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/${selectedIssue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "rejected", closeoutNotes: rejectNotes }),
      });
      if (!res.ok) throw new Error("Failed to reject issue");
      const updated = await res.json();
      setSelectedIssue(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      setShowReject(false);
      setRejectNotes("");
      loadHistory(selectedIssue.id);
    } catch (err: any) {
      setRejectError(err.message ?? "Failed to reject issue");
    } finally {
      setRejecting(false);
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
    const matchesStatus = statusFilter === "All" || issue.status === statusFilter.toLowerCase().replace(/ /g, "_");
    const matchesSeverity = severityFilter === "All" || issue.severity === severityFilter.toLowerCase();
    const matchesCategory = categoryFilter === "All" || issue.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesSeverity && matchesCategory;
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
      case "assigneeName": return ((a.assigneeName || (a as any).responsibleParty) ?? "").localeCompare(((b.assigneeName || (b as any).responsibleParty) ?? "")) * dir;
      case "createdAt":    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") * dir;
      default: return 0;
    }
  });

  const openCount = issues?.filter(i => i.status === "open").length ?? 0;
  const inProgressCount = issues?.filter(i => i.status === "in_progress").length ?? 0;
  const pendingReviewCount = issues?.filter(i => i.status === "pending_review").length ?? 0;
  const closedCount = issues?.filter(i => i.status === "closed" || (i.status as string) === "resolved").length ?? 0;
  const overdueCount = issues?.filter(i => {
    if (!i.dueDate || ["closed", "resolved", "rejected"].includes(i.status)) return false;
    return new Date(i.dueDate) < new Date();
  }).length ?? 0;

  // Valid status transitions
  const getNextStatuses = (currentStatus: string) => {
    switch (currentStatus) {
      case "open": return ["in_progress", "rejected"];
      case "in_progress": return ["pending_review", "closed", "rejected"];
      case "pending_review": return ["closed", "in_progress", "rejected"];
      default: return [];
    }
  };

  const isTerminal = (status: string) => ["closed", "resolved", "rejected"].includes(status);

  const issuePhotos = selectedIssue?.photos ? (() => {
    try { return JSON.parse(selectedIssue.photos) as string[]; } catch { return []; }
  })() : [];

  const closeoutPhotoUrls = selectedIssue?.closeoutPhotos ? (() => {
    try { return JSON.parse(selectedIssue.closeoutPhotos) as string[]; } catch { return []; }
  })() : [];

  // Bulk selection helpers
  const visibleIds = sorted.map(i => i.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;
  const totalMatchingCount = filtered?.length ?? 0;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const toggleSelectOne = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectAllMatching(false);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  };

  const doBulkAction = async (action: string, patch: Record<string, any>) => {
    setBulkActionPending(true);
    setBulkActionResult(null);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const body = selectAllMatching
        ? { filterAll: true, patch, action }
        : { ids: Array.from(selectedIds), patch, action };
      const res = await fetch(`${apiBase()}/api/issues/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Bulk action failed");
      const data = await res.json();
      setBulkActionResult(data.description ?? "Bulk action completed");
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      clearSelection();
    } catch (err: any) {
      setBulkActionResult("Error: " + (err.message ?? "Bulk action failed"));
    } finally {
      setBulkActionPending(false);
    }
  };

  const doBulkRemind = async () => {
    setBulkActionPending(true);
    setBulkActionResult(null);
    try {
      const token = localStorage.getItem("inspectproof_token") || "";
      const res = await fetch(`${apiBase()}/api/issues/bulk-remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Failed to send reminders");
      const data = await res.json();
      setBulkActionResult(`Sent ${data.remindersSent} reminder email${data.remindersSent !== 1 ? "s" : ""}`);
      clearSelection();
    } catch (err: any) {
      setBulkActionResult("Error: " + (err.message ?? "Failed"));
    } finally {
      setBulkActionPending(false);
    }
  };

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
        <div className="flex-1 min-w-[120px] bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-red-700">{openCount}</p>
          <p className="text-xs text-red-500 font-medium">Open</p>
        </div>
        <div className="flex-1 min-w-[120px] bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-blue-700">{inProgressCount}</p>
          <p className="text-xs text-blue-500 font-medium">In Progress</p>
        </div>
        <div className="flex-1 min-w-[120px] bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-yellow-700">{pendingReviewCount}</p>
          <p className="text-xs text-yellow-500 font-medium">Pending Review</p>
        </div>
        <div className="flex-1 min-w-[120px] bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <p className="text-2xl font-bold text-green-700">{closedCount}</p>
          <p className="text-xs text-green-500 font-medium">Closed</p>
        </div>
        <div className={`flex-1 min-w-[120px] rounded-xl px-4 py-3 ${overdueCount > 0 ? "bg-orange-50 border border-orange-100" : "bg-muted/30 border border-border"}`}>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-orange-700" : "text-muted-foreground"}`}>{overdueCount}</p>
          <p className={`text-xs font-medium ${overdueCount > 0 ? "text-orange-500" : "text-muted-foreground"}`}>Overdue</p>
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

      {bulkActionResult && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {bulkActionResult}
          <button onClick={() => setBulkActionResult(null)} className="ml-auto text-blue-600 hover:text-blue-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b flex flex-wrap items-center gap-3 bg-muted/20">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {["All", "Open", "In Progress", "Pending Review", "Closed", "Rejected"].map(status => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={cn("text-xs px-2.5", statusFilter === status ? "bg-sidebar text-white hover:bg-sidebar/90" : "")}
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="flex h-9 w-[140px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="All">All Categories</option>
              {ISSUE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="flex h-9 w-[140px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="All">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        {/* Select-all-matching banner */}
        {allVisibleSelected && !selectAllMatching && totalMatchingCount > visibleIds.length && (
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex items-center gap-3">
            <span>All {visibleIds.length} issues on this page are selected.</span>
            <button
              className="font-semibold underline underline-offset-2 hover:text-blue-900"
              onClick={() => setSelectAllMatching(true)}
            >
              Select all {totalMatchingCount} matching issues
            </button>
          </div>
        )}
        {selectAllMatching && (
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex items-center gap-3">
            <span>All {totalMatchingCount} matching issues are selected.</span>
            <button
              className="font-semibold underline underline-offset-2 hover:text-blue-900"
              onClick={clearSelection}
            >
              Clear selection
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading issues...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-sidebar transition-colors"
                    title={allVisibleSelected ? "Deselect all" : "Select all on page"}
                  >
                    {allVisibleSelected
                      ? <CheckSquare className="h-4 w-4 text-secondary" />
                      : <Square className="h-4 w-4" />}
                  </button>
                </TableHead>
                <SortableHead col="id" label="ID" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="title" label="Title" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="severity" label="Severity / Priority" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="projectName" label="Project" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="assigneeName" label="Assigned To" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead col="createdAt" label="Created" sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((issue) => {
                const isChecked = selectedIds.has(issue.id) || selectAllMatching;
                return (
                  <TableRow
                    key={issue.id}
                    className={cn("group cursor-pointer hover:bg-muted/50", isChecked && "bg-blue-50/40")}
                    onClick={() => handleSelectIssue(issue)}
                  >
                    <TableCell onClick={e => toggleSelectOne(issue.id, e)}>
                      {isChecked
                        ? <CheckSquare className="h-4 w-4 text-secondary" />
                        : <Square className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/80" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{issue.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sidebar">{issue.title}</div>
                      {issue.category && (
                        <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{issue.category}</span>
                      )}
                      {issue.dueDate && new Date(issue.dueDate) < new Date() && !["closed", "resolved", "rejected"].includes(issue.status) && (
                        <span className="text-[10px] text-orange-600 font-semibold flex items-center gap-0.5 mt-0.5">
                          <AlertTriangle className="h-3 w-3" /> Overdue
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <SeverityBadge severity={issue.severity} />
                        {issue.priority && <PriorityBadge priority={issue.priority} />}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={issue.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{issue.projectName}</TableCell>
                    <TableCell>{(issue as any).assigneeName || (issue as any).responsibleParty || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">{formatDate(issue.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center p-8 text-muted-foreground">
                    No issues found matching filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Issue Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setCreateError(""); setCreatePhotos([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Issue / Defect</DialogTitle>
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
                <Label>Category</Label>
                <select
                  value={newForm.category}
                  onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select category</option>
                  {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select
                  value={newForm.priority}
                  onChange={e => setNewForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>
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
                <Label>Status</Label>
                <select
                  value={newForm.status}
                  onChange={e => setNewForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="closed">Closed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <select
                  value={newForm.projectId}
                  onChange={e => setNewForm(f => ({ ...f, projectId: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">No project</option>
                  {(projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={newForm.dueDate}
                  onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Location / Element</Label>
                <Input
                  placeholder="e.g. Level 2, South wall"
                  value={newForm.location}
                  onChange={e => setNewForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned To</Label>
                <select
                  value={newForm.assignedToId}
                  onChange={e => setNewForm(f => ({ ...f, assignedToId: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Unassigned</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>
                  ))}
                </select>
              </div>
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

            {/* Photo upload */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Photos
              </Label>
              <input
                ref={createPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleCreatePhotoAdd(e.target.files)}
              />
              <button
                onClick={() => createPhotoInputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-lg p-3 text-center text-sm text-muted-foreground hover:border-secondary/50 hover:bg-muted/20 transition-colors flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4 text-muted-foreground/50" />
                <span>Attach photos (optional)</span>
              </button>
              {createPhotos.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {createPhotos.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.previewUrl} alt={p.name} className="w-16 h-16 object-cover rounded-md border border-border" />
                      {!p.objectPath && (
                        <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center">
                          <Loader2 className="h-4 w-4 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        onClick={() => setCreatePhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full items-center justify-center hidden group-hover:flex text-xs"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {createError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <X className="h-3.5 w-3.5 shrink-0" />{createError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreateError(""); setCreatePhotos([]); }}>
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
      <Dialog open={!!selectedIssue && !showCloseout && !showReject} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-muted-foreground">#{selectedIssue?.id}</span>
              <DialogTitle className="flex-1">{selectedIssue?.title}</DialogTitle>
            </div>
          </DialogHeader>

          {selectedIssue && (
            <>
              {/* Tabs */}
              <div className="flex gap-0 border-b border-border -mx-6 px-6">
                <button
                  onClick={() => setDetailTab("details")}
                  className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", detailTab === "details" ? "border-sidebar text-sidebar" : "border-transparent text-muted-foreground hover:text-sidebar")}
                >
                  Details
                </button>
                <button
                  onClick={() => { setDetailTab("history"); }}
                  className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5", detailTab === "history" ? "border-sidebar text-sidebar" : "border-transparent text-muted-foreground hover:text-sidebar")}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  History & Comments
                  {historyFeed.length > 0 && (
                    <span className="bg-muted text-muted-foreground text-xs rounded-full px-1.5 py-0.5">{historyFeed.length}</span>
                  )}
                </button>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0">
                {detailTab === "details" && (
                  <div className="space-y-5 mt-2 pb-4">
                    <div className="flex flex-wrap gap-2 items-center">
                      <SeverityBadge severity={selectedIssue.severity} />
                      {selectedIssue.priority && <PriorityBadge priority={selectedIssue.priority} />}
                      <StatusBadge status={selectedIssue.status} />
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <ExternalLink className="h-4 w-4" />
                        {selectedIssue.projectName}
                      </div>
                      {selectedIssue.category && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">{selectedIssue.category}</span>
                      )}
                    </div>

                    {/* Status controls */}
                    {!isTerminal(selectedIssue.status) && (
                      <div className="flex items-center gap-3">
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">Change Status</Label>
                        <div className="flex gap-2 flex-wrap">
                          {getNextStatuses(selectedIssue.status).map(s => (
                            <Button
                              key={s}
                              size="sm"
                              variant="outline"
                              disabled={updatingStatus}
                              onClick={() => handleStatusChange(s)}
                              className={cn("text-xs gap-1", s === "rejected" ? "text-red-600 border-red-200 hover:bg-red-50" : s === "closed" ? "text-green-600 border-green-200 hover:bg-green-50" : "")}
                            >
                              {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                              {ISSUE_STATUSES.find(x => x.value === s)?.label || s}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Assignee picker */}
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Assigned To</Label>
                      <select
                        value={selectedIssue.assignedToId?.toString() || ""}
                        onChange={e => handleAssigneeChange(e.target.value)}
                        disabled={updatingAssignee}
                        className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-1"
                      >
                        <option value="">Unassigned</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>
                        ))}
                      </select>
                      {updatingAssignee && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</Label>
                      <div className="bg-muted/30 p-4 rounded-md border text-sm text-sidebar">
                        {selectedIssue.description || "No description provided."}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      {selectedIssue.location && (
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Location</Label>
                          <div>{selectedIssue.location}</div>
                        </div>
                      )}
                      {selectedIssue.dueDate && (
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Due Date</Label>
                          <div className={new Date(selectedIssue.dueDate) < new Date() && !isTerminal(selectedIssue.status) ? "text-orange-600 font-semibold" : ""}>
                            {selectedIssue.dueDate}
                          </div>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Created</Label>
                        <div>{formatDate(selectedIssue.createdAt)}</div>
                      </div>
                      {selectedIssue.resolvedDate && (
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">Resolved</Label>
                          <div className="text-green-600">{selectedIssue.resolvedDate}</div>
                        </div>
                      )}
                    </div>

                    {/* Photos */}
                    {issuePhotos.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Photos</Label>
                        <div className="flex gap-2 flex-wrap">
                          {issuePhotos.map((path, i) => (
                            <a key={i} href={`${apiBase()}/api/storage${path}`} target="_blank" rel="noopener noreferrer">
                              <img
                                src={`${apiBase()}/api/storage${path}`}
                                alt={`Photo ${i + 1}`}
                                className="w-20 h-20 object-cover rounded-md border border-border hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inspection link */}
                    {selectedIssue.inspectionId && (
                      <div className="text-sm text-muted-foreground bg-muted/20 border border-border rounded-md px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Image className="h-4 w-4 shrink-0" />
                          <span>Linked to Inspection #{selectedIssue.inspectionId}</span>
                        </div>
                        <a
                          href={`/inspections/${selectedIssue.inspectionId}`}
                          className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View inspection
                        </a>
                      </div>
                    )}

                    {/* Markup document reference */}
                    {selectedIssue.markupDocumentId && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Markup Reference</Label>
                        <div className="flex items-center justify-between bg-muted/20 border border-border rounded-md px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Image className="h-4 w-4 shrink-0" />
                            <span>Markup document #{selectedIssue.markupDocumentId}</span>
                          </div>
                          <a
                            href={`${apiBase()}/api/markup-documents/${selectedIssue.markupDocumentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View markup
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Close-out section */}
                    {selectedIssue.closeoutNotes && (
                      <div>
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Close-out Notes</Label>
                        <div className="bg-green-50 border border-green-100 p-3 rounded-md text-sm text-green-800">
                          {selectedIssue.closeoutNotes}
                        </div>
                        {closeoutPhotoUrls.length > 0 && (
                          <div className="flex gap-2 flex-wrap mt-2">
                            {closeoutPhotoUrls.map((path, i) => (
                              <a key={i} href={`${apiBase()}/api/storage${path}`} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={`${apiBase()}/api/storage${path}`}
                                  alt={`Evidence ${i + 1}`}
                                  className="w-16 h-16 object-cover rounded-md border border-green-200 hover:opacity-90"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    {!isTerminal(selectedIssue.status) && (
                      <div className="pt-2 border-t border-border flex justify-end gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          onClick={() => setShowReject(true)}
                          className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Ban className="h-4 w-4" />
                          Reject / Not Required
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

                {detailTab === "history" && (
                  <div className="space-y-3 mt-2 pb-4">
                    {/* Comment composer */}
                    <div className="flex gap-2">
                      <textarea
                        placeholder="Add a comment…"
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        rows={2}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                      />
                      <Button
                        onClick={handlePostComment}
                        disabled={!commentText.trim() || postingComment}
                        size="sm"
                        className="self-end gap-1"
                      >
                        {postingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                        Post
                      </Button>
                    </div>

                    {historyLoading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading history…
                      </div>
                    ) : historyFeed.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">No activity yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {historyFeed.map((item: any) => (
                          <div key={item.id} className={cn("flex gap-3 p-3 rounded-lg border text-sm", item.type === "comment" ? "bg-blue-50/50 border-blue-100" : "bg-muted/20 border-border")}>
                            <div className="mt-0.5 shrink-0">
                              {item.type === "comment"
                                ? <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                                : getActionIcon(item.action)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sidebar">{item.userName}</span>
                                {item.type === "comment" && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">comment</span>
                                )}
                                <span className="text-xs text-muted-foreground ml-auto">{timeAgo(item.createdAt)}</span>
                              </div>
                              <p className="text-muted-foreground mt-0.5">{item.description || item.body}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
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
              Closing out this issue will mark it as closed and record the evidence.
            </div>
            <div className="space-y-1.5">
              <Label>Close-out Notes <span className="text-red-500">*</span></Label>
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
                <Camera className="h-3.5 w-3.5" /> Evidence Photos (optional)
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
              </button>
              {closeoutPhotos.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {closeoutPhotos.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.previewUrl} alt={p.name} className="w-16 h-16 object-cover rounded-md border border-border" />
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

      {/* Reject Dialog */}
      <Dialog open={showReject} onOpenChange={(open) => { if (!open) { setShowReject(false); setRejectError(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-600" />
              Reject / Not Required: {selectedIssue?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-800">
              Mark this issue as rejected or not required. A reason must be provided.
            </div>
            <div className="space-y-1.5">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <textarea
                placeholder="Explain why this issue is being rejected or is not required…"
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            {rejectError && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />{rejectError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setShowReject(false); setRejectError(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejecting}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white"
            >
              {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-4 w-4" />}
              {rejecting ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={showBulkAssign} onOpenChange={setShowBulkAssign}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-secondary" />
              Assign {selectAllMatching ? totalMatchingCount : selectedIds.size} Issue{selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <select
                value={bulkAssignId}
                onChange={e => setBulkAssignId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Unassigned</option>
                {(users as any[] ?? []).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowBulkAssign(false)}>Cancel</Button>
            <Button
              disabled={bulkActionPending}
              onClick={async () => {
                await doBulkAction("bulk_assign", { assignedToId: bulkAssignId ? parseInt(bulkAssignId) : null });
                setShowBulkAssign(false);
              }}
            >
              {bulkActionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Dialog */}
      <Dialog open={showBulkStatus} onOpenChange={setShowBulkStatus}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-secondary" />
              Change Status for {selectAllMatching ? totalMatchingCount : selectedIds.size} Issue{selectedIds.size !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Status</Label>
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select status…</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowBulkStatus(false)}>Cancel</Button>
            <Button
              disabled={bulkActionPending || !bulkStatus}
              onClick={async () => {
                await doBulkAction("bulk_status_change", { status: bulkStatus });
                setShowBulkStatus(false);
              }}
            >
              {bulkActionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              Change Status
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Toolbar */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-sidebar text-white px-5 py-3 rounded-2xl shadow-2xl shadow-sidebar/40 border border-white/10">
          <span className="text-sm font-semibold mr-1">
            {selectAllMatching ? totalMatchingCount : selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-white/20" />
          <button
            onClick={() => setShowBulkAssign(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            disabled={bulkActionPending}
          >
            <Users className="h-3.5 w-3.5" />
            Assign
          </button>
          <button
            onClick={() => setShowBulkStatus(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            disabled={bulkActionPending}
          >
            <Tag className="h-3.5 w-3.5" />
            Status
          </button>
          <button
            onClick={doBulkRemind}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            disabled={bulkActionPending}
          >
            {bulkActionPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
            Remind
          </button>
          <button
            onClick={() => doBulkAction("archive", { archived: true })}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            disabled={bulkActionPending}
          >
            <Archive className="h-3.5 w-3.5" />
            Archive
          </button>
          <div className="h-4 w-px bg-white/20" />
          <button
            onClick={clearSelection}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
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
  return <Badge className={`capitalize text-xs ${getStyles()}`}>{severity}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const normalized = priority.toLowerCase();
  const getStyles = () => {
    switch(normalized) {
      case "urgent": return "border-purple-300 bg-purple-50 text-purple-700";
      case "high": return "border-orange-300 bg-orange-50 text-orange-700";
      case "normal": return "border-gray-300 bg-gray-50 text-gray-600";
      case "low": return "border-blue-200 bg-blue-50 text-blue-600";
      default: return "border-gray-200 bg-gray-50 text-gray-600";
    }
  };
  return <Badge variant="outline" className={`capitalize text-xs ${getStyles()}`}>{priority}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const getStyles = () => {
    switch(status) {
      case "open": return "border-red-200 bg-red-50 text-red-700";
      case "in_progress": return "border-blue-200 bg-blue-50 text-blue-700";
      case "pending_review": return "border-yellow-200 bg-yellow-50 text-yellow-700";
      case "closed":
      case "resolved": return "border-green-200 bg-green-50 text-green-700";
      case "rejected": return "border-gray-300 bg-gray-100 text-gray-600";
      default: return "border-gray-200 bg-gray-50 text-gray-700";
    }
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return <Badge variant="outline" className={`capitalize text-xs ${getStyles()}`}>{label}</Badge>;
}
