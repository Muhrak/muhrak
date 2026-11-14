import { PermanentEmailError, type EmailProvider, type OutgoingEmail } from "../email-provider";

/**
 * Resend over its REST API (https://resend.com/docs/api-reference/emails/send-email).
 * Plain fetch, no SDK. 4xx answers other than 429 are permanent; everything
 * else is thrown as a normal error so BullMQ retries it.
 */
export function createResendProvider(options: { apiKey: string; from: string }): EmailProvider {
  return {
    name: "resend",
    async send(email: OutgoingEmail) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (response.ok) return;

      const detail = await response.text().catch(() => "");
      const message = `Resend answered ${response.status}: ${detail.slice(0, 300)}`;
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new PermanentEmailError(message);
      }
      throw new Error(message);
    },
  };
}
