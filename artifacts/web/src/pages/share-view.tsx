import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, MapPin, Calendar, User, Cloud, FileText } from "lucide-react";

function apiBase() {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

async function fetchShareView(token: string) {
  const res = await fetch(`${apiBase()}/api/share/${token}`);
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-orange-400 mb-4" />
        <h1 className="text-xl font-bold text-gray-800 mb-2">Inspection Not Found</h1>
        <p className="text-gray-500 text-sm">This link may have expired or been revoked.</p>
        <p className="text-xs text-gray-400 mt-6">InspectProof · PlanProof Technologies Pty Ltd</p>
      </div>
    );
  }

  const { inspection, project, issues } = data;
  const compliance = inspection.totalItems > 0
    ? Math.round((inspection.passCount / inspection.totalItems) * 100)
    : 0;

  const typeLabel = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

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
                        : "bg-orange-100 text-orange-700"
                    }`}>
                      {typeLabel(issue.status)}
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

        <p className="text-center text-xs text-gray-400 py-4">
          This report is shared via InspectProof · PlanProof Technologies Pty Ltd · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
