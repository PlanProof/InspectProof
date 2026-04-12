import { useParams } from "wouter";
import { formatInspectionType } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  AlertTriangle, MapPin, Calendar, CheckCircle2, Clock, HardHat, Upload, ChevronDown, ChevronUp, X, Image,
} from "lucide-react";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function fetchContractorPortal(token: string) {
  const res = await fetch(`${apiBase()}/api/contractor-share/${token}`);
  if (res.status === 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "This link is no longer active.");
  }
  if (!res.ok) throw new Error("error");
  return res.json();
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  major: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  minor: "bg-blue-100 text-blue-700 border-blue-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

function IssueCard({
  issue,
  token,
}: {
  issue: any;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [photoObjectPath, setPhotoObjectPath] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCompleted = issue.status === "work_completed" || issue.status === "resolved";

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Only image files are accepted.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await fetch(`${apiBase()}/api/contractor-share/${token}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-file-content-type": file.type,
        },
        body: buffer,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Upload failed");
      }
      const { objectPath } = await res.json();
      setPhotoObjectPath(objectPath);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    } catch (err: any) {
      setUploadError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase()}/api/contractor-share/${token}/issues/${issue.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, photoUrl: photoObjectPath ?? undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["contractor-portal", token] });
    },
  });

  const typeLabel = (s: string) => formatInspectionType(s);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer flex items-start justify-between gap-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${SEVERITY_COLORS[issue.severity] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {issue.severity}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
              issue.status === "resolved"
                ? "bg-green-100 text-green-700"
                : issue.status === "work_completed"
                ? "bg-blue-100 text-blue-700"
                : "bg-orange-100 text-orange-700"
            }`}>
              {issue.status === "work_completed" ? "Work Completed — Awaiting Inspection" : typeLabel(issue.status)}
            </span>
          </div>
          <p className="font-semibold text-gray-800 text-sm truncate">{issue.title}</p>
          {issue.location && (
            <p className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5">
              <MapPin className="h-3 w-3" />{issue.location}
            </p>
          )}
        </div>
        <div className="shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {issue.description && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700">{issue.description}</p>
            </div>
          )}
          {issue.dueDate && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              Due: {issue.dueDate}
            </div>
          )}

          {isCompleted ? (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-700">Work marked as completed</p>
                {issue.closeoutNotes && <p className="text-xs text-blue-600 mt-0.5">{issue.closeoutNotes}</p>}
              </div>
            </div>
          ) : submitted ? (
            <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-green-700">Submitted — awaiting inspection</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-600">
                Mark this defect as completed by adding completion notes and optionally uploading a photo.
              </p>
              {mutation.isError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  {mutation.error?.message || "Failed to submit. Please try again."}
                </div>
              )}
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Describe the work completed (optional)…"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />

              {/* Photo upload */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Evidence photo (optional)</p>
                {photoPreviewUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={photoPreviewUrl}
                      alt="Evidence"
                      className="h-24 w-24 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      onClick={() => { setPhotoObjectPath(null); setPhotoPreviewUrl(null); }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <div className="h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Upload photo
                      </>
                    )}
                  </button>
                )}
                {uploadError && (
                  <p className="text-xs text-red-500 mt-1">{uploadError}</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>

              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                {mutation.isPending ? "Submitting…" : "Mark as Work Completed"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContractorPortal() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["contractor-portal", token],
    queryFn: () => fetchContractorPortal(token!),
    retry: false,
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    const message = (error as Error).message;
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
          <Clock className="h-8 w-8 text-orange-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">This link is no longer active</h1>
        <p className="text-gray-500 text-sm max-w-sm">{message}</p>
        <p className="text-xs text-gray-400 mt-6">InspectProof · PlanProof Technologies Pty Ltd</p>
      </div>
    );
  }

  if (!data) return null;

  const { contractor, project, issues, expiresAt } = data;
  const openIssues = issues.filter((i: any) => i.status !== "resolved" && i.status !== "work_completed");
  const completedIssues = issues.filter((i: any) => i.status === "work_completed" || i.status === "resolved");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div style={{ backgroundColor: "#0B1933" }} className="px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-0.5">Contractor Portal</p>
            <h1 className="text-white text-lg font-bold flex items-center gap-2">
              <HardHat className="h-5 w-5 text-yellow-400" />
              {contractor.name}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] font-medium">Powered by</p>
            <p className="text-white text-sm font-bold" style={{ fontFamily: "monospace" }}>InspectProof</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Project Info */}
        {project && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 font-medium mb-0.5">Project</p>
            <p className="font-semibold text-gray-800">{project.name}</p>
            {project.siteAddress && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                {project.siteAddress}{project.suburb ? `, ${project.suburb}` : ""}{project.state ? ` ${project.state}` : ""}
              </p>
            )}
            {expiresAt && (
              <p className="text-xs text-orange-500 mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                This portal link expires {new Date(expiresAt).toLocaleDateString("en-AU")}
              </p>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange-700">{openIssues.length}</p>
            <p className="text-xs text-orange-600 font-medium mt-0.5">Open Defects</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{completedIssues.length}</p>
            <p className="text-xs text-green-600 font-medium mt-0.5">Work Completed</p>
          </div>
        </div>

        {issues.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">No defects assigned</p>
            <p className="text-xs text-gray-400 mt-1">There are no outstanding defects assigned to you on this project.</p>
          </div>
        )}

        {/* Open Issues */}
        {openIssues.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Open Defects ({openIssues.length})
            </h2>
            <div className="space-y-3">
              {openIssues.map((issue: any) => (
                <IssueCard key={issue.id} issue={issue} token={token!} />
              ))}
            </div>
          </div>
        )}

        {/* Completed Issues */}
        {completedIssues.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completed ({completedIssues.length})
            </h2>
            <div className="space-y-3">
              {completedIssues.map((issue: any) => (
                <IssueCard key={issue.id} issue={issue} token={token!} />
              ))}
            </div>
          </div>
        )}

        <div className="pt-2">
          <p className="text-center text-xs text-gray-400">
            InspectProof · PlanProof Technologies Pty Ltd · {new Date().getFullYear()}
          </p>
          <p className="text-center text-[10px] text-gray-300 mt-1">
            This portal is private and intended for the named contractor only.
          </p>
        </div>
      </div>
    </div>
  );
}
