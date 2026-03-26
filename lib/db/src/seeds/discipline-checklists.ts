import { db } from "../index";
import { checklistTemplatesTable, checklistItemsTable } from "../schema/checklists";
import { inArray } from "drizzle-orm";

type ItemDef = {
  category: string;
  description: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  defectTrigger?: boolean;
  requirePhoto?: boolean;
  codeReference?: string;
  recommendedAction?: string;
};

const NON_BS_DISCIPLINES = [
  "Structural Engineer",
  "Plumbing Officer",
  "Builder / QC",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
];

async function seedTemplate(
  name: string,
  discipline: string,
  inspectionType: string,
  folder: string,
  description: string,
  sortOrder: number,
  items: ItemDef[],
) {
  const [tmpl] = await db.insert(checklistTemplatesTable)
    .values({ name, discipline, inspectionType, folder, description, sortOrder })
    .returning();
  if (items.length > 0) {
    await db.insert(checklistItemsTable).values(
      items.map((item, i) => ({
        templateId: tmpl.id,
        orderIndex: i + 1,
        category: item.category,
        description: item.description,
        riskLevel: (item.riskLevel ?? "medium") as "low" | "medium" | "high" | "critical",
        defectTrigger: item.defectTrigger ?? false,
        requirePhoto: item.requirePhoto ?? false,
        codeReference: item.codeReference ?? null,
        recommendedAction: item.recommendedAction ?? null,
        isRequired: true,
        includeInReport: true,
      })),
    );
  }
  console.log(`  ✓ [${discipline}] ${folder} — ${name} (${items.length} items)`);
}

