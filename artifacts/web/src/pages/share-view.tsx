import { useParams } from "wouter";
import { formatInspectionType } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CheckCircle2, AlertTriangle, MapPin, Calendar,
  User, Cloud, FileText, Download, Pen, Clock,
} from "lucide-react";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function fetchShareView(token: string) {
  const res = await fetch(`${apiBase()}/api/share/${token}`);
  if (res.status === 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "link_inactive");
  }
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error("error");
  return res.json();
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex-1 min-w-[100px] rounded-xl p-4 ${color} flex flex-col items-center`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs font-medium mt-0.5 opacity-80">{label}</span>
    </div>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

function AcknowledgementSection({
  token,
  existingAck,
}: {
  token: string;
  existingAck: { clientName: string; clientEmail: string; signatureText?: string; acknowledgedAt: string } | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase()}/api/share/${token}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name, clientEmail: email, signatureText: signature }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to submit acknowledgement");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["share", token] });
    },
  });

  if (existingAck || submitted) {
    return (
      <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 text-sm">Report Acknowledged</p>
            {existingAck && (
              <>
                <p className="text-xs text-gray-500 mt-0.5">
                  Acknowledged by <span className="font-medium">{existingAck.clientName}</span> ({existingAck.clientEmail}) on{" "}
                  {new Date(existingAck.acknowledgedAt).toLocaleString("en-AU")}
                </p>
                {existingAck.signatureText && (
                  <div className="mt-2 border-t border-green-100 pt-2">
                    <p className="text-[10px] text-gray-400 font-medium mb-0.5">SIGNATURE</p>
                    <p className="font-semibold text-gray-700 text-sm italic">{existingAck.signatureText}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="font-bold text-gray-800 mb-1 flex items-center gap-2 text-sm">
        <Pen className="h-4 w-4 text-blue-500" /> Acknowledge Report
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Confirm that you have reviewed this inspection report by entering your details and typed signature below.
      </p>
      {mutation.isError && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          {mutation.error?.message || "Failed to submit. Please try again."}
        </div>
      )}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Jane Smith"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Your Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. jane@example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Typed Signature <span className="text-red-500">*</span>
          </label>
          <p className="text-[11px] text-gray-400 mb-1.5">
            Type your full name below as your digital signature acknowledging this report.
          </p>
          <input
            type="text"
            value={signature}
            onChange={e => setSignature(e.target.value)}
            placeholder="Type your full name to sign"
            style={{ fontFamily: "cursive", fontSize: "1.1rem" }}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-400 bg-gray-50"
          />
          {signature && (
            <p className="text-[10px] text-gray-400 mt-1">
              Signing as: <span className="font-semibold italic">{signature}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (!name.trim() || !email.trim() || !signature.trim()) return;
            mutation.mutate();
          }}
          disabled={mutation.isPending || !name.trim() || !email.trim() || !signature.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          {mutation.isPending ? "Submitting…" : "Sign & Acknowledge"}
        </button>
      </div>
    </div>
  );
}

function DownloadReportButton({ token }: { token: string }) {
  const handleDownload = () => {
    window.open(`${apiBase()}/api/share/${token}/pdf`, "_blank");
  };

  return (
    <button
      onClick={handleDownload}
      className="flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 hover:text-blue-700 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
    >
      <Download className="h-4 w-4" />
      Download PDF Report
    </button>
  );
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["share", token],
    queryFn: () => fetchShareView(token!),
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
    const isInactive = message.includes("inactive") || message.includes("expired") || message.includes("revoked");
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <div className={`h-16 w-16 rounded-full flex items-center justify-center mb-4 ${isInactive ? "bg-orange-100" : "bg-red-100"}`}>
          {isInactive ? <Clock className="h-8 w-8 text-orange-500" /> : <AlertTriangle className="h-8 w-8 text-red-400" />}
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          {isInactive ? "This link is no longer active" : "Inspection Not Found"}
        </h1>
        <p className="text-gray-500 text-sm max-w-sm">
          {isInactive
            ? message
            : "This link may have expired or been revoked. Please contact the inspection team for a new link."}
        </p>
        <p className="text-xs text-gray-400 mt-6">InspectProof · PlanProof Technologies Pty Ltd</p>
      </div>
    );
  }

  if (!data) return null;

  const { inspection, project, issues, acknowledgement } = data;
  const compliance = inspection.totalItems > 0
    ? Math.round((inspection.passCount / inspection.totalItems) * 100)
    : 0;

  const typeLabel = (s: string) => formatInspectionType(s);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div style={{ backgroundColor: "#0B1933" }} className="px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-0.5">Inspection Report</p>
            <h1 className="text-white text-lg font-bold">{typeLabel(inspection.inspectionType)}</h1>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] font-medium">Powered by</p>
            <p className="text-white text-sm font-bold" style={{ fontFamily: "monospace" }}>InspectProof</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Download + Actions Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <DownloadReportButton token={token!} />
          {inspection.shareTokenExpiry && (
            <p className="text-xs text-gray-400">
              Link expires {new Date(inspection.shareTokenExpiry).toLocaleDateString("en-AU")}
            </p>
          )}
        </div>

        {/* Project Info */}
        {project && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" /> Project Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Project</p>
                <p className="font-semibold text-gray-800">{project.name}</p>
              </div>
              {project.siteAddress && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Site Address</p>
                  <p className="text-gray-700 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    {project.siteAddress}{project.suburb ? `, ${project.suburb}` : ""}{project.state ? ` ${project.state}` : ""}
                  </p>
                </div>
              )}
              {project.clientName && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Client</p>
                  <p className="text-gray-700">{project.clientName}</p>
                </div>
              )}
              {project.builderName && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Builder</p>
                  <p className="text-gray-700">{project.builderName}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inspection Summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> Inspection Summary
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-5">
            {inspection.scheduledDate && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Date</p>
                <p className="text-gray-700 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {inspection.scheduledDate}
                </p>
              </div>
            )}
            {inspection.inspectorName && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Inspector</p>
                <p className="text-gray-700 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {inspection.inspectorName}
                </p>
              </div>
            )}
            {inspection.weatherConditions && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Weather</p>
                <p className="text-gray-700 flex items-center gap-1">
                  <Cloud className="h-3.5 w-3.5 text-gray-400" />
                  {inspection.weatherConditions}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">Status</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                inspection.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : inspection.status === "scheduled"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {typeLabel(inspection.status)}
              </span>
            </div>
          </div>

          {inspection.totalItems > 0 && (
            <>
              <div className="flex gap-3 flex-wrap mb-4">
                <StatPill label="Pass" value={inspection.passCount} color="bg-green-50 text-green-700" />
                <StatPill label="Fail" value={inspection.failCount} color="bg-red-50 text-red-700" />
                <StatPill label="N/A" value={inspection.naCount} color="bg-gray-100 text-gray-600" />
                <StatPill label="Compliance" value={compliance} color="bg-blue-50 text-blue-700" />
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${compliance}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{compliance}% compliance</p>
            </>
          )}

          {inspection.signedOffAt && (
            <div className="mt-4 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Digitally signed off · {new Date(inspection.signedOffAt).toLocaleDateString("en-AU")}
            </div>
          )}
        </div>

        {/* Issues */}
        {issues && issues.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Issues / Defects ({issues.length})
            </h2>
            <div className="space-y-3">
              {issues.map((issue: any, i: number) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-gray-800 text-sm">{issue.title}</p>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${SEVERITY_COLORS[issue.severity] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {issue.severity}
                    </span>
                  </div>
                  {issue.description && <p className="text-xs text-gray-500">{issue.description}</p>}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {issue.location && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />{issue.location}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      issue.status === "resolved"
                        ? "bg-green-100 text-green-700"
                        : issue.status === "work_completed"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>
                      {issue.status === "work_completed" ? "Work Completed — Awaiting Inspection" : typeLabel(issue.status)}
                    </span>
                    {issue.dueDate && (
                      <span className="text-[10px] text-gray-400">Due: {issue.dueDate}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {inspection.notes && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-3 text-sm">Inspector Notes</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{inspection.notes}</p>
          </div>
        )}

        {/* Client Acknowledgement */}
        <AcknowledgementSection token={token!} existingAck={acknowledgement} />

        <p className="text-center text-xs text-gray-400 py-4">
          This report is shared via InspectProof · PlanProof Technologies Pty Ltd · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
