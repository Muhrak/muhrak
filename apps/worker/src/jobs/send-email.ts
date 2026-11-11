import { emailJobSchema } from "@muhrak/schemas";
import { UnrecoverableError, type Job } from "bullmq";
import { PermanentEmailError, type EmailProvider } from "../email/email-provider";
import { renderEmail } from "../email/templates";

/**
 * Handle one job from the "email" queue: validate, render, send.
 * Job data is never logged: it can hold one-time links.
 */
export function createSendEmailHandler(provider: EmailProvider) {
  return async function sendEmail(job: Job): Promise<void> {
    const parsed = emailJobSchema.safeParse(job.data);
    if (!parsed.success) {
      // A malformed job will never succeed; do not retry it.
      throw new UnrecoverableError(`Invalid email job ${job.id}`);
    }
    const email = renderEmail(parsed.data);
    try {
      await provider.send({ ...email, to: parsed.data.to, idempotencyKey: String(job.id) });
    } catch (err) {
      if (err instanceof PermanentEmailError) {
        throw new UnrecoverableError(err.message);
      }
      throw err;
    }
  };
}
