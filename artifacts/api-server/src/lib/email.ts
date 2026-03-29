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

// ── Feedback notification ───────────────────────────────────────────────────

const FEEDBACK_TO = process.env.FEEDBACK_EMAIL || "contact@inspectproof.com.au";

function feedbackNotificationHtml(opts: { senderName: string | null; senderEmail: string | null; message: string; submittedAt: string }): string {
  const { senderName, senderEmail, message, submittedAt } = opts;
  const displayName = senderName || "Anonymous user";
  const displayEmail = senderEmail || "No email provided";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>New Feedback</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0B1933;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
              <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">User Feedback</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 24px;">
            <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0B1933;">New feedback received</h1>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:12px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;width:30%;background:#f1f5f9;">From</td>
                <td style="padding:12px 20px;font-size:15px;font-weight:600;color:#0B1933;">${displayName}</td>
              </tr>
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:12px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#f1f5f9;">Email</td>
                <td style="padding:12px 20px;font-size:15px;color:#466DB5;"><a href="mailto:${displayEmail}" style="color:#466DB5;text-decoration:none;">${displayEmail}</a></td>
              </tr>
              <tr>
                <td style="padding:12px 20px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;background:#f1f5f9;">Submitted</td>
                <td style="padding:12px 20px;font-size:14px;color:#6b7280;">${submittedAt}</td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Message</p>
            <div style="background:#f8fafc;border-left:4px solid #C5D92D;border-radius:0 8px 8px 0;padding:20px 24px;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${message}</div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">InspectProof — PlanProof Technologies Pty Ltd</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendFeedbackEmail(
  opts: { senderName: string | null; senderEmail: string | null; message: string },
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) {
    log?.warn({ smtpHost: SMTP_HOST }, "SMTP not configured — skipping feedback email");
    return;
  }
  const submittedAt = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
  const displayName = opts.senderName || "Anonymous user";
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: FEEDBACK_TO,
      replyTo: opts.senderEmail || undefined,
      subject: `New feedback from ${displayName} — InspectProof`,
      html: feedbackNotificationHtml({ ...opts, submittedAt }),
      text: [
        `New feedback from: ${displayName} <${opts.senderEmail || "no email"}>`,
        `Submitted: ${submittedAt}`,
        ``,
        opts.message,
      ].join("\n"),
    });
    log?.info({ to: FEEDBACK_TO, from: opts.senderEmail }, "Feedback notification email sent");
  } catch (err) {
    log?.error({ err }, "Failed to send feedback notification email");
  }
}

// ── App invite ──────────────────────────────────────────────────────────────

function appInviteHtml(opts: { inviteeName: string | null; inviterName: string; registerUrl: string }): string {
  const { inviteeName, inviterName, registerUrl } = opts;
  const greeting = inviteeName ? `Hi ${inviteeName.split(" ")[0]},` : "Hi there,";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>You've been invited to InspectProof</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0B1933;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
              <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Team Invitation</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 32px;">
            <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">${greeting}</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0B1933;">You've been invited to InspectProof</h1>
            <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">
              <strong>${inviterName}</strong> has added you to their team on InspectProof — Australia's built environment inspection and compliance platform.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
              <tr><td>
                <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0B1933;">To get started:</p>
                <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
                  <strong>1.</strong> Download the <strong>Expo Go</strong> app on your iPhone or Android device
                </p>
                <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
                  <strong>2.</strong> Create your account using the button below
                </p>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                  <strong>3.</strong> Sign in on the app using the same email and password
                </p>
              </td></tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#C5D92D;border-radius:8px;">
                  <a href="${registerUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;">
                    Create Your Account →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Or copy this link into your browser:</p>
            <p style="margin:0;font-size:12px;color:#466DB5;word-break:break-all;">${registerUrl}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              InspectProof — a product of PlanProof Technologies Pty Ltd<br/>
              If you weren't expecting this invitation, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface AppInviteEmailOpts {
  toEmail: string;
  inviteeName: string | null;
  inviterName: string;
}

