import { db, usersTable, projectsTable, inspectionsTable, checklistTemplatesTable, checklistItemsTable, checklistResultsTable, issuesTable, documentsTable, notesTable, reportsTable, activityLogsTable, notificationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding InspectProof database...");

  // Clear existing data
  await db.execute(sql`TRUNCATE TABLE notifications, activity_logs, reports, notes, documents, issues, checklist_results, checklist_items, checklist_templates, inspections, projects, users RESTART IDENTITY CASCADE`);

  // Users
  const users = await db.insert(usersTable).values([
    { email: "admin@inspectproof.com.au", passwordHash: "password123", firstName: "Sarah", lastName: "Mitchell", role: "admin", phone: "0412 345 678", isActive: true },
    { email: "james@inspectproof.com.au", passwordHash: "password123", firstName: "James", lastName: "Thornton", role: "certifier", phone: "0412 456 789", isActive: true },
    { email: "rachel@inspectproof.com.au", passwordHash: "password123", firstName: "Rachel", lastName: "Chen", role: "inspector", phone: "0413 567 890", isActive: true },
    { email: "david@inspectproof.com.au", passwordHash: "password123", firstName: "David", lastName: "Kovacs", role: "inspector", phone: "0414 678 901", isActive: true },
    { email: "emily@inspectproof.com.au", passwordHash: "password123", firstName: "Emily", lastName: "Walsh", role: "staff", phone: "0415 789 012", isActive: true },
  ]).returning();

  console.log(`✅ Created ${users.length} users`);

  // Projects
  const projects = await db.insert(projectsTable).values([
    {
      name: "Lakeview Residences — Stage 2",
      siteAddress: "42 Lakeview Drive",
      suburb: "Docklands",
      state: "VIC",
      postcode: "3008",
      clientName: "Meridian Property Group",
      builderName: "Apex Constructions Pty Ltd",
      designerName: "Urban Form Architects",
      daNumber: "DA/2024/0892",
      certificationNumber: "CC-2024-1102",
      buildingClassification: "Class 2",
      projectType: "residential",
      status: "active",
      stage: "frame",
      assignedCertifierId: users[1].id,
      assignedInspectorId: users[2].id,
      startDate: "2024-02-15",
      expectedCompletionDate: "2025-08-30",
    },
    {
      name: "Harrington Office Complex",
      siteAddress: "88 Harrington Street",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
      clientName: "Harrington Holdings Ltd",
      builderName: "Buildtek Commercial",
      designerName: "S+P Design Studio",
      daNumber: "DA/2024/1245",
      certificationNumber: "CC-2024-1455",
      buildingClassification: "Class 5/6",
      projectType: "commercial",
      status: "active",
      stage: "slab",
      assignedCertifierId: users[1].id,
      assignedInspectorId: users[3].id,
      startDate: "2024-04-01",
      expectedCompletionDate: "2026-03-31",
    },
    {
      name: "Riverside Villa — Lot 14",
      siteAddress: "14 Riverside Court",
      suburb: "Toorak",
      state: "VIC",
      postcode: "3142",
      clientName: "Mr & Mrs A. Patel",
      builderName: "Heritage Homes Victoria",
      designerName: "Prestige Architectural Group",
      daNumber: "DA/2024/0334",
      certificationNumber: "CC-2024-0456",
      buildingClassification: "Class 1a",
      projectType: "residential",
      status: "active",
      stage: "lock_up",
      assignedCertifierId: users[1].id,
      assignedInspectorId: users[2].id,
      startDate: "2023-11-01",
      expectedCompletionDate: "2025-04-30",
    },
    {
      name: "Pacific Industrial Estate — Unit 3",
      siteAddress: "Unit 3, 150 Pacific Highway",
      suburb: "Tuggerah",
      state: "NSW",
      postcode: "2259",
      clientName: "Pacific Logistics Pty Ltd",
      builderName: "Industrial Build Co",
      designerName: null,
      daNumber: "DA/2024/0567",
      certificationNumber: "CC-2024-0678",
      buildingClassification: "Class 7b",
      projectType: "industrial",
      status: "active",
      stage: "fit_out",
      assignedCertifierId: users[1].id,
      assignedInspectorId: users[3].id,
      startDate: "2024-01-15",
      expectedCompletionDate: "2025-02-28",
    },
    {
      name: "Westfield Community Pool",
      siteAddress: "23 Community Boulevard",
      suburb: "Westfield",
      state: "QLD",
      postcode: "4053",
      clientName: "Westfield City Council",
      builderName: "Aquatic Constructions QLD",
      designerName: "Civic Design Group",
      daNumber: "DA/2024/0123",
      certificationNumber: "CC-2024-0245",
      buildingClassification: "Class 9b",
      projectType: "infrastructure",
      status: "active",
      stage: "final",
      assignedCertifierId: users[1].id,
      assignedInspectorId: users[2].id,
      startDate: "2023-08-01",
      expectedCompletionDate: "2025-01-31",
    },
    {
      name: "Oakwood Townhouses — Block B",
      siteAddress: "56 Oakwood Avenue",
      suburb: "Chatswood",
      state: "NSW",
      postcode: "2067",
      clientName: "Oakwood Developments",
      builderName: "Contemporary Constructions",
      designerName: "New Form Architects",
      daNumber: "DA/2023/1892",
      certificationNumber: "CC-2023-2001",
      buildingClassification: "Class 1a",
      projectType: "residential",
      status: "completed",
      stage: "completed",
      assignedCertifierId: users[1].id,
      assignedInspectorId: users[3].id,
      startDate: "2023-05-01",
      expectedCompletionDate: "2024-11-30",
      completedDate: "2024-11-28",
    },
  ]).returning();

  console.log(`✅ Created ${projects.length} projects`);

  // Checklist templates
  const templates = await db.insert(checklistTemplatesTable).values([
    { name: "Residential Frame Inspection", inspectionType: "frame", description: "Standard frame inspection checklist for Class 1a residential buildings per NCC 2022" },
    { name: "Residential Footings Inspection", inspectionType: "footings", description: "Footing inspection checklist for residential construction" },
    { name: "Residential Slab Inspection", inspectionType: "slab", description: "Pre-pour slab inspection checklist" },
    { name: "Final Inspection — Residential", inspectionType: "final", description: "Final occupation inspection for residential buildings" },
    { name: "Fire Safety Inspection", inspectionType: "fire_safety", description: "Annual fire safety inspection checklist" },
    { name: "Pool Barrier Compliance", inspectionType: "pool_barrier", description: "Swimming pool and spa barrier compliance inspection" },
  ]).returning();

  // Frame checklist items
  await db.insert(checklistItemsTable).values([
    { templateId: templates[0].id, orderIndex: 1, category: "Structural", description: "Timber species and grade comply with engineer's specification", codeReference: "NCC 2022 Vol 2 - 3.4.2", riskLevel: "high", isRequired: true },
    { templateId: templates[0].id, orderIndex: 2, category: "Structural", description: "Wall frame member sizes match approved plans", codeReference: "AS 1684.2", riskLevel: "high", isRequired: true },
    { templateId: templates[0].id, orderIndex: 3, category: "Structural", description: "Bracing installed as per engineering specification and bracing schedule", codeReference: "AS 1684.2 Section 8", riskLevel: "critical", isRequired: true },
    { templateId: templates[0].id, orderIndex: 4, category: "Structural", description: "Tie-down and hold-down connections installed correctly", codeReference: "AS 1684.2 Section 9", riskLevel: "critical", isRequired: true },
    { templateId: templates[0].id, orderIndex: 5, category: "Structural", description: "Roof framing members sized and spaced per specification", codeReference: "AS 1684.2 Table 8.1", riskLevel: "high", isRequired: true },
    { templateId: templates[0].id, orderIndex: 6, category: "Structural", description: "Roof trusses installed plumb and true with temporary bracing", codeReference: "AS 4440", riskLevel: "high", isRequired: true },
    { templateId: templates[0].id, orderIndex: 7, category: "Connections", description: "All joist hangers, connectors and brackets correctly installed", codeReference: "AS 1684.2", riskLevel: "medium", isRequired: true },
    { templateId: templates[0].id, orderIndex: 8, category: "Connections", description: "Nailing schedule compliant — spacings and nail sizes correct", codeReference: "AS 1684.2 Appendix B", riskLevel: "high", isRequired: true },
    { templateId: templates[0].id, orderIndex: 9, category: "Moisture", description: "Wet area wall framing — moisture resistant framing used where required", codeReference: "NCC 2022 Vol 2 - 3.8.1", riskLevel: "medium", isRequired: true },
    { templateId: templates[0].id, orderIndex: 10, category: "Moisture", description: "Termite protection measures in place per specification", codeReference: "AS 3660.1", riskLevel: "high", isRequired: true },
    { templateId: templates[0].id, orderIndex: 11, category: "Services", description: "Electrical conduit and rough-in work completed before close-in", codeReference: "AS/NZS 3000", riskLevel: "low", isRequired: false },
    { templateId: templates[0].id, orderIndex: 12, category: "Services", description: "Plumbing rough-in completed and pressure-tested", codeReference: "AS 3500", riskLevel: "medium", isRequired: false },
    { templateId: templates[0].id, orderIndex: 13, category: "Fire Safety", description: "Fire separation elements installed per fire engineer's report", codeReference: "NCC 2022 Section C", riskLevel: "critical", isRequired: true },
    { templateId: templates[0].id, orderIndex: 14, category: "Energy Efficiency", description: "Insulation batts installed in walls (R-value compliant)", codeReference: "NCC 2022 Section J", riskLevel: "medium", isRequired: true },
    { templateId: templates[0].id, orderIndex: 15, category: "General", description: "All timber free from excessive moisture damage, splits or defects", codeReference: "AS 1684.2", riskLevel: "medium", isRequired: true },
  ]);

  // Footings checklist items
  await db.insert(checklistItemsTable).values([
    { templateId: templates[1].id, orderIndex: 1, category: "Earthworks", description: "Excavation dimensions match approved plans and engineer's specification", codeReference: "AS 2870", riskLevel: "high", isRequired: true },
    { templateId: templates[1].id, orderIndex: 2, category: "Earthworks", description: "Formation level achieved and compacted to specified density", codeReference: "AS 2870 Table 1.1", riskLevel: "high", isRequired: true },
    { templateId: templates[1].id, orderIndex: 3, category: "Earthworks", description: "Reactive soil classification confirmed — P classification appropriate", codeReference: "AS 2870", riskLevel: "critical", isRequired: true },
    { templateId: templates[1].id, orderIndex: 4, category: "Reinforcement", description: "Reinforcement bar sizes, spacing and positioning match engineer's drawings", codeReference: "AS 3600", riskLevel: "critical", isRequired: true },
    { templateId: templates[1].id, orderIndex: 5, category: "Reinforcement", description: "Concrete cover to reinforcement correct — chairs and spacers installed", codeReference: "AS 3600 Table 4.10.3.2", riskLevel: "high", isRequired: true },
    { templateId: templates[1].id, orderIndex: 6, category: "Concrete", description: "Concrete specified grade confirmed (min N25 for footings)", codeReference: "AS 3600", riskLevel: "high", isRequired: true },
    { templateId: templates[1].id, orderIndex: 7, category: "Drainage", description: "Sub-soil drainage installed and connected to appropriate outlet", codeReference: "AS 3500.3", riskLevel: "medium", isRequired: true },
    { templateId: templates[1].id, orderIndex: 8, category: "Termite", description: "Termite barrier system installed around perimeter", codeReference: "AS 3660.1", riskLevel: "high", isRequired: true },
  ]);

  // Pool barrier checklist items
  await db.insert(checklistItemsTable).values([
    { templateId: templates[5].id, orderIndex: 1, category: "Fence Height", description: "Barrier height not less than 1200mm above finished ground level", codeReference: "AS 1926.1-2012 Cl 2.2", riskLevel: "critical", isRequired: true },
    { templateId: templates[5].id, orderIndex: 2, category: "Gate", description: "Self-closing gate fitted — closes from any position", codeReference: "AS 1926.1-2012 Cl 2.5", riskLevel: "critical", isRequired: true },
    { templateId: templates[5].id, orderIndex: 3, category: "Gate", description: "Self-latching gate — latch positioned on pool side of fence", codeReference: "AS 1926.1-2012 Cl 2.5.3", riskLevel: "critical", isRequired: true },
    { templateId: templates[5].id, orderIndex: 4, category: "Climbability", description: "No climbable objects within 900mm of barrier on outside", codeReference: "AS 1926.1-2012 Cl 2.7", riskLevel: "critical", isRequired: true },
    { templateId: templates[5].id, orderIndex: 5, category: "Openings", description: "No openings in fence greater than 100mm", codeReference: "AS 1926.1-2012 Cl 2.4", riskLevel: "critical", isRequired: true },
    { templateId: templates[5].id, orderIndex: 6, category: "CPR Sign", description: "CPR sign permanently displayed and clearly visible from pool area", codeReference: "Pool Safety Act", riskLevel: "high", isRequired: true },
  ]);

  console.log(`✅ Created ${templates.length} checklist templates`);

  // Inspections
  const today = new Date();
  const inspections = await db.insert(inspectionsTable).values([
    {
      projectId: projects[0].id,
      inspectionType: "frame",
      status: "completed",
      scheduledDate: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      completedDate: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      inspectorId: users[2].id,
      duration: 120,
      notes: "Frame inspection completed. Several items required follow-up including bracing compliance.",
      weatherConditions: "Fine, 22°C",
      checklistTemplateId: templates[0].id,
    },
    {
      projectId: projects[0].id,
      inspectionType: "footings",
      status: "completed",
      scheduledDate: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      completedDate: new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      inspectorId: users[2].id,
      duration: 90,
      notes: "Footings inspection passed. All items compliant.",
      weatherConditions: "Overcast, 18°C",
      checklistTemplateId: templates[1].id,
    },
    {
      projectId: projects[1].id,
      inspectionType: "slab",
      status: "scheduled",
      scheduledDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      scheduledTime: "09:00",
      inspectorId: users[3].id,
      duration: 90,
      notes: "Pre-pour slab inspection. Check reinforcement layout.",
      checklistTemplateId: templates[2].id,
    },
    {
      projectId: projects[2].id,
      inspectionType: "frame",
      status: "follow_up_required",
      scheduledDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      completedDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      inspectorId: users[2].id,
      duration: 150,
      notes: "Frame inspection — follow-up required for hold-down connections and bracing in north wall.",
      weatherConditions: "Clear, 25°C",
      checklistTemplateId: templates[0].id,
    },
    {
      projectId: projects[3].id,
      inspectionType: "special",
      status: "in_progress",
      scheduledDate: today.toISOString().split("T")[0],
      scheduledTime: "08:30",
      inspectorId: users[3].id,
      duration: 180,
      notes: "Fitout and services inspection in progress.",
    },
    {
      projectId: projects[4].id,
      inspectionType: "pool_barrier",
      status: "scheduled",
      scheduledDate: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      scheduledTime: "14:00",
      inspectorId: users[2].id,
      duration: 60,
      notes: "Pool barrier compliance inspection prior to final certificate.",
      checklistTemplateId: templates[5].id,
    },
    {
      projectId: projects[4].id,
      inspectionType: "final",
      status: "scheduled",
      scheduledDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      scheduledTime: "10:00",
      inspectorId: users[2].id,
      duration: 180,
      notes: "Final occupation inspection — all works to be completed before this date.",
      checklistTemplateId: templates[3].id,
    },
    {
      projectId: projects[5].id,
      inspectionType: "final",
      status: "completed",
      scheduledDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      completedDate: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      inspectorId: users[3].id,
      duration: 210,
      notes: "Final inspection passed. Certificate of Occupancy issued.",
      weatherConditions: "Fine, 20°C",
      checklistTemplateId: templates[3].id,
    },
  ]).returning();

  console.log(`✅ Created ${inspections.length} inspections`);

  // Add some checklist results for completed inspections
  const frameItems = await db.select().from(checklistItemsTable).where(sql`${checklistItemsTable.templateId} = ${templates[0].id}`);

  if (frameItems.length > 0) {
    const resultMapping = [
      "pass", "pass", "fail", "pass", "pass", "pass", "pass", "fail", "pass", "pass", "na", "na", "pass", "pass", "pass"
    ];
    await db.insert(checklistResultsTable).values(
      frameItems.slice(0, resultMapping.length).map((item, idx) => ({
        inspectionId: inspections[0].id,
        checklistItemId: item.id,
        result: resultMapping[idx] as "pass" | "fail" | "na" | "pending",
        notes: resultMapping[idx] === "fail" ? "Does not comply with specification. Remediation required before proceeding." : null,
      }))
    );
  }

  console.log(`✅ Created checklist results`);

  // Issues / Defects
  await db.insert(issuesTable).values([
    {
      projectId: projects[0].id,
      inspectionId: inspections[0].id,
      title: "Bracing non-compliant — North wall",
      description: "Wall bracing on north elevation does not comply with engineer's bracing schedule. Bracing length insufficient. Sheet bracing to be replaced with structural angle bracing per engineer's revised detail.",
      severity: "critical",
      status: "open",
      location: "North wall — Level 1",
      codeReference: "AS 1684.2 Section 8 — Bracing",
      responsibleParty: "Apex Constructions Pty Ltd",
      dueDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[0].id,
      inspectionId: inspections[0].id,
      title: "Nailing schedule non-compliant — Ridge junction",
      description: "Nailing at ridge junction does not meet minimum nail spacing requirements per AS 1684.2 Appendix B. Additional skew nails required at 150mm centres.",
      severity: "high",
      status: "in_progress",
      location: "Roof — Ridge line",
      codeReference: "AS 1684.2 Appendix B",
      responsibleParty: "Apex Constructions Pty Ltd",
      dueDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[2].id,
      inspectionId: inspections[3].id,
      title: "Hold-down connections missing — Garage",
      description: "Hold-down straps not installed at corner posts in garage wall. Engineer's detail shows SS RHS hold-down at all garage corners. Works to be rectified prior to frame approval being issued.",
      severity: "critical",
      status: "open",
      location: "Garage — All corners",
      codeReference: "AS 1684.2 Section 9",
      responsibleParty: "Heritage Homes Victoria",
      dueDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[2].id,
      inspectionId: inspections[3].id,
      title: "Termite barrier incomplete",
      description: "Chemical termite barrier not applied to full perimeter. Gap evident on eastern boundary adjacent to retaining wall. Applicator to complete and provide certification.",
      severity: "high",
      status: "open",
      location: "Eastern boundary",
      codeReference: "AS 3660.1",
      responsibleParty: "Heritage Homes Victoria",
      dueDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[1].id,
      inspectionId: null,
      title: "Slab reinforcement drawings not on site",
      description: "Engineer's reinforcement drawings not available on site at time of pre-inspection review. Drawings must be present and accessible to inspector at time of inspection.",
      severity: "medium",
      status: "resolved",
      location: "Site office",
      codeReference: "Building Act — Site Records",
      responsibleParty: "Buildtek Commercial",
      dueDate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      resolvedDate: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[4].id,
      inspectionId: null,
      title: "CPR signage not displayed",
      description: "Mandatory CPR resuscitation sign not displayed at pool area. Laminated A4 CPR sign to be permanently affixed in a visible location near the pool.",
      severity: "high",
      status: "open",
      location: "Pool deck area",
      codeReference: "Pool Safety Act — s.18",
      responsibleParty: "Aquatic Constructions QLD",
      dueDate: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[3].id,
      inspectionId: null,
      title: "Exit signage not operational",
      description: "Emergency exit signs in warehouse area not illuminated. Electrical contractor to complete wiring and test all emergency lighting circuits prior to final inspection.",
      severity: "critical",
      status: "open",
      location: "Warehouse — Bay 2 and Bay 3",
      codeReference: "NCC 2022 Part E4",
      responsibleParty: "Industrial Build Co",
      dueDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      projectId: projects[0].id,
      inspectionId: null,
      title: "Wet area membrane not installed",
      description: "Waterproofing membrane to bathroom wet areas not installed prior to tiling. Membrane to be installed and inspected before tiling proceeds.",
      severity: "high",
      status: "open",
      location: "Level 2 — Bathrooms",
      codeReference: "AS 3740",
      responsibleParty: "Apex Constructions Pty Ltd",
      dueDate: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
  ]);

  console.log(`✅ Created issues/defects`);

  // Documents
  await db.insert(documentsTable).values([
    { projectId: projects[0].id, name: "Architectural Plans — Rev C", category: "plans", fileName: "lakeview_arch_plans_revC.pdf", fileSize: 4200000, mimeType: "application/pdf", version: "C", tags: ["architecture", "approved"], uploadedById: users[1].id },
    { projectId: projects[0].id, name: "Structural Engineer Report", category: "engineering", fileName: "lakeview_struct_eng.pdf", fileSize: 1800000, mimeType: "application/pdf", version: "1", tags: ["structural", "engineering"], uploadedById: users[1].id },
    { projectId: projects[0].id, name: "Construction Certificate", category: "certificates", fileName: "CC-2024-1102.pdf", fileSize: 520000, mimeType: "application/pdf", version: "1", tags: ["certificate", "approved"], uploadedById: users[4].id },
    { projectId: projects[0].id, name: "Frame Inspection Photos", category: "photos", fileName: "frame_inspection_20250110.zip", fileSize: 28000000, mimeType: "application/zip", version: null, tags: ["photos", "frame"], uploadedById: users[2].id },
    { projectId: projects[1].id, name: "Structural Design Drawings", category: "engineering", fileName: "harrington_structural.pdf", fileSize: 8900000, mimeType: "application/pdf", version: "2", tags: ["structural", "commercial"], uploadedById: users[1].id },
    { projectId: projects[1].id, name: "Geotechnical Report", category: "engineering", fileName: "harrington_geotech.pdf", fileSize: 3400000, mimeType: "application/pdf", version: "1", tags: ["geotechnical", "soils"], uploadedById: users[1].id },
    { projectId: projects[2].id, name: "Architectural Plans — Rev B", category: "plans", fileName: "riverside_villa_plans.pdf", fileSize: 3100000, mimeType: "application/pdf", version: "B", tags: ["residential", "approved"], uploadedById: users[4].id },
    { projectId: projects[4].id, name: "Pool Barrier Compliance Report", category: "reports", fileName: "pool_barrier_report.pdf", fileSize: 890000, mimeType: "application/pdf", version: "1", tags: ["pool", "compliance"], uploadedById: users[2].id },
  ]);

  console.log(`✅ Created documents`);

  // Notes
  await db.insert(notesTable).values([
    { projectId: projects[0].id, inspectionId: inspections[0].id, content: "Spoke with site foreman — bracing contractor scheduled for tomorrow. Expect rectification completed by end of week.", authorId: users[2].id },
    { projectId: projects[0].id, inspectionId: null, content: "Client called re: project timeline. Advised frame approval on hold pending bracing rectification. Client aware and builder has been contacted.", authorId: users[4].id },
    { projectId: projects[2].id, inspectionId: inspections[3].id, content: "Builder requested 5-day extension for hold-down installation. Approved verbally — formal variation to be submitted.", authorId: users[1].id },
    { projectId: projects[4].id, inspectionId: null, content: "Pool barrier pre-inspection review completed. Main gate and north boundary fence require attention before formal inspection.", authorId: users[2].id },
    { projectId: projects[1].id, inspectionId: null, content: "Slab inspection on track for next Thursday. Builder confirmed drawings will be on-site.", authorId: users[3].id },
  ]);

  console.log(`✅ Created notes`);

  // Reports
  await db.insert(reportsTable).values([
    { projectId: projects[0].id, inspectionId: inspections[0].id, title: "Frame Inspection Report — Lakeview Residences", reportType: "detailed", status: "draft", generatedById: users[1].id },
    { projectId: projects[5].id, inspectionId: inspections[7].id, title: "Final Inspection Certificate — Oakwood Townhouses", reportType: "summary", status: "final", generatedById: users[1].id },
    { projectId: projects[2].id, inspectionId: inspections[3].id, title: "Defect Notice — Riverside Villa", reportType: "defect_notice", status: "final", generatedById: users[1].id },
  ]);

  console.log(`✅ Created reports`);

  // Activity logs
  await db.insert(activityLogsTable).values([
    { entityType: "project", entityId: projects[0].id, action: "created", description: "Project 'Lakeview Residences — Stage 2' created", userId: users[0].id },
    { entityType: "inspection", entityId: inspections[0].id, action: "completed", description: "Frame inspection completed — 2 items failed", userId: users[2].id },
    { entityType: "issue", entityId: 1, action: "created", description: "Critical issue raised: Bracing non-compliant — North wall", userId: users[2].id },
    { entityType: "project", entityId: projects[1].id, action: "created", description: "Project 'Harrington Office Complex' created", userId: users[0].id },
    { entityType: "inspection", entityId: inspections[2].id, action: "scheduled", description: "Slab inspection scheduled for next week", userId: users[3].id },
    { entityType: "issue", entityId: 5, action: "resolved", description: "Issue resolved: Slab reinforcement drawings now on site", userId: users[3].id },
    { entityType: "project", entityId: projects[5].id, action: "completed", description: "Project 'Oakwood Townhouses — Block B' marked as completed", userId: users[1].id },
    { entityType: "report", entityId: 2, action: "finalised", description: "Final inspection certificate issued for Oakwood Townhouses", userId: users[1].id },
  ]);

  // Notifications
  await db.insert(notificationsTable).values([
    { userId: users[1].id, title: "Inspection Tomorrow", body: "Slab inspection at Harrington Office Complex scheduled for tomorrow at 09:00", type: "inspection_reminder", isRead: "false", entityType: "inspection", entityId: inspections[2].id },
    { userId: users[1].id, title: "Critical Issue Overdue", body: "Bracing non-compliance at Lakeview Residences is approaching due date", type: "issue_overdue", isRead: "false", entityType: "issue", entityId: 1 },
    { userId: users[1].id, title: "Report Ready for Review", body: "Frame Inspection Report for Lakeview Residences is ready for your review", type: "report_pending", isRead: "false", entityType: "report", entityId: 1 },
    { userId: users[1].id, title: "Pool Barrier Inspection", body: "Pool barrier inspection at Westfield Community Pool scheduled for tomorrow at 14:00", type: "inspection_reminder", isRead: "false", entityType: "inspection", entityId: inspections[5].id },
    { userId: users[2].id, title: "Issue Assigned", body: "You have been assigned to resolve the hold-down connection issue at Riverside Villa", type: "project_update", isRead: "true", entityType: "issue", entityId: 3 },
  ]);

  console.log(`✅ Created activity logs and notifications`);
  console.log("\n🎉 Seed complete! Login with:");
  console.log("   Email: admin@inspectproof.com.au");
  console.log("   Password: password123");
}

seed().catch(console.error);
