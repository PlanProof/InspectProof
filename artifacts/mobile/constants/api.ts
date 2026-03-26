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
  footings: "Footings",
  slab: "Slab",
  frame: "Frame",
  final: "Final",
  fire_safety: "Fire Safety",
  pool_barrier: "Pool Barrier",
  special: "Special",
  preliminary: "Preliminary",
  progress: "Progress",
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
