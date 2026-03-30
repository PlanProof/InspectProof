import { setBaseUrl } from "@workspace/api-client-react";

// Set base URL at module level for Expo
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

export function getApiUrl(path: string): string {
  const base = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
  return `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
}

export const DEMO_EMAIL = "admin@inspectproof.com.au";
export const DEMO_PASSWORD = "password123";

export const INSPECTION_TYPES: Record<string, string> = {
  footing: "Footing", footings: "Footings",
  slab: "Slab", frame: "Frame", pre_plaster: "Pre-Plaster",
  waterproofing: "Waterproofing", lock_up: "Lock-Up", pool_barrier: "Pool Barrier",
  final: "Final", special: "Special", preliminary: "Preliminary", progress: "Progress",
  qc_footing: "QC — Footings", qc_frame: "QC — Frame", qc_fitout: "QC — Fit-Out",
  qc_pre_handover: "QC — Pre-Handover", non_conformance: "Non-Conformance",
  hold_point: "Hold Point", daily_site: "Daily Site Diary", trade_inspection: "Trade Inspection",
  safety_inspection: "Safety Inspection", hazard_assessment: "Hazard Assessment",
  incident_inspection: "Incident Investigation", toolbox: "Toolbox Talk",
  pre_purchase_building: "Building Inspection", pre_purchase_pest: "Pest Inspection",
  pre_purchase_combined: "Building & Pest",
  fire_active: "Active Systems", fire_passive: "Passive Systems",
  fire_safety: "Fire Safety", annual_fire_safety: "Annual Fire Safety", fire_egress: "Egress & Evacuation",
  structural_footing_slab: "Structural — Footing & Slab", structural_frame: "Structural — Frame",
  structural_final: "Structural — Final",
  plumbing: "Plumbing", drainage: "Drainage", pressure_test: "Pressure Test",
  electrical: "Electrical", compliance: "Compliance", structural: "Structural",
  hvac: "HVAC",
};

export const PROJECT_STAGES: Record<string, string> = {
  pre_construction: "Pre-Construction",
  footings: "Footings",
  slab: "Slab",
  frame: "Frame",
  lock_up: "Lock-Up",
  fit_out: "Fit-Out",
  final: "Final",
  completed: "Completed",
};

export const PROJECT_TYPES: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
  mixed_use: "Mixed Use",
  infrastructure: "Infrastructure",
};

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  follow_up_required: "Follow-Up Required",
  cancelled: "Cancelled",
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
  deferred: "Deferred",
};
