import { EMAIL_QUEUE, emailJobSchema, type EmailJob } from "@muhrak/schemas";
import { defaultJobOptions, getQueue } from "../../shared/queue";

/**
 * Notification module: decides WHAT to send and puts it on the queue.
 * The worker renders the template and calls the email provider, so a slow or
 * failing provider never slows down an API request.
 */

/**
 * Queue one email. `dedupeKey` becomes the job id: adding the same key twice
 * is ignored by BullMQ, so a retried request cannot send the email twice.
 */
async function enqueueEmail(job: EmailJob, dedupeKey: string): Promise<void> {
  const payload = emailJobSchema.parse(job);
  await getQueue(EMAIL_QUEUE).add(payload.template, payload, { ...defaultJobOptions, jobId: dedupeKey });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
  /** Unique per reset request, e.g. the reset token's database id. */
  dedupeKey: string;
}): Promise<void> {
  await enqueueEmail(
    {
      template: "password-reset",
      to: input.to,
      data: { fullName: input.fullName, resetUrl: input.resetUrl, expiresInMinutes: input.expiresInMinutes },
    },
    // BullMQ job ids may not contain ":".
    `password-reset-${input.dedupeKey}`,
  );
}
