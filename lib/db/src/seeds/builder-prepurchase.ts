import { db } from "../index";
import { checklistTemplatesTable, checklistItemsTable } from "../schema/checklists";
import { eq } from "drizzle-orm";

type ItemDef = {
  category: string;
  description: string;
  riskLevel?: "low" | "medium" | "high";
  defectTrigger?: boolean;
  requirePhoto?: boolean;
  recommendedAction?: string;
};

async function seedTemplate(
  name: string,
  discipline: string,
  inspectionType: string,
  folder: string,
  description: string,
  sortOrder: number,
  items: ItemDef[],
) {
  // Remove existing template with same name + discipline
  const existing = await db
    .select()
    .from(checklistTemplatesTable)
    .where(eq(checklistTemplatesTable.name, name));

  for (const t of existing) {
    if (t.discipline === discipline) {
      await db.delete(checklistItemsTable).where(eq(checklistItemsTable.templateId, t.id));
      await db.delete(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, t.id));
    }
  }

  const [tmpl] = await db
    .insert(checklistTemplatesTable)
    .values({ name, discipline, inspectionType, folder, description, sortOrder })
    .returning();

  await db.insert(checklistItemsTable).values(
    items.map((item, i) => ({
      templateId: tmpl.id,
      orderIndex: i + 1,
      category: item.category,
      description: item.description,
      riskLevel: item.riskLevel ?? "medium",
      defectTrigger: item.defectTrigger ?? false,
      requirePhoto: item.requirePhoto ?? false,
      recommendedAction: item.recommendedAction ?? null,
      isRequired: true,
      includeInReport: true,
    })),
  );
  console.log(`  ✓ ${name} (${items.length} items)`);
}

