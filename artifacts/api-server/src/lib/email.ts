import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const SMTP_FROM = process.env.SMTP_FROM || "InspectProof <noreply@inspectproof.com.au>";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";
const FEEDBACK_TO = process.env.FEEDBACK_EMAIL || "contact@inspectproof.com.au";
const IOS_APP_URL = process.env.IOS_APP_URL || "https://apps.apple.com/au/app/inspectproof";
const ANDROID_APP_URL = process.env.ANDROID_APP_URL || "https://play.google.com/store/apps/details?id=com.inspectproof";

const LOGO_URL = `${APP_BASE_URL}/logo-light.png`;

const BASE_FONT = `'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const BRAND_FONT = `'OddliniUX', 'Plus Jakarta Sans', 'Inter', Helvetica, Arial, sans-serif`;

const FONT_IMPORT = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&display=swap" rel="stylesheet" />
<style>
  @font-face {
    font-family: 'OddliniUX';
    src: url('${APP_BASE_URL}/fonts/oddlini-medium-ultra-expanded.otf') format('opentype');
    font-weight: 500;
    font-style: normal;
  }
</style>`;

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function formatDateAU(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return dateStr;
  }
}

/* ── Shared layout helpers ─────────────────────────────────── */

function emailHeader(tag: string): string {
  return `
        <tr><td style="background:#0B1933;padding:24px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="${LOGO_URL}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border:0;outline:none;" />
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:20px;font-weight:500;color:#ffffff;font-family:${BRAND_FONT};letter-spacing:0.02em;line-height:1;">InspectProof</span>
                </td>
              </tr></table>
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="font-size:11px;color:#C5D92D;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;font-family:${BASE_FONT};">${tag}</span>
            </td>
          </tr></table>
        </td></tr>`;
}

function emailWrapper(opts: {
  title: string;
  tag: string;
  width?: number;
  content: string;
  footer?: string;
}): string {
  const { title, tag, width = 600, content, footer } = opts;
  const footerText = footer ??
    "InspectProof — a product of PlanProof Technologies Pty Ltd<br/>This is an automated notification. Please do not reply directly.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${FONT_IMPORT}
</head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:${BASE_FONT};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:40px 0;">
    <tr><td align="center">
      <table width="${width}" cellpadding="0" cellspacing="0" style="max-width:${width}px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        ${emailHeader(tag)}
        <tr><td style="padding:36px 32px 32px;font-family:${BASE_FONT};">
          ${content}
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;font-family:${BASE_FONT};line-height:1.7;">${footerText}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ── Shared sub-components ─────────────────────────────────── */

function infoTable(rows: Array<{ label: string; value: string; highlight?: boolean }>): string {
  const rowsHtml = rows.map((r, i) => `
    <tr${i < rows.length - 1 ? ' style="border-bottom:1px solid #e5e7eb;"' : ""}>
      <td style="padding:13px 20px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;width:38%;background:#f1f5f9;font-family:${BASE_FONT};">${r.label}</td>
      <td style="padding:13px 20px;font-size:14px;${r.highlight ? `font-weight:700;color:#466DB5;` : `color:#1f2937;`}font-family:${BASE_FONT};">${r.value}</td>
    </tr>`).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">${rowsHtml}</table>`;
}

function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
    <tr><td style="background:#C5D92D;border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;font-family:${BASE_FONT};">${label}</a>
    </td></tr>
  </table>`;
}

function sectionTitle(text: string): string {
  return `<h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#0B1933;font-family:${BASE_FONT};line-height:1.3;">${text}</h1>`;
}

function greeting(name: string): string {
  return `<p style="margin:0 0 4px;font-size:14px;color:#6b7280;font-family:${BASE_FONT};">Hi ${name},</p>`;
}

function bodyText(text: string, extra = ""): string {
  return `<p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.7;font-family:${BASE_FONT};${extra}">${text}</p>`;
}

/* ── Inspection Assigned Email ─────────────────────────────── */

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
    ? "An inspection has been reassigned to you. Here are the details:"
    : "A new inspection has been assigned to you. Here are the details:";

  const content = `
    ${greeting(inspectorName)}
    ${sectionTitle(heading)}
    ${bodyText(intro)}
    ${infoTable([
      { label: "Inspection Type", value: typeLabel },
      { label: "Project", value: projectName },
      { label: "Site Address", value: projectAddress },
      { label: "Scheduled", value: `${dateLabel}${timeLabel}`, highlight: true },
    ])}
    ${ctaButton(link, "View Inspection Details →")}
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.7;font-family:${BASE_FONT};">If you have any questions, please contact your team leader or reply to this email.</p>`;

  return emailWrapper({
    title: heading,
    tag: isReassignment ? "Reassignment Notice" : "Inspection Notice",
    content,
  });
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

export async function sendInspectionAssignedEmail(
  opts: InspectionEmailOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) { log?.warn({}, "Resend not configured — skipping inspection email"); return; }
  const typeLabel = opts.inspectionType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const heading = opts.isReassignment ? "Inspection Reassigned to You" : "You've Been Assigned an Inspection";
  try {
    const { error } = await getResend().emails.send({
      from: SMTP_FROM,
      to: opts.inspectorEmail,
      subject: `${heading} — ${typeLabel} at ${opts.projectName}`,
      html: inspectionAssignedHtml(opts),
    });
    if (error) throw new Error(error.message);
    log?.info({ to: opts.inspectorEmail, inspectionId: opts.inspectionId }, "Inspection assignment email sent");
  } catch (err) {
    log?.error({ err, to: opts.inspectorEmail }, "Failed to send inspection assignment email");
  }
}

