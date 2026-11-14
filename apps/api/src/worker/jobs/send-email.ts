import { emailJobSchema } from "../../schemas";
import type { JobRow } from "../../db/schema";
import { PermanentEmailError, type EmailProvider } from "../email/email-provider";
import { renderEmail } from "../email/templates";

/** A failure that retrying cannot fix: the job stops instead of retrying. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/**
 * Run one job from the "email" queue: validate, render, send.
 * Job data is never logged: it can hold one-time links.
 */
export async function sendEmailJob(provider: EmailProvider, job: Pick<JobRow, "id" | "payload">): Promise<void> {
  const parsed = emailJobSchema.safeParse(job.payload);
  if (!parsed.success) {
    // A malformed job will never succeed; do not retry it.
    throw new PermanentJobError(`Invalid email job ${job.id}`);
  }
  const email = renderEmail(parsed.data);
  try {
    // The job id is the provider's idempotency key: a retry after a crash never sends twice.
    await provider.send({ ...email, to: parsed.data.to, idempotencyKey: job.id });
  } catch (err) {
    if (err instanceof PermanentEmailError) {
      throw new PermanentJobError(err.message);
    }
    throw err;
  }
}
