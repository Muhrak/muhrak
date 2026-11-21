import { EMAIL_QUEUE, emailJobSchema, type EmailJob } from "../../schemas";
import { env } from "../../config/env";
import { enqueueJob, type JobExecutor } from "../../shared/jobs";

/**
 * Notification module: decides WHAT to send and puts it on the queue.
 * The background worker (src/worker) renders the template and calls the
 * email provider, so a slow or failing provider never slows down a request.
 */

/**
 * Queue one email. `dedupeKey` is the job's unique key: adding the same key twice
 * is ignored, so a retried request cannot send the email twice.
 */
async function enqueueEmail(job: EmailJob, dedupeKey: string, tx?: JobExecutor): Promise<void> {
  const payload = emailJobSchema.parse(job);
  await enqueueJob(EMAIL_QUEUE, payload.template, payload, { dedupeKey, tx });
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

/**
 * Tell a seller about a new quote request. Pass the transaction that saves
 * the request, so the email exists only if the request does.
 * `dedupeKey`: the request id.
 */
export async function sendNewRfqEmail(
  input: {
    to: string;
    fullName: string;
    reference: string;
    buyerName: string;
    partName: string;
    partNumber: string | null;
    quantity: string;
    neededBy: string;
    deliverTo: string;
    rfqId: string;
  },
  tx?: JobExecutor,
): Promise<void> {
  const { to, rfqId, ...data } = input;
  await enqueueEmail(
    {
      template: "rfq-new",
      to,
      data: { ...data, inboxUrl: `${env.WEB_APP_URL}/seller/rfq-inbox?id=${encodeURIComponent(rfqId)}` },
    },
    `rfq-new-${rfqId}`,
    tx,
  );
}

/**
 * Tell a buyer about a new quotation (Day 11). Pass the transaction that
 * saves the quotation, so the email exists only if the quotation does.
 * `dedupeKey`: the quotation id.
 */
export async function sendNewQuoteEmail(
  input: {
    to: string;
    fullName: string;
    quoteId: string;
    quoteReference: string;
    rfqId: string;
    rfqReference: string;
    sellerName: string;
    partName: string;
    itemCount: number;
    total: string;
    deliveryDays: number;
    validUntil: string;
    revised: boolean;
  },
  tx?: JobExecutor,
): Promise<void> {
  const { to, quoteId, rfqId, ...data } = input;
  await enqueueEmail(
    {
      template: "quote-new",
      to,
      data: { ...data, requestUrl: `${env.WEB_APP_URL}/buyer/requests?id=${encodeURIComponent(rfqId)}` },
    },
    `quote-new-${quoteId}`,
    tx,
  );
}