/* ── Feedback Notification Email ───────────────────────────── */

function feedbackNotificationHtml(opts: { senderName: string | null; senderEmail: string | null; message: string; submittedAt: string }): string {
  const { senderName, senderEmail, message, submittedAt } = opts;
  const displayName = senderName || "Anonymous user";
  const displayEmail = senderEmail || "No email provided";

  const content = `
    ${sectionTitle("New Feedback Received")}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 20px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;width:28%;background:#f1f5f9;font-family:${BASE_FONT};">From</td>
        <td style="padding:12px 20px;font-size:14px;font-weight:700;color:#0B1933;font-family:${BASE_FONT};">${displayName}</td>
      </tr>
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 20px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;background:#f1f5f9;font-family:${BASE_FONT};">Email</td>
        <td style="padding:12px 20px;font-size:14px;font-family:${BASE_FONT};"><a href="mailto:${displayEmail}" style="color:#466DB5;text-decoration:none;font-family:${BASE_FONT};">${displayEmail}</a></td>
      </tr>
      <tr>
        <td style="padding:12px 20px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;background:#f1f5f9;font-family:${BASE_FONT};">Submitted</td>
        <td style="padding:12px 20px;font-size:13px;color:#6b7280;font-family:${BASE_FONT};">${submittedAt}</td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-family:${BASE_FONT};">Message</p>
    <div style="background:#f8fafc;border-left:4px solid #C5D92D;border-radius:0 8px 8px 0;padding:20px 24px;font-size:14px;color:#374151;line-height:1.8;white-space:pre-wrap;font-family:${BASE_FONT};">${message}</div>`;

  return emailWrapper({
    title: "New Feedback",
    tag: "User Feedback",
    content,
    footer: "InspectProof — PlanProof Technologies Pty Ltd",
  });
}

