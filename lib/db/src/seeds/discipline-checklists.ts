import { db } from "../index";
import { checklistTemplatesTable, checklistItemsTable, checklistResultsTable } from "../schema/checklists";
import { eq, and, gt } from "drizzle-orm";

type ItemDef = {
  category: string;
  description: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  defectTrigger?: boolean;
  requirePhoto?: boolean;
  codeReference?: string;
  recommendedAction?: string;
};

/**
 * Upsert a platform (global) checklist template and its items in-place.
 * Matches templates by inspectionType — preserves IDs so existing inspection
 * checklist results remain valid. New items are inserted; removed items are
 * only hard-deleted if they have never been used in any inspection.
 */
async function seedTemplate(
  name: string,
  discipline: string,
  inspectionType: string,
  folder: string,
  description: string,
  sortOrder: number,
  items: ItemDef[],
) {
  // 1. Upsert template by inspectionType — mark as global platform template
  const [existing] = await db
    .select({ id: checklistTemplatesTable.id })
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.inspectionType, inspectionType))
    .limit(1);

  let templateId: number;
  if (existing) {
    await db.update(checklistTemplatesTable)
      .set({ name, discipline, folder, description, sortOrder, isGlobal: true })
      .where(eq(checklistTemplatesTable.id, existing.id));
    templateId = existing.id;
  } else {
    const [tmpl] = await db.insert(checklistTemplatesTable)
      .values({ name, discipline, inspectionType, folder, description, sortOrder, isGlobal: true })
      .returning();
    templateId = tmpl.id;
  }

  // 2. Upsert items by orderIndex — update in-place to preserve IDs
  for (const [i, item] of items.entries()) {
    const orderIndex = i + 1;
    const itemData = {
      category: item.category,
      description: item.description,
      riskLevel: (item.riskLevel ?? "medium") as "low" | "medium" | "high" | "critical",
      defectTrigger: item.defectTrigger ?? false,
      requirePhoto: item.requirePhoto ?? false,
      codeReference: item.codeReference ?? null,
      recommendedAction: item.recommendedAction ?? null,
      isRequired: true,
      includeInReport: true,
    };

    const [existingItem] = await db
      .select({ id: checklistItemsTable.id })
      .from(checklistItemsTable)
      .where(and(
        eq(checklistItemsTable.templateId, templateId),
        eq(checklistItemsTable.orderIndex, orderIndex),
      ))
      .limit(1);

    if (existingItem) {
      await db.update(checklistItemsTable)
        .set(itemData)
        .where(eq(checklistItemsTable.id, existingItem.id));
    } else {
      await db.insert(checklistItemsTable)
        .values({ templateId, orderIndex, ...itemData });
    }
  }

  // 3. Remove items beyond the current count only if they have never been used
  const extras = await db
    .select({ id: checklistItemsTable.id })
    .from(checklistItemsTable)
    .where(and(
      eq(checklistItemsTable.templateId, templateId),
      gt(checklistItemsTable.orderIndex, items.length),
    ));

  for (const extra of extras) {
    const [used] = await db
      .select({ id: checklistResultsTable.id })
      .from(checklistResultsTable)
      .where(eq(checklistResultsTable.checklistItemId, extra.id))
      .limit(1);
    if (!used) {
      await db.delete(checklistItemsTable)
        .where(eq(checklistItemsTable.id, extra.id));
    }
  }

  console.log(`  ✓ [${discipline}] ${folder} — ${name} (${items.length} items)`);
}

