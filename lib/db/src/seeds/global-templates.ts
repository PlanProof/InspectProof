import { db } from "../index";
import { docTemplatesTable } from "../schema/docTemplates";
import { checklistTemplatesTable, checklistItemsTable, checklistResultsTable } from "../schema/checklists";
import { inspectionsTable } from "../schema/inspections";
import { eq, and, isNull, isNotNull, notInArray } from "drizzle-orm";
import { seedBuildingSurveyorTemplates } from "./bs-templates";
import { seedDisciplineChecklists } from "./discipline-checklists";

const GLOBAL_DOC_TEMPLATES: Array<{ name: string; discipline: string; content: string; linkedChecklistIds: number[] }> = [
  {
    name: "Inspection Certificate",
    discipline: "Building Surveyor",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;letter-spacing:0.5px;">Licensed Building Certifier · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
        <div>{{license_number}}</div>
      </div>
    </div>
    <div style="border:2px solid #C5D92D;padding:18px 32px;background:#f9fafb;">
      <div style="font-size:18px;font-weight:700;color:#0B1933;letter-spacing:1px;text-align:center;text-transform:uppercase;">Inspection Certificate</div>
      <div style="text-align:center;font-size:11px;color:#466DB5;margin-top:4px;">Issued under the Environmental Planning and Assessment Act 1979</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Project Name</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Lot / DP Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{lot_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">DA / BA Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{da_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">NCC Building Class</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{ncc_class}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspection Type</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_type}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspection Date</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_date}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspection Time</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_time}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspector Name</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspector_name}}</td></tr>
      </table>
      <div style="background:#f0f9f0;border:1px solid #86efac;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-weight:700;color:#166534;font-size:13px;margin-bottom:4px;">&#10003; RESULT: {{result}}</div>
        <div style="font-size:12px;color:#166534;">This certificate confirms the above inspection has been carried out and the work is found to satisfy the relevant development consent and applicable standards.</div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:8px;">Inspector Notes</div>
        <div style="font-size:13px;color:#374151;line-height:1.6;">{{notes}}</div>
      </div>
      <div style="margin-bottom:24px;">
        <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:8px;">Checklist Summary</div>
        {{checklist_items}}
      </div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">Certifier Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{certifier_name}}</div>
            <div style="font-size:11px;color:#6b7280;">{{license_number}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date Issued</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}} · Page 1 of 1
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Defect Notice",
    discipline: "Building Surveyor",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;">Licensed Building Certifier · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
      </div>
    </div>
    <div style="border:2px solid #f97316;padding:18px 32px;background:#fff7ed;">
      <div style="font-size:18px;font-weight:700;color:#c2410c;letter-spacing:1px;text-align:center;text-transform:uppercase;">&#9888; Defect Notice</div>
      <div style="text-align:center;font-size:11px;color:#9a3412;margin-top:4px;">Issued under the Building Act — Action Required</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Notice Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">DN-{{council_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Project</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">DA / BA Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{da_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Date of Inspection</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_date}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspector_name}}</td></tr>
      </table>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-weight:700;color:#991b1b;font-size:13px;margin-bottom:4px;">RESULT: FAILED — Defects Identified</div>
        <div style="font-size:12px;color:#991b1b;">The following defects must be rectified before work proceeds or before the next inspection is booked.</div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:8px;">Defects Identified</div>
        <div style="font-size:13px;color:#374151;line-height:1.7;">{{notes}}</div>
      </div>
      <div style="margin-bottom:24px;">
        <div style="font-weight:600;color:#0B1933;font-size:13px;margin-bottom:8px;">Non-Conforming Items</div>
        {{checklist_items}}
      </div>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <div style="font-weight:700;color:#713f12;font-size:13px;margin-bottom:4px;">Required Action</div>
        <div style="font-size:12px;color:#713f12;">All defects listed above must be rectified and a re-inspection booked within 10 business days. Failure to comply may result in further regulatory action.</div>
      </div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">Authorised Certifier Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{certifier_name}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date Issued</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}}
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Compliance Report",
    discipline: "Building Surveyor",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;">Compliance Specialists · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
      </div>
    </div>
    <div style="border:2px solid #466DB5;padding:18px 32px;background:#eff6ff;">
      <div style="font-size:18px;font-weight:700;color:#1e40af;letter-spacing:1px;text-align:center;text-transform:uppercase;">Compliance Report</div>
      <div style="text-align:center;font-size:11px;color:#1d4ed8;margin-top:4px;">{{inspection_type}} · {{inspection_date}}</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #466DB5;padding-bottom:8px;">1. Project Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Project Name</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">DA / BA Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{da_number}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Council Reference</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{council_number}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">NCC Building Class</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{ncc_class}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #466DB5;padding-bottom:8px;">2. Inspection Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Inspection Type</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_type}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Date &amp; Time</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_date}} at {{inspection_time}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspector_name}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Overall Result</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#166534;">{{result}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #466DB5;padding-bottom:8px;">3. Findings &amp; Observations</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #466DB5;padding-bottom:8px;">4. Checklist Results</div>
      <div style="margin-bottom:28px;">{{checklist_items}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #466DB5;padding-bottom:8px;">5. Certification</div>
      {{signature_block}}
      <div style="font-size:12px;color:#6b7280;margin-bottom:24px;line-height:1.6;">I, the undersigned, certify that I have inspected the above-described work and that the inspection findings recorded in this report are accurate and complete to the best of my knowledge and belief.</div>
      <div style="display:flex;justify-content:space-between;margin-top:24px;">
        <div>
          <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
          <div style="font-size:11px;color:#6b7280;">Signature</div>
          <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{certifier_name}}</div>
          <div style="font-size:11px;color:#6b7280;">{{license_number}}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#6b7280;">Report Date</div>
          <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}} · Confidential
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Non-Compliance Notice",
    discipline: "Building Surveyor",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;">Regulatory Compliance Authority · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}}</div>
        <div>{{license_number}}</div>
      </div>
    </div>
    <div style="border:3px solid #dc2626;padding:18px 32px;background:#fee2e2;">
      <div style="font-size:18px;font-weight:700;color:#991b1b;letter-spacing:1px;text-align:center;text-transform:uppercase;">&#9940; Non-Compliance Notice</div>
      <div style="text-align:center;font-size:11px;color:#7f1d1d;margin-top:4px;">OFFICIAL NOTICE — Immediate Action Required</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin-bottom:24px;border-radius:0 4px 4px 0;">
        <div style="font-size:13px;color:#7f1d1d;font-weight:600;">NOTICE TO: Owner / Builder / Contractor of</div>
        <div style="font-size:14px;color:#991b1b;font-weight:700;margin-top:4px;">{{project_name}} — {{project_address}}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Notice Reference</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">NCN-{{council_number}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">DA / BA Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{da_number}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Date of Inspection</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_date}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Authorised Officer</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspector_name}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:10px;border-bottom:2px solid #dc2626;padding-bottom:6px;">Non-Compliance Details</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:20px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:10px;border-bottom:2px solid #dc2626;padding-bottom:6px;">Non-Conforming Checklist Items</div>
      <div style="margin-bottom:20px;">{{checklist_items}}</div>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:16px 18px;margin-bottom:24px;">
        <div style="font-weight:700;color:#713f12;font-size:13px;margin-bottom:6px;">Rectification Requirement</div>
        <div style="font-size:12px;color:#713f12;line-height:1.6;">You are required to rectify all non-compliances listed above within <strong>14 calendar days</strong> of the date of this notice. A re-inspection must be booked and passed before work can continue. Failure to comply may result in a Stop Work Order or prosecution under applicable legislation.</div>
      </div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">Authorised Officer Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{certifier_name}}</div>
            <div style="font-size:11px;color:#6b7280;">{{license_number}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date Issued</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}}
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Safety Inspection Report",
    discipline: "WHS Officer",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;">WHS &amp; Safety Inspection Services · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
      </div>
    </div>
    <div style="border:2px solid #f59e0b;padding:18px 32px;background:#fffbeb;">
      <div style="font-size:18px;font-weight:700;color:#92400e;letter-spacing:1px;text-align:center;text-transform:uppercase;">&#9888; Safety Inspection Report</div>
      <div style="text-align:center;font-size:11px;color:#b45309;margin-top:4px;">WHS Act 2011 · Safe Work Australia Standards</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #f59e0b;padding-bottom:8px;">Site Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Project</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Date of Inspection</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_date}} at {{inspection_time}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">WHS Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspector_name}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Overall Rating</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;font-weight:700;">{{result}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #f59e0b;padding-bottom:8px;">Safety Observations</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #f59e0b;padding-bottom:8px;">Safety Checklist Results</div>
      <div style="margin-bottom:28px;">{{checklist_items}}</div>
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <div style="font-weight:700;color:#78350f;font-size:13px;margin-bottom:6px;">Immediate Hazards Noted</div>
        <div style="font-size:12px;color:#92400e;line-height:1.6;">Any hazards identified during this inspection must be addressed immediately. Where a serious safety risk is identified, work in the affected area must cease until the hazard is controlled.</div>
      </div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">WHS Inspector Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspector_name}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}}
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Pre-Purchase Building Report",
    discipline: "Pre-Purchase Inspector",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;">Registered Building Inspector · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
        <div>{{license_number}}</div>
      </div>
    </div>
    <div style="border:2px solid #8b5cf6;padding:18px 32px;background:#f5f3ff;">
      <div style="font-size:18px;font-weight:700;color:#5b21b6;letter-spacing:1px;text-align:center;text-transform:uppercase;">Pre-Purchase Building Inspection Report</div>
      <div style="text-align:center;font-size:11px;color:#6d28d9;margin-top:4px;">Prepared in accordance with AS 4349.1 — Inspection of Buildings</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="background:#f5f3ff;border-left:4px solid #8b5cf6;padding:12px 16px;margin-bottom:24px;border-radius:0 4px 4px 0;">
        <div style="font-size:12px;color:#4c1d95;line-height:1.6;"><strong>IMPORTANT:</strong> This report is prepared exclusively for the client named below and must not be relied upon by any other party. It represents the opinion of the inspector at the time of inspection only.</div>
      </div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #8b5cf6;padding-bottom:8px;">Property Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Property Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Lot / DP</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{lot_number}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Inspection Date</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_date}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspector_name}}</td></tr>
        <tr><td style="padding:8px;background:#f8fafc;font-weight:600;color:#0B1933;font-size:13px;">Overall Condition</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;font-weight:700;">{{result}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #8b5cf6;padding-bottom:8px;">Inspector Summary</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #8b5cf6;padding-bottom:8px;">Inspection Findings</div>
      <div style="margin-bottom:28px;">{{checklist_items}}</div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <div style="font-weight:700;color:#166534;font-size:13px;margin-bottom:6px;">Disclaimer</div>
        <div style="font-size:11px;color:#15803d;line-height:1.6;">This report is limited to visible and accessible areas only. It does not include testing of services (electrical, plumbing, gas), pest inspection, or areas concealed by furniture, floor coverings, or insulation. The inspector accepts no liability for defects not observable at the time of inspection.</div>
      </div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">Inspector Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspector_name}}</div>
            <div style="font-size:11px;color:#6b7280;">{{license_number}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Report Date</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}} · Prepared under AS 4349.1
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Quality Control Report",
    discipline: "Builder / QC",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;">Quality Assurance &amp; Control · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
      </div>
    </div>
    <div style="border:2px solid #10b981;padding:18px 32px;background:#ecfdf5;">
      <div style="font-size:18px;font-weight:700;color:#065f46;letter-spacing:1px;text-align:center;text-transform:uppercase;">Quality Control Report</div>
      <div style="text-align:center;font-size:11px;color:#047857;margin-top:4px;">{{inspection_type}} · {{inspection_date}}</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #10b981;padding-bottom:8px;">Project &amp; Inspection Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f0fdf4;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Project</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f0fdf4;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f0fdf4;font-weight:600;color:#0B1933;font-size:13px;">Inspection Type</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_type}}</td></tr>
        <tr><td style="padding:8px;background:#f0fdf4;font-weight:600;color:#0B1933;font-size:13px;">Date &amp; Time</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspection_date}} at {{inspection_time}}</td></tr>
        <tr><td style="padding:8px;background:#f0fdf4;font-weight:600;color:#0B1933;font-size:13px;">QC Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;">{{inspector_name}}</td></tr>
        <tr><td style="padding:8px;background:#f0fdf4;font-weight:600;color:#0B1933;font-size:13px;">QC Result</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#065f46;">{{result}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #10b981;padding-bottom:8px;">Observations &amp; Findings</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #10b981;padding-bottom:8px;">Quality Checklist</div>
      <div style="margin-bottom:28px;">{{checklist_items}}</div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">QC Inspector Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspector_name}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}}
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Inspection Summary Report",
    discipline: "Building Surveyor",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;letter-spacing:0.5px;">Licensed Building Certifier · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
        <div>{{license_number}}</div>
      </div>
    </div>
    <div style="border:2px solid #C5D92D;padding:18px 32px;background:#f9fafb;">
      <div style="font-size:18px;font-weight:700;color:#0B1933;letter-spacing:1px;text-align:center;text-transform:uppercase;">Inspection Summary Report</div>
      <div style="text-align:center;font-size:11px;color:#466DB5;margin-top:4px;">{{inspection_type}} · {{inspection_date}}</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Project Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Project Name</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">DA / BA Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{da_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">NCC Building Class</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{ncc_class}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Inspection Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Inspection Type</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_type}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspection Date</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_date}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspection Time</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_time}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspector_name}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Overall Result</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;font-weight:700;">{{result}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Summary of Findings</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Checklist Results</div>
      <div style="margin-bottom:28px;">{{checklist_items}}</div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">Certifier Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{certifier_name}}</div>
            <div style="font-size:11px;color:#6b7280;">{{license_number}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date Issued</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}}
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
  {
    name: "Occupancy Inspection Report",
    discipline: "Building Surveyor",
    content: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;">
    <div style="background:#0B1933;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;">
      <div>
        <div style="font-size:22px;font-weight:700;letter-spacing:1px;">{{company_name}}</div>
        <div style="font-size:11px;color:#C5D92D;margin-top:4px;letter-spacing:0.5px;">Licensed Building Certifier · ABN {{abn}}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#ccc;">
        <div>{{company_address}}</div>
        <div>{{phone}} · {{email}}</div>
        <div>{{license_number}}</div>
      </div>
    </div>
    <div style="border:2px solid #C5D92D;padding:18px 32px;background:#f0fdf4;">
      <div style="font-size:18px;font-weight:700;color:#0B1933;letter-spacing:1px;text-align:center;text-transform:uppercase;">Occupancy Inspection Report</div>
      <div style="text-align:center;font-size:11px;color:#166534;margin-top:4px;">Occupancy Certificate Assessment · {{inspection_date}}</div>
    </div>
    <div style="padding:28px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
      <div style="background:#f0fdf4;border-left:4px solid #C5D92D;padding:12px 16px;margin-bottom:24px;border-radius:0 4px 4px 0;">
        <div style="font-size:12px;color:#166534;line-height:1.6;">This report records the findings of an Occupancy Inspection carried out under the Environmental Planning and Assessment Act 1979. Occupancy must not commence until an Occupation Certificate has been issued.</div>
      </div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Property Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Project Name</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_name}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Site Address</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{project_address}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Lot / DP Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{lot_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">DA / BA Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{da_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">NCC Building Class</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{ncc_class}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Council Reference</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{council_number}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Inspection Details</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;width:36%;font-size:13px;">Inspection Date</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_date}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspection Time</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspection_time}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Inspector</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{inspector_name}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Licence Number</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;">{{license_number}}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:600;color:#0B1933;font-size:13px;">Overall Result</td><td style="padding:8px;font-size:13px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#166534;">{{result}}</td></tr>
      </table>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Inspector Notes</div>
      <div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:24px;">{{notes}}</div>
      <div style="font-weight:600;color:#0B1933;font-size:14px;margin-bottom:16px;border-bottom:2px solid #C5D92D;padding-bottom:8px;">Occupancy Checklist</div>
      <div style="margin-bottom:28px;">{{checklist_items}}</div>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <div style="font-weight:700;color:#713f12;font-size:13px;margin-bottom:4px;">Occupation Certificate Notice</div>
        <div style="font-size:12px;color:#713f12;line-height:1.6;">Occupation of the building is not permitted until an Occupation Certificate has been formally issued. This report does not constitute an Occupation Certificate.</div>
      </div>
      <div style="border-top:2px solid #e5e7eb;padding-top:20px;">
        {{signature_block}}
        <div style="display:flex;justify-content:space-between;margin-top:32px;">
          <div>
            <div style="border-top:1px solid #374151;width:220px;margin-bottom:4px;"></div>
            <div style="font-size:11px;color:#6b7280;">Certifier Signature</div>
            <div style="font-size:12px;font-weight:600;color:#0B1933;margin-top:2px;">{{certifier_name}}</div>
            <div style="font-size:11px;color:#6b7280;">{{license_number}}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#6b7280;">Date Issued</div>
            <div style="font-size:13px;font-weight:600;color:#0B1933;margin-top:2px;">{{inspection_date}}</div>
          </div>
        </div>
      </div>
    </div>
    <div style="background:#0B1933;color:#9ca3af;font-size:10px;padding:10px 32px;text-align:center;border-radius:0 0 8px 8px;">
      This document was generated by InspectProof · {{company_name}} · Occupancy Assessment
    </div>
  </div>`,
    linkedChecklistIds: [],
  },
];

/**
 * Propagates any newly-added platform checklist items to existing active
 * inspections that use those global templates. Safe to run on every boot —
 * it only inserts rows for items not already present in an inspection.
 */
async function propagatePlatformUpdatesToActiveInspections(): Promise<void> {
  // Find all non-completed inspections that use a global (platform) template
  const activeInspections = await db
    .select({
      inspectionId: inspectionsTable.id,
      templateId: inspectionsTable.checklistTemplateId,
    })
    .from(inspectionsTable)
    .innerJoin(
      checklistTemplatesTable,
      eq(inspectionsTable.checklistTemplateId, checklistTemplatesTable.id),
    )
    .where(and(
      isNotNull(inspectionsTable.checklistTemplateId),
      eq(checklistTemplatesTable.isGlobal, true),
      notInArray(inspectionsTable.status, ["completed", "cancelled"]),
    ));

  let totalAdded = 0;

  for (const { inspectionId, templateId } of activeInspections) {
    if (!templateId) continue;

    // Find template items that don't yet have a checklist_result in this inspection
    const existingItemIds = await db
      .select({ id: checklistResultsTable.checklistItemId })
      .from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, inspectionId));

    const coveredIds = existingItemIds.map(r => r.id);

    const missingItems = coveredIds.length > 0
      ? await db
          .select({ id: checklistItemsTable.id })
          .from(checklistItemsTable)
          .where(and(
            eq(checklistItemsTable.templateId, templateId),
            notInArray(checklistItemsTable.id, coveredIds),
          ))
      : await db
          .select({ id: checklistItemsTable.id })
          .from(checklistItemsTable)
          .where(eq(checklistItemsTable.templateId, templateId));

    if (missingItems.length > 0) {
      await db.insert(checklistResultsTable).values(
        missingItems.map(item => ({
          inspectionId,
          checklistItemId: item.id,
          result: "pending" as const,
        })),
      );
      totalAdded += missingItems.length;
    }
  }

  if (totalAdded > 0) {
    console.log(`[Propagate] Added ${totalAdded} new checklist item(s) to active inspections`);
  } else {
    console.log("[Propagate] All active inspections are up to date");
  }
}

export async function ensureGlobalTemplatesSeed(): Promise<void> {
  try {
    // Always upsert platform checklist templates so changes reach all users immediately
    console.log("[Seed] Syncing platform checklist templates...");
    await seedBuildingSurveyorTemplates();
    await seedDisciplineChecklists();
    console.log("[Seed] Platform checklist templates synced");

    // Propagate any new items to active inspections
    await propagatePlatformUpdatesToActiveInspections();

    // Doc templates — upsert platform templates by name so discipline assignments stay current
    const existingNames = await db
      .select({ name: docTemplatesTable.name })
      .from(docTemplatesTable)
      .where(isNull(docTemplatesTable.userId));
    const existingNameSet = new Set(existingNames.map(r => r.name));

    for (const tmpl of GLOBAL_DOC_TEMPLATES) {
      if (existingNameSet.has(tmpl.name)) {
        // Update discipline on existing global templates (user_id is null)
        await db
          .update(docTemplatesTable)
          .set({ discipline: tmpl.discipline })
          .where(and(eq(docTemplatesTable.name, tmpl.name), isNull(docTemplatesTable.userId)));
      } else {
        // Insert new global template
        await db.insert(docTemplatesTable).values({
          userId: null,
          name: tmpl.name,
          content: tmpl.content,
          discipline: tmpl.discipline,
          linkedChecklistIds: JSON.stringify(tmpl.linkedChecklistIds),
        });
        console.log(`  ✓ Doc template added: ${tmpl.name}`);
      }
    }
    console.log("[Seed] Global doc templates synced");
  } catch (err) {
    console.error("[Seed] Global template seed failed — continuing without seeding:", err);
  }
}
  