import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  // ── Building Surveyor ─────────────────────────────────────────────────────
  bs_footing_slab:           "Footing & Slab",
  footing:                   "Footing",
  footings:                  "Footings",
  slab:                      "Slab",
  frame:                     "Frame",
  steel_frame:               "Steel Frame",
  waterproofing:             "Waterproofing",
  pre_plaster:               "Pre-Plaster",
  lock_up:                   "Lock-Up",
  fire_penetration:          "Fire Penetration",
  fire_separation:           "Fire Separation",
  occupancy:                 "Occupancy",
  pool_barrier:              "Pool Barrier",
  pool_shell:                "Pool Shell & Hydraulics",
  pool_final:                "Pool Safety Final",
  final:                     "Final",
  preliminary:               "Preliminary",
  progress:                  "Progress",
  special:                   "Special",
  compliance:                "Compliance",
  // ── Structural Engineer ──────────────────────────────────────────────────
  structural_footing_slab:   "Footing & Slab",
  se_footing_slab:           "Footing & Slab",
  structural_frame:          "Frame",
  structural_steel_frame:    "Steel Frame",
  structural_retaining_wall: "Retaining Wall",
  structural_final:          "Final",
  structural:                "Structural",
  // ── Plumbing Officer ─────────────────────────────────────────────────────
  plumbing_rough_in:         "Rough-In",
  plumbing_sanitary_drainage:"Sanitary Drainage",
  plumbing_hot_cold_water:   "Hot & Cold Water",
  plumbing_gas:              "Gas Installation",
  plumbing_stormwater:       "Stormwater Drainage",
  plumbing_fire_services:    "Fire Services Plumbing",
  plumbing_completion:       "Completion",
  plumbing:                  "Plumbing",
  drainage:                  "Drainage",
  // ── Builder / QC ─────────────────────────────────────────────────────────
  builder_pre_slab:          "Pre-Slab",
  builder_frame_stage:       "Frame Stage",
  builder_lock_up:           "Lock-Up Stage",
  builder_defect:            "Defect",
  builder_practical_completion: "Practical Completion",
  builder_handover:          "Handover",
  builder_concrete_pour:     "Concrete Pour",
  builder_site_feasibility:  "Site Feasibility",
  qc_footing:                "QC — Footings",
  qc_frame:                  "QC — Frame",
  qc_fitout:                 "QC — Fit-Out",
  qc_pre_handover:           "QC — Pre-Handover",
  non_conformance:           "Non-Conformance",
  hold_point:                "Hold Point",
  // ── Site Supervisor ──────────────────────────────────────────────────────
  site_daily:                "Daily Site",
  site_subcontractor_prestart:"Subcontractor Pre-Start",
  site_concrete_pour:        "Concrete Pour Sign-Off",
  site_defect_walkthrough:   "Defect Walkthrough",
  site_pre_handover_walk:    "Pre-Handover Walk",
  daily_site:                "Daily Site",
  // ── WHS Officer ──────────────────────────────────────────────────────────
  whs_site_safety_audit:     "Site Safety Audit",
  whs_plant_equipment:       "Plant & Equipment",
  whs_hazmat:                "Hazardous Materials",
  whs_incident_investigation:"Incident Investigation",
  whs_emergency_procedures:  "Emergency Procedures",
  safety_inspection:         "Safety Inspection",
  hazard_assessment:         "Hazard Assessment",
  incident_inspection:       "Incident Investigation",
  // ── Pre-Purchase Inspector ───────────────────────────────────────────────
  prepurchase_building:      "Pre-Purchase Building",
  prepurchase_pest:          "Pest & Termite",
  prepurchase_strata:        "Strata / Unit",
  prepurchase_commercial:    "Commercial Property",
  pre_purchase_building:     "Building Inspection",
  pre_purchase_pest:         "Pest Inspection",
  pre_purchase_combined:     "Building & Pest",
  // ── Fire Safety Engineer ─────────────────────────────────────────────────
  fire_safety_systems:       "Fire Safety Systems",
  fire_emergency_lighting:   "Emergency Lighting & Exit",
  fire_hydrant_hose_reel:    "Hydrant & Hose Reel",
  fire_smoke_alarms:         "Smoke Alarm Compliance",
  fire_afss:                 "Annual Fire Safety Statement",
  fire_safety:               "Fire Safety",
  annual_fire_safety:        "Annual Fire Safety",
  fire_active:               "Active Systems",
  fire_passive:              "Passive Systems",
  fire_egress:               "Egress & Evacuation",
  // ── Property Manager ─────────────────────────────────────────────────────
  pm_routine:                "Routine Property",
  pm_entry:                  "Entry Condition",
  pm_exit:                   "Exit Condition",
  pm_maintenance:            "Maintenance",
  // ── Pool Inspector ───────────────────────────────────────────────────────
  pool_water_quality:        "Water Quality & Equipment",
  pool_spa:                  "Spa & Portable Pool",
  // ── Insurance Assessor ───────────────────────────────────────────────────
  ins_storm:                 "Storm Damage",
  ins_fire:                  "Fire Damage",
  ins_water:                 "Water & Flood Damage",
  ins_general:               "General Property Assessment",
};

/** Strips discipline abbreviation prefixes and returns a clean, human-readable label. */
export function formatInspectionType(slug: string | null | undefined): string {
  if (!slug) return "Inspection";
  if (INSPECTION_TYPE_LABELS[slug]) return INSPECTION_TYPE_LABELS[slug];
  // Strip known discipline abbreviation prefixes before title-casing
  const stripped = slug
    .replace(/^(bs|ins|pm|whs|se|pe|builder|structural|plumbing|site|fire|pool|prepurchase)_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  return stripped;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return dateStr;
  }
}