export async function seedDisciplineChecklists() {
  console.log("\n=== Upserting discipline checklist templates ===\n");

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURAL ENGINEER
  // ─────────────────────────────────────────────────────────────────────────
  console.log("--- Structural Engineer ---");

  await seedTemplate(
    "Footing & Slab Inspection", "Structural Engineer", "structural_footing_slab", "Footing & Slab Inspection",
    "Comprehensive structural inspection covering the full footing and slab concrete pour cycle — site classification, excavation, termite protection, reinforcement, in-slab services and pour readiness. Aligned with NCC Volume 2 H4.3, AS 2870-2011, AS 3600-2018 and AS 3660.1-2014.",
    10,
    [
      // ── 1. Site & Earthworks ─────────────────────────────────────────────
      { category: "Site & Earthworks", description: "Site classification confirmed per geotechnical report (S / M / H / E / P) — geotechnical report held on site", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2870-2011 Cl 3.1 / NCC H4.3" },
      { category: "Site & Earthworks", description: "Topsoil, vegetation and organic matter stripped from entire building footprint", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "NCC Vol 2 H1.4.3" },
      { category: "Site & Earthworks", description: "Cut and fill conditions at boundaries match engineer design and geotechnical report", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },
      { category: "Site & Earthworks", description: "No uncontrolled fill present beneath any footing or slab panel unless specifically engineered and documented", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870 Cl 3.3" },

      // ── 2. Excavation & Bearing ──────────────────────────────────────────
      { category: "Excavation & Bearing", description: "Footing trench dimensions (width, depth, step-down heights) match structural drawings throughout", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870-2011 Cl 4.3" },
      { category: "Excavation & Bearing", description: "Edge / perimeter beams excavated to minimum depth below natural ground level per engineer's drawings (typically ≥ 300 mm)", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870-2011 Cl 4.3.3" },
      { category: "Excavation & Bearing", description: "Step-down footings formed on undisturbed firm ground — no fill at toe of steps; treads horizontal", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870-2011 Cl 4.3.4" },
      { category: "Excavation & Bearing", description: "Founding soil confirmed to match geotechnical report — no fill, soft, reactive or expansive material under footings", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870-2011 Cl 4.4" },
      { category: "Excavation & Bearing", description: "Subsoil drainage installed where ground moisture is present or required by geotech (e.g. Class H / E sites)", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2870 / NCC H4.3" },
      { category: "Excavation & Bearing", description: "No water present in trench — dewatering completed; base of trench firm and not disturbed", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },
      { category: "Excavation & Bearing", description: "Minimum 300 mm clearance maintained from all drainage pipes, conduits and services", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 2870" },

      // ── 3. Termite & Subfloor Protection ────────────────────────────────
      { category: "Termite & Moisture Protection", description: "Termite management system installed by licensed operator — compliant with AS 3660.1 and relevant state requirements", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1-2014 / NCC H2.1.1" },
      { category: "Termite & Moisture Protection", description: "Termite barrier covers all paths of entry to structure — perimeter, internal piers, pipes and conduits addressed", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1 Cl 6.3" },
      { category: "Termite & Moisture Protection", description: "Vapour barrier installed — minimum 0.2 mm polyethylene, correct grade, no tears or punctures visible", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1 / NCC H4.3.2" },
      { category: "Termite & Moisture Protection", description: "Vapour barrier lapped minimum 200 mm at all joints; laps taped or sealed and turned up at edge beams", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 3660.1" },
      { category: "Termite & Moisture Protection", description: "Damp-proof course (DPC) provided at all slab-on-ground interfaces with masonry brickwork", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 3660.1 / NCC H4.3" },

      // ── 4. Subgrade & Fill Preparation ──────────────────────────────────
      { category: "Subgrade & Fill", description: "Fill material visually consistent with approved specification — no black soil, expansive clay, building waste or reactive material present", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870 Cl 3.3" },
      { category: "Subgrade & Fill", description: "Fill surface firm and stable underfoot — no rutting, pumping or soft spots observed; compaction test certificate confirmed as held on site", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870 / NCC H4.3" },
      { category: "Subgrade & Fill", description: "Fill depth consistent with engineer's drawings — no visible over-filling or undermining at footing lines", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2870" },
      { category: "Subgrade & Fill", description: "Sub-base surface level, even and free of voids, soft spots and debris — visually confirmed before membrane placement", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },

      // ── 5. Formwork & Setout ─────────────────────────────────────────────
      { category: "Formwork & Setout", description: "Slab overall plan dimensions and setout verified against approved structural/architectural plans — building position, offsets and shaped panels correct", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870 / NCC H4.3" },
      { category: "Formwork & Setout", description: "Edge formwork set to correct slab thickness throughout — depth verified by direct measurement or string-line", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 3610 / AS 2870" },
      { category: "Formwork & Setout", description: "Edge formwork straight, plumb and adequately braced — no bowing, gaps or movement risk observed before pour", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 3610" },
      { category: "Formwork & Setout", description: "Thickened edge (haunch) dimensions visually match drawings in width and depth throughout", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 2870" },
      { category: "Formwork & Setout", description: "Slab fall / grade set correctly — confirmed against drainage design; ponding areas not acceptable", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "NCC H4.3" },

      // ── 6. Footing Reinforcement ─────────────────────────────────────────
      { category: "Footing Reinforcement", description: "Rebar grade, size and spacing in all footing beams and edge beams match structural drawings", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600-2018 Cl 4.8" },
      { category: "Footing Reinforcement", description: "Bottom cover to footing reinforcement — minimum 65 mm to bottom of bars (ground-bearing exposure A1/A2)", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600 Table 4.10.3.2" },
      { category: "Footing Reinforcement", description: "Ligatures and stirrups installed at correct spacing and tied securely — no missing ligatures", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Footing Reinforcement", description: "Lap lengths and splice positions comply with structural drawings — all laps tied", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600 Cl 13.2" },
      { category: "Footing Reinforcement", description: "Starter bars for walls, columns and piers correctly positioned, plumb and tied", riskLevel: "critical", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600" },
      { category: "Footing Reinforcement", description: "No reinforcement in direct contact with soil, formwork face or vapour barrier", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600 Cl 4.10" },

      // ── 7. Slab Reinforcement ────────────────────────────────────────────
      { category: "Slab Reinforcement", description: "Bottom mesh / rebar — size, bar spacing, laps and layout per structural drawings throughout slab", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600 / AS 2870" },
      { category: "Slab Reinforcement", description: "Cover chairs placed at maximum 900 mm each way — mesh not deflected by foot traffic or services", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600 Cl 4.10" },
      { category: "Slab Reinforcement", description: "Bottom cover achieved: minimum 40 mm (suspended slab, exposure A1) or 65 mm (ground-bearing) as applicable", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600 Table 4.10.3.2" },
      { category: "Slab Reinforcement", description: "Top mesh / rebar installed over all supports, at slab edges, openings and re-entrant corners as shown", riskLevel: "high", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600 / AS 2870" },
      { category: "Slab Reinforcement", description: "Additional reinforcement trimmed around all penetrations and openings — no unreinforced corners", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600 Cl 16.3" },
      { category: "Slab Reinforcement", description: "Control joint locations marked and formed per structural drawings — no unplanned saw cuts planned as a substitute", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS 3600 Cl 16.4" },
      { category: "Slab Reinforcement", description: "Steel is clean and free from mud, scale, mill oil or any contaminant that could reduce bond", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600 Cl 18.2" },

      // ── 8. In-Slab Services ──────────────────────────────────────────────
      { category: "In-Slab Services", description: "All in-slab conduit, PVC sleeves and pipes positioned per services drawings — not floating or stacked", riskLevel: "medium", defectTrigger: true, requirePhoto: true, codeReference: "AS 3600 Cl 16.5 / NCC" },
      { category: "In-Slab Services", description: "Conduit / pipe diameter does not exceed one-third of slab thickness at any cross-section", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 3600 Cl 16.5.1" },
      { category: "In-Slab Services", description: "Plumber has provided written sign-off confirming all in-slab drainage and supply are complete — no further changes", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "NCC / Trade ITP" },
      { category: "In-Slab Services", description: "Electrical conduit checked and signed off by licensed electrician — circuit IDs labelled at tails", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS/NZS 3000 / Trade ITP" },
      { category: "In-Slab Services", description: "Penetrations through edge formwork sleeved and sealed against concrete ingress", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "NCC" },
      { category: "In-Slab Services", description: "Isolation / de-bonding sleeves installed around pipes at slab / footing interfaces where thermal movement required", riskLevel: "medium", defectTrigger: false, requirePhoto: false, codeReference: "AS 3600 Cl 16.5" },

      // ── 9. Pre-Pour Confirmation ─────────────────────────────────────────
      { category: "Pre-Pour Confirmation", description: "Specified concrete grade confirmed on site before pour — minimum N25 residential (AS 2870) or engineer's stated strength; delivery docket to be checked on arrival of each truck", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 2870 Cl 5 / AS 1379" },
      { category: "Pre-Pour Confirmation", description: "Builder confirms no additional water is to be added to any concrete load on site — inspector to reject any non-conforming load", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "AS 1379 Cl 7.4 / AS 3600 Cl 19.1" },
      { category: "Pre-Pour Confirmation", description: "Concrete test cylinder sampling equipment confirmed on site before pour commences — minimum 2 sets per 50 m³ poured", riskLevel: "medium", defectTrigger: true, requirePhoto: false, codeReference: "AS 1379 / AS 3600 Cl 19.6" },

      // ── 10. Hold Points & Sign-Offs ──────────────────────────────────────
      { category: "Hold Points", description: "This inspection is the structural engineer hold-point — all items on this checklist must be satisfactory before written clearance is issued; concrete must not be placed without this clearance", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "Engineer's ITP / NCC A2.4" },
      { category: "Hold Points", description: "Building surveyor hold-point clearance obtained and held on site where required by consent conditions — pour must not proceed without it", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "NCC A2.4 / State Building Act" },
      { category: "Hold Points", description: "All trade sign-offs (plumber's written completion certificate, compaction test certificates) held on site and filed in project ITP before pour commences", riskLevel: "critical", defectTrigger: true, requirePhoto: false, codeReference: "NCC / Trade ITP" },

      // ── 11. Documentation ────────────────────────────────────────────────
      { category: "Documentation", description: "Geotechnical / soil classification report available on site and referenced on structural drawings", riskLevel: "high", requirePhoto: false, codeReference: "AS 2870-2011 Cl 2" },
      { category: "Documentation", description: "Compaction test certificates for all fill placed on site available for inspection", riskLevel: "high", requirePhoto: false },
      { category: "Documentation", description: "Termite management installation report and certificate held on file per AS 3660.1", riskLevel: "high", requirePhoto: false, codeReference: "AS 3660.1" },
      { category: "Documentation", description: "Engineer's ITP and inspection certificate for footing and slab to be issued on completion of inspection", riskLevel: "high", requirePhoto: false, codeReference: "NCC A2.4" },
      { category: "Documentation", description: "All inspection clearance records retained on the project file for the life of the building", riskLevel: "medium", requirePhoto: false },
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

  await seedTemplate(
    "Site Feasibility Inspection", "Builder / QC", "builder_site_feasibility", "Site Feasibility Inspection",
    "Pre-construction site feasibility assessment covering ground conditions, access, hazards, services and statutory constraints.",
    80,
    [
      { category: "Contours & Gradient", description: "Site slope assessed — cut and fill requirements, retaining wall needs and potential for differential settlement identified", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Contours & Gradient", description: "Steeply sloping lots checked for additional engineering requirements and cost implications", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Site Hazards", description: "Evidence of contamination, fill, mine subsidence or unstable ground investigated — geotech report obtained if required", riskLevel: "critical", defectTrigger: true, requirePhoto: true },
      { category: "Site Hazards", description: "Bushfire, flood and overland flow risks checked against council mapping and planning certificates", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Site Access", description: "Vehicle access to site confirmed — driveway crossover, gate width and road conditions adequate for delivery vehicles and concrete trucks", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Site Access", description: "Crane and heavy plant access assessed — overhead clearance and ground bearing confirmed", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Sediment Control", description: "Sediment fence location planned along all downslope boundaries before earthworks commence", riskLevel: "high", defectTrigger: true, requirePhoto: false, codeReference: "Managing Urban Stormwater: Soils and Construction (Blue Book)" },
      { category: "Sediment Control", description: "Temporary stabilisation measures (hay bales, rock check dams, silt traps) identified for site runoff management", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Sediment Control", description: "Sediment stockpile areas identified — minimum 10m from watercourses and drainage lines", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Overhead Power Lines", description: "Overhead power lines located on and adjacent to site — safe work distances established per SafeWork guidelines", riskLevel: "critical", defectTrigger: true, requirePhoto: true },
      { category: "Overhead Power Lines", description: "Exclusion zones marked for scaffolding, cranes and elevated work platforms operating near power lines", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Easements", description: "Title search reviewed — all drainage, sewer, water, electrical and pipeline easements identified and plotted on site plan", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Easements", description: "No structures or permanent works proposed within easement boundaries — confirmed with relevant authority if required", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Neighbours", description: "Adjoining property conditions documented — any existing damage, encroachments or sensitive structures noted", riskLevel: "medium", defectTrigger: false, requirePhoto: true },
      { category: "Neighbours", description: "Setbacks from proposed building to all boundaries verified against development consent and BCA", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Neighbours", description: "Potential impact on neighbouring properties assessed — overshadowing, privacy, noise and vibration from excavation", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Fencing", description: "Existing boundary fences inspected and ownership/responsibility confirmed", riskLevel: "low", defectTrigger: false, requirePhoto: true },
      { category: "Fencing", description: "Hoarding or temporary site fencing required — height, type and signage requirements confirmed with council", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Traffic Management", description: "Traffic Management Plan (TMP) requirement assessed — pedestrian safety, truck routes and signage planned", riskLevel: "high", defectTrigger: true, requirePhoto: false },
      { category: "Traffic Management", description: "On-street parking impacts identified — council permits obtained for hoardings, crane pads or skip bins on road reserve", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Services & Utilities", description: "Underground services located via Dial Before You Dig — gas, water, sewer, electrical and comms marked on site plan", riskLevel: "critical", defectTrigger: true, requirePhoto: false },
      { category: "Services & Utilities", description: "Existing service connections (water, sewer, electrical) adequate for proposed works — upgrade requirements noted", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
      { category: "Vegetation & Trees", description: "Significant or protected trees identified — Tree Management Plans and council approvals in place before clearing", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Soil Conditions", description: "Soil classification determined (AS 2870) — reactive clay, sandy or rock conditions confirmed from test bores or neighbouring data", riskLevel: "high", defectTrigger: false, requirePhoto: false, codeReference: "AS 2870" },
      { category: "Stormwater & Drainage", description: "Existing site drainage assessed — on-site detention (OSD) requirements and discharge points confirmed with council", riskLevel: "medium", defectTrigger: false, requirePhoto: false },
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
