import { EMAIL_QUEUE, emailJobSchema, type EmailJob } from "../../schemas";
import { env } from "../../config/env";
import { enqueueJob } from "../../shared/jobs";

/**
 * Notification module: decides WHAT to send and puts it on the queue.
 * The background worker (src/worker) renders the template and calls the
 * email provider, so a slow or failing provider never slows down a request.
 */

/**
 * Queue one email. `dedupeKey` is the job's unique key: adding the same key twice
 * is ignored, so a retried request cannot send the email twice.
 */
async function enqueueEmail(job: EmailJob, dedupeKey: string): Promise<void> {
  const payload = emailJobSchema.parse(job);
  await enqueueJob(EMAIL_QUEUE, payload.template, payload, { dedupeKey });
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
    `password-reset-${input.dedupeKey}`,
  );
}

/** The 6-digit code that activates a new account. `dedupeKey`: unique per code. */
export async function sendVerifyEmail(input: {
  to: string;
  fullName: string;
  code: string;
  expiresInMinutes: number;
  dedupeKey: string;
}): Promise<void> {
  await enqueueEmail(
    {
      template: "verify-email",
      to: input.to,
      data: { fullName: input.fullName, code: input.code, expiresInMinutes: input.expiresInMinutes },
    },
    `verify-email-${input.dedupeKey}`,
  );
}

/**
 * Someone signed up with this address, which already has an account. The
 * owner is told how to get in; the account itself is not changed.
 * `dedupeKey`: unique per attempt.
 */
export async function sendAccountExistsEmail(input: {
  to: string;
  fullName: string;
  loginUrl: string;
  resetUrl: string;
  dedupeKey: string;
}): Promise<void> {
  await enqueueEmail(
    {
      template: "account-exists",
      to: input.to,
      data: { fullName: input.fullName, loginUrl: input.loginUrl, resetUrl: input.resetUrl },
    },
    `account-exists-${input.dedupeKey}`,
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