export async function seedDisciplineChecklists() {
  console.log("\n=== Removing ALL non-Building Surveyor templates ===");

  const allNonBS = await db
    .select({ id: checklistTemplatesTable.id })
    .from(checklistTemplatesTable)
    .where(inArray(checklistTemplatesTable.discipline, NON_BS_DISCIPLINES));

  if (allNonBS.length > 0) {
    const ids = allNonBS.map(t => t.id);
    await db.delete(checklistItemsTable).where(inArray(checklistItemsTable.templateId, ids));
    await db.delete(checklistTemplatesTable).where(inArray(checklistTemplatesTable.id, ids));
    console.log(`  Deleted ${allNonBS.length} non-BS templates.\n`);
  } else {
    console.log("  Nothing to delete.\n");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURAL ENGINEER
  // ─────────────────────────────────────────────────────────────────────────
  console.log("--- Structural Engineer ---");

  await seedTemplate(
    "Footing Inspection", "Structural Engineer", "structural_footing", "Footing Inspection",
    "Review of excavated footing trenches and pad footings prior to concrete pour.",
    10,
    [
      { category: "Dimensions", description: "Footing dimensions match engineer drawings (depth, width, step-downs)", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },
      { category: "Bearing", description: "Founding material confirmed as per geotechnical report — no fill, soft or unstable soil", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870-2011 Cl 4.4" },
      { category: "Clearances", description: "Minimum 300mm clearance from any drainage pipes or services", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 2870" },
      { category: "Reinforcement", description: "Rebar size, spacing, and cover conform to structural drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Reinforcement", description: "Ligatures, chairs and spacers installed correctly to maintain cover", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Site Conditions", description: "No water pooling in excavation — dewatering carried out if required", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Hold Points", description: "Footing hold-point sign-off obtained from structural engineer before pour", riskLevel: "critical", requirePhoto: false, codeReference: "Engineer's ITP" },
      { category: "Documentation", description: "Footing inspection certificate or engineer's letter to be issued", riskLevel: "medium" },
    ],
  );

  await seedTemplate(
    "Slab Inspection", "Structural Engineer", "structural_slab", "Slab Inspection",
    "Review of ground floor or elevated concrete slab prior to pour.",
    20,
    [
      { category: "Subgrade", description: "Fill material compacted to specified density — compaction test report available", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },
      { category: "Membrane", description: "Vapour barrier / termite membrane installed, lapped and sealed correctly", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1" },
      { category: "Formwork", description: "Edge formwork correctly set to required slab thickness and fall", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Reinforcement", description: "Mesh / rebar size, spacing, laps and cover chairs per drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Reinforcement", description: "Top steel installed over supports and at slab edges as required", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600" },
      { category: "Services", description: "Conduits, pipes and penetrations located and fixed before pour — not stacked", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Concrete", description: "Concrete mix design approved and test cylinders arranged for pour day", riskLevel: "medium", codeReference: "AS 1379" },
      { category: "Hold Points", description: "Engineer hold-point inspection completed and sign-off obtained", riskLevel: "critical", requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Frame Inspection", "Structural Engineer", "structural_frame", "Frame Inspection",
    "Structural review of timber or light-gauge steel framing prior to lining.",
    30,
    [
      { category: "Members", description: "Stud spacing, size and grade match structural drawings throughout", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684 / AS 4600" },
      { category: "Members", description: "All lintels, beams and posts are correct size, species and grade", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684" },
      { category: "Connections", description: "Tie-downs, hold-downs and brackets installed per engineer's connection schedule", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684.2" },
      { category: "Connections", description: "Fastener type, size and quantity match specification — no substitutions", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Bracing", description: "Diagonal bracing or structural sheathing installed and fixed per drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684 Cl 8" },
      { category: "Floor System", description: "Floor joists, bearers, and blocking installed correctly — no notches outside permitted zones", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS 1684" },
      { category: "Roof Structure", description: "Roof trusses or rafters bear correctly on wall plates and are braced per drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Documentation", description: "Frame inspection certificate issued after satisfactory inspection", riskLevel: "medium" },
    ],
  );

  await seedTemplate(
    "Steel Frame Inspection", "Structural Engineer", "structural_steel_frame", "Steel Frame Inspection",
    "Inspection of structural steel framing, connections and welds for commercial and industrial buildings.",
    40,
    [
      { category: "Fabrication", description: "Steel members match approved drawings — sections, lengths and grades verified", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4100" },
      { category: "Connections", description: "Bolted connections use correct bolt grade, size and quantity — no missing bolts", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 4100 Cl 9" },
      { category: "Welds", description: "Welds inspected for size, length and quality — no visible cracks or undercut", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 1554" },
      { category: "Erection", description: "Columns plumb and beams level within permitted tolerances", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 4100 Cl 15" },
      { category: "Base Plates", description: "Column base plates anchored with correct holding-down bolt pattern and size", riskLevel: "critical", defectTrigger: true, requirePhoto: true },
      { category: "Bracing", description: "All bracing members, gussets and turnbuckles installed per drawings", riskLevel: "high", defectTrigger: false, requirePhoto: false },
      { category: "Surface Treatment", description: "Protective coating or paint system applied to specified DFT", riskLevel: "low", defectTrigger: false, requirePhoto: false, codeReference: "AS/NZS 2312" },
      { category: "Documentation", description: "NATA-certified inspection report for welds and connections provided", riskLevel: "high", requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Retaining Wall Inspection", "Structural Engineer", "structural_retaining_wall", "Retaining Wall Inspection",
    "Structural review of retaining walls and drainage prior to backfilling.",
    50,
    [
      { category: "Foundation", description: "Footing depth and bearing consistent with engineer design", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4678" },
      { category: "Reinforcement", description: "Wall reinforcement (vertical bars, horizontal ties) match drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Drainage", description: "Agricultural drain installed at base of wall with correct fall and outlet", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Drainage", description: "Drainage aggregate placed between wall and cut face", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Waterproofing", description: "Waterproofing membrane applied to soil-face of wall where required", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Surcharge", description: "No surcharges within 1.5× wall height during construction", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Documentation", description: "Engineer's certificate of retaining wall compliance issued", riskLevel: "medium" },
    ],
  );

  await seedTemplate(
    "Structural Final Inspection", "Structural Engineer", "structural_final", "Structural Final Inspection",
    "Overall structural sign-off at completion of construction.",
    60,
    [
      { category: "Foundations", description: "No cracking, subsidence or differential settlement visible at footings or slab", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Frame", description: "No visible structural defects — no missing connections, split members or excessive deflection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Roof", description: "Roof structure appears structurally sound — no sagging, spreading or missing bracing", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Connections", description: "All hold-downs, tie-downs and brackets remain in place and undamaged", riskLevel: "critical", defectTrigger: true, requirePhoto: true },
      { category: "Modifications", description: "Any structural modifications approved by engineer and documented", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Documentation", description: "Structural engineer's certificate of compliance issued for the works", riskLevel: "high" },
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PLUMBING OFFICER
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- Plumbing Officer ---");

  await seedTemplate(
    "Rough-In Inspection", "Plumbing Officer", "plumbing_rough_in", "Rough-In Inspection",
    "Inspection of concealed plumbing rough-in before wall and floor coverings are applied.",
    10,
    [
      { category: "Layout", description: "All waste and supply pipe routes follow approved plans and are accessible for maintenance", riskLevel: "medium", defectTrigger: false, requirePhoto: true },
      { category: "Pipe Material", description: "Correct pipe material, class and jointing method used for each application (uPVC, copper, PEX)", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.1" },
      { category: "Falls", description: "Waste lines fall minimum 1:40 (2.5%) for horizontal pipes", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.2 Cl 8.2" },
      { category: "Venting", description: "Vent pipes installed to correct height and diameter — not blocked by insulation or sheeting", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.2" },
      { category: "Penetrations", description: "All floor and wall penetrations sealed against vermin and fire-rated where required", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Pressure Test", description: "Air or water pressure test conducted on concealed supply lines — no pressure drop", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.1 Cl 10" },
      { category: "Isolation Valves", description: "Isolation valves installed at each fixture and at water meter", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS/NZS 3500.1" },
      { category: "Documentation", description: "Rough-in inspection certificate completed and signed", riskLevel: "medium" },
    ],
  );

  await seedTemplate(
    "Sanitary Drainage Inspection", "Plumbing Officer", "plumbing_sanitary_drainage", "Sanitary Drainage Inspection",
    "Inspection of sanitary drainage including underground and above-ground waste lines.",
    20,
    [
      { category: "Pipe Grade", description: "Underground drain falls minimum 1:60 throughout — checked with level", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.2 Cl 8.2" },
      { category: "Pipe Bedding", description: "Pipes bedded and surrounded in clean granular material to correct depth", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Junctions", description: "All junctions are 45° or 90° swept fittings — no sharp-angle connections", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.2" },
      { category: "Inspection Openings", description: "IOs installed at every change of direction and maximum 45m spacing", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.2 Cl 9" },
      { category: "Boundary Trap", description: "Boundary trap (BT) installed in correct location and accessible", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.2" },
      { category: "Pressure Test", description: "Drain tested by hydraulic pressure or water-filled test — zero leakage", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.2 Cl 13" },
      { category: "Documentation", description: "Drainage inspection certificate completed and forwarded to authority", riskLevel: "medium" },
    ],
  );

  await seedTemplate(
    "Hot & Cold Water Systems", "Plumbing Officer", "plumbing_hot_cold_water", "Hot & Cold Water Systems",
    "Inspection of domestic hot and cold water supply including HWS and fixtures.",
    30,
    [
      { category: "Water Meter", description: "Water meter located, accessible, and connects to licensed water authority service", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS/NZS 3500.1" },
      { category: "Backflow", description: "Backflow prevention device installed at meter and where required by risk assessment", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.1 Cl 4.6" },
      { category: "HWS", description: "Hot water system installed correctly — correct TPR valve, expansion control and pressure relief valve", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.4" },
      { category: "HWS Temperature", description: "HWS temperature set to minimum 60°C storage / 50°C delivery", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.4 Cl 4.3" },
      { category: "Pressure", description: "Water pressure at fixtures within 200–500 kPa (or as per authority requirements)", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.1" },
      { category: "Fixtures", description: "All fixtures properly connected, sealed and free of leaks on initial fill", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Lagging", description: "Hot water pipes lagged where exposed in unheated spaces or roof void", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Documentation", description: "Certificate of compliance for HWS and water supply works issued", riskLevel: "medium" },
    ],
  );

  await seedTemplate(
    "Gas Installation Inspection", "Plumbing Officer", "plumbing_gas", "Gas Installation Inspection",
    "Inspection of natural gas or LPG installation including meters, pipework and appliances.",
    40,
    [
      { category: "Pipe Material", description: "Gas pipework is correct material (copper or approved polymer) and appropriately clipped and supported", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 5601.1" },
      { category: "Pressure Test", description: "Pressure test to 7 kPa (NG) or 14 kPa (LPG) held for minimum 5 minutes — zero drop", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 5601.1 Cl 5" },
      { category: "Meter", description: "Gas meter in accessible location with correct clearances from ignition sources and openings", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 5601.1" },
      { category: "Appliances", description: "All gas appliances connected and commissioned by licensed gasfitter — no leaks detected", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 5601.1" },
      { category: "Ventilation", description: "Appliance ventilation and flue system installed to manufacturer's spec and AS 5601", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 5601.1" },
      { category: "Isolation", description: "Isolation valve accessible adjacent to each appliance", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Documentation", description: "Gas compliance certificate (Form 4 or state equivalent) completed and forwarded", riskLevel: "critical" },
    ],
  );

  await seedTemplate(
    "Stormwater Drainage Inspection", "Plumbing Officer", "plumbing_stormwater", "Stormwater Drainage Inspection",
    "Inspection of roof drainage, surface drainage and stormwater discharge systems.",
    50,
    [
      { category: "Gutters & Downpipes", description: "Gutters fall minimum 1:500 toward downpipes — no ponding sections", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.3" },
      { category: "Downpipes", description: "Downpipes sized to match roof catchment area per AS/NZS 3500.3 calculations", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS/NZS 3500.3" },
      { category: "Discharge", description: "Stormwater discharges to approved point — kerb/channel, soakage pit or council drain", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Pits & Sumps", description: "Grated drainage pits installed at correct locations with correct falls leading in", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Silt Traps", description: "Silt/sediment traps installed where required by local council or environmental plan", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Pressure Test", description: "Stormwater lines pressure or water tested — zero leakage confirmed", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3500.3" },
    ],
  );

  await seedTemplate(
    "Fire Services Plumbing", "Plumbing Officer", "plumbing_fire_services", "Fire Services Plumbing",
    "Inspection of fire hydrant and sprinkler supply plumbing for Class 2+ buildings.",
    60,
    [
      { category: "Supply Pipe", description: "Fire services supply main is correct diameter per hydraulic design — no reduction in bore", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 2118.1" },
      { category: "Isolation Valves", description: "Isolation valves for fire services are OS&Y or butterfly type — locked open", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 1851" },
      { category: "Hydrant Booster", description: "Fire brigade boosting inlet on building façade — accessible, capped and labelled", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2419.1" },
      { category: "Pressure & Flow", description: "Flow test and pressure test conducted by licensed fire protection plumber — results recorded", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 1851" },
      { category: "Backflow", description: "Testable backflow prevention device installed on fire services connection where required", riskLevel: "high", defectTrigger: false, requirePhoto: false, codeReference: "AS/NZS 3500.1" },
      { category: "Documentation", description: "Commissioning test report and plumber's compliance certificate provided", riskLevel: "critical" },
    ],
  );

  await seedTemplate(
    "Plumbing Completion Inspection", "Plumbing Officer", "plumbing_completion", "Completion Inspection",
    "Final plumbing sign-off confirming all systems are complete and compliant.",
    70,
    [
      { category: "Fixtures", description: "All fixtures (basins, baths, showers, toilets, sinks) installed, operational and free of leaks", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Hot Water", description: "HWS operating correctly — hot water reaches all fixtures within reasonable time", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Drainage", description: "All fixtures drain freely — no gurgling, slow drainage or cross-venting issues", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Gas", description: "Gas appliances all operational and gas compliance certificate on hand", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Water Efficiency", description: "All fixtures are WELS rated and labelled as required by WaterMark", riskLevel: "low", defectTrigger: false, requirePhoto: false, codeReference: "WaterMark Scheme" },
      { category: "Backflow Devices", description: "All testable backflow prevention devices commissioned and logged", riskLevel: "high", defectTrigger: false, requirePhoto: false },
      { category: "Documentation", description: "Final Certificate of Compliance (Form 1 or state equivalent) issued", riskLevel: "critical" },
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BUILDER / QC
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- Builder / QC ---");

  await seedTemplate(
    "Pre-Slab Inspection", "Builder / QC", "builder_pre_slab", "Pre-Slab Inspection",
    "Quality check immediately before concrete is poured for the ground floor slab.",
    10,
    [
      { category: "Subgrade", description: "Subgrade compacted and approved — no disturbance since engineer's inspection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Membrane", description: "Vapour / termite barrier laid, lapped min 200mm and taped — no tears or punctures", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1" },
      { category: "Reinforcement", description: "Steel mesh/rebar correctly positioned and supported on chairs — cover adequate", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Edge Forms", description: "Edge formwork straight, level and set to correct slab depth", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Services", description: "Conduit, PVC sleeves and in-slab pipes fixed in position — not floating", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Concrete Order", description: "Concrete mix design, quantity and slump confirmed with batch plant", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Sign-Off", description: "Plumber and structural engineer hold-point sign-offs completed before pour commences", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Frame Stage Inspection", "Builder / QC", "builder_frame_stage", "Frame Stage Inspection",
    "Quality review of framing prior to lock-up — before insulation and lining.",
    20,
    [
      { category: "Walls", description: "Wall frames plumb, straight and correctly spaced — no bowing or racking", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Walls", description: "All noggings, blocking and backing strips in place for fixtures and cabinetry", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Roof", description: "Roof trusses or rafters correctly seated, plumb and braced per drawing", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684" },
      { category: "Connections", description: "All structural tie-downs, straps and hold-down bolts installed", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684" },
      { category: "Openings", description: "Door and window openings correctly sized, square and within tolerance ±3mm", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Services Rough-In", description: "Electrical, plumbing, and data rough-ins completed before insulation", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Termite", description: "Physical termite protection installed correctly at all penetrations", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1" },
    ],
  );

  await seedTemplate(
    "Lock-Up Stage Inspection", "Builder / QC", "builder_lock_up", "Lock-Up Stage Inspection",
    "QC inspection at lock-up — roof, external walls and openings weathertight.",
    30,
    [
      { category: "Roof", description: "Roofing material fully fixed — all ridge capping, flashings, valleys and penetrations sealed", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "External Walls", description: "External cladding or brickwork complete and weathertight", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Windows & Doors", description: "All windows and external doors installed, operational and flashed correctly", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Drainage", description: "Roof drainage (gutters, downpipes) connected and discharging correctly", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Damp Course", description: "Damp-proof course / flashing visible below lowest external cladding", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "NCC Vol 2" },
      { category: "Security", description: "Building secure — all openings lockable before trade subcontractors work inside", riskLevel: "low", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Defect Inspection", "Builder / QC", "builder_defect", "Defect Inspection",
    "Systematic inspection to identify, record and categorise defects prior to client handover.",
    40,
    [
      { category: "Internal Finishes", description: "Walls — painting complete, no drips, runs, missed patches or substrate visible", riskLevel: "low", defectTrigger: true, requirePhoto: true },
      { category: "Internal Finishes", description: "Ceilings — no cracking, staining, cornice gaps or paint defects", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Internal Finishes", description: "Skirting boards, architraves and trims — correctly fixed, gaps filled and painted", riskLevel: "low", defectTrigger: true, requirePhoto: false },
      { category: "Joinery", description: "All doors operate freely, latch correctly and are hung square without binding", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Joinery", description: "Kitchen and laundry cabinetry level, secure, soft-close hinges operational", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Floor Coverings", description: "Tiles — grout lines consistent, no hollow-sounding tiles, no cracking or lippage", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Floor Coverings", description: "Timber / laminate / carpet — correctly laid, no bubbles, joins or fraying", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Wet Areas", description: "Waterproofing visible below tiles in shower recess — no silicone gaps or movement", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3740" },
      { category: "External", description: "External paint / render — no cracking, peeling, missed areas or colour variation", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Services", description: "All power points, switches and light fittings installed, operational and correctly positioned", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Practical Completion Inspection", "Builder / QC", "builder_practical_completion", "Practical Completion Inspection",
    "Formal inspection confirming the building is ready for occupation and client handover.",
    50,
    [
      { category: "Structural", description: "No structural defects or movement visible — doors and windows operate normally", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Services", description: "All mechanical services (HVAC, exhaust fans) operational", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Electrical", description: "Electrical installation complete — switchboard labelled, GPOs and lights tested", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Plumbing", description: "All plumbing fixtures operational and compliance certificate on hand", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Site", description: "Site cleaned — all waste, formwork, timber off-cuts and rubble removed", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Site", description: "Driveway, paths and landscaping in agreed final condition", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Defects List", description: "Outstanding defect list prepared — all items agreed with client and scheduled for rectification", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Certificates", description: "Occupation Certificate (or equivalent) obtained from certifier", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Handover Inspection", "Builder / QC", "builder_handover", "Handover Inspection",
    "Client walkthrough and formal handover — keys, manuals and warranties handed to owner.",
    60,
    [
      { category: "Defect Rectification", description: "All agreed defects from PC inspection have been rectified to client's satisfaction", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Documentation", description: "All certificates, warranties and instruction manuals handed to client (appliances, garage door, HWS)", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Keys & Access", description: "All door keys, garage remotes and security codes provided to client", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Meters", description: "Gas, electricity and water meter readings recorded at handover date", riskLevel: "low", defectTrigger: false, requirePhoto: true },
      { category: "Smoke Alarms", description: "Smoke alarms tested in client's presence — batteries and operation confirmed", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "NCC Cl E2.2a" },
      { category: "Client Sign-Off", description: "Client signs handover certificate acknowledging receipt of keys and documentation", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Concrete Pour Inspection", "Builder / QC", "builder_concrete_pour", "Concrete Pour Inspection",
    "On-site quality control during concrete pours — mix, placement and finishing.",
    70,
    [
      { category: "Delivery", description: "Concrete batch delivery docket matches specified mix design — no unauthorised water addition", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 1379" },
      { category: "Slump", description: "Slump tested on site — within specified range (typically 80–120mm)", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 1012.3" },
      { category: "Test Cylinders", description: "Minimum 3 test cylinders taken per 50m³ or per pour — clearly labelled and cured correctly", riskLevel: "high", defectTrigger: false, requirePhoto: true, codeReference: "AS 1012.9" },
      { category: "Placement", description: "Concrete placed and compacted with vibrator — no segregation visible", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Finishing", description: "Surface finished to specified level, falls and texture", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Curing", description: "Curing compound applied or wet hessian placed immediately after finishing", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS 3600" },
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SITE SUPERVISOR
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- Site Supervisor ---");

  await seedTemplate(
    "Daily Site Inspection", "Site Supervisor", "site_daily", "Daily Site Inspection",
    "Daily safety, housekeeping and progress check across the construction site.",
    10,
    [
      { category: "Site Access", description: "Site entry is controlled — hoarding, gates and signage in place and undamaged", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Housekeeping", description: "Site free of unnecessary trip hazards — walkways clear, materials stored safely", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "PPE", description: "All workers on site wearing required PPE (hard hats, high-vis, safety boots)", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg 2017" },
      { category: "Edge Protection", description: "All open edges, excavations and floor voids are barricaded or covered", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "WHS Reg s225" },
      { category: "Plant & Equipment", description: "Mobile plant operating safely — spotters used where pedestrian/plant interaction exists", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Weather", description: "Site conditions assessed for high wind, lightning or extreme heat risk", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Progress", description: "Work progressing in line with programme — delays or issues noted", riskLevel: "low", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Subcontractor Pre-Start", "Site Supervisor", "site_subcontractor_prestart", "Subcontractor Pre-Start",
    "Pre-start briefing and sign-on check for each new trade or subcontractor arriving on site.",
    20,
    [
      { category: "Induction", description: "Subcontractor workers have completed site induction — forms signed and filed", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Licences", description: "All required trade licences and insurances checked and on file (Public Liability, WorkCover)", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "SWMS", description: "Safe Work Method Statement submitted, reviewed and accepted before commencing high-risk work", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s299" },
      { category: "Scope of Work", description: "Scope of works, drawings and specifications briefed to subcontractor foreman", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Programme", description: "Subcontractor's work sequence confirmed against master programme — no conflicts", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Coordination", description: "Interface with other trades identified — coordination meeting held if required", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Concrete Pour Sign-Off", "Site Supervisor", "site_concrete_pour", "Concrete Pour Sign-Off",
    "Site supervisor's hold-point confirmation before and during each concrete pour.",
    30,
    [
      { category: "Engineer Sign-Off", description: "Structural engineer's hold-point inspection completed and written approval received", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Plumber Sign-Off", description: "Plumber has signed off all in-slab services — no further changes to be made", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Electrician Sign-Off", description: "Electrician has confirmed all conduit positions and sleeves are correct", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Crew & Resources", description: "Concrete crew, vibrators, screed rails and curing materials confirmed on site", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Weather", description: "Weather forecast reviewed — no rain expected during pour and initial cure period", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Test Cylinders", description: "Concrete testing technician confirmed on site for cylinder collection and slump testing", riskLevel: "high", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Defect Walkthrough", "Site Supervisor", "site_defect_walkthrough", "Defect Walkthrough",
    "Systematic room-by-room walkthrough to log defects prior to client inspection.",
    40,
    [
      { category: "Walls", description: "All internal walls — free of holes, patching marks, scuffs and paint defects", riskLevel: "low", defectTrigger: true, requirePhoto: true },
      { category: "Ceilings", description: "Ceilings — no cracking, staining, cornice gaps or uneven plasterboard joins", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Doors", description: "All doors open, close and latch correctly — hardware complete and operational", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Windows", description: "All windows open, lock and seal correctly — no broken glass or damaged frames", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Kitchen", description: "Kitchen cabinetry — no gaps, damage, misaligned doors or non-operational soft-close", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Bathrooms", description: "Tiles, grout and silicone in wet areas — no cracks, voids or hollow-sounding tiles", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Flooring", description: "All floor coverings — no joins lifting, staining, bubbles or transitional strip issues", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "External", description: "External — render, cladding, decking and paths all defect free and clean", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
    ],
  );

  await seedTemplate(
    "Pre-Handover Walk", "Site Supervisor", "site_pre_handover_walk", "Pre-Handover Walk",
    "Final walk confirming defects rectified and site ready before client handover.",
    50,
    [
      { category: "Defect Closure", description: "All items on defect list from previous inspection have been signed off as rectified", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Cleanliness", description: "Building professionally cleaned — no construction dust, labels or protective film remaining", riskLevel: "low", defectTrigger: true, requirePhoto: false },
      { category: "Appliances", description: "All appliances installed, functional and protective wrapping removed", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Site", description: "Site cleaned — no rubbish, unused materials or plant remaining on site", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Signage & Hoarding", description: "Temporary hoarding and signage removed from public areas", riskLevel: "low", defectTrigger: false, requirePhoto: false },
      { category: "Occupation Certificate", description: "Occupation Certificate confirmed issued and on file before handover proceeds", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // WHS OFFICER
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- WHS Officer ---");

  await seedTemplate(
    "Site Safety Audit", "WHS Officer", "whs_site_safety_audit", "Site Safety Audit",
    "Comprehensive safety audit of the construction site against WHS legislation and site rules.",
    10,
    [
      { category: "Management", description: "WHS Management Plan current, signed by PCBU and accessible on site", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s293" },
      { category: "Management", description: "Emergency response plan posted prominently — assembly point clearly marked", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Act s19" },
      { category: "Site Conditions", description: "Site perimeter securely fenced — no unauthorised access possible", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "First Aid", description: "Adequate first aid kit available and restocked — first aid officer identified", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s42" },
      { category: "Fall Prevention", description: "Edge protection, scaffolding or personal fall arrest in use at all work at heights >2m", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "WHS Reg s225" },
      { category: "Fall Prevention", description: "Scaffolding erected by competent person — tag current", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "WHS Reg s228" },
      { category: "Excavations", description: "All excavations >1.5m shored, battered or benched — no unprotected workers below", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "WHS Reg s308" },
      { category: "Electrical", description: "Temporary electrical supply has RCDs — all extension leads tagged and tested", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3012" },
      { category: "SWMS", description: "SWMS in place for all high-risk construction work — reviewed and signed by workers", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s299" },
      { category: "Welfare", description: "Amenities (toilets, drinking water, shelter) adequate for workforce size", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "WHS Reg s223" },
    ],
  );

  await seedTemplate(
    "Plant & Equipment Inspection", "WHS Officer", "whs_plant_equipment", "Plant & Equipment Inspection",
    "Pre-use and periodic inspection of construction plant, mobile equipment and lifting gear.",
    20,
    [
      { category: "Registration", description: "Plant registration current (cranes, EWPs, forklifts) — records on site", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s233" },
      { category: "Operator Licences", description: "All plant operators hold current high-risk work licence for the specific plant", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s60" },
      { category: "Pre-Start Checks", description: "Daily pre-start inspection completed by operator and logged — defects reported", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Condition", description: "No fluid leaks, damaged hoses, missing guards or loose components observed", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Lifting Gear", description: "Slings, chains and shackles inspected — within SWL rating, no kinks or deformation", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 3776" },
      { category: "Exclusion Zones", description: "Exclusion zones established around operating plant — barriers or spotter in place", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Maintenance", description: "Plant maintenance logbook up to date — next service due date not exceeded", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Hazardous Materials Inspection", "WHS Officer", "whs_hazmat", "Hazardous Materials Inspection",
    "Inspection of hazardous chemical storage, handling and SDS compliance on site.",
    30,
    [
      { category: "Register", description: "Hazardous chemicals register current and accessible — all chemicals on site listed", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s346" },
      { category: "SDS", description: "Safety Data Sheets available for every hazardous chemical — less than 5 years old", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s344" },
      { category: "Storage", description: "Flammable liquids stored in approved flammable goods cabinet — away from ignition sources", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 1940" },
      { category: "Labelling", description: "All chemical containers correctly labelled — no decanting into unlabelled containers", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Asbestos", description: "Asbestos register checked — no ACM disturbed without licensed removalist", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s419" },
      { category: "Spill Kit", description: "Spill containment kit available and stocked — workers trained in spill procedure", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Incident Investigation", "WHS Officer", "whs_incident_investigation", "Incident Investigation",
    "Structured investigation following a workplace incident, near miss or dangerous event.",
    40,
    [
      { category: "Scene", description: "Scene secured and preserved — no disturbance until investigation complete (unless ongoing hazard)", riskLevel: "critical", defectTrigger: true, requirePhoto: true },
      { category: "Notification", description: "Regulator notified within required timeframe for serious incident", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Act s38" },
      { category: "Evidence", description: "Photographs, measurements and witness statements collected promptly", riskLevel: "high", defectTrigger: false, requirePhoto: true },
      { category: "Root Cause", description: "Root cause analysis completed — contributing factors identified", riskLevel: "high", defectTrigger: false, requirePhoto: false },
      { category: "Corrective Actions", description: "Corrective actions documented with owner and due date — entered in register", riskLevel: "high", defectTrigger: false, requirePhoto: false },
      { category: "Worker Welfare", description: "Injured worker's welfare checked — EAP and return-to-work plan initiated if required", riskLevel: "high", defectTrigger: false, requirePhoto: false },
      { category: "Report", description: "Incident report completed and distributed to management and workers", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Emergency Procedures Review", "WHS Officer", "whs_emergency_procedures", "Emergency Procedures Review",
    "Periodic review and drill of site emergency response arrangements.",
    50,
    [
      { category: "Plan", description: "Emergency response plan is current — reviewed within last 12 months", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "WHS Act s19" },
      { category: "Assembly Point", description: "Assembly point sign posted and unobstructed — all workers know the location", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "First Aid", description: "First aid officer present on site — contact details posted at entry", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Drill", description: "Emergency drill conducted and documented — participation rate and timing recorded", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Communications", description: "Communication system functional — emergency services numbers posted", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Evacuation", description: "Evacuation routes clear and unobstructed — all workers briefed on routes", riskLevel: "high", defectTrigger: true, requirePhoto: false },
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PRE-PURCHASE INSPECTOR
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- Pre-Purchase Inspector ---");

  await seedTemplate(
    "Pre-Purchase Building Inspection", "Pre-Purchase Inspector", "prepurchase_building", "Pre-Purchase Building Inspection",
    "Comprehensive condition assessment of a property for a prospective purchaser per AS 4349.1.",
    10,
    [
      { category: "Roof Exterior", description: "Roof covering — tiles, metal or membrane in good condition; no slipped, cracked or missing materials", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4349.1" },
      { category: "Roof Exterior", description: "Gutters, flashings, valleys and downpipes — no rust, blockages or pulling away from fascia", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Roof Space", description: "Roof space inspected — no active leaks, pest damage, missing insulation or structural concerns", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "External Walls", description: "External walls — no significant cracking, moisture penetration, spalling or damage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Site Drainage", description: "Site drainage falls away from building — no evidence of ponding or rising damp", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Internal", description: "Internal walls and ceilings — no significant cracking, damp staining or structural movement", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Sub-Floor", description: "Sub-floor inspected (if applicable) — no moisture, pest damage, or failing stumps/bearer", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Wet Areas", description: "Bathrooms and laundry — no evidence of leaks, water damage or failed waterproofing", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Services", description: "Electrical, plumbing and gas — visible condition noted; specialist inspection recommended where concerns identified", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Conclusion", description: "Overall condition assessment and major defects summary completed per AS 4349.1", riskLevel: "high", requirePhoto: false, codeReference: "AS 4349.1" },
    ],
  );

  await seedTemplate(
    "Pest & Termite Inspection", "Pre-Purchase Inspector", "prepurchase_pest", "Pest & Termite Inspection",
    "Visual inspection for timber pests including termites, borers and wood decay fungi.",
    20,
    [
      { category: "Exterior", description: "Perimeter of building inspected — no termite leads, mud tubes or evidence of active activity", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.2" },
      { category: "Sub-Floor", description: "Sub-floor accessible areas inspected — no termite workings, moisture or decayed timber", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 4349.3" },
      { category: "Roof Space", description: "Roof space inspected for termite and borer activity in roof timbers and battens", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Internal", description: "Internal rooms — probing and inspection of skirtings, architraves, floors and wall frames", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Garden & Trees", description: "Trees, stumps and garden beds within 3m of building checked for termite nests", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Moisture", description: "Moisture levels in timber checked with moisture meter — readings above 20% flagged", riskLevel: "medium", defectTrigger: true, requirePhoto: false },
      { category: "Report", description: "Pest inspection report issued in accordance with AS 4349.3 — defects clearly noted", riskLevel: "high", requirePhoto: false, codeReference: "AS 4349.3" },
    ],
  );

  await seedTemplate(
    "Strata / Unit Inspection", "Pre-Purchase Inspector", "prepurchase_strata", "Strata / Unit Inspection",
    "Condition inspection of a strata title unit and its lot entitlements within a strata scheme.",
    30,
    [
      { category: "Unit Interior", description: "Walls, ceilings, floors and wet areas within the lot — no defects or water damage", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4349.1" },
      { category: "Balcony", description: "Balcony structure, balustrade height and condition assessed — no corrosion or movement", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Common Property", description: "Visible common property areas noted — car park, lobby, lifts, pool and gardens", riskLevel: "medium", defectTrigger: false, requirePhoto: true },
      { category: "Services", description: "Metering, hot water system, air conditioning and exhaust fans operational", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Strata Records", description: "Strata report recommended — 10-year capital works fund, levies and known disputes noted", riskLevel: "high", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Commercial Property Condition Report", "Pre-Purchase Inspector", "prepurchase_commercial", "Commercial Property Condition Report",
    "Condition assessment of a commercial, retail or industrial property prior to purchase or lease.",
    40,
    [
      { category: "Structure", description: "External and internal structural elements — no significant cracking, movement or deterioration", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4349.1" },
      { category: "Roof", description: "Roof covering, drainage and penetrations — no leaks, membrane failures or damaged flashings", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Façade", description: "External façade — cladding, glazing, sealants and weatherproofing in acceptable condition", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Services", description: "Electrical switchboard, HVAC, hydraulics and fire services — visible condition assessed", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Accessibility", description: "Accessible path of travel and DDA-compliant facilities — any non-compliance noted", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "NCC Cl D3" },
      { category: "Asbestos", description: "Signs of ACM noted for further assessment — asbestos register requested from vendor", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "WHS Reg s419" },
      { category: "Conclusion", description: "Condition rating and major capital expenditure items summarised in report", riskLevel: "high", requirePhoto: false },
    ],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FIRE SAFETY ENGINEER
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n--- Fire Safety Engineer ---");

  await seedTemplate(
    "Fire Safety Systems Inspection", "Fire Safety Engineer", "fire_safety_systems", "Fire Safety Systems Inspection",
    "Inspection and commissioning verification of active fire safety systems in a building.",
    10,
    [
      { category: "Detection", description: "Smoke detection system covers all required areas — no zone gaps", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "NCC Spec E2.2b / AS 1670.1" },
      { category: "Detection", description: "Fire alarm panel operational — no faults, monitored by approved monitoring company", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 1670.1" },
      { category: "Sprinklers", description: "Sprinkler system covers all required areas — correct sprinkler type and spacing per design", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2118.1" },
      { category: "Sprinklers", description: "Sprinkler control valve open and tagged — flow test confirms adequate pressure and flow", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2118.1" },
      { category: "Special Suppression", description: "Special suppression systems commissioned and tested per manufacturer requirements", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Dampers", description: "Fire and smoke dampers in HVAC inspected and actuated correctly in test mode", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 1682.2" },
      { category: "Compartmentation", description: "Fire-rated walls, doors and penetration seals intact — no holes or gaps in rated construction", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "NCC Spec C3.4" },
      { category: "Documentation", description: "Fire systems commissioning report and Essential Safety Measures schedule prepared", riskLevel: "high", requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Emergency Lighting & Exit Inspection", "Fire Safety Engineer", "fire_emergency_lighting", "Emergency Lighting & Exit Inspection",
    "Inspection and testing of emergency lighting and exit signage throughout the building.",
    20,
    [
      { category: "Exit Signs", description: "Exit signs installed above all exit doors and along exit paths — illuminated and unobstructed", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2293.1" },
      { category: "Exit Signs", description: "Exit signs have directional arrows where path of travel is not obvious", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2293.1" },
      { category: "Emergency Lights", description: "Emergency luminaires installed at required spacing along evacuation routes", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2293.1" },
      { category: "Battery Test", description: "90-minute discharge test conducted — all units maintain minimum illumination throughout", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 2293.2" },
      { category: "Luminance", description: "Emergency lighting illuminance levels measured and recorded — not less than 0.2 lux at floor", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2293.1 Cl 3.3" },
      { category: "Exits", description: "All exit doors swing in the direction of travel and open without a key or special knowledge", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "NCC D2.21" },
      { category: "Maintenance Tag", description: "Emergency lighting maintenance tag current — next service within required interval", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
    ],
  );

  await seedTemplate(
    "Fire Hydrant & Hose Reel Inspection", "Fire Safety Engineer", "fire_hydrant_hose_reel", "Fire Hydrant & Hose Reel Inspection",
    "Inspection and flow testing of fire hydrant and hose reel systems.",
    30,
    [
      { category: "Hydrants", description: "All fire hydrants accessible, labelled and unobstructed — no parking over hydrant pits", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2419.1" },
      { category: "Hydrants", description: "Hydrant outlet valve, cap and thread in good condition — pressure test within required interval", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 1851" },
      { category: "Booster Inlet", description: "Fire brigade booster inlet accessible at building front — signage correct, capped and undamaged", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2419.1" },
      { category: "Hose Reels", description: "Hose reels in accessible cabinets — hose undamaged, nozzle present and reel unobstructed", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2441" },
      { category: "Flow Test", description: "Flow test conducted at furthest hydrant — minimum residual pressure and flow rate achieved", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 2419.1" },
      { category: "Annual Service", description: "Annual inspection and service completed by fire protection contractor — report on file", riskLevel: "high", requirePhoto: false, codeReference: "AS 1851" },
    ],
  );

  await seedTemplate(
    "Smoke Alarm Compliance Inspection", "Fire Safety Engineer", "fire_smoke_alarms", "Smoke Alarm Compliance Inspection",
    "Inspection of smoke alarm installation and compliance for residential buildings.",
    40,
    [
      { category: "Locations", description: "Smoke alarms installed in every bedroom, hallway and on each storey as required by legislation", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "NCC E2.2a / State legislation" },
      { category: "Type", description: "Alarm type appropriate for location — interconnected alarms where required", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 3786" },
      { category: "Hardwired", description: "Alarms hardwired to mains power with battery backup where required by state legislation", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Test", description: "All alarms tested by activating test button — all units sound within 30 seconds of activation", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 3786" },
      { category: "Interconnection", description: "Interconnected alarms tested — activation of one alarm triggers all other alarms in the dwelling", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Age", description: "Alarms not older than 10 years from manufacture date — manufacture date visible on unit", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 3786" },
    ],
  );

  await seedTemplate(
    "Annual Fire Safety Statement", "Fire Safety Engineer", "fire_afss", "Annual Fire Safety Statement",
    "Annual Essential Safety Measures inspection to support the Annual Fire Safety Statement.",
    50,
    [
      { category: "Essential Safety Measures", description: "All ESMs listed on the ESM schedule are inspected this cycle — none overlooked", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Fire Compartmentation", description: "Fire doors, smoke doors and seals operational — no wedged-open doors or damaged seals", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 1905.1" },
      { category: "Sprinklers", description: "Sprinkler system annual service completed by licensed fire protection contractor", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 1851" },
      { category: "Detection & Alarm", description: "Fire detection and alarm system annual service completed — no outstanding faults", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 1851" },
      { category: "Emergency Lighting", description: "Emergency lighting annual service completed — all units operational and battery test passed", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2293.2" },
      { category: "Hydrants & Hose Reels", description: "Hydrant and hose reel annual service completed — flow test on record", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 1851" },
      { category: "Statement", description: "Annual Fire Safety Statement signed by competent fire safety practitioner and lodged with council", riskLevel: "critical", defectTrigger: false, requirePhoto: false },
    ],
  );

  console.log("\n=== All discipline checklists seeded successfully ===");
}
