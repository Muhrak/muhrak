import type { EmailJob } from "../../schemas";

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

    case "verify-email": {
      const { fullName, code, expiresInMinutes } = job.data;
      return {
        subject: `${code} is your Muhrak verification code`,
        text: [
          `Hi ${fullName},`,
          "",
          "Welcome to Muhrak. Enter this code to verify your email and activate your account:",
          "",
          code,
          "",
          `It works once and expires in ${expiresInMinutes} minutes. Never share it: Muhrak will never ask you for it.`,
          "",
          "If you did not create a Muhrak account, ignore this email. Nothing will be activated.",
        ].join("\n"),
        html: layout(
          "Verify your email",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:20px;">
            Hi ${escapeHtml(fullName)}, welcome to Muhrak. Enter this code to verify your email and activate your account.
          </td></tr>
          <tr><td style="padding-bottom:20px;">
            <div style="display:inline-block;background:#f5f5f7;border-radius:16px;padding:16px 24px;font-size:32px;font-weight:bold;letter-spacing:10px;color:#0a0b12;font-family:'Courier New',Courier,monospace;">${escapeHtml(code)}</div>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#6b6b73;">
            The code works once and expires in ${expiresInMinutes} minutes. Never share it: Muhrak will never ask you for it.<br><br>
            If you did not create a Muhrak account, ignore this email. Nothing will be activated.
          </td></tr>`,
        ),
      };
    }

    case "account-exists": {
      const { fullName, loginUrl, resetUrl } = job.data;
      return {
        subject: "You already have a Muhrak account",
        text: [
          `Hi ${fullName},`,
          "",
          "Someone tried to sign up for Muhrak with this email, but you already have an account.",
          `Log in: ${loginUrl}`,
          `Forgot your password? Reset it: ${resetUrl}`,
          "",
          "If this was not you, you can ignore this email. Your account has not changed.",
        ].join("\n"),
        html: layout(
          "You already have an account",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:24px;">
            Hi ${escapeHtml(fullName)}, someone tried to sign up for Muhrak with this email, but you already have an account.
          </td></tr>
          <tr><td style="padding-bottom:16px;">
            <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#0a0b12;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px;">Log in</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#6b6b73;">
            Forgot your password? <a href="${escapeHtml(resetUrl)}" style="color:#0a0a0a;">Reset it here</a>.<br><br>
            If this was not you, ignore this email. Your account has not changed.
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

    case "rfq-new": {
      const { fullName, reference, buyerName, partName, partNumber, quantity, neededBy, deliverTo, inboxUrl } = job.data;
      const url = escapeHtml(inboxUrl);
      const rows: [string, string][] = [
        ["Part", partName],
        ...(partNumber ? ([["Part number", partNumber]] as [string, string][]) : []),
        ["Quantity", quantity],
        ["Needed by", neededBy],
        ["Deliver to", deliverTo],
        ["Buyer", buyerName],
      ];
      const rowHtml = rows
        .map(
          ([label, value]) =>
            `<tr><td style="font-size:13px;color:#6b6b73;padding:6px 16px 6px 0;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="font-size:14px;color:#0a0a0a;padding:6px 0;">${escapeHtml(value)}</td></tr>`,
        )
        .join("");
      return {
        subject: `New quote request ${reference}: ${partName}`,
        text: [
          `Hi ${fullName},`,
          "",
          `A buyer asked you for a quote on Muhrak (${reference}).`,
          "",
          ...rows.map(([label, value]) => `${label}: ${value}`),
          "",
          `Open it in your RFQ inbox: ${inboxUrl}`,
          "",
          "Requests close by themselves after 7 days without a reply.",
        ].join("\n"),
        html: layout(
          "New quote request",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:16px;">
            Hi ${escapeHtml(fullName)}, a buyer asked you for a quote on Muhrak (${escapeHtml(reference)}).
          </td></tr>
          <tr><td style="padding-bottom:20px;"><table role="presentation" cellpadding="0" cellspacing="0">${rowHtml}</table></td></tr>
          <tr><td style="padding-bottom:16px;">
            <a href="${url}" style="display:inline-block;background:#0a0b12;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px;">Open RFQ inbox</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#6b6b73;">Requests close by themselves after 7 days without a reply.</td></tr>`,
        ),
      };
    }
    case "quote-new": {
      const { fullName, quoteReference, rfqReference, sellerName, partName, itemCount, total, deliveryDays, validUntil, revised, requestUrl } = job.data;
      const url = escapeHtml(requestUrl);
      const rows: [string, string][] = [
        ["From", sellerName],
        ["For", itemCount > 1 ? `${partName} and ${itemCount - 1} more item${itemCount > 2 ? "s" : ""}` : partName],
        ["Total", total],
        ["Delivery", `${deliveryDays} day${deliveryDays === 1 ? "" : "s"} after payment`],
        ["Valid until", validUntil],
      ];
      const rowHtml = rows
        .map(
          ([label, value]) =>
            `<tr><td style="font-size:13px;color:#6b6b73;padding:6px 16px 6px 0;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="font-size:14px;color:#0a0a0a;padding:6px 0;${label === "Total" ? "font-weight:bold;" : ""}">${escapeHtml(value)}</td></tr>`,
        )
        .join("");
      const intro = revised
        ? `${sellerName} sent you a revised quotation (${quoteReference}) for your request ${rfqReference}. It replaces their earlier one.`
        : `${sellerName} sent you a quotation (${quoteReference}) for your request ${rfqReference}.`;
      return {
        subject: `${revised ? "Revised quotation" : "New quotation"} ${quoteReference} from ${sellerName}`,
        text: [
          `Hi ${fullName},`,
          "",
          intro,
          "",
          ...rows.map(([label, value]) => `${label}: ${value}`),
          "",
          `See the quotation and download the PDF: ${requestUrl}`,
          "",
          "Pay only on Muhrak. Payments made outside Muhrak are not protected.",
        ].join("\n"),
        html: layout(
          revised ? "Revised quotation" : "New quotation",
          `<tr><td style="font-size:15px;line-height:1.5;color:#3a3a40;padding-bottom:16px;">
            Hi ${escapeHtml(fullName)}, ${escapeHtml(intro)}
          </td></tr>
          <tr><td style="padding-bottom:20px;"><table role="presentation" cellpadding="0" cellspacing="0">${rowHtml}</table></td></tr>
          <tr><td style="padding-bottom:16px;">
            <a href="${url}" style="display:inline-block;background:#0a0b12;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 28px;border-radius:999px;">See the quotation</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#6b6b73;">Pay only on Muhrak. Payments made outside Muhrak are not protected.</td></tr>`,
        ),
      };
    }
  }
}
