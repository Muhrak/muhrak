import type { EmailJob } from "@muhrak/schemas";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Simple, email-client-safe layout in the Muhrak light style: white card, near-black button. */
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;padding:32px;">
          <tr><td style="font-size:20px;font-weight:bold;letter-spacing:2px;padding-bottom:24px;">MUHRAK</td></tr>
          <tr><td style="font-size:24px;line-height:1.3;padding-bottom:12px;">${escapeHtml(title)}</td></tr>
          ${bodyHtml}
        </table>
        <p style="font-size:12px;color:#8e8e96;margin-top:16px;">Muhrak · Spare parts across the GCC</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderEmail(job: EmailJob): RenderedEmail {
  switch (job.template) {
    case "password-reset": {
      const { fullName, resetUrl, expiresInMinutes } = job.data;
      const url = escapeHtml(resetUrl);
      return {
        subject: "Reset your Muhrak password",
        text: [
          `Hi ${fullName},`,
          "",
          "We received a request to reset the password for your Muhrak account.",
          `Open this link to choose a new password (it works once and expires in ${expiresInMinutes} minutes):`,
          resetUrl,
          "",
          "If you did not ask for this, you can ignore this email. Your password stays the same.",
        ].join("\n"),
        html: layout(
          "Reset your password",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:24px;">
            Hi ${escapeHtml(fullName)}, we received a request to reset the password for your Muhrak account.
            The link works once and expires in ${expiresInMinutes} minutes.
          </td></tr>
          <tr><td style="padding-bottom:24px;">
            <a href="${url}" style="display:inline-block;background:#0a0b12;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px;">Choose a new password</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#6b6b73;">
            If the button does not work, copy this link into your browser:<br>
            <a href="${url}" style="color:#0a0a0a;word-break:break-all;">${url}</a><br><br>
            If you did not ask for this, ignore this email. Your password stays the same.
          </td></tr>`,
        ),
      };
    }

    case "seller-verified": {
      const { fullName, companyName, dashboardUrl } = job.data;
      const url = escapeHtml(dashboardUrl);
      return {
        subject: `${companyName} is now verified on Muhrak`,
        text: [
          `Hi ${fullName},`,
          "",
          `Good news: ${companyName} is now a verified seller on Muhrak.`,
          "Buyers see a verified badge on your store and every product.",
          "",
          `Open your Seller Centre: ${dashboardUrl}`,
        ].join("\n"),
        html: layout(
          "Your company is verified",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:24px;">
            Hi ${escapeHtml(fullName)}, good news: <strong>${escapeHtml(companyName)}</strong> is now a verified seller on Muhrak.
            Buyers see a verified badge on your store and every product.
          </td></tr>
          <tr><td style="padding-bottom:8px;">
            <a href="${url}" style="display:inline-block;background:#0a0b12;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px;">Open Seller Centre</a>
          </td></tr>`,
        ),
      };
    }

    case "seller-changes-needed": {
      const { fullName, companyName, reason, documents, verificationUrl } = job.data;
      const url = escapeHtml(verificationUrl);
      const documentLines = documents.map((doc) => `- ${doc.label}: ${doc.reason}`);
      const documentHtml = documents
        .map((doc) => `<li style="margin-bottom:6px;"><strong>${escapeHtml(doc.label)}</strong>: ${escapeHtml(doc.reason)}</li>`)
        .join("");
      return {
        subject: `Changes needed to verify ${companyName}`,
        text: [
          `Hi ${fullName},`,
          "",
          `We reviewed ${companyName} and need a few changes before we can verify it.`,
          ...(reason ? ["", reason] : []),
          ...(documentLines.length > 0 ? ["", "Documents to replace:", ...documentLines] : []),
          "",
          `Fix these and submit again: ${verificationUrl}`,
        ].join("\n"),
        html: layout(
          "Changes needed",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:16px;">
            Hi ${escapeHtml(fullName)}, we reviewed <strong>${escapeHtml(companyName)}</strong> and need a few changes before we can verify it.
          </td></tr>
          ${reason ? `<tr><td style="font-size:15px;line-height:1.5;color:#0a0a0a;padding-bottom:16px;white-space:pre-line;">${escapeHtml(reason)}</td></tr>` : ""}
          ${
            documentHtml
              ? `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:16px;">Documents to replace:<ul style="padding-left:20px;margin:8px 0 0;">${documentHtml}</ul></td></tr>`
              : ""
          }
          <tr><td style="padding-bottom:8px;">
            <a href="${url}" style="display:inline-block;background:#0a0b12;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px;">Fix and submit again</a>
          </td></tr>`,
        ),
      };
    }
  }
}