export async function sendAppInviteEmail(
  opts: AppInviteEmailOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) {
    log?.warn({ smtpHost: SMTP_HOST }, "SMTP not configured — skipping app invite email");
    return;
  }
  const registerUrl = `${APP_BASE_URL}/register`;
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.toEmail,
      subject: `${opts.inviterName} has invited you to InspectProof`,
      html: appInviteHtml({ inviteeName: opts.inviteeName, inviterName: opts.inviterName, registerUrl }),
      text: [
        `Hi${opts.inviteeName ? ` ${opts.inviteeName.split(" ")[0]}` : ""},`,
        ``,
        `${opts.inviterName} has added you to their team on InspectProof.`,
        ``,
        `To get started:`,
        `1. Download Expo Go on your phone`,
        `2. Create your account at: ${registerUrl}`,
        `3. Sign in on the app with the same email and password`,
        ``,
        `— InspectProof`,
      ].join("\n"),
    });
    log?.info({ to: opts.toEmail }, "App invite email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send app invite email");
  }
}

// ── Welcome with credentials (admin-created accounts) ───────────────────────

function welcomeWithCredentialsHtml(opts: {
  firstName: string;
  email: string;
  temporaryPassword: string;
  inviterName: string;
  loginUrl: string;
}): string {
  const { firstName, email, temporaryPassword, inviterName, loginUrl } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Welcome to InspectProof</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0B1933;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
              <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Welcome</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 32px;">
            <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hi ${firstName},</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0B1933;">Your InspectProof Account is Ready</h1>
            <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">
              <strong>${inviterName}</strong> has created an account for you on InspectProof. Use the credentials below to sign in.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
              <tr><td>
                <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0B1933;">Your login credentials:</p>
                <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Email:</strong> ${email}</p>
                <p style="margin:0 0 16px;font-size:14px;color:#374151;"><strong>Temporary Password:</strong> <span style="font-family:monospace;background:#eef2ff;padding:2px 6px;border-radius:4px;">${temporaryPassword}</span></p>
                <p style="margin:0;font-size:13px;color:#6b7280;">Please change your password after your first login.</p>
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
              <tr><td>
                <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0B1933;">Getting started on mobile:</p>
                <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;"><strong>1.</strong> Download the <strong>Expo Go</strong> app from the App Store or Google Play</p>
                <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;"><strong>2.</strong> Open the InspectProof mobile app link below</p>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;"><strong>3.</strong> Sign in using your email and the temporary password above</p>
              </td></tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#C5D92D;border-radius:8px;">
                  <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;">
                    Sign In to InspectProof →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Or copy this link:</p>
            <p style="margin:0;font-size:12px;color:#466DB5;word-break:break-all;">${loginUrl}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">InspectProof — PlanProof Technologies Pty Ltd<br/>If you weren't expecting this, please contact your team administrator.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface WelcomeWithCredentialsOpts {
  toEmail: string;
  firstName: string;
  temporaryPassword: string;
  inviterName: string;
}

export async function sendWelcomeWithCredentialsEmail(
  opts: WelcomeWithCredentialsOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) {
    log?.warn({ smtpHost: SMTP_HOST }, "SMTP not configured — skipping welcome email");
    return;
  }
  const loginUrl = `${APP_BASE_URL}/login`;
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.toEmail,
      subject: `Welcome to InspectProof — Your account is ready`,
      html: welcomeWithCredentialsHtml({ ...opts, loginUrl }),
      text: [
        `Hi ${opts.firstName},`,
        ``,
        `${opts.inviterName} has created an InspectProof account for you.`,
        ``,
        `Email: ${opts.toEmail}`,
        `Temporary Password: ${opts.temporaryPassword}`,
        ``,
        `Sign in at: ${loginUrl}`,
        ``,
        `For mobile: download Expo Go, then open the InspectProof app and sign in with the above credentials.`,
        ``,
        `— InspectProof`,
      ].join("\n"),
    });
    log?.info({ to: opts.toEmail }, "Welcome with credentials email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send welcome with credentials email");
  }
}

// ── Inspection assignment ───────────────────────────────────────────────────

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
