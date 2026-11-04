import nodemailer from "nodemailer";
import { logger } from "./logger";

/** Escape untrusted strings before inserting them into HTML */
function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function getAppBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return "https://tancom.replit.app";
}

function getTransport() {
  const host = process.env["EMAIL_HOST"];
  const port = parseInt(process.env["EMAIL_PORT"] ?? "587", 10);
  const user = process.env["EMAIL_USER"];
  const pass = process.env["EMAIL_PASS"];

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export interface GroupInviteEmailOptions {
  toEmail: string;
  toName: string;
  groupName: string;
  inviterName: string;
  groupId: number;
}

export async function sendGroupInviteEmail(opts: GroupInviteEmailOptions): Promise<void> {
  const { toEmail, toName, groupName, inviterName, groupId } = opts;
  const transport = getTransport();
  const from = process.env["EMAIL_FROM"] ?? process.env["EMAIL_USER"] ?? "noreply@tancom.app";
  const appUrl = getAppBaseUrl();
  const groupsUrl = `${appUrl}/groups`;

  if (!transport) {
    logger.warn(
      { toEmail, groupName },
      "Email not configured (set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS). Skipping invitation email."
    );
    return;
  }

  const safeToName      = escHtml(toName);
  const safeInviterName = escHtml(inviterName);
  const safeGroupName   = escHtml(groupName);
  const safeGroupsUrl   = encodeURI(groupsUrl);
  const safeAppUrl      = encodeURI(appUrl);
  const subject = `${inviterName} invited you to join "${groupName}" on TanCom`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:36px 40px;text-align:center;">
            <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">TanCom</p>
            <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Video Conferencing &amp; Collaboration</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#111827;">You're invited!</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${safeToName},<br><br>
              <strong>${safeInviterName}</strong> has invited you to join the group
              <strong>&ldquo;${safeGroupName}&rdquo;</strong> on TanCom.
            </p>
            <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.6;">
              TanCom lets your group meet via video, chat, share files, and stay connected — all in one place.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
              <tr>
                <td align="center" style="background:#2563eb;border-radius:10px;padding:14px 32px;">
                  <a href="${safeGroupsUrl}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">
                    View My Invitation →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
              If you don't have a TanCom account yet, you can
              <a href="${safeAppUrl}" style="color:#2563eb;">sign up for free</a>
              and then accept the invitation from your Groups page.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              You received this because ${safeInviterName} added your email to the group &ldquo;${safeGroupName}&rdquo;.<br>
              <a href="${safeAppUrl}" style="color:#9ca3af;">TanCom</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`;

  const text = `
Hi ${toName},

${inviterName} has invited you to join the group "${groupName}" on TanCom.

View your invitation here: ${groupsUrl}

If you don't have a TanCom account yet, sign up free at ${appUrl} and accept the invitation from your Groups page.

—
TanCom
`.trim();

  try {
    await transport.sendMail({ from, to: toEmail, subject, html, text });
    logger.info({ toEmail, groupName }, "Group invitation email sent");
  } catch (err) {
    logger.error({ err, toEmail, groupName }, "Failed to send group invitation email");
  }
}