export async function sendFeedbackEmail(
  opts: { senderName: string | null; senderEmail: string | null; message: string },
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) { log?.warn({}, "Resend not configured — skipping feedback email"); return; }
  const submittedAt = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
  const displayName = opts.senderName || "Anonymous user";
  try {
    const { error } = await getResend().emails.send({
      from: SMTP_FROM,
      to: FEEDBACK_TO,
      replyTo: opts.senderEmail || undefined,
      subject: `New feedback from ${displayName} — InspectProof`,
      html: feedbackNotificationHtml({ ...opts, submittedAt }),
    });
    if (error) throw new Error(error.message);
    log?.info({ to: FEEDBACK_TO }, "Feedback notification email sent");
  } catch (err) {
    log?.error({ err }, "Failed to send feedback notification email");
  }
}

/* ── App Invite Email ──────────────────────────────────────── */

function appInviteHtml(opts: { inviteeName: string | null; inviterName: string; companyName: string | null; registerUrl: string; iosUrl: string; androidUrl: string }): string {
  const { inviteeName, inviterName, companyName, registerUrl, iosUrl, androidUrl } = opts;
  const firstName = inviteeName ? inviteeName.split(" ")[0] : null;
  const displayOrg = companyName || inviterName;

  const content = `
    ${greeting(firstName ?? "there")}
    ${sectionTitle("You've Been Invited to InspectProof")}
    ${bodyText(`You have been invited by <strong>${displayOrg}</strong> for access to their inspection platform with InspectProof — Australia's built environment inspection and compliance platform.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <tr><td style="background:#f1f5f9;padding:13px 20px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#0B1933;text-transform:uppercase;letter-spacing:0.5px;font-family:${BASE_FONT};">Option 1 — Web (quickest)</p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:16px 20px;">
        <p style="margin:0 0 5px;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>1.</strong> Click <strong>Create Your Account</strong> below</p>
        <p style="margin:0 0 5px;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>2.</strong> Download the InspectProof app</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>3.</strong> Sign in with the same email &amp; password</p>
      </td></tr>
    </table>

    ${ctaButton(registerUrl, "Create Your Account →")}

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="background:#f1f5f9;padding:13px 20px;border-bottom:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#0B1933;text-transform:uppercase;letter-spacing:0.5px;font-family:${BASE_FONT};">Option 2 — App only</p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:16px 20px;">
        <p style="margin:0 0 5px;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>1.</strong> Download the InspectProof app below</p>
        <p style="margin:0 0 5px;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>2.</strong> Tap <strong>Create a new account</strong> on the login screen</p>
        <p style="margin:0 0 5px;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>3.</strong> Fill in your details and tap <strong>"I was invited by my company"</strong></p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;font-family:${BASE_FONT};"><strong>4.</strong> You're in — no plan selection needed</p>
      </td></tr>
    </table>

    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;font-family:${BASE_FONT};">Download the app:</p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${iosUrl}" style="display:inline-block;background:#0B1933;border-radius:8px;padding:10px 20px;text-decoration:none;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;vertical-align:middle;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.78 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" fill="white"/></svg>
              </td>
              <td style="vertical-align:middle;">
                <span style="display:block;font-size:10px;color:#9ca3af;line-height:1;font-family:${BASE_FONT};">Download on the</span>
                <span style="display:block;font-size:14px;font-weight:700;color:#ffffff;line-height:1.3;font-family:${BASE_FONT};">App Store</span>
              </td>
            </tr></table>
          </a>
        </td>
        <td>
          <a href="${androidUrl}" style="display:inline-block;background:#0B1933;border-radius:8px;padding:10px 20px;text-decoration:none;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:10px;vertical-align:middle;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.18 23.76C3.06 23.69 3 23.54 3 23.34V0.66C3 0.46 3.06 0.31 3.18 0.24L3.24 0.18L15.33 12L3.24 23.82L3.18 23.76ZM19.44 15.93L16.89 14.46L14.13 12L16.89 9.54L19.44 8.07C20.16 7.65 20.67 7.89 20.67 8.73V15.27C20.67 16.11 20.16 16.35 19.44 15.93ZM4.02 24L15.66 12.66L13.29 10.29L4.02 24ZM4.02 0L13.29 13.71L15.66 11.34L4.02 0Z" fill="white"/></svg>
              </td>
              <td style="vertical-align:middle;">
                <span style="display:block;font-size:10px;color:#9ca3af;line-height:1;font-family:${BASE_FONT};">Get it on</span>
                <span style="display:block;font-size:14px;font-weight:700;color:#ffffff;line-height:1.3;font-family:${BASE_FONT};">Google Play</span>
              </td>
            </tr></table>
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;font-family:${BASE_FONT};">Or copy this link into your browser:</p>
    <p style="margin:0;font-size:12px;color:#466DB5;word-break:break-all;font-family:${BASE_FONT};">${registerUrl}</p>`;

  return emailWrapper({
    title: "You've been invited to InspectProof",
    tag: "Team Invitation",
    content,
    footer: "InspectProof — a product of PlanProof Technologies Pty Ltd<br/>If you weren't expecting this invitation, you can safely ignore this email.",
  });
}

export interface AppInviteEmailOpts {
  toEmail: string;
  inviteeName: string | null;
  inviterName: string;
  companyName?: string | null;
}

export async function sendAppInviteEmail(
  opts: AppInviteEmailOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) { log?.warn({}, "Resend not configured — skipping invite email"); return; }
  const params = new URLSearchParams({ mode: "signup" });
  if (opts.companyName) params.set("company", opts.companyName);
  if (opts.inviterName) params.set("invitedBy", opts.inviterName);
  if (opts.inviteeName) params.set("name", opts.inviteeName);
  const registerUrl = `${APP_BASE_URL}/login?${params.toString()}`;
  const subject = opts.companyName
    ? `${opts.companyName} has invited you to InspectProof`
    : `${opts.inviterName} has invited you to InspectProof`;
  try {
    const { error } = await getResend().emails.send({
      from: SMTP_FROM,
      to: opts.toEmail,
      subject,
      html: appInviteHtml({ inviteeName: opts.inviteeName, inviterName: opts.inviterName, companyName: opts.companyName ?? null, registerUrl, iosUrl: IOS_APP_URL, androidUrl: ANDROID_APP_URL }),
    });
    if (error) throw new Error(error.message);
    log?.info({ to: opts.toEmail }, "App invite email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send app invite email");
  }
}

/* ── Token Invite Email ────────────────────────────────────── */

export interface TokenInviteEmailOpts {
  toEmail: string;
  inviteeName: string | null;
  inviterName: string;
  companyName: string | null;
  token: string;
}

export async function sendTokenInviteEmail(
  opts: TokenInviteEmailOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) { log?.warn({}, "Resend not configured — skipping token invite email"); return; }
  const joinUrl = `${APP_BASE_URL}/join?token=${opts.token}`;
  const firstName = opts.inviteeName ? opts.inviteeName.split(" ")[0] : null;
  const displayOrg = opts.companyName || opts.inviterName;
  const subject = opts.companyName
    ? `${opts.companyName} has invited you to InspectProof`
    : `${opts.inviterName} has invited you to InspectProof`;

  const content = `
    ${greeting(firstName ?? "there")}
    ${sectionTitle("You've Been Invited to InspectProof")}
    ${bodyText(`You have been invited by <strong>${displayOrg}</strong> to join their team on InspectProof — Australia's built environment inspection and compliance platform.`)}
    ${bodyText("Click the button below to set up your account. Your email has been pre-filled and your account will be automatically linked to your team.")}
    ${ctaButton(joinUrl, "Accept Invitation & Create Account →")}
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-family:${BASE_FONT};">This invitation link expires in 7 days. If you weren't expecting this, you can safely ignore this email.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;word-break:break-all;font-family:${BASE_FONT};">Or copy this link: ${joinUrl}</p>`;

  const html = emailWrapper({
    title: "You've been invited to InspectProof",
    tag: "Team Invitation",
    content,
    footer: "InspectProof — a product of PlanProof Technologies Pty Ltd<br/>If you weren't expecting this invitation, you can safely ignore this email.",
  });

  try {
    const { error } = await getResend().emails.send({ from: SMTP_FROM, to: opts.toEmail, subject, html });
    if (error) throw new Error(error.message);
    log?.info({ to: opts.toEmail }, "Token invite email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send token invite email");
  }
}

/* ── Welcome with Credentials Email ───────────────────────── */

export interface WelcomeWithCredentialsOpts {
  toEmail: string;
  firstName: string;
  temporaryPassword: string;
  inviterName: string;
}

function welcomeWithCredentialsHtml(opts: { firstName: string; email: string; temporaryPassword: string; inviterName: string; loginUrl: string }): string {
  const { firstName, email, temporaryPassword, inviterName, loginUrl } = opts;

  const content = `
    ${greeting(firstName)}
    ${sectionTitle("Your InspectProof Account Is Ready")}
    ${bodyText(`<strong>${inviterName}</strong> has created an account for you on InspectProof. Use the credentials below to sign in.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
      <tr><td>
        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0B1933;font-family:${BASE_FONT};">Your login credentials:</p>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;font-family:${BASE_FONT};"><strong>Email:</strong> ${email}</p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;font-family:${BASE_FONT};"><strong>Temporary Password:</strong> <span style="font-family:monospace;background:#eef2ff;padding:2px 8px;border-radius:4px;font-size:14px;">${temporaryPassword}</span></p>
        <p style="margin:0;font-size:13px;color:#6b7280;font-family:${BASE_FONT};">Please change your password after your first login.</p>
      </td></tr>
    </table>
    ${ctaButton(loginUrl, "Sign In to InspectProof →")}`;

  return emailWrapper({
    title: "Welcome to InspectProof",
    tag: "Welcome",
    content,
    footer: "InspectProof — PlanProof Technologies Pty Ltd<br/>If you weren't expecting this, please contact your team administrator.",
  });
}

export async function sendWelcomeWithCredentialsEmail(
  opts: WelcomeWithCredentialsOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) { log?.warn({}, "Resend not configured — skipping welcome email"); return; }
  const loginUrl = `${APP_BASE_URL}/login`;
  try {
    const { error } = await getResend().emails.send({
      from: SMTP_FROM,
      to: opts.toEmail,
      subject: "Welcome to InspectProof — Your account is ready",
      html: welcomeWithCredentialsHtml({ ...opts, email: opts.toEmail, loginUrl }),
    });
    if (error) throw new Error(error.message);
    log?.info({ to: opts.toEmail }, "Welcome with credentials email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send welcome with credentials email");
  }
}

/* ── Contractor Defect Report Email ─────────────────────────── */

export interface ContractorDefectReportOpts {
  toEmail: string;
  contractorName: string;
  trade: string;
  projectName: string;
  inspectionName: string;
  inspectionDate?: string | null;
  senderName: string;
  senderCompany?: string;
  defects: Array<{
    itemName: string;
    severity?: string | null;
    location?: string | null;
    recommendedAction?: string | null;
    notes?: string | null;
  }>;
}

function defectReportHtml(opts: ContractorDefectReportOpts): string {
  const { contractorName, trade, projectName, inspectionName, inspectionDate, senderName, defects } = opts;
  const dateStr = inspectionDate ? formatDateAU(inspectionDate) : "";
  const severityColour = (s?: string | null) => {
    if (!s) return "#6b7280";
    const lower = s.toLowerCase();
    if (lower === "critical") return "#dc2626";
    if (lower === "major") return "#ea580c";
    if (lower === "minor") return "#ca8a04";
    return "#6b7280";
  };
  const defectRows = defects.map((d, i) => `
    <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#ffffff"};">
      <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-family:${BASE_FONT};">${d.itemName}</td>
      <td style="padding:12px 16px;font-size:13px;border-bottom:1px solid #e5e7eb;font-family:${BASE_FONT};">
        ${d.severity ? `<span style="color:${severityColour(d.severity)};font-weight:700;font-family:${BASE_FONT};">${d.severity.charAt(0).toUpperCase() + d.severity.slice(1)}</span>` : `<span style="color:#9ca3af;font-family:${BASE_FONT};">—</span>`}
      </td>
      <td style="padding:12px 16px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${BASE_FONT};">${d.location || "—"}</td>
      <td style="padding:12px 16px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;font-family:${BASE_FONT};">${d.recommendedAction || d.notes || "—"}</td>
    </tr>`).join("");

  const content = `
    ${greeting(contractorName)}
    ${sectionTitle("Defect Items Assigned to You")}
    ${bodyText(`<strong>${senderName}</strong> has assigned the following defect items to you for rectification.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff;border-radius:10px;margin-bottom:28px;">
      <tr>
        <td style="padding:14px 20px;border-right:1px solid #dde6ff;">
          <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;font-family:${BASE_FONT};">Project</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#0B1933;font-family:${BASE_FONT};">${projectName}</p>
        </td>
        <td style="padding:14px 20px;border-right:1px solid #dde6ff;">
          <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;font-family:${BASE_FONT};">Inspection</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#0B1933;font-family:${BASE_FONT};">${inspectionName}${dateStr ? ` — ${dateStr}` : ""}</p>
        </td>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;font-family:${BASE_FONT};">Trade</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#0B1933;font-family:${BASE_FONT};">${trade || "—"}</p>
        </td>
      </tr>
    </table>

    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0B1933;font-family:${BASE_FONT};">${defects.length} Defect${defects.length !== 1 ? "s" : ""} Requiring Attention</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:28px;">
      <tr style="background:#0B1933;">
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#C5D92D;text-transform:uppercase;letter-spacing:0.6px;font-family:${BASE_FONT};">Item</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#C5D92D;text-transform:uppercase;letter-spacing:0.6px;font-family:${BASE_FONT};">Severity</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#C5D92D;text-transform:uppercase;letter-spacing:0.6px;font-family:${BASE_FONT};">Location</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#C5D92D;text-transform:uppercase;letter-spacing:0.6px;font-family:${BASE_FONT};">Action Required</th>
      </tr>
      ${defectRows}
    </table>

    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;font-family:${BASE_FONT};">
      Please review the defects above and arrange rectification works. If you have any questions, contact <strong>${senderName}</strong> directly.
    </p>`;

  return emailWrapper({
    title: "Defect Report — InspectProof",
    tag: "Defect Report",
    width: 640,
    content,
    footer: "Sent via InspectProof — Australian Building Certification Platform",
  });
}

export async function sendContractorDefectReportEmail(
  opts: ContractorDefectReportOpts,
  log?: { warn: (obj: any, msg: string) => void; error: (obj: any, msg: string) => void; info: (obj: any, msg: string) => void }
): Promise<void> {
  if (!isConfigured()) { log?.warn({}, "Resend not configured — skipping defect report email"); return; }
  const subject = `Defect Report — ${opts.projectName} (${opts.defects.length} item${opts.defects.length !== 1 ? "s" : ""})`;
  // Use the sender's company name as the display name if available, otherwise fall back to default
  const fromAddress = SMTP_FROM.match(/<(.+)>/)?.[1] ?? "noreply@inspectproof.com.au";
  const fromField = opts.senderCompany
    ? `${opts.senderCompany} <${fromAddress}>`
    : SMTP_FROM;
  try {
    const { error } = await getResend().emails.send({
      from: fromField,
      to: opts.toEmail,
      subject,
      html: defectReportHtml(opts),
    });
    if (error) throw new Error(error.message);
    log?.info({ to: opts.toEmail, project: opts.projectName }, "Contractor defect report email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send contractor defect report email");
    throw err;
  }
}
