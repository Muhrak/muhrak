import type { EmailProvider } from "../email-provider";

/**
 * Local development without a Resend key: print the email instead of sending
 * it, so links (e.g. password reset) can be opened from the terminal.
 * Never used in production; see src/worker/index.ts.
 */
export function createConsoleProvider(): EmailProvider {
  return {
    name: "console",
    async send(email) {
      console.log(`\n--- email (not sent: no RESEND_API_KEY) ---\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n---\n`);
    },
  };
}