async function main() {
  console.log("Seeding Builder and Pre-Purchase Inspector templates...");

  // ── BUILDER: DEFECT INSPECTION ─────────────────────────────────────────────
  await seedTemplate(
    "Defect Inspection",
    "Builder / QC",
    "non_conformance",
    "Builder",
    "Identify incomplete, damaged, poor-quality or non-compliant work during or after construction.",
    1,
    [
      // Site / External
      { category: "Site / External", description: "Site cleanliness and rubbish removal", riskLevel: "low" },
      { category: "Site / External", description: "External building fabric free from visible damage", riskLevel: "medium", defectTrigger: true },
      { category: "Site / External", description: "Paths and driveways complete and undamaged", riskLevel: "low" },
      { category: "Site / External", description: "Stormwater drainage complete and connected", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Site / External", description: "Retaining walls complete and structurally sound (if applicable)", riskLevel: "high", defectTrigger: true },
      { category: "Site / External", description: "Fencing and gates installed and operational (if applicable)", riskLevel: "low" },
      { category: "Site / External", description: "No ponding water or drainage concerns", riskLevel: "medium" },
      // Structure / Frame
      { category: "Structure / Frame", description: "No visible cracking to structural elements", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage structural engineer to assess" },
      { category: "Structure / Frame", description: "No visible movement or settlement", riskLevel: "high", defectTrigger: true },
      { category: "Structure / Frame", description: "Frame members free from damage or alteration", riskLevel: "high", defectTrigger: true },
      { category: "Structure / Frame", description: "No incomplete framing elements", riskLevel: "high", defectTrigger: true },
      { category: "Structure / Frame", description: "Beams and lintels installed correctly where visible", riskLevel: "high", defectTrigger: true },
      { category: "Structure / Frame", description: "No unauthorized alterations to structural elements", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      // Roof / External Envelope
      { category: "Roof / External Envelope", description: "Roof coverings complete and undamaged", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Roof / External Envelope", description: "Flashings installed and sealed correctly", riskLevel: "high", defectTrigger: true },
      { category: "Roof / External Envelope", description: "Gutters and downpipes complete and clear", riskLevel: "medium", defectTrigger: true },
      { category: "Roof / External Envelope", description: "All roof penetrations sealed", riskLevel: "high", defectTrigger: true },
      { category: "Roof / External Envelope", description: "Wall cladding complete with no gaps or damage", riskLevel: "medium", defectTrigger: true },
      { category: "Roof / External Envelope", description: "Windows installed, sealed and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Roof / External Envelope", description: "External doors installed and fully functional", riskLevel: "medium", defectTrigger: true },
      // Internal Finishes
      { category: "Internal Finishes", description: "Wall linings complete, no gaps or loose sheets", riskLevel: "medium", defectTrigger: true },
      { category: "Internal Finishes", description: "Plasterwork free from damage, dents and cracks", riskLevel: "low", defectTrigger: true, requirePhoto: true },
      { category: "Internal Finishes", description: "Paint finish acceptable — no runs, missed areas or inconsistency", riskLevel: "low", defectTrigger: true },
      { category: "Internal Finishes", description: "Flooring complete and undamaged", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Internal Finishes", description: "Skirting boards and architraves complete and fitted correctly", riskLevel: "low", defectTrigger: true },
      { category: "Internal Finishes", description: "Ceiling finishes complete and free from damage", riskLevel: "low", defectTrigger: true },
      { category: "Internal Finishes", description: "Joinery finish acceptable — aligned, undamaged, operational", riskLevel: "medium", defectTrigger: true },
      // Wet Areas
      { category: "Wet Areas", description: "No visible waterproofing concerns or moisture damage", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Test waterproofing membrane and rectify" },
      { category: "Wet Areas", description: "Tiling quality acceptable — no cracked, loose or misaligned tiles", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Wet Areas", description: "Silicone and sealant finish neat, continuous and mould-free", riskLevel: "medium", defectTrigger: true },
      { category: "Wet Areas", description: "Drainage falls appear adequate to wastes", riskLevel: "high", defectTrigger: true },
      { category: "Wet Areas", description: "Shower screens installed correctly and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Wet Areas", description: "Plumbing fixtures installed, connected and undamaged", riskLevel: "medium", defectTrigger: true },
      // Fixtures / Fittings
      { category: "Fixtures / Fittings", description: "All doors open, close and latch correctly", riskLevel: "medium", defectTrigger: true },
      { category: "Fixtures / Fittings", description: "Door furniture installed and functioning", riskLevel: "low", defectTrigger: true },
      { category: "Fixtures / Fittings", description: "Cabinetry aligned, level and fully operational", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Fixtures / Fittings", description: "Benchtops installed, undamaged and sealed", riskLevel: "medium", defectTrigger: true },
      { category: "Fixtures / Fittings", description: "Wardrobes and shelving complete and functional", riskLevel: "low", defectTrigger: true },
      { category: "Fixtures / Fittings", description: "Appliances installed and connected (if applicable)", riskLevel: "medium", defectTrigger: true },
      // Services
      { category: "Services", description: "Plumbing fixtures operational with no visible leaks", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Rectify leaks before handover" },
      { category: "Services", description: "No leaks visible to pipework or fixtures", riskLevel: "high", defectTrigger: true },
      { category: "Services", description: "Hot water system installed and connected", riskLevel: "high", defectTrigger: true },
      { category: "Services", description: "Light fittings and power points fitted and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Services", description: "Smoke alarms installed in required locations", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Install smoke alarms to NCC requirements" },
      { category: "Services", description: "Exhaust fans fitted in wet areas", riskLevel: "medium", defectTrigger: true },
      { category: "Services", description: "Heating and cooling units installed (if applicable)", riskLevel: "medium" },
      // Compliance / Completion
      { category: "Compliance / Completion", description: "Safety barriers and balustrades complete and structurally sound", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Rectify immediately — safety hazard" },
      { category: "Compliance / Completion", description: "Stair elements complete — handrails, nosings, risers", riskLevel: "high", defectTrigger: true },
      { category: "Compliance / Completion", description: "External steps complete and slip-resistant", riskLevel: "high", defectTrigger: true },
      { category: "Compliance / Completion", description: "No obvious incomplete permit items", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Compliance / Completion", description: "Building ready for practical completion consideration", riskLevel: "high" },
    ],
  );

  // ── BUILDER: HANDOVER INSPECTION ──────────────────────────────────────────
  await seedTemplate(
    "Handover Inspection",
    "Builder / QC",
    "qc_pre_handover",
    "Builder",
    "Confirm presentation, completeness, and client-facing quality at practical completion.",
    2,
    [
      // Presentation
      { category: "Presentation", description: "Dwelling presented clean — all trades work completed and area tidy", riskLevel: "low", defectTrigger: true },
      { category: "Presentation", description: "All rubbish and construction waste removed from site", riskLevel: "low", defectTrigger: true },
      { category: "Presentation", description: "All surfaces cleaned — floors, benchtops, windows", riskLevel: "low", defectTrigger: true },
      { category: "Presentation", description: "Windows cleaned internally and externally", riskLevel: "low" },
      { category: "Presentation", description: "No obvious damage from trades at point of handover", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      // External Completion
      { category: "External Completion", description: "External cladding complete and free from damage", riskLevel: "medium", defectTrigger: true },
      { category: "External Completion", description: "Painting and external coatings complete", riskLevel: "medium", defectTrigger: true },
      { category: "External Completion", description: "Roof and guttering complete", riskLevel: "high", defectTrigger: true },
      { category: "External Completion", description: "Driveways and paths complete", riskLevel: "low", defectTrigger: true },
      { category: "External Completion", description: "Landscaping items complete (if part of scope)", riskLevel: "low" },
      { category: "External Completion", description: "External taps and fixtures installed", riskLevel: "medium", defectTrigger: true },
      // Internal Completion
      { category: "Internal Completion", description: "Paint finish acceptable throughout — no missed areas or defects", riskLevel: "low", defectTrigger: true },
      { category: "Internal Completion", description: "Walls and ceilings free from damage", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Internal Completion", description: "Flooring complete throughout", riskLevel: "medium", defectTrigger: true },
      { category: "Internal Completion", description: "All doors functioning correctly — open, close, latch", riskLevel: "medium", defectTrigger: true },
      { category: "Internal Completion", description: "All locks functional — entry doors and windows", riskLevel: "medium", defectTrigger: true },
      { category: "Internal Completion", description: "Cabinetry aligned, hinges adjusted, all complete", riskLevel: "medium", defectTrigger: true },
      { category: "Internal Completion", description: "Trims and mouldings complete and fitted", riskLevel: "low", defectTrigger: true },
      // Kitchen / Laundry
      { category: "Kitchen / Laundry", description: "Kitchen cabinetry complete and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Kitchen / Laundry", description: "Appliances installed and functional", riskLevel: "medium", defectTrigger: true },
      { category: "Kitchen / Laundry", description: "Sinks and taps operational with no leaks", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Kitchen / Laundry", description: "Splashbacks complete and sealed", riskLevel: "medium", defectTrigger: true },
      { category: "Kitchen / Laundry", description: "Laundry fit-off complete — taps, waste, cabinet", riskLevel: "medium", defectTrigger: true },
      // Bathrooms / Wet Areas
      { category: "Bathrooms / Wet Areas", description: "All fixtures installed and undamaged", riskLevel: "medium", defectTrigger: true },
      { category: "Bathrooms / Wet Areas", description: "No cracked or missing tiles", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Bathrooms / Wet Areas", description: "Silicone finish acceptable — continuous, neat, mould-free", riskLevel: "medium", defectTrigger: true },
      { category: "Bathrooms / Wet Areas", description: "Screens and mirrors fitted correctly", riskLevel: "medium", defectTrigger: true },
      { category: "Bathrooms / Wet Areas", description: "Drainage functioning — water drains away from area", riskLevel: "high", defectTrigger: true },
      { category: "Bathrooms / Wet Areas", description: "No visible leaks or moisture damage", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      // Electrical / Mechanical / Plumbing
      { category: "Electrical / Mechanical / Plumbing", description: "All lights working", riskLevel: "medium", defectTrigger: true },
      { category: "Electrical / Mechanical / Plumbing", description: "Power points fitted and active", riskLevel: "medium", defectTrigger: true },
      { category: "Electrical / Mechanical / Plumbing", description: "Switches fitted and operational", riskLevel: "medium", defectTrigger: true },
      { category: "Electrical / Mechanical / Plumbing", description: "Smoke alarms installed and operational", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Electrical / Mechanical / Plumbing", description: "Exhaust systems installed in wet areas", riskLevel: "medium", defectTrigger: true },
      { category: "Electrical / Mechanical / Plumbing", description: "Hot water functioning", riskLevel: "high", defectTrigger: true },
      { category: "Electrical / Mechanical / Plumbing", description: "Plumbing fixtures operational with no leaks", riskLevel: "high", defectTrigger: true },
      // Safety / Final Items
      { category: "Safety / Final Items", description: "Handrails and balustrades complete and firm", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Rectify before handover — safety item" },
      { category: "Safety / Final Items", description: "Stairs complete — nosings, handrails, all treads", riskLevel: "high", defectTrigger: true },
      { category: "Safety / Final Items", description: "No glazing safety concerns apparent", riskLevel: "high", defectTrigger: true },
      { category: "Safety / Final Items", description: "Pool barrier complete and compliant in appearance (if applicable)", riskLevel: "high", defectTrigger: true },
      { category: "Safety / Final Items", description: "External access elements complete (ramps, paths, steps)", riskLevel: "medium", defectTrigger: true },
      // Handover Items
      { category: "Handover Items", description: "Appliance manuals and warranties on hand for client", riskLevel: "low", defectTrigger: true },
      { category: "Handover Items", description: "Warranties documents prepared and ready to hand over", riskLevel: "low", defectTrigger: true },
      { category: "Handover Items", description: "All keys, remotes and access items on hand", riskLevel: "medium", defectTrigger: true },
      { category: "Handover Items", description: "Compliance certificates uploaded and available (if issued)", riskLevel: "medium" },
      { category: "Handover Items", description: "Defects and omissions list finalised", riskLevel: "medium" },
    ],
  );

  // ── BUILDER: CERTIFIER READINESS — FOOTINGS ───────────────────────────────
  await seedTemplate(
    "Certifier Readiness — Footings",
    "Builder / QC",
    "qc_footing",
    "Builder",
    "Check whether footings / excavation appears ready for building certifier stage inspection.",
    3,
    [
      { category: "Footing Readiness", description: "Site setout consistent with approved plans", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Footing Readiness", description: "Excavation depth appears correct for footing type", riskLevel: "high", defectTrigger: true },
      { category: "Footing Readiness", description: "Bearing surface acceptable — no loose fill, water or contamination", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Remove contamination and re-inspect" },
      { category: "Footing Readiness", description: "Reinforcement in place and positioned correctly (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Footing Readiness", description: "Dimensions generally align with approved plans", riskLevel: "high", defectTrigger: true },
      { category: "Footing Readiness", description: "Setbacks from boundaries appear correct", riskLevel: "high", defectTrigger: true },
      { category: "Footing Readiness", description: "All penetrations identified and formed", riskLevel: "medium", defectTrigger: true },
      { category: "Footing Readiness", description: "Site access safe for certifier inspection", riskLevel: "medium", defectTrigger: true, recommendedAction: "Provide safe access before booking inspection" },
    ],
  );

  // ── BUILDER: CERTIFIER READINESS — SLAB ──────────────────────────────────
  await seedTemplate(
    "Certifier Readiness — Slab",
    "Builder / QC",
    "qc_footing",
    "Builder",
    "Check whether slab formation appears ready for building certifier stage inspection.",
    4,
    [
      { category: "Slab Readiness", description: "Vapour barrier installed correctly — lapped, taped, no tears", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Slab Readiness", description: "Reinforcement installed to engineer specification", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Slab Readiness", description: "Edge thickening and beams formed correctly", riskLevel: "high", defectTrigger: true },
      { category: "Slab Readiness", description: "All penetrations in place — plumbing, conduits, services", riskLevel: "high", defectTrigger: true },
      { category: "Slab Readiness", description: "Termite management components in place (if applicable)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Slab Readiness", description: "Stepdowns formed correctly where required", riskLevel: "medium", defectTrigger: true },
      { category: "Slab Readiness", description: "Slab area prepared and dimensions verified against plans", riskLevel: "high", defectTrigger: true },
    ],
  );

  // ── BUILDER: CERTIFIER READINESS — FRAME ─────────────────────────────────
  await seedTemplate(
    "Certifier Readiness — Frame",
    "Builder / QC",
    "qc_frame",
    "Builder",
    "Check whether frame appears ready for building certifier stage inspection.",
    5,
    [
      { category: "Frame Readiness", description: "Wall frames erected and generally plumb and straight", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Frame Readiness", description: "Bracing installed as per engineering and plans", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Complete bracing before booking inspection" },
      { category: "Frame Readiness", description: "Tie-downs and hold-downs installed to engineer specification", riskLevel: "high", defectTrigger: true },
      { category: "Frame Readiness", description: "Trusses and rafters installed and bearing correctly", riskLevel: "high", defectTrigger: true },
      { category: "Frame Readiness", description: "Lintels and beams installed over all openings", riskLevel: "high", defectTrigger: true },
      { category: "Frame Readiness", description: "Frame plumb, square and complete — no missing members", riskLevel: "high", defectTrigger: true },
      { category: "Frame Readiness", description: "Wet area framing suitable — correct timber species or steel", riskLevel: "high", defectTrigger: true },
      { category: "Frame Readiness", description: "Window and door openings formed correctly to plans", riskLevel: "medium", defectTrigger: true },
      { category: "Frame Readiness", description: "Inspection access safe and unobstructed", riskLevel: "medium", defectTrigger: true, recommendedAction: "Provide safe access before booking inspection" },
    ],
  );

  // ── BUILDER: CERTIFIER READINESS — WATERPROOFING ─────────────────────────
  await seedTemplate(
    "Certifier Readiness — Waterproofing",
    "Builder / QC",
    "qc_fitout",
    "Builder",
    "Check whether waterproofing appears ready for building certifier inspection.",
    6,
    [
      { category: "Waterproofing Readiness", description: "Substrate complete, solid and free from contamination", riskLevel: "high", defectTrigger: true },
      { category: "Waterproofing Readiness", description: "Wet area setdown and drainage falls prepared correctly", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Waterproofing Readiness", description: "Junctions between floor and wall sealed and primed", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Waterproofing Readiness", description: "Membrane installed to all required areas", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Complete membrane application to full extent" },
      { category: "Waterproofing Readiness", description: "Penetrations treated and sealed correctly", riskLevel: "high", defectTrigger: true },
      { category: "Waterproofing Readiness", description: "Upturns and thresholds treated to required height", riskLevel: "high", defectTrigger: true },
      { category: "Waterproofing Readiness", description: "Membrane cured (if required) before inspection", riskLevel: "medium", defectTrigger: true },
      { category: "Waterproofing Readiness", description: "Area ready for certifier inspection at appropriate stage", riskLevel: "medium", defectTrigger: true },
    ],
  );

  // ── BUILDER: CERTIFIER READINESS — FINAL ─────────────────────────────────
  await seedTemplate(
    "Certifier Readiness — Final / Occupancy",
    "Builder / QC",
    "qc_pre_handover",
    "Builder",
    "Check whether building appears ready for final building certifier inspection.",
    7,
    [
      { category: "Final Readiness", description: "Building substantially complete — no obvious incomplete works", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Final Readiness", description: "Sanitary fixtures installed and connected", riskLevel: "high", defectTrigger: true },
      { category: "Final Readiness", description: "Smoke alarms installed in all required locations", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Install smoke alarms before booking final inspection" },
      { category: "Final Readiness", description: "Stair and balustrade safety items complete", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Final Readiness", description: "Glazing installed throughout", riskLevel: "high", defectTrigger: true },
      { category: "Final Readiness", description: "Waterproofed areas complete — tiles, screens, fittings", riskLevel: "high", defectTrigger: true },
      { category: "Final Readiness", description: "Stormwater connected to appropriate point of discharge", riskLevel: "high", defectTrigger: true },
      { category: "Final Readiness", description: "Site safe for certifier inspection — no hazards present", riskLevel: "medium", defectTrigger: true },
      { category: "Final Readiness", description: "All prescribed final inspection items complete per conditions", riskLevel: "high", defectTrigger: true, recommendedAction: "Review DA conditions and consent before booking" },
      { category: "Final Readiness", description: "No obvious incomplete works likely to fail certifier inspection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
    ],
  );

  // ── PRE-PURCHASE: STANDARD BUILDING INSPECTION ────────────────────────────
  await seedTemplate(
    "Standard Pre-Purchase Building Inspection",
    "Pre-Purchase Inspector",
    "pre_purchase_building",
    "Pre-Purchase",
    "Assess visible condition, defects, risk and maintenance issues for a prospective purchaser.",
    10,
    [
      // Site and Surroundings
      { category: "Site and Surroundings", description: "Site drainage appears adequate — no evidence of water pooling", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Site and Surroundings", description: "No significant surface water issues noted", riskLevel: "medium", defectTrigger: true },
      { category: "Site and Surroundings", description: "Retaining walls in acceptable condition — no visible movement", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage geotechnical engineer for further assessment" },
      { category: "Site and Surroundings", description: "Site slope does not present drainage or stability concerns", riskLevel: "medium", defectTrigger: true },
      { category: "Site and Surroundings", description: "Access limitations noted for inspection purposes", riskLevel: "low" },
      { category: "Site and Surroundings", description: "Trees not observed to be undermining or at risk of affecting structure", riskLevel: "medium", defectTrigger: true, recommendedAction: "Obtain arborist report if tree proximity is concerning" },
      { category: "Site and Surroundings", description: "No evidence of significant ground movement or subsidence", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      // External Building
      { category: "External Building", description: "Wall cladding in acceptable condition — no missing, cracked or loose sections", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "External Building", description: "No significant cracking to external walls", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Structural engineer assessment recommended" },
      { category: "External Building", description: "Movement joints in acceptable condition (if applicable)", riskLevel: "medium", defectTrigger: true },
      { category: "External Building", description: "External paint and coating condition acceptable", riskLevel: "low", defectTrigger: true },
      { category: "External Building", description: "Windows in acceptable condition — no cracked glazing, seals intact", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "External Building", description: "Doors in acceptable condition and operational", riskLevel: "medium", defectTrigger: true },
      { category: "External Building", description: "Deck and balcony condition acceptable — no visible structural concerns", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage builder or engineer to assess deck structure" },
      { category: "External Building", description: "Balustrade height and security acceptable from visible inspection", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Rectify to meet safety requirements before occupation" },
      { category: "External Building", description: "Eaves and soffits in acceptable condition", riskLevel: "medium", defectTrigger: true },
      // Roof Exterior
      { category: "Roof Exterior", description: "Roof covering in acceptable condition — no visible damage or displacement", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Obtain roofing specialist report" },
      { category: "Roof Exterior", description: "Ridge capping and bedding in acceptable condition", riskLevel: "high", defectTrigger: true },
      { category: "Roof Exterior", description: "Flashings in acceptable condition — no lifting or gaps", riskLevel: "high", defectTrigger: true },
      { category: "Roof Exterior", description: "Gutters in acceptable condition — no sagging, rust or blockages", riskLevel: "medium", defectTrigger: true },
      { category: "Roof Exterior", description: "Downpipes in acceptable condition and discharging appropriately", riskLevel: "medium", defectTrigger: true },
      { category: "Roof Exterior", description: "No signs of prior leaks visible from roof exterior inspection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Roof Exterior", description: "Roof drainage appears adequate", riskLevel: "medium", defectTrigger: true },
      { category: "Roof Exterior", description: "No visible significant rust, corrosion or damage to roof materials", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      // Roof Space
      { category: "Roof Space", description: "Roof framing visible condition acceptable", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Structural engineer assessment recommended" },
      { category: "Roof Space", description: "No signs of active or prior leaks to roof space", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Roof Space", description: "Insulation present and in reasonable condition (if visible)", riskLevel: "low" },
      { category: "Roof Space", description: "No moisture staining to framing or sarking", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Roof Space", description: "Ventilation appears adequate", riskLevel: "medium", defectTrigger: true },
      { category: "Roof Space", description: "No visible signs of significant structural movement", riskLevel: "high", defectTrigger: true },
      { category: "Roof Space", description: "No obvious termite or pest indicators visible in roof space", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage licensed pest inspector for invasive termite inspection" },
      // Interior
      { category: "Interior", description: "No significant wall cracking noted internally", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Structural assessment recommended for significant cracking" },
      { category: "Interior", description: "No ceiling sagging or damage", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Interior", description: "No water staining to ceilings or walls", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Locate and rectify source of water entry" },
      { category: "Interior", description: "No visible mould or damp indicators beyond surface marks", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Investigate source of moisture and treat" },
      { category: "Interior", description: "No apparent floor level concerns — doors and windows operate freely", riskLevel: "high", defectTrigger: true },
      { category: "Interior", description: "Doors and windows operate freely — no sticking", riskLevel: "medium", defectTrigger: true },
      { category: "Interior", description: "General internal finish in acceptable condition", riskLevel: "low", defectTrigger: true },
      // Wet Areas
      { category: "Wet Areas", description: "No visible moisture damage to wet area surfaces", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Specialist waterproofing assessment recommended" },
      { category: "Wet Areas", description: "Sealant in acceptable condition — no cracking, voids or discolouration", riskLevel: "medium", defectTrigger: true },
      { category: "Wet Areas", description: "Tiles in acceptable condition — no cracking, loose or missing tiles", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Wet Areas", description: "No visible shower leakage or moisture penetration indicators", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Wet Areas", description: "Ventilation in wet areas appears adequate", riskLevel: "medium", defectTrigger: true },
      { category: "Wet Areas", description: "No visible plumbing leak indicators", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Wet Areas", description: "Finishes in reasonable condition for age of building", riskLevel: "low" },
      // Subfloor
      { category: "Subfloor", description: "Ventilation in subfloor appears adequate (if accessible)", riskLevel: "medium", defectTrigger: true, recommendedAction: "Improve ventilation to reduce moisture risk" },
      { category: "Subfloor", description: "No significant moisture or water present in subfloor", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Investigate and rectify moisture source" },
      { category: "Subfloor", description: "Timber floor members in acceptable condition (if visible)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Subfloor", description: "Floor support stumps or piers in acceptable condition (if visible)", riskLevel: "high", defectTrigger: true },
      { category: "Subfloor", description: "No drainage concerns in subfloor space", riskLevel: "medium", defectTrigger: true },
      { category: "Subfloor", description: "No visible signs of significant ground movement in subfloor", riskLevel: "high", defectTrigger: true },
      { category: "Subfloor", description: "No obvious termite or pest indicators in subfloor space", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage licensed pest inspector for invasive inspection" },
      // Services — Visual / Basic
      { category: "Services — Visible Only", description: "Plumbing condition observed — no obvious leaks or deterioration", riskLevel: "medium", defectTrigger: true },
      { category: "Services — Visible Only", description: "No obvious electrical safety concerns observed", riskLevel: "high", defectTrigger: true, recommendedAction: "Engage licensed electrician for further assessment" },
      { category: "Services — Visible Only", description: "Hot water unit visible condition acceptable for age", riskLevel: "medium", defectTrigger: true },
      { category: "Services — Visible Only", description: "Heating and cooling units visible condition acceptable (if applicable)", riskLevel: "low" },
      { category: "Services — Visible Only", description: "Smoke alarms present — note: serviceability not tested", riskLevel: "high", defectTrigger: true, recommendedAction: "Test smoke alarms and replace if faulty before occupation" },
      // Safety Hazards
      { category: "Safety Hazards", description: "No significant trip hazards identified", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Rectify prior to occupation" },
      { category: "Safety Hazards", description: "Balustrade and stair elements appear safe from visual inspection", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Engage builder to assess and rectify" },
      { category: "Safety Hazards", description: "No broken glazing safety concerns noted", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Safety Hazards", description: "No major moisture or mould issues creating health risk", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Investigate and treat moisture source urgently" },
      { category: "Safety Hazards", description: "No structural concerns requiring urgent specialist review identified", riskLevel: "high", defectTrigger: true, recommendedAction: "Engage structural engineer urgently" },
      // Approval / Alteration Red Flags
      { category: "Approval / Alterations", description: "No obvious unapproved structures observed", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Purchaser to conduct council records search" },
      { category: "Approval / Alterations", description: "Enclosed verandahs, garages or sheds noted — approval status unknown without records search", riskLevel: "medium", defectTrigger: true },
      { category: "Approval / Alterations", description: "No unusual alterations suggesting unapproved works", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Approval / Alterations", description: "Construction quality appears consistent throughout building", riskLevel: "medium", defectTrigger: true },
    ],
  );

  // ── PRE-PURCHASE: PRE-AUCTION QUICK INSPECTION ────────────────────────────
  await seedTemplate(
    "Pre-Auction Quick Condition Inspection",
    "Pre-Purchase Inspector",
    "pre_purchase_building",
    "Pre-Purchase",
    "Rapid condition overview for buyers needing a fast turnaround before auction.",
    11,
    [
      { category: "Quick Condition Check", description: "Significant structural cracking noted internally or externally", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Full pre-purchase inspection recommended before bidding" },
      { category: "Quick Condition Check", description: "Active moisture or leak indicators visible", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Investigate prior to purchase" },
      { category: "Quick Condition Check", description: "Roof condition concerns evident from accessible inspection", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Quick Condition Check", description: "Subfloor concerns noted (if accessible)", riskLevel: "high", defectTrigger: true, requirePhoto: true },
      { category: "Quick Condition Check", description: "Wet area condition concerns noted", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Quick Condition Check", description: "Major safety risks identified requiring urgent attention", riskLevel: "high", defectTrigger: true, requirePhoto: true, recommendedAction: "Do not occupy until rectified" },
      { category: "Quick Condition Check", description: "Significant unapproved structures or illegal works suspected", riskLevel: "high", defectTrigger: true, recommendedAction: "Conduct council records search before exchange" },
      { category: "Quick Condition Check", description: "Specialist review urgently recommended based on observed conditions", riskLevel: "high", defectTrigger: true, recommendedAction: "Delay purchase until specialist reports obtained" },
    ],
  );

  // ── PRE-PURCHASE: NEW HOME PRE-SETTLEMENT INSPECTION ─────────────────────
  await seedTemplate(
    "New Home Pre-Settlement Inspection",
    "Pre-Purchase Inspector",
    "pre_purchase_combined",
    "Pre-Purchase",
    "Buyer-focused inspection of a newly built home before settlement.",
    12,
    [
      { category: "Pre-Settlement Check", description: "No cosmetic defects to painted surfaces — runs, marks, missed areas", riskLevel: "low", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "No incomplete works visible — fixtures, fittings, trims", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "Finish quality acceptable throughout — no gaps, poor cuts or rough edges", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "Joinery aligned, complete and undamaged", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "Plasterwork and paint finishes acceptable — no dents, shadows or patches", riskLevel: "low", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "Tiling and wet area finishes acceptable", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "No external damage visible — cladding, roof, gutters", riskLevel: "medium", defectTrigger: true, requirePhoto: true },
      { category: "Pre-Settlement Check", description: "All appliances and fittings installed and present", riskLevel: "medium", defectTrigger: true },
      { category: "Pre-Settlement Check", description: "Site cleaned — no building waste or rubbish remaining", riskLevel: "low", defectTrigger: true },
      { category: "Pre-Settlement Check", description: "No practical livability issues — doors operational, lights working, hot water present", riskLevel: "high", defectTrigger: true, recommendedAction: "Raise with builder before settlement" },
    ],
  );

  console.log("\nDone. All Builder and Pre-Purchase Inspector templates seeded.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
