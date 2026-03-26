import { db } from "../index";
import { checklistTemplatesTable, checklistItemsTable } from "../schema/checklists";
import { eq, inArray, not } from "drizzle-orm";

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

const CLASS_1_TO_9_FOLDERS = [
  "Class 1a","Class 1b","Class 2","Class 3","Class 4",
  "Class 5","Class 6","Class 7a","Class 7b","Class 8",
  "Class 9a","Class 9b","Class 9c",
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
  const existing = await db.select().from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.name, name));
  for (const t of existing) {
    if (t.discipline === discipline && t.folder === folder) {
      await db.delete(checklistItemsTable).where(eq(checklistItemsTable.templateId, t.id));
      await db.delete(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, t.id));
    }
  }
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
  console.log("\n=== Cleaning existing Class 1–9 templates for non-BS disciplines ===");

  const toDelete = await db.select({ id: checklistTemplatesTable.id })
    .from(checklistTemplatesTable)
    .where(
      inArray(checklistTemplatesTable.discipline, NON_BS_DISCIPLINES)
    );

  const toDeleteClass19 = toDelete.filter((_, i) => true);
  const allNonBS = await db.select().from(checklistTemplatesTable)
    .where(inArray(checklistTemplatesTable.discipline, NON_BS_DISCIPLINES));

  const class19Templates = allNonBS.filter(t => CLASS_1_TO_9_FOLDERS.includes(t.folder));
  const ids = class19Templates.map(t => t.id);

  if (ids.length > 0) {
    await db.delete(checklistItemsTable).where(inArray(checklistItemsTable.templateId, ids));
    await db.delete(checklistTemplatesTable).where(inArray(checklistTemplatesTable.id, ids));
    console.log(`  Deleted ${ids.length} existing Class 1–9 templates for non-BS disciplines.`);
  } else {
    console.log("  No existing Class 1–9 templates to delete.");
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // STRUCTURAL ENGINEER
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Structural Engineer ---");

  const seFooting = (folder: string, sort: number, extra?: ItemDef[]) =>
    seedTemplate("Footing Inspection", "Structural Engineer", "se_footing", folder,
      "Structural engineer review of footing system prior to concrete pour.",
      sort, [
        { category: "Site Conditions", description: "Bearing surface free from loose material, water and contamination", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870", recommendedAction: "Remove and re-inspect bearing surface" },
        { category: "Site Conditions", description: "Excavation dimensions consistent with geotechnical and engineering drawings", riskLevel: "high", defectTrigger: true },
        { category: "Reinforcement", description: "Reinforcing steel size, spacing and cover comply with structural drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
        { category: "Reinforcement", description: "Bar laps and hooks installed to specification", riskLevel: "high", defectTrigger: true },
        { category: "Reinforcement", description: "Cover chairs/supports in place to maintain correct concrete cover", riskLevel: "medium", defectTrigger: true },
        { category: "Setout", description: "Footing setout consistent with approved structural drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Setout", description: "Setbacks from site boundaries verified", riskLevel: "medium", defectTrigger: true },
        { category: "Services / Penetrations", description: "All penetrations and sleeves identified and formed in reinforcement", riskLevel: "medium", defectTrigger: true },
        ...(extra ?? []),
      ]);

  const seSlab = (folder: string, sort: number, extra?: ItemDef[]) =>
    seedTemplate("Slab Inspection", "Structural Engineer", "se_slab", folder,
      "Structural engineer review of ground-bearing or suspended slab prior to concrete pour.",
      sort, [
        { category: "Substrate", description: "Compacted fill or ground surface prepared to specification", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },
        { category: "Vapour / Membrane", description: "Vapour barrier installed, lapped, taped and free from tears", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Reinforcement", description: "Top and bottom reinforcement mesh/bar to drawing specification", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
        { category: "Reinforcement", description: "Edge thickening reinforcement and beams formed correctly", riskLevel: "high", defectTrigger: true },
        { category: "Reinforcement", description: "Concrete cover maintained throughout via bar chairs", riskLevel: "medium", defectTrigger: true },
        { category: "Services", description: "All conduits, pipes and penetrations installed prior to pour", riskLevel: "medium", defectTrigger: true },
        { category: "Termite Protection", description: "Termite management system components in place (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Dimensions", description: "Slab thickness and dimensions verified against structural drawings", riskLevel: "high", defectTrigger: true },
        ...(extra ?? []),
      ]);

  const seFrame = (folder: string, sort: number, label = "Frame Structural Review") =>
    seedTemplate(label, "Structural Engineer", "se_frame", folder,
      "Structural engineer review of structural frame at frame/structure stage.",
      sort, [
        { category: "Wall Frames", description: "Stud size, spacing and species comply with engineering drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684" },
        { category: "Wall Frames", description: "Bracing type, quantity and location comply with bracing schedule", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Install missing bracing before proceeding" },
        { category: "Connections", description: "Tie-downs and hold-downs installed to engineer specification at all required locations", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Connections", description: "Joist hangers, straps and connectors correctly installed", riskLevel: "high", defectTrigger: true },
        { category: "Lintels & Beams", description: "Lintels and beams of correct size installed over all openings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1684" },
        { category: "Lintels & Beams", description: "Beam bearing lengths and bearing surfaces adequate", riskLevel: "high", defectTrigger: true },
        { category: "Roof Structure", description: "Trusses and rafters installed to design — size, spacing, bearing", riskLevel: "high", defectTrigger: true },
        { category: "Roof Structure", description: "Truss tie-downs and bracing installed per engineering", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "General", description: "No notching, drilling or alteration to structural members without engineering approval", riskLevel: "high", defectTrigger: true, recommendedAction: "Obtain engineering approval or remediate" },
      ]);

  const seSteelFrame = (folder: string, sort: number) =>
    seedTemplate("Steel Frame Inspection", "Structural Engineer", "se_steel_frame", folder,
      "Structural engineer review of steel portal frame or structural steel system.",
      sort, [
        { category: "Column Bases", description: "Column base plates installed level, plumb and to anchor bolt pattern", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4100" },
        { category: "Column Bases", description: "Anchor bolts of correct size, grade and projection", riskLevel: "high", defectTrigger: true },
        { category: "Column Bases", description: "Base plate grouting completed (if applicable)", riskLevel: "medium", defectTrigger: true },
        { category: "Frame Members", description: "Steel sections of correct grade, size and orientation to drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Frame Members", description: "Frame plumb and square — no visible out-of-tolerance deflection", riskLevel: "high", defectTrigger: true },
        { category: "Connections", description: "Bolted connections complete — all bolts in place to correct grade", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 4100" },
        { category: "Connections", description: "Welded connections inspected — full penetration welds as specified", riskLevel: "high", defectTrigger: true, recommendedAction: "Obtain NDT weld inspection report" },
        { category: "Bracing & Purlins", description: "Knee bracing, fly bracing and portal bracing installed to drawings", riskLevel: "high", defectTrigger: true },
        { category: "Bracing & Purlins", description: "Purlins, girts and bridging installed to specification", riskLevel: "medium", defectTrigger: true },
        { category: "Protective Coating", description: "Steel protection system (paint/zinc) applied to specification", riskLevel: "medium", defectTrigger: true },
      ]);

  // Class 1a
  await seFooting("Class 1a", 1);
  await seSlab("Class 1a", 2);
  await seFrame("Class 1a", 3);

  // Class 1b
  await seFooting("Class 1b", 1);
  await seSlab("Class 1b", 2);
  await seFrame("Class 1b", 3);

  // Class 2
  await seFooting("Class 2", 1, [
    { category: "Piled Foundations", description: "Pile locations and depths comply with geotechnical and structural drawings (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2159" },
  ]);
  await seSlab("Class 2", 2, [
    { category: "Post-Tensioning", description: "PT cables, anchors and dead-ends installed to PT engineer drawings (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Post-Tensioning", description: "Sheathing intact and ducts free from obstruction", riskLevel: "high", defectTrigger: true },
  ]);
  await seFrame("Class 2", 3, "Frame / Structure Inspection");

  // Class 3
  await seFooting("Class 3", 1);
  await seSlab("Class 3", 2);
  await seFrame("Class 3", 3);

  // Class 4
  await seedTemplate("Structural Compliance Review", "Structural Engineer", "se_structural_review", "Class 4",
    "Structural engineer review of dwelling within a non-residential building — structural compliance assessment.",
    1, [
      { category: "Foundation", description: "Foundation system appropriate for combined loading (residential over/within commercial)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Floor / Slab", description: "Floor slab/structure designed for residential live loads as well as commercial below", riskLevel: "high", defectTrigger: true },
      { category: "Wall Structure", description: "Structural walls and columns verified to structural drawings", riskLevel: "high", defectTrigger: true },
      { category: "Connections", description: "Interface connections between commercial and residential structure reviewed", riskLevel: "high", defectTrigger: true },
      { category: "Fire Separation", description: "Fire-rated structural elements in place at class boundary", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 C2" },
      { category: "Serviceability", description: "No evidence of excessive deflection or cracking to structural elements", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    ]);

  // Class 5
  await seFooting("Class 5", 1);
  await seSteelFrame("Class 5", 2);

  // Class 6
  await seFooting("Class 6", 1);
  await seSteelFrame("Class 6", 2);

  // Class 7a
  await seFooting("Class 7a", 1);
  await seedTemplate("Slab & Deck Inspection", "Structural Engineer", "se_slab_deck", "Class 7a",
    "Structural engineer review of carpark slab/deck — reinforcement, PT and waterproofing substrate.",
    2, [
      { category: "Slab Geometry", description: "Slab thickness, falls and dimensions to structural drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Reinforcement", description: "Top and bottom reinforcement compliant with structural drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Post-Tensioning", description: "PT cables, stressing anchors and pocket formers installed correctly (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Post-Tensioning", description: "Stressing records reviewed and compliant with engineer specification", riskLevel: "high", defectTrigger: true },
      { category: "Waterproofing Substrate", description: "Concrete surface prepared for waterproofing membrane — no contamination", riskLevel: "high", defectTrigger: true },
      { category: "Expansion Joints", description: "Expansion and contraction joints formed at required locations", riskLevel: "medium", defectTrigger: true },
      { category: "Edge Treatment", description: "Edge beams, upstands and kerb elements to drawings", riskLevel: "medium", defectTrigger: true },
      { category: "Drainage", description: "Drainage falls adequate — no ponding areas visible in formwork layout", riskLevel: "high", defectTrigger: true },
    ]);

  // Class 7b
  await seFooting("Class 7b", 1);
  await seSteelFrame("Class 7b", 2);

  // Class 8
  await seFooting("Class 8", 1);
  await seSteelFrame("Class 8", 2);

  // Class 9a
  await seFooting("Class 9a", 1);
  await seSlab("Class 9a", 2);
  await seSteelFrame("Class 9a", 3);

  // Class 9b
  await seFooting("Class 9b", 1);
  await seSlab("Class 9b", 2);
  await seFrame("Class 9b", 3, "Frame & Structure Inspection");

  // Class 9c
  await seFooting("Class 9c", 1);
  await seSlab("Class 9c", 2);
  await seFrame("Class 9c", 3);

  // ══════════════════════════════════════════════════════════════════════════════
  // PLUMBING OFFICER
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Plumbing Officer ---");

  const poRoughIn = (folder: string, sort: number) =>
    seedTemplate("Rough-In Inspection", "Plumbing Officer", "po_rough_in", folder,
      "Inspection of rough-in plumbing before walls are enclosed.",
      sort, [
        { category: "Sanitary Pipework", description: "Sanitary pipework installed to correct falls — min 1:60 horizontal drains", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.2" },
        { category: "Sanitary Pipework", description: "Trap arms, gully outlets and inspection points correctly positioned", riskLevel: "high", defectTrigger: true },
        { category: "Sanitary Pipework", description: "Stack vents and ventilation pipework installed correctly", riskLevel: "high", defectTrigger: true },
        { category: "Water Supply", description: "Hot and cold water supply lines of correct size and material", riskLevel: "high", defectTrigger: true, codeReference: "AS/NZS 3500.1" },
        { category: "Water Supply", description: "Isolation valves installed at all fixtures and branches", riskLevel: "medium", defectTrigger: true },
        { category: "Water Supply", description: "Pressure tested — system holds pressure per AS/NZS 3500 requirements", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Pipework Support", description: "All pipework adequately clipped, supported and protected from damage", riskLevel: "medium", defectTrigger: true },
        { category: "Wet Area Setout", description: "Wastes and floor drains positioned to correct location per plan", riskLevel: "high", defectTrigger: true },
      ]);

  const poSanitary = (folder: string, sort: number) =>
    seedTemplate("Sanitary Drainage Inspection", "Plumbing Officer", "po_sanitary", folder,
      "Inspection of sanitary drainage system — underground and internal.",
      sort, [
        { category: "Underground Drain", description: "Underground sanitary drain installed at correct depth and falls", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.2" },
        { category: "Underground Drain", description: "Pipe material, class and jointing compliant with specification", riskLevel: "high", defectTrigger: true },
        { category: "Underground Drain", description: "All junctions, bends and inspection openings correctly installed", riskLevel: "medium", defectTrigger: true },
        { category: "Underground Drain", description: "Drain tested — no visible leaks or pressure loss during test", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Connection", description: "Connection to sewer or on-site treatment system approved and correct", riskLevel: "high", defectTrigger: true },
        { category: "Inspection Points", description: "Inspection openings accessible at required intervals and locations", riskLevel: "medium", defectTrigger: true },
        { category: "Grease & Solids", description: "Grease arrestors installed where required (commercial kitchens)", riskLevel: "high", defectTrigger: true },
      ]);

  const poHotCold = (folder: string, sort: number) =>
    seedTemplate("Hot & Cold Water Systems", "Plumbing Officer", "po_hot_cold", folder,
      "Inspection of hot and cold water supply systems including tempering valves and storage.",
      sort, [
        { category: "Cold Water Supply", description: "Mains water connection complies with approved design", riskLevel: "high", defectTrigger: true, codeReference: "AS/NZS 3500.1" },
        { category: "Cold Water Supply", description: "Backflow prevention device installed at point of supply", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Hot Water System", description: "Hot water unit installed — type, capacity and location per approved drawings", riskLevel: "high", defectTrigger: true },
        { category: "Hot Water System", description: "Tempering valve installed and set to 50°C max at all sanitary outlets", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 3500.4", recommendedAction: "Adjust tempering valve and re-test" },
        { category: "Hot Water System", description: "Pressure relief valve and expansion control valve fitted and piped to drain", riskLevel: "high", defectTrigger: true },
        { category: "Pipework", description: "Hot water pipe insulated to minimum specification to reduce heat loss", riskLevel: "medium", defectTrigger: true },
        { category: "Pipework", description: "No cross-connections between hot and cold systems", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Testing", description: "System pressure tested — no leaks at joints, valves or fittings", riskLevel: "high", defectTrigger: true },
      ]);

  const poStormwater = (folder: string, sort: number) =>
    seedTemplate("Stormwater Drainage Inspection", "Plumbing Officer", "po_stormwater", folder,
      "Inspection of stormwater drainage system from roof, paved areas and site.",
      sort, [
        { category: "Roof Drainage", description: "Gutters and downpipes of correct size to AS 3500.3 calculation", riskLevel: "high", defectTrigger: true, codeReference: "AS/NZS 3500.3" },
        { category: "Roof Drainage", description: "Downpipes connected to approved stormwater system", riskLevel: "high", defectTrigger: true },
        { category: "Underground Stormwater", description: "Underground stormwater drain at correct falls and depth", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Underground Stormwater", description: "Stormwater connection to kerb/channel, soakage or detention approved", riskLevel: "high", defectTrigger: true },
        { category: "On-site Detention", description: "OSD tank, pit or soakage system installed per hydraulic design (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Surface Drainage", description: "Site drainage falls away from building — no ponding adjacent to structure", riskLevel: "medium", defectTrigger: true },
        { category: "Testing", description: "Stormwater system tested — no leaks or blockages", riskLevel: "medium", defectTrigger: true },
      ]);

  const poFireServices = (folder: string, sort: number) =>
    seedTemplate("Fire Services Plumbing Inspection", "Plumbing Officer", "po_fire_services", folder,
      "Inspection of fire hydrant, hose reel and sprinkler plumbing systems.",
      sort, [
        { category: "Water Supply", description: "Dedicated fire water supply connection size and backflow prevention compliant", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2419" },
        { category: "Hydrant System", description: "Fire hydrant boosters, pillar hydrants and landing valves installed to AS 2419", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Hose Reel", description: "Hose reel systems installed at required spacing and height", riskLevel: "high", defectTrigger: true, codeReference: "AS 2441" },
        { category: "Hose Reel", description: "Hose reel pressure test completed — min 400 kPa static at outlet", riskLevel: "high", defectTrigger: true },
        { category: "Sprinkler System", description: "Sprinkler heads installed at correct spacing, orientation and concealment (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2118" },
        { category: "Sprinkler System", description: "Main stop valve and flow/pressure test connection installed and labelled", riskLevel: "high", defectTrigger: true },
        { category: "Commissioning", description: "Flow and pressure tests recorded and compliant with design", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      ]);

  // Class 1a
  await poRoughIn("Class 1a", 1);
  await poSanitary("Class 1a", 2);
  await poHotCold("Class 1a", 3);
  await poStormwater("Class 1a", 4);
  await seedTemplate("Gas Installation Inspection", "Plumbing Officer", "po_gas", "Class 1a",
    "Inspection of natural gas or LPG installation prior to connection and commissioning.",
    5, [
      { category: "Pipework", description: "Gas pipework material, size and jointing compliant with AS 5601", riskLevel: "high", defectTrigger: true, codeReference: "AS 5601" },
      { category: "Pipework", description: "No gas pipe buried under slab without approved sleeve or protection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Appliance Connections", description: "All appliance connections include approved flexible connectors and isolation valves", riskLevel: "high", defectTrigger: true },
      { category: "Testing", description: "Gas system pressure tested — no pressure drop over 1 hour hold", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Locate and rectify leak before connection to supply" },
      { category: "Ventilation", description: "Appliance flues and draught diverters correctly installed and terminated", riskLevel: "high", defectTrigger: true, codeReference: "AS 5601" },
      { category: "Meter / Regulator", description: "Gas meter position compliant — clearance from ignition sources observed", riskLevel: "high", defectTrigger: true },
      { category: "Commissioning", description: "All appliances tested for gas-tight connection and correct operation", riskLevel: "high", defectTrigger: true },
    ]);

  // Class 1b
  await poRoughIn("Class 1b", 1);
  await poSanitary("Class 1b", 2);
  await poHotCold("Class 1b", 3);
  await poStormwater("Class 1b", 4);

  // Class 2
  await poRoughIn("Class 2", 1);
  await poSanitary("Class 2", 2);
  await poHotCold("Class 2", 3);
  await poStormwater("Class 2", 4);
  await poFireServices("Class 2", 5);

  // Class 3
  await poSanitary("Class 3", 1);
  await poHotCold("Class 3", 2);
  await poFireServices("Class 3", 3);

  // Class 4
  await poRoughIn("Class 4", 1);
  await poSanitary("Class 4", 2);
  await poHotCold("Class 4", 3);

  // Class 5
  await poSanitary("Class 5", 1);
  await poHotCold("Class 5", 2);
  await poFireServices("Class 5", 3);

  // Class 6
  await poSanitary("Class 6", 1);
  await poHotCold("Class 6", 2);
  await seedTemplate("Grease Trap Inspection", "Plumbing Officer", "po_grease_trap", "Class 6",
    "Inspection of commercial grease trap or grease arrestor installation.",
    3, [
      { category: "Unit Installation", description: "Grease arrestor size calculated to AS 1546.1 for peak flow rate", riskLevel: "high", defectTrigger: true, codeReference: "AS 1546.1" },
      { category: "Unit Installation", description: "Grease arrestor located to permit service access and maintenance", riskLevel: "medium", defectTrigger: true },
      { category: "Pipework", description: "All kitchen drainage connected to grease arrestor inlet", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Connect all kitchen wastes before commissioning" },
      { category: "Pipework", description: "Outlet pipework connected to sanitary drain downstream of arrestor", riskLevel: "high", defectTrigger: true },
      { category: "Inspection Points", description: "Inspection openings accessible and watertight", riskLevel: "medium", defectTrigger: true },
      { category: "Testing", description: "Unit water tested prior to commissioning — no leaks", riskLevel: "high", defectTrigger: true },
    ]);

  // Class 7a
  await poSanitary("Class 7a", 1);
  await poStormwater("Class 7a", 2);

  // Class 7b
  await poSanitary("Class 7b", 1);
  await poStormwater("Class 7b", 2);

  // Class 8
  await poSanitary("Class 8", 1);
  await poStormwater("Class 8", 2);
  await seedTemplate("Trade Waste Inspection", "Plumbing Officer", "po_trade_waste", "Class 8",
    "Inspection of trade waste pre-treatment system prior to connection to sewer.",
    3, [
      { category: "Pre-Treatment System", description: "Trade waste pre-treatment system type and capacity approved by water authority", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Treatment System", description: "Oil/water separator, settling tank or other treatment device installed correctly", riskLevel: "high", defectTrigger: true },
      { category: "Pipework", description: "All trade waste process drainage connected to pre-treatment system", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Connect all trade waste streams before commissioning" },
      { category: "Pipework", description: "Overflow protection device installed to prevent bypass of treatment", riskLevel: "high", defectTrigger: true },
      { category: "Connection to Sewer", description: "Treated effluent connection to sewer at approved point", riskLevel: "high", defectTrigger: true },
      { category: "Sampling Point", description: "Sampling point installed at required location for authority monitoring", riskLevel: "medium", defectTrigger: true },
    ]);

  // Class 9a
  await poSanitary("Class 9a", 1);
  await poHotCold("Class 9a", 2);
  await poFireServices("Class 9a", 3);

  // Class 9b
  await poSanitary("Class 9b", 1);
  await poHotCold("Class 9b", 2);
  await poFireServices("Class 9b", 3);

  // Class 9c
  await poSanitary("Class 9c", 1);
  await poHotCold("Class 9c", 2);
  await poFireServices("Class 9c", 3);

  // ══════════════════════════════════════════════════════════════════════════════
  // BUILDER / QC — class-specific
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Builder / QC ---");

  const bqcCertReadiness = (folder: string, sort: number, extra?: ItemDef[]) =>
    seedTemplate("Certifier Readiness Inspection", "Builder / QC", "qc_cert_readiness", folder,
      "Builder QC check confirming the work is ready for building certifier stage inspection.",
      sort, [
        { category: "Readiness", description: "Site safe and accessible for certifier inspection", riskLevel: "medium", defectTrigger: true },
        { category: "Readiness", description: "All required work for this stage is complete", riskLevel: "high", defectTrigger: true },
        { category: "Documentation", description: "Approved plans and relevant engineering documents on site", riskLevel: "medium", defectTrigger: true },
        { category: "Setout / Dimensions", description: "Dimensions and setouts verified against approved plans", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Structural Elements", description: "Structural elements installed per engineering drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Connections", description: "All required connections, fixings and fasteners in place", riskLevel: "high", defectTrigger: true },
        { category: "Services", description: "Rough-in services and penetrations in place prior to enclosure", riskLevel: "high", defectTrigger: true },
        ...(extra ?? []),
      ]);

  const bqcDefect = (folder: string, sort: number, extra?: ItemDef[]) =>
    seedTemplate("Defect & Quality Inspection", "Builder / QC", "qc_defect", folder,
      "Quality control inspection identifying defects, incomplete works and non-conformances.",
      sort, [
        { category: "External", description: "External fabric and cladding complete and free from damage", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
        { category: "External", description: "Roof, gutters and flashings complete and watertight", riskLevel: "high", defectTrigger: true },
        { category: "External", description: "Windows and external doors installed, sealed and operational", riskLevel: "medium", defectTrigger: true },
        { category: "Internal Finishes", description: "Wall and ceiling linings complete, undamaged and painted", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
        { category: "Internal Finishes", description: "Floor finishes complete, undamaged and clean", riskLevel: "medium", defectTrigger: true },
        { category: "Wet Areas", description: "Waterproofing and tiling complete — no cracked or hollow tiles", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Fixtures", description: "All fixtures, fittings and joinery complete and operational", riskLevel: "medium", defectTrigger: true },
        { category: "Services", description: "Plumbing, electrical and mechanical services complete and operational", riskLevel: "high", defectTrigger: true },
        { category: "Safety", description: "Balustrades, handrails and safety glazing compliant and undamaged", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 D3" },
        ...(extra ?? []),
      ]);

  // Class 1a
  await bqcCertReadiness("Class 1a", 1);
  await bqcDefect("Class 1a", 2, [
    { category: "Safety", description: "Smoke alarms installed in all required locations and operational", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E2" },
  ]);

  // Class 1b
  await bqcCertReadiness("Class 1b", 1);
  await bqcDefect("Class 1b", 2);

  // Class 2
  await bqcCertReadiness("Class 2", 1, [
    { category: "Fire", description: "Fire separation walls and floors constructed per fire engineered drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 C" },
  ]);
  await bqcDefect("Class 2", 2, [
    { category: "Fire Safety", description: "Fire doors and smoke seals installed and operational in common areas", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Accessibility", description: "Accessible paths, lift access and common areas complete to DDA requirements", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 D4" },
  ]);

  // Class 3
  await bqcCertReadiness("Class 3", 1);
  await bqcDefect("Class 3", 2, [
    { category: "Fire Safety", description: "Fire compartmentation, doors and suppression systems complete", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);

  // Class 4
  await bqcCertReadiness("Class 4", 1);
  await bqcDefect("Class 4", 2);

  // Class 5
  await seedTemplate("Fit-Out Quality Inspection", "Builder / QC", "qc_fitout", "Class 5",
    "Builder QC inspection of commercial office fit-out quality and completeness.",
    1, [
      { category: "Structure", description: "Structural elements and penetrations complete and fire-stopped", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Partitions", description: "Internal partitions straight, plumb, complete and fully lined", riskLevel: "medium", defectTrigger: true },
      { category: "Ceilings", description: "Suspended ceiling grid level and complete — tiles fitted and undamaged", riskLevel: "medium", defectTrigger: true },
      { category: "Flooring", description: "Floor finishes complete and undamaged throughout", riskLevel: "medium", defectTrigger: true },
      { category: "Services", description: "Lighting, power, data and HVAC services operational", riskLevel: "high", defectTrigger: true },
      { category: "Amenities", description: "Amenities (toilets, kitchenette) complete and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Fire Safety", description: "Exit signs, emergency lighting and fire doors operational", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E" },
      { category: "Accessibility", description: "Accessible paths, amenities and signage complete", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 D4" },
    ]);
  await bqcCertReadiness("Class 5", 2);

  // Class 6
  await seedTemplate("Fit-Out Quality Inspection", "Builder / QC", "qc_fitout", "Class 6",
    "Builder QC inspection of retail shop fit-out quality and completeness.",
    1, [
      { category: "Shopfront", description: "Shopfront glazing, signage and entry installed and undamaged", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Internal Finishes", description: "Walls, floors and ceilings complete and free from defects", riskLevel: "medium", defectTrigger: true },
      { category: "Amenities", description: "Staff amenities and customer facilities complete", riskLevel: "medium", defectTrigger: true },
      { category: "Services", description: "Lighting, power, HVAC and security services operational", riskLevel: "high", defectTrigger: true },
      { category: "Kitchen / Food Service", description: "Commercial kitchen fit-out complete and cleanable (if applicable)", riskLevel: "high", defectTrigger: true },
      { category: "Fire Safety", description: "Exit signs, emergency lighting and fire safety systems complete", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E" },
      { category: "Accessibility", description: "Accessible entry, circulation and amenities per DDA", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 D4" },
    ]);
  await bqcCertReadiness("Class 6", 2);

  // Class 7a
  await seedTemplate("Structural & Slab Quality Review", "Builder / QC", "qc_structure", "Class 7a",
    "Builder QC review of carpark structure and slab quality prior to certifier inspection.",
    1, [
      { category: "Concrete Quality", description: "Concrete surface finish acceptable — no honeycombing, cracking or cold joints", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Drainage", description: "Drainage falls adequate — no ponding evident", riskLevel: "high", defectTrigger: true },
      { category: "Line Marking", description: "Car park line marking, signage and wheel stops complete", riskLevel: "low", defectTrigger: true },
      { category: "Safety Features", description: "Wheel guards, safety kerbs and pedestrian barriers installed", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Waterproofing", description: "Waterproofing membrane applied to exposed slab — no blistering or damage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Services", description: "Lighting, ventilation and fire services complete", riskLevel: "high", defectTrigger: true },
    ]);
  await bqcCertReadiness("Class 7a", 2);

  // Class 7b
  await seedTemplate("Structure & Cladding Quality Review", "Builder / QC", "qc_structure", "Class 7b",
    "Builder QC inspection of warehouse structure and external cladding.",
    1, [
      { category: "Structure", description: "Steel portal frame plumb, square and complete", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Cladding", description: "Wall and roof cladding complete — no gaps, loose sheets or damage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Cladding", description: "Flashings, ridgecaps and gutters installed and watertight", riskLevel: "high", defectTrigger: true },
      { category: "Doors & Access", description: "Roller doors, personnel access doors and windows installed and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Floor Slab", description: "Concrete floor slab complete — no cracking or surface defects", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Services", description: "Electrical, lighting and fire services complete", riskLevel: "high", defectTrigger: true },
    ]);
  await bqcCertReadiness("Class 7b", 2);

  // Class 8
  await seedTemplate("Structure & Services Quality Review", "Builder / QC", "qc_structure", "Class 8",
    "Builder QC inspection of industrial building structure, services and safety features.",
    1, [
      { category: "Structure", description: "Structural frame complete and free from visible defects", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Cladding & Roof", description: "Roof and wall cladding complete, sealed and watertight", riskLevel: "high", defectTrigger: true },
      { category: "Floor", description: "Industrial floor slab complete — finish, falls and joint sealing to specification", riskLevel: "medium", defectTrigger: true },
      { category: "Services", description: "Electrical, compressed air, gas and mechanical services complete", riskLevel: "high", defectTrigger: true },
      { category: "Safety", description: "Safety handrails, mezzanine barriers and loading dock safety complete", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017" },
      { category: "Fire Safety", description: "Fire suppression, detection and exit systems complete", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E" },
    ]);
  await bqcCertReadiness("Class 8", 2);

  // Class 9a
  await bqcCertReadiness("Class 9a", 1, [
    { category: "Infection Control", description: "Infection control zones and finishes complete per health facility guidelines", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await bqcDefect("Class 9a", 2, [
    { category: "Medical Services", description: "Medical gas, nurse call and specialist services tested and operational", riskLevel: "high", defectTrigger: true },
  ]);

  // Class 9b
  await bqcCertReadiness("Class 9b", 1);
  await bqcDefect("Class 9b", 2, [
    { category: "Evacuation", description: "Evacuation routes, exit doors and signage complete and compliant", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E" },
  ]);

  // Class 9c
  await bqcCertReadiness("Class 9c", 1);
  await bqcDefect("Class 9c", 2, [
    { category: "Accessibility", description: "Aged care accessibility features complete — grab rails, ramps, accessible bathrooms", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 D4" },
  ]);

  // ══════════════════════════════════════════════════════════════════════════════
  // SITE SUPERVISOR
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Site Supervisor ---");

  const ssProgress = (folder: string, sort: number, label = "Stage Progress Inspection", extraItems?: ItemDef[]) =>
    seedTemplate(label, "Site Supervisor", "ss_progress", folder,
      "Site supervisor stage inspection confirming progress, quality and readiness to proceed.",
      sort, [
        { category: "Safety", description: "Site is safe — fencing, signage, PPE and access in order", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017" },
        { category: "Works Completed", description: "Works for this stage are complete per construction programme", riskLevel: "high", defectTrigger: true },
        { category: "Quality", description: "Quality of workmanship acceptable — no visible defects to completed work", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
        { category: "Plans on Site", description: "Current approved plans and documentation on site", riskLevel: "medium", defectTrigger: true },
        { category: "Subcontractors", description: "Subcontractor work reviewed against scope and specification", riskLevel: "medium", defectTrigger: true },
        { category: "Programme", description: "Works on track with construction programme — delays noted and managed", riskLevel: "low" },
        { category: "Materials", description: "Materials on site are as specified — no substitutions without approval", riskLevel: "medium", defectTrigger: true },
        ...(extraItems ?? []),
      ]);

  const ssHandover = (folder: string, sort: number) =>
    seedTemplate("Pre-Handover Site Review", "Site Supervisor", "ss_handover", folder,
      "Site supervisor pre-handover review confirming the site is clean, complete and ready for occupancy.",
      sort, [
        { category: "Cleanliness", description: "All construction waste, rubbish and temporary works removed from site", riskLevel: "medium", defectTrigger: true },
        { category: "Cleanliness", description: "Building interior cleaned and presented to handover standard", riskLevel: "medium", defectTrigger: true },
        { category: "External Works", description: "External works complete — paths, driveways, landscaping", riskLevel: "low", defectTrigger: true },
        { category: "Outstanding Items", description: "All outstanding items from defect lists rectified", riskLevel: "high", defectTrigger: true },
        { category: "Services", description: "All services operational and tested — power, water, gas", riskLevel: "high", defectTrigger: true },
        { category: "Safety", description: "Safety items complete — balustrades, smoke alarms, pool fencing (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Handover Pack", description: "Manuals, warranties and keys assembled for client handover", riskLevel: "medium", defectTrigger: true },
      ]);

  // Class 1a
  await ssProgress("Class 1a", 1, "Stage Progress Inspection", [
    { category: "Footing / Slab", description: "Footing and slab stage complete and inspected by certifier", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Frame", description: "Frame stage complete, bracing and tie-downs in place", riskLevel: "high", defectTrigger: true },
    { category: "Lock-Up", description: "Lock-up stage achieved — roof, windows and external doors in", riskLevel: "medium", defectTrigger: true },
  ]);
  await ssHandover("Class 1a", 2);

  // Class 1b
  await ssProgress("Class 1b", 1);
  await ssHandover("Class 1b", 2);

  // Class 2
  await ssProgress("Class 2", 1, "Stage Progress Inspection", [
    { category: "Common Areas", description: "Common area works progressing — stairwells, lifts, lobbies", riskLevel: "medium", defectTrigger: true },
    { category: "Fire Separation", description: "Fire-rated construction progress checked at each stage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await ssHandover("Class 2", 2);

  // Class 3
  await ssProgress("Class 3", 1, "Stage Progress Inspection", [
    { category: "Fire Safety", description: "Fire safety construction elements progressing as per drawings", riskLevel: "high", defectTrigger: true },
  ]);
  await ssHandover("Class 3", 2);

  // Class 4
  await ssProgress("Class 4", 1);
  await ssHandover("Class 4", 2);

  // Class 5
  await ssProgress("Class 5", 1, "Stage Progress Inspection", [
    { category: "Base Building", description: "Base building structure and services complete before fit-out commences", riskLevel: "high", defectTrigger: true },
    { category: "Fit-Out", description: "Fit-out works progressing per tenant brief and construction drawings", riskLevel: "medium", defectTrigger: true },
  ]);
  await ssHandover("Class 5", 2);

  // Class 6
  await ssProgress("Class 6", 1, "Stage Progress Inspection", [
    { category: "Shopfront", description: "Shopfront and tenancy fit-out progressing to approved plans", riskLevel: "medium", defectTrigger: true },
  ]);
  await ssHandover("Class 6", 2);

  // Class 7a
  await ssProgress("Class 7a", 1, "Structural Stage Inspection", [
    { category: "Slab", description: "Carpark slab quality — finish, falls and no visible defects", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Safety", description: "Temporary safety barriers in place on all open edges", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017" },
  ]);
  await ssHandover("Class 7a", 2);

  // Class 7b
  await ssProgress("Class 7b", 1, "Structural Stage Inspection", [
    { category: "Structure", description: "Steel frame complete and sign-off from structural engineer obtained", riskLevel: "high", defectTrigger: true },
    { category: "Cladding", description: "Wall and roof cladding progressing — weather-tight at each section", riskLevel: "high", defectTrigger: true },
  ]);
  await ssHandover("Class 7b", 2);

  // Class 8
  await ssProgress("Class 8", 1, "Structural Stage Inspection", [
    { category: "Structure & Slab", description: "Industrial structure and slab complete to specification", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Process Services", description: "Process services (gas, compressed air, trade waste) roughed-in correctly", riskLevel: "high", defectTrigger: true },
  ]);
  await ssHandover("Class 8", 2);

  // Class 9a
  await ssProgress("Class 9a", 1, "Stage Progress Inspection", [
    { category: "Infection Control", description: "Infection control construction methodology followed during works", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Specialist Services", description: "Medical gases, nurse call and specialist services roughed-in", riskLevel: "high", defectTrigger: true },
  ]);
  await ssHandover("Class 9a", 2);

  // Class 9b
  await ssProgress("Class 9b", 1, "Stage Progress Inspection", [
    { category: "Seating / Assembly", description: "Assembly area structure, seating and sightlines progressing to plans", riskLevel: "medium", defectTrigger: true },
    { category: "Acoustics", description: "Acoustic walls, ceilings and insulation installed per acoustic spec", riskLevel: "medium", defectTrigger: true },
  ]);
  await ssHandover("Class 9b", 2);

  // Class 9c
  await ssProgress("Class 9c", 1, "Stage Progress Inspection", [
    { category: "Accessibility", description: "Aged care accessibility features — corridors, grab rails, bathroom layouts", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Resident Safety", description: "Resident safety features in place — wander management, call systems", riskLevel: "high", defectTrigger: true },
  ]);
  await ssHandover("Class 9c", 2);

  // ══════════════════════════════════════════════════════════════════════════════
  // WHS OFFICER
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- WHS Officer ---");

  const whsSite = (folder: string, sort: number, extra?: ItemDef[]) =>
    seedTemplate("Site Safety Inspection", "WHS Officer", "whs_site_safety", folder,
      "Work health and safety inspection of the construction site.",
      sort, [
        { category: "Site Perimeter", description: "Site fencing or hoarding complete, secure and in good condition", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.305" },
        { category: "Site Perimeter", description: "Public protection measures in place — overhead protection, barriers", riskLevel: "high", defectTrigger: true },
        { category: "PPE", description: "All workers wearing appropriate PPE — helmets, HiVis, boots, eye/ear protection", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.44" },
        { category: "Housekeeping", description: "Site kept in an orderly condition — no trip hazards or waste build-up", riskLevel: "medium", defectTrigger: true },
        { category: "Access / Egress", description: "Safe access and egress to all work areas — no improvised access", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "First Aid", description: "First aid kit accessible and fully stocked", riskLevel: "medium", defectTrigger: true },
        { category: "Emergency", description: "Emergency assembly point and emergency contacts displayed on site", riskLevel: "medium", defectTrigger: true },
        { category: "Induction", description: "All workers have completed site induction and hold SWMS for their tasks", riskLevel: "high", defectTrigger: true, codeReference: "WHS Act 2011 s.47" },
        ...(extra ?? []),
      ]);

  const whsScaffold = (folder: string, sort: number) =>
    seedTemplate("Scaffold & Elevated Work Platform Inspection", "WHS Officer", "whs_scaffold", folder,
      "WHS inspection of scaffolding, EWPs and fall prevention systems on site.",
      sort, [
        { category: "Scaffold", description: "Scaffold erected by a competent person — tag current and valid", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS/NZS 4576, WHS Reg r.225" },
        { category: "Scaffold", description: "Scaffold fully planked, with guardrails, mid-rails and toe boards", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Stop work on scaffold until compliant" },
        { category: "Scaffold", description: "Scaffold tied to building per design — no excess lean or displacement", riskLevel: "high", defectTrigger: true },
        { category: "Scaffold", description: "Safe access to scaffold platform provided — ladder or stair tower", riskLevel: "high", defectTrigger: true },
        { category: "EWP / MEWP", description: "EWP pre-start check completed — current log book sighted", riskLevel: "high", defectTrigger: true, codeReference: "AS 2550.10" },
        { category: "EWP / MEWP", description: "EWP operator holds current licence for the equipment class", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Fall Prevention", description: "Edge protection installed at all open edges — no unprotected leading edges", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.224" },
        { category: "Fall Prevention", description: "Safety nets or catch platforms in place where required", riskLevel: "high", defectTrigger: true },
      ]);

  const whsHazmat = (folder: string, sort: number) =>
    seedTemplate("Hazardous Materials & Asbestos Inspection", "WHS Officer", "whs_hazmat", folder,
      "WHS inspection of hazardous materials management on the construction site.",
      sort, [
        { category: "Asbestos", description: "Asbestos register and management plan available on site (existing buildings)", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.425" },
        { category: "Asbestos", description: "Asbestos removal licensed — Class A or B licence sighted as required", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Cease all asbestos work until licenced contractor on site" },
        { category: "Asbestos", description: "Asbestos waste labelled, contained and disposed of to licensed facility", riskLevel: "high", defectTrigger: true },
        { category: "Chemicals", description: "Safety Data Sheets (SDS) available for all hazardous chemicals on site", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017 r.341" },
        { category: "Chemicals", description: "Chemical storage in approved flammable cabinets or bunded areas", riskLevel: "high", defectTrigger: true },
        { category: "Silica Dust", description: "Silica dust controls in place — wet cutting, vacuum extraction or RPE", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.50" },
        { category: "Lead", description: "Lead paint identified and managed — lead safety practices followed", riskLevel: "medium", defectTrigger: true },
      ]);

  // Class 1a
  await whsSite("Class 1a", 1);
  await whsScaffold("Class 1a", 2);

  // Class 1b
  await whsSite("Class 1b", 1);
  await whsScaffold("Class 1b", 2);

  // Class 2
  await whsSite("Class 2", 1, [
    { category: "Working at Heights", description: "Fall prevention in place on all open floor slabs and stairwells", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.224" },
  ]);
  await whsScaffold("Class 2", 2);
  await whsHazmat("Class 2", 3);

  // Class 3
  await whsSite("Class 3", 1, [
    { category: "Public Interface", description: "Public safety maintained — pedestrian separation from construction activity", riskLevel: "high", defectTrigger: true },
  ]);
  await whsScaffold("Class 3", 2);
  await whsHazmat("Class 3", 3);

  // Class 4
  await whsSite("Class 4", 1);
  await whsScaffold("Class 4", 2);

  // Class 5
  await whsSite("Class 5", 1, [
    { category: "Existing Occupants", description: "Separation between occupied areas and construction maintained — no cross-contamination", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await whsScaffold("Class 5", 2);
  await whsHazmat("Class 5", 3);

  // Class 6
  await whsSite("Class 6", 1, [
    { category: "Retail Environment", description: "Shop/retail area protected from construction dust and activity during trading", riskLevel: "high", defectTrigger: true },
  ]);
  await whsScaffold("Class 6", 2);
  await whsHazmat("Class 6", 3);

  // Class 7a
  await whsSite("Class 7a", 1, [
    { category: "Traffic Management", description: "Traffic management plan in place — pedestrian and vehicle separation maintained", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Open Edges", description: "Open slab edges protected — no unguarded drop to lower levels", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Install edge protection immediately" },
  ]);
  await seedTemplate("Plant & Equipment Safety Inspection", "WHS Officer", "whs_plant", "Class 7a",
    "WHS inspection of plant and equipment on carpark construction site.",
    2, [
      { category: "Plant Registration", description: "Registered plant has current registration certificate on site", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017 r.229" },
      { category: "Operators", description: "Plant operators hold required High Risk Work Licence", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Start Check", description: "Pre-start inspection records maintained for all plant", riskLevel: "medium", defectTrigger: true },
      { category: "Exclusion Zones", description: "Exclusion zones maintained around operating plant", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Traffic Control", description: "Spotters/traffic controllers in place when plant operates near workers or public", riskLevel: "high", defectTrigger: true },
      { category: "Overhead Hazards", description: "Overhead power lines and services identified — safe working distances maintained", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017 r.163" },
    ]);

  // Class 7b
  await whsSite("Class 7b", 1, [
    { category: "Craning", description: "Crane lift plans and exclusion zones in place for structural steel erection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await seedTemplate("Plant & Equipment Safety Inspection", "WHS Officer", "whs_plant", "Class 7b",
    "WHS inspection of plant, equipment and steel erection safety on warehouse site.",
    2, [
      { category: "Plant Registration", description: "Registered plant has current registration certificate on site", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017 r.229" },
      { category: "Operators", description: "Plant operators hold required High Risk Work Licence", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Steel Erection", description: "Steel erection SWMS in place — structural engineer sign-off on frame stability", riskLevel: "high", defectTrigger: true },
      { category: "Exclusion Zones", description: "Exclusion zones maintained during crane and rigging activities", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Overhead Hazards", description: "Overhead power lines identified — safe working distances maintained", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017 r.163" },
    ]);

  // Class 8
  await whsSite("Class 8", 1, [
    { category: "Hazardous Processes", description: "Hazardous work SWMS in place for industrial processes — welding, confined spaces", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await seedTemplate("Plant & Equipment Safety Inspection", "WHS Officer", "whs_plant", "Class 8",
    "WHS inspection of industrial plant, equipment and confined space safety.",
    2, [
      { category: "Plant Registration", description: "All registered plant has current registration and pre-start logs", riskLevel: "high", defectTrigger: true, codeReference: "WHS Regulations 2017 r.229" },
      { category: "Confined Spaces", description: "Confined space entry permits and atmospheric testing in place", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.66" },
      { category: "Hot Work", description: "Hot work permit in place — fire watch and extinguisher on hand", riskLevel: "high", defectTrigger: true },
      { category: "Hazardous Substances", description: "Chemical manifest, SDS and spill containment in place for hazardous substances", riskLevel: "high", defectTrigger: true },
      { category: "Electrical", description: "Electrical installations tested and tagged — no exposed or damaged leads", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "WHS Regulations 2017 r.150" },
    ]);
  await whsHazmat("Class 8", 3);

  // Class 9a
  await whsSite("Class 9a", 1, [
    { category: "Infection Control", description: "Construction infection control risk assessment (ICRA) in place and followed", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Dust Control", description: "Negative pressure dust containment maintained in adjacent occupied clinical areas", riskLevel: "high", defectTrigger: true },
  ]);
  await whsHazmat("Class 9a", 2);

  // Class 9b
  await whsSite("Class 9b", 1, [
    { category: "Public Safety", description: "Public access to facility separated from construction — safe pedestrian paths", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Crowd Management", description: "Construction schedule coordinated with facility events to minimise risk", riskLevel: "medium" },
  ]);
  await whsScaffold("Class 9b", 2);

  // Class 9c
  await whsSite("Class 9c", 1, [
    { category: "Vulnerable Persons", description: "Residents protected from construction noise, dust and access — separation maintained", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    { category: "Noise & Vibration", description: "Construction noise and vibration within approved limits during resident care hours", riskLevel: "medium", defectTrigger: true },
  ]);
  await whsHazmat("Class 9c", 2);

  // ══════════════════════════════════════════════════════════════════════════════
  // PRE-PURCHASE INSPECTOR
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Pre-Purchase Inspector ---");

  const ppResidential = (folder: string, sort: number, label = "Pre-Purchase Building Inspection", extra?: ItemDef[]) =>
    seedTemplate(label, "Pre-Purchase Inspector", "pp_residential", folder,
      "Standard pre-purchase building inspection assessing overall condition of the property.",
      sort, [
        { category: "Roof & Gutters", description: "Roof covering condition — visible damage, deterioration or displacement", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Obtain roofer's report and repair quote" },
        { category: "Roof & Gutters", description: "Gutters and downpipes condition — rust, blockage, improper fall", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
        { category: "External", description: "External walls — cracking, movement, damp or surface deterioration", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "External", description: "Windows and external doors — condition, sealing and operation", riskLevel: "medium", defectTrigger: true },
        { category: "Internal", description: "Internal walls and ceilings — cracking, moisture staining or damage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Internal", description: "Floor structure and coverings — bounce, damage, dampness", riskLevel: "medium", defectTrigger: true },
        { category: "Wet Areas", description: "Bathroom, ensuite and laundry — waterproofing concerns, silicone, mould", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Structure", description: "Subfloor/foundation — condition of stumps, bearers, joists where accessible", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Services", description: "Plumbing, electrical and gas services — visible concerns or obvious deficiencies noted", riskLevel: "high", defectTrigger: true },
        ...(extra ?? []),
      ]);

  const ppPest = (folder: string, sort: number) =>
    seedTemplate("Pest & Termite Inspection", "Pre-Purchase Inspector", "pp_pest", folder,
      "Visual inspection for evidence of timber pest activity including termites.",
      sort, [
        { category: "Timber Pests", description: "Evidence of termite activity — mud leads, damage to timber, workings", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage licensed pest controller immediately" },
        { category: "Timber Pests", description: "Termite management system in place and in date — chemical, physical or bait", riskLevel: "high", defectTrigger: true },
        { category: "Timber Damage", description: "Structural timber showing damage from wood borers or decay fungi", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Conducive Conditions", description: "Conducive conditions identified — excessive moisture, timber-to-soil contact", riskLevel: "medium", defectTrigger: true },
        { category: "Subfloor", description: "Subfloor accessible and inspected — no evidence of moisture or pest harbourage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Roof Space", description: "Roof space inspected for pest activity and moisture-damaged timbers", riskLevel: "high", defectTrigger: true },
      ]);

  const ppCommercial = (folder: string, sort: number, label = "Commercial Property Condition Inspection") =>
    seedTemplate(label, "Pre-Purchase Inspector", "pp_commercial", folder,
      "Pre-purchase condition inspection of commercial or industrial property.",
      sort, [
        { category: "Structure", description: "Structural elements — visible cracking, movement, corrosion or deterioration", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage structural engineer for assessment" },
        { category: "Roof & Envelope", description: "Roof cladding and external fabric — condition, leaks, penetrations", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Internal", description: "Internal finishes — walls, ceilings, floors condition and suitability for use", riskLevel: "medium", defectTrigger: true },
        { category: "Services", description: "Electrical, plumbing and HVAC services — obvious condition concerns noted", riskLevel: "high", defectTrigger: true },
        { category: "Hazardous Materials", description: "Evidence of asbestos, lead paint or hazardous materials — record location", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Obtain hazardous materials survey before purchase" },
        { category: "Site", description: "Site access, drainage, parking and external hardstand — condition", riskLevel: "medium", defectTrigger: true },
        { category: "Compliance", description: "Visible building works — evidence of unauthorised alterations or additions", riskLevel: "high", defectTrigger: true, recommendedAction: "Request building consent records from council" },
      ]);

  // Class 1a
  await ppResidential("Class 1a", 1);
  await ppPest("Class 1a", 2);

  // Class 1b
  await ppResidential("Class 1b", 1, "Pre-Purchase Building Inspection", [
    { category: "Fire Safety", description: "Smoke alarms installed in required locations", riskLevel: "high", defectTrigger: true },
  ]);
  await ppPest("Class 1b", 2);

  // Class 2
  await seedTemplate("Strata Unit Pre-Purchase Inspection", "Pre-Purchase Inspector", "pp_strata", "Class 2",
    "Pre-purchase inspection of apartment/strata unit including lot and common area observations.",
    1, [
      { category: "Lot — Condition", description: "Internal walls, ceilings and floors — cracks, moisture or damage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Lot — Wet Areas", description: "Bathroom and laundry wet areas — waterproofing concerns, mould, silicone failure", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Lot — Services", description: "Plumbing and electrical within lot — visible issues", riskLevel: "medium", defectTrigger: true },
      { category: "Lot — Windows & Doors", description: "Windows, balcony doors and entry door operation and sealing", riskLevel: "medium", defectTrigger: true },
      { category: "Common Areas", description: "Lift, stairwells, carpark and common area condition noted", riskLevel: "medium", defectTrigger: true },
      { category: "Common Areas", description: "External cladding and facade condition observed from visible areas", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Review strata records for outstanding defects and maintenance" },
      { category: "Building Fabric", description: "Evidence of water ingress or fire separation deficiencies in common areas", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Records", description: "Strata levy arrears, special levies and major works planned reviewed (if available)", riskLevel: "medium" },
    ]);
  await ppPest("Class 2", 2);

  // Class 3
  await ppResidential("Class 3", 1, "Building Condition Inspection");

  // Class 4
  await ppResidential("Class 4", 1, "Building Condition Inspection");

  // Class 5
  await ppCommercial("Class 5", 1, "Commercial Office Condition Inspection");

  // Class 6
  await ppCommercial("Class 6", 1, "Retail Property Condition Inspection");

  // Class 7a
  await ppCommercial("Class 7a", 1, "Carpark Property Condition Inspection");

  // Class 7b
  await ppCommercial("Class 7b", 1, "Warehouse Property Condition Inspection");

  // Class 8
  await ppCommercial("Class 8", 1, "Industrial Property Condition Inspection");

  // Class 9a
  await ppCommercial("Class 9a", 1, "Health Facility Condition Inspection");

  // Class 9b
  await ppCommercial("Class 9b", 1, "Assembly Building Condition Inspection");

  // Class 9c
  await ppCommercial("Class 9c", 1, "Aged Care Facility Condition Inspection");

  // ══════════════════════════════════════════════════════════════════════════════
  // FIRE SAFETY ENGINEER
  // ══════════════════════════════════════════════════════════════════════════════
  console.log("\n--- Fire Safety Engineer ---");

  const fseSystems = (folder: string, sort: number, extra?: ItemDef[]) =>
    seedTemplate("Fire Safety Systems Inspection", "Fire Safety Engineer", "fse_systems", folder,
      "Fire safety engineer inspection of active and passive fire safety systems.",
      sort, [
        { category: "Passive Fire", description: "Fire-rated walls and floors complete — penetration seals in place", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 C3, AS 4072" },
        { category: "Passive Fire", description: "Fire and smoke doors installed — rating, seals and hardware correct", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1905" },
        { category: "Passive Fire", description: "Fire dampers installed in HVAC penetrations through fire-rated construction", riskLevel: "high", defectTrigger: true },
        { category: "Detection", description: "Smoke detection system installed — detector type and placement per engineered design", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1670" },
        { category: "Detection", description: "Fire indicator panel (FIP) installed, commissioned and tested", riskLevel: "high", defectTrigger: true },
        { category: "Suppression", description: "Sprinkler system hydraulically tested and commissioned per AS 2118", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2118" },
        { category: "Exit Systems", description: "Exit signs and emergency lighting installed and functioning", riskLevel: "high", defectTrigger: true, codeReference: "AS 2293" },
        { category: "Exit Systems", description: "Exits clear, unobstructed and exit doors operable without key from inside", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 D2" },
        ...(extra ?? []),
      ]);

  const fseEmergency = (folder: string, sort: number) =>
    seedTemplate("Emergency Lighting & Exit Inspection", "Fire Safety Engineer", "fse_emergency", folder,
      "Inspection of emergency lighting, exit signage and evacuation systems.",
      sort, [
        { category: "Exit Signs", description: "Exit signs installed at all required locations — illuminated and visible", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2293, NCC 2022 E4" },
        { category: "Exit Signs", description: "Exit signs tested — battery backup operates for 90 minute duration", riskLevel: "high", defectTrigger: true },
        { category: "Emergency Lighting", description: "Emergency luminaires installed at required locations per AS 2293", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Emergency Lighting", description: "Emergency lighting functional test completed — duration and lux level adequate", riskLevel: "high", defectTrigger: true, codeReference: "AS 2293.2" },
        { category: "Evacuation", description: "Evacuation diagrams installed at required locations and current", riskLevel: "medium", defectTrigger: true, codeReference: "AS 3745" },
        { category: "Exit Doors", description: "Exit door hardware allows free exit — no key or code required from inside", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 D2" },
        { category: "Paths of Travel", description: "Paths of travel to exits clear and unobstructed — min 1m clear width", riskLevel: "high", defectTrigger: true },
      ]);

  const fseHydrant = (folder: string, sort: number) =>
    seedTemplate("Fire Hydrant & Hose Reel Inspection", "Fire Safety Engineer", "fse_hydrant", folder,
      "Fire safety engineer inspection of fire hydrant and hose reel system.",
      sort, [
        { category: "Hydrant System", description: "Fire hydrant system installed per approved hydraulic design", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2419" },
        { category: "Hydrant System", description: "Booster assembly installed, labelled and accessible at street level", riskLevel: "high", defectTrigger: true },
        { category: "Hydrant System", description: "Hydrant flow and pressure test results compliant with AS 2419", riskLevel: "high", defectTrigger: true, requirePhoto: true },
        { category: "Hose Reels", description: "Hose reels installed at required locations — within 36m travel of any point", riskLevel: "high", defectTrigger: true, codeReference: "AS 2441" },
        { category: "Hose Reels", description: "Hose reel pressure test completed — min 400 kPa at outlet", riskLevel: "high", defectTrigger: true },
        { category: "Isolating Valves", description: "Isolation valves and test points labelled and accessible", riskLevel: "medium", defectTrigger: true },
        { category: "Signage", description: "Hydrant signage and location indicators installed to standard", riskLevel: "medium", defectTrigger: true },
      ]);

  // Class 1a
  await seedTemplate("Smoke Alarm Compliance Inspection", "Fire Safety Engineer", "fse_smoke_alarm", "Class 1a",
    "Fire safety inspection of smoke alarm installation in Class 1a dwellings.",
    1, [
      { category: "Location", description: "Smoke alarms installed in all bedrooms, living areas and hallways per NCC", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E2.2a" },
      { category: "Type", description: "Smoke alarm type correct — photoelectric type required for NCC 2022", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 E2.2a, AS 3786" },
      { category: "Interconnection", description: "Smoke alarms interconnected — when one activates all sound", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 E2.2a" },
      { category: "Power Supply", description: "Smoke alarms hard-wired with battery backup where required", riskLevel: "high", defectTrigger: true },
      { category: "Function Test", description: "All alarms function tested on site — audible alarm confirmed", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Compliant Product", description: "Alarms are listed in the Register of Fire Protection Products (or equivalent)", riskLevel: "medium", defectTrigger: true },
    ]);

  // Class 1b
  await seedTemplate("Smoke Alarm & Fire Safety Compliance", "Fire Safety Engineer", "fse_smoke_alarm", "Class 1b",
    "Fire safety inspection of smoke alarms, emergency lighting and basic fire safety in Class 1b buildings.",
    1, [
      { category: "Smoke Alarms", description: "Smoke alarms installed in all bedrooms and corridors per NCC 2022", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E2" },
      { category: "Smoke Alarms", description: "Smoke alarms interconnected and hard-wired with battery backup", riskLevel: "high", defectTrigger: true },
      { category: "Emergency Lighting", description: "Emergency lighting installed in corridors, stairwells and exits (if required)", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 E4, AS 2293" },
      { category: "Exits", description: "Exit paths clear and exit doors operable without key", riskLevel: "high", defectTrigger: true },
      { category: "Fire Extinguisher", description: "Portable fire extinguisher installed in accessible location", riskLevel: "medium", defectTrigger: true, codeReference: "AS 2444" },
      { category: "Function Test", description: "All smoke alarms function tested on site", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    ]);

  // Class 2
  await fseSystems("Class 2", 1, [
    { category: "Common Areas", description: "Fire safety systems complete in common areas — lobby, carpark, plant rooms", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await fseEmergency("Class 2", 2);
  await fseHydrant("Class 2", 3);

  // Class 3
  await fseSystems("Class 3", 1, [
    { category: "Guest Rooms", description: "Smoke detection in all guest rooms — addressable system commissioned", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await fseEmergency("Class 3", 2);
  await fseHydrant("Class 3", 3);

  // Class 4
  await seedTemplate("Smoke Alarm & Fire Safety Compliance", "Fire Safety Engineer", "fse_smoke_alarm", "Class 4",
    "Fire safety inspection for Class 4 dwelling within a non-residential building.",
    1, [
      { category: "Dwelling Smoke Alarms", description: "Smoke alarms in dwelling portion per Class 1a requirements", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 E2" },
      { category: "Interface", description: "Fire separation between Class 4 dwelling and host building maintained", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 C2" },
      { category: "Egress", description: "Separate egress from dwelling to outside provided", riskLevel: "high", defectTrigger: true },
      { category: "Host Building", description: "Host building fire safety systems operational in common areas", riskLevel: "high", defectTrigger: true },
    ]);

  // Class 5
  await fseSystems("Class 5", 1);
  await fseEmergency("Class 5", 2);
  await fseHydrant("Class 5", 3);

  // Class 6
  await fseSystems("Class 6", 1, [
    { category: "Sprinklers", description: "Sprinkler system installed throughout tenancy per AS 2118", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2118" },
  ]);
  await fseEmergency("Class 6", 2);
  await fseHydrant("Class 6", 3);

  // Class 7a
  await fseEmergency("Class 7a", 1);
  await fseHydrant("Class 7a", 2);

  // Class 7b
  await fseSystems("Class 7b", 1, [
    { category: "Suppression", description: "Fire suppression system type appropriate for occupancy — sprinkler or gaseous", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await fseEmergency("Class 7b", 2);
  await fseHydrant("Class 7b", 3);

  // Class 8
  await fseSystems("Class 8", 1, [
    { category: "Hazardous Areas", description: "Special suppression or hazardous area protection installed per hazmat fire safety report", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await fseEmergency("Class 8", 2);
  await seedTemplate("Hazardous Materials Fire Safety Inspection", "Fire Safety Engineer", "fse_hazmat", "Class 8",
    "Fire safety inspection of hazardous materials storage areas and industrial fire suppression.",
    3, [
      { category: "Storage Areas", description: "Flammable and combustible liquid storage in approved fire-rated cabinets/rooms", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 1940" },
      { category: "Suppression", description: "Automatic suppression system type and coverage appropriate for hazard", riskLevel: "high", defectTrigger: true },
      { category: "Ventilation", description: "Explosion-proof ventilation and extraction installed in hazardous areas", riskLevel: "high", defectTrigger: true },
      { category: "Containment", description: "Spill containment bunding installed — capacity adequate", riskLevel: "high", defectTrigger: true },
      { category: "Detection", description: "Gas or vapour detection installed in hazardous atmospheres", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Extinguishers", description: "Appropriate portable extinguisher types provided for the hazard class", riskLevel: "medium", defectTrigger: true, codeReference: "AS 2444" },
    ]);

  // Class 9a
  await fseSystems("Class 9a", 1, [
    { category: "Compartmentation", description: "Fire compartmentation between wards, theatres and plant rooms complete", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC 2022 C" },
    { category: "Healthcare Specific", description: "Medical gas shutoffs and fire control panels installed in required locations", riskLevel: "high", defectTrigger: true },
  ]);
  await fseEmergency("Class 9a", 2);
  await fseHydrant("Class 9a", 3);

  // Class 9b
  await fseSystems("Class 9b", 1, [
    { category: "Assembly", description: "Fire safety systems capable of protecting peak occupancy load for assembly area", riskLevel: "high", defectTrigger: true },
    { category: "Stage / Production", description: "Fire curtain, drencher or separation system installed at stage (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await fseEmergency("Class 9b", 2);
  await fseHydrant("Class 9b", 3);

  // Class 9c
  await fseSystems("Class 9c", 1, [
    { category: "Resident Egress", description: "Fire safety systems account for residents' limited mobility — extended evacuation time", riskLevel: "high", defectTrigger: true, codeReference: "NCC 2022 C, E" },
    { category: "Refuge Areas", description: "Fire refuge areas installed per fire engineering report", riskLevel: "high", defectTrigger: true, requirePhoto: true },
  ]);
  await fseEmergency("Class 9c", 2);
  await fseHydrant("Class 9c", 3);

  console.log("\n=== All discipline checklists seeded successfully ===");
}
