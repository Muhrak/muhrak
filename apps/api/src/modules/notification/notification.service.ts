import { EMAIL_QUEUE, emailJobSchema, type EmailJob } from "@muhrak/schemas";
import { env } from "../../config/env";
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

/** Tell a seller their company was verified. `dedupeKey`: unique per decision. */
export async function sendSellerVerifiedEmail(input: {
  to: string;
  fullName: string;
  companyName: string;
  dedupeKey: string;
}): Promise<void> {
  await enqueueEmail(
    {
      template: "seller-verified",
      to: input.to,
      data: {
        fullName: input.fullName,
        companyName: input.companyName,
        dashboardUrl: `${env.WEB_APP_URL}/seller/verification`,
      },
    },
    `seller-verified-${input.dedupeKey}`,
  );
}

/** Tell a seller what to fix before they can be verified. `dedupeKey`: unique per decision. */
export async function sendSellerChangesNeededEmail(input: {
  to: string;
  fullName: string;
  companyName: string;
  reason: string | null;
  documents: { label: string; reason: string }[];
  dedupeKey: string;
}): Promise<void> {
  await enqueueEmail(
    {
      template: "seller-changes-needed",
      to: input.to,
      data: {
        fullName: input.fullName,
        companyName: input.companyName,
        reason: input.reason,
        documents: input.documents,
        verificationUrl: `${env.WEB_APP_URL}/seller/verification`,
      },
    },
    `seller-changes-needed-${input.dedupeKey}`,
  );
}
