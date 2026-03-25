export const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  Structural: [
    "Compliant — timber species and grade confirmed per engineer's specification",
    "Non-compliant — member sizes do not match approved plans",
    "Bracing installed correctly per bracing schedule",
    "Bracing installation non-compliant — refer to engineer",
    "Tie-down and hold-down connections installed correctly",
    "Tie-down connections incomplete or incorrectly installed",
    "Roof trusses installed plumb with temporary bracing in place",
    "Roof framing members verified per specification",
  ],
  Connections: [
    "All joist hangers and connectors correctly installed",
    "Nailing schedule compliant — spacings and nail sizes verified",
    "Non-compliant nailing — refer to specification",
    "Missing connectors identified — remediation required",
    "Strapping and hold-downs correctly fixed",
  ],
  Moisture: [
    "Moisture resistant framing confirmed in wet areas",
    "Termite protection in place per specification",
    "Moisture barrier not installed — remediation required",
    "Evidence of moisture damage — further investigation required",
    "DPC installed correctly at base of walls",
  ],
  Services: [
    "Electrical rough-in complete and compliant",
    "Plumbing rough-in complete and pressure-tested",
    "Conduit installed before close-in",
    "Services incomplete — re-inspection required prior to close-in",
    "Penetrations correctly sealed",
  ],
  "Fire Safety": [
    "Fire separation elements installed per fire engineer's report",
    "FRL elements not installed — hold on close-in until rectified",
    "Penetration sealing completed and compliant",
    "Fire-rated construction confirmed per specification",
    "Fire collar/intumescent strip installed at penetrations",
  ],
  "Energy Efficiency": [
    "Insulation batts installed correctly, R-value compliant",
    "Insulation missing or incorrectly fitted — rectify before close-in",
    "Vapour barrier installed where required",
    "Thermal bridging noted — review NatHERS energy report",
    "Wall insulation compliant per NCC Section J",
  ],
  Earthworks: [
    "Excavation dimensions verified against approved plans — compliant",
    "Formation level achieved and compacted",
    "Reactive soil classification confirmed (site class per AS 2870)",
    "Excavation dimensions non-compliant — rectify before pour",
    "Setback from boundaries checked and compliant",
  ],
  Reinforcement: [
    "Reinforcement bar sizes, spacing, and position verified — compliant",
    "Concrete cover confirmed — chairs and spacers in place",
    "Non-compliant reinforcement placement — stop work issued",
    "Laps and splices correctly detailed and installed",
    "Reinforcement requires adjustment — refer to engineer",
  ],
  Concrete: [
    "Concrete grade confirmed — N25 or better",
    "Delivery docket sighted and compliant",
    "Weather conditions acceptable for pour",
    "Slump tested and within acceptable range",
    "Concrete not to be poured — conditions not met",
  ],
  Drainage: [
    "Sub-soil drainage installed and connected to approved disposal point",
    "Ag-pipe and gravel surround correctly installed",
    "Drainage not installed — hold on pour",
    "Fall to drainage adequate and compliant",
  ],
  Termite: [
    "Termite barrier system installed per specification — certificate sighted",
    "Termite protection system not complete — hold on slab",
    "Physical barrier installed at slab penetrations",
    "Installer's certificate of installation provided and compliant",
  ],
  "Fence Height": [
    "Barrier height ≥ 1200mm at all points — compliant",
    "Barrier height less than 1200mm — must be raised to comply",
    "Height measured at most restrictive point of grade",
    "Height compliant — refer to photos for verification",
  ],
  Gate: [
    "Self-closing mechanism operational — gate closes and latches unaided",
    "Self-latching latch positioned on pool side at correct height — compliant",
    "Gate does not self-close — adjustment required",
    "Latch not on pool side — must be relocated to comply",
    "Gate in good condition — no corrosion or structural defects",
  ],
  Climbability: [
    "No climbable objects within 900mm exclusion zone — compliant",
    "Objects identified within 900mm — must be removed or relocated",
    "Pool pump and equipment correctly positioned outside exclusion zone",
    "Pool equipment relocated — now compliant",
  ],
  Openings: [
    "No gaps or openings greater than 100mm — compliant",
    "Gap(s) exceed 100mm — barrier must be repaired before approval",
    "Fence in good structural condition — no defects noted",
    "Bottom rail clearance to ground compliant — ≤ 100mm",
  ],
  "CPR Sign": [
    "CPR sign permanently displayed and clearly visible from pool area — compliant",
    "CPR sign missing — must be installed before compliance approval",
    "CPR sign present but incorrect format — must be replaced with current CPR Australia version",
    "Resuscitation instructions legible and facing pool area",
  ],
  General: [
    "Compliant at time of inspection — no defects noted",
    "Site generally compliant — minor items to be rectified",
    "Significant defects noted — refer to photos and report",
    "Re-inspection required before proceeding to next stage",
    "Not yet constructed — item not applicable at this stage of works",
    "Item unable to be inspected — obstructed at time of visit",
  ],
};

export const UNIVERSAL_SUGGESTIONS = [
  "Compliant at time of inspection",
  "Non-compliant — rectification required before re-inspection",
  "Not yet constructed — re-inspection required",
  "Rectification completed and verified",
  "Unable to inspect — area obstructed",
  "Approved as per engineer's specification",
  "Refer to attached photos for detail",
];

export function getSuggestionsForItem(category: string, description: string): string[] {
  const catSuggestions = CATEGORY_SUGGESTIONS[category] || [];
  const lowerDesc = description.toLowerCase();
  const universalFiltered = UNIVERSAL_SUGGESTIONS.filter(s =>
    !catSuggestions.some(c => c.toLowerCase() === s.toLowerCase())
  );
  const allSuggestions = [...catSuggestions, ...universalFiltered];
  return allSuggestions.slice(0, 10);
}
