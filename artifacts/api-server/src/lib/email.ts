import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "InspectProof <noreply@inspectproof.com.au>";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";

function isConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function formatDateAU(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function inspectionAssignedHtml(opts: {
  inspectorName: string;
  inspectionType: string;
  projectName: string;
  projectAddress: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  inspectionId: number;
  isReassignment?: boolean;
}): string {
  const { inspectorName, inspectionType, projectName, projectAddress, scheduledDate, scheduledTime, inspectionId, isReassignment } = opts;
  const typeLabel = inspectionType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const dateLabel = formatDateAU(scheduledDate);
  const timeLabel = scheduledTime ? ` at ${scheduledTime}` : "";
  const link = `${APP_BASE_URL}/inspections/${inspectionId}`;
  const heading = isReassignment ? "Inspection Reassigned to You" : "You've Been Assigned an Inspection";
  const intro = isReassignment
    ? `An inspection has been reassigned to you. Here are the details:`
    : `A new inspection has been assigned to you. Here are the details:`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0B1933;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">InspectProof</span>
                  </td>
                  <td align="right">
                    <span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Inspection Notice</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hi ${inspectorName},</p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0B1933;">${heading}</h1>
              <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">${intro}</p>

              <!-- Detail Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr style="border-bottom:1px solid #e5e7eb;">
                        <td style="padding:14px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;width:38%;background:#f1f5f9;">Inspection Type</td>
                        <td style="padding:14px 20px;font-size:15px;font-weight:600;color:#0B1933;">${typeLabel}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #e5e7eb;">
                        <td style="padding:14px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#f1f5f9;">Project</td>
                        <td style="padding:14px 20px;font-size:15px;color:#374151;">${projectName}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #e5e7eb;">
                        <td style="padding:14px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#f1f5f9;">Site Address</td>
                        <td style="padding:14px 20px;font-size:15px;color:#374151;">${projectAddress}</td>
                      </tr>
                      <tr>
                        <td style="padding:14px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#f1f5f9;">Scheduled</td>
                        <td style="padding:14px 20px;font-size:15px;font-weight:600;color:#466DB5;">${dateLabel}${timeLabel}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#C5D92D;border-radius:8px;">
                    <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;">
                      View Inspection Details →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                If you have any questions, please contact your team leader or reply to this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                InspectProof — a product of PlanProof Technologies Pty Ltd<br/>
                This is an automated notification. Do not reply directly.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface InspectionEmailOpts {
  inspectorName: string;
  inspectorEmail: string;
  inspectionType: string;
  projectName: string;
  projectAddress: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  inspectionId: number;
  isReassignment?: boolean;
}

export async function sendInspectionAssignedEmail(opts: InspectionEmailOpts, log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }): Promise<void> {
  if (!isConfigured()) {
    log?.warn({ smtpHost: SMTP_HOST }, "SMTP not configured — skipping inspection assignment email");
    return;
  }

  const typeLabel = opts.inspectionType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const heading = opts.isReassignment ? "Inspection Reassigned to You" : "You've Been Assigned an Inspection";

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.inspectorEmail,
      subject: `${heading} — ${typeLabel} at ${opts.projectName}`,
      html: inspectionAssignedHtml(opts),
      text: [
        `Hi ${opts.inspectorName},`,
        ``,
        `${heading}`,
        ``,
        `Inspection Type: ${typeLabel}`,
        `Project: ${opts.projectName}`,
        `Site Address: ${opts.projectAddress}`,
        `Scheduled: ${formatDateAU(opts.scheduledDate)}${opts.scheduledTime ? " at " + opts.scheduledTime : ""}`,
        ``,
        `View the inspection: ${APP_BASE_URL}/inspections/${opts.inspectionId}`,
        ``,
        `— InspectProof`,
      ].join("\n"),
    });
    log?.info({ to: opts.inspectorEmail, inspectionId: opts.inspectionId }, "Inspection assignment email sent");
  } catch (err) {
    log?.error({ err, to: opts.inspectorEmail }, "Failed to send inspection assignment email");
  }
}
