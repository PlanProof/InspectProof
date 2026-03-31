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

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0B1933;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
            <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Inspection Notice</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 32px 24px;">
          <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hi ${inspectorName},</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0B1933;">${heading}</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">${intro}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
            <tr><td style="padding:0;">
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
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#C5D92D;border-radius:8px;">
              <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;">View Inspection Details →</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">If you have any questions, please contact your team leader or reply to this email.</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">InspectProof — a product of PlanProof Technologies Pty Ltd<br/>This is an automated notification. Do not reply directly.</p>
        </td></tr>
      </table>
    </td></tr>
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
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>New Feedback</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0B1933;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
            <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">User Feedback</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 32px 24px;">
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
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">InspectProof — PlanProof Technologies Pty Ltd</p>
        </td></tr>
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
  const greeting = inviteeName ? `Hi ${inviteeName.split(" ")[0]},` : "Hi there,";
  const displayOrg = companyName || inviterName;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>You've been invited to InspectProof</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0B1933;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
            <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Team Invitation</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 32px 32px;">
          <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">${greeting}</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0B1933;">You've been invited to InspectProof</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">
            You have been invited by <strong>${displayOrg}</strong> for access to their inspection platform with InspectProof — Australia's built environment inspection and compliance platform.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="background:#f1f5f9;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#0B1933;text-transform:uppercase;letter-spacing:0.5px;">Option 1 — Web (quickest)</p>
            </td></tr>
            <tr><td style="background:#f8fafc;padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;"><strong>1.</strong> Click <strong>Create Your Account</strong> below</p>
              <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;"><strong>2.</strong> Download the InspectProof app</p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;"><strong>3.</strong> Sign in with the same email &amp; password</p>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background:#C5D92D;border-radius:8px;">
              <a href="${registerUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;">Create Your Account →</a>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
            <tr><td style="background:#f1f5f9;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#0B1933;text-transform:uppercase;letter-spacing:0.5px;">Option 2 — App only</p>
            </td></tr>
            <tr><td style="background:#f8fafc;padding:16px 20px;">
              <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;"><strong>1.</strong> Download the InspectProof app below</p>
              <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;"><strong>2.</strong> Tap <strong>Create a new account</strong> on the login screen</p>
              <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;"><strong>3.</strong> Fill in your details and tap <strong>"I was invited by my company"</strong></p>
              <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;"><strong>4.</strong> You're in — no plan selection needed</p>
            </td></tr>
          </table>
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;">Download the app:</p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="padding-right:12px;">
                <a href="${iosUrl}" style="display:inline-block;background:#0B1933;border-radius:8px;padding:10px 20px;text-decoration:none;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="padding-right:10px;vertical-align:middle;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 22C7.78 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" fill="white"/></svg>
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="display:block;font-size:10px;color:#9ca3af;line-height:1;">Download on the</span>
                      <span style="display:block;font-size:15px;font-weight:700;color:#ffffff;line-height:1.3;">App Store</span>
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
                      <span style="display:block;font-size:10px;color:#9ca3af;line-height:1;">Get it on</span>
                      <span style="display:block;font-size:15px;font-weight:700;color:#ffffff;line-height:1.3;">Google Play</span>
                    </td>
                  </tr></table>
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;color:#466DB5;word-break:break-all;">${registerUrl}</p>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
            InspectProof — a product of PlanProof Technologies Pty Ltd<br/>
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </td></tr>
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

/* ── Welcome with Credentials Email ───────────────────────── */

export interface WelcomeWithCredentialsOpts {
  toEmail: string;
  firstName: string;
  temporaryPassword: string;
  inviterName: string;
}

function welcomeWithCredentialsHtml(opts: { firstName: string; email: string; temporaryPassword: string; inviterName: string; loginUrl: string }): string {
  const { firstName, email, temporaryPassword, inviterName, loginUrl } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Welcome to InspectProof</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0B1933;padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:20px;font-weight:700;color:#ffffff;">InspectProof</span></td>
            <td align="right"><span style="font-size:12px;color:#C5D92D;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Welcome</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:36px 32px 32px;">
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
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#C5D92D;border-radius:8px;">
              <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0B1933;text-decoration:none;border-radius:8px;">Sign In to InspectProof →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:20px 32px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">InspectProof — PlanProof Technologies Pty Ltd<br/>If you weren't expecting this, please contact your team administrator.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
      html: welcomeWithCredentialsHtml({ ...opts, loginUrl }),
    });
    if (error) throw new Error(error.message);
    log?.info({ to: opts.toEmail }, "Welcome with credentials email sent");
  } catch (err) {
    log?.error({ err, to: opts.toEmail }, "Failed to send welcome with credentials email");
  }
}
