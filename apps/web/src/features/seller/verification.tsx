"use client";

import {
  DOCUMENT_LABELS,
  GCC_COUNTRY_NAMES,
  type DocumentType,
  type SellerAccount,
  type SellerDocument,
} from "@/schemas";
import Link from "next/link";
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Icon, type IconName } from "@/components/layout/icon";
import { FormError } from "@/features/auth/field";
import { acceptFor, checkFile, describeRules, uploadFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getDocumentLink, useSellerAccount, useSubmitDocument, useSubmitForReview } from "./api";
import { DOCUMENT_STATUS, focusRing, inputClass, StatusChip, type Tone, VERIFICATION_STATUS } from "./parts";

/**
 * Figma "Seller – Verification" (396:6512), dark frame converted to the
 * light Seller Centre palette: status card, documents list, upload panel
 * and "Why verify".
 */

const NUMBER_LABEL: Record<DocumentType, { label: string; placeholder: string }> = {
  commercial_registration: { label: "CR number", placeholder: "e.g. 1234567" },
  vat_certificate: { label: "VAT number", placeholder: "e.g. OM1100012345" },
  owner_id: { label: "ID number", placeholder: "e.g. 12345678" },
  bank_proof: { label: "Bank and last 4 digits", placeholder: "e.g. Bank Muscat 2210" },
};

const MISSING_TEXT: Record<DocumentType, string> = {
  commercial_registration: "Your company's commercial registration (CR)",
  vat_certificate: "Needed because your company is VAT registered",
  owner_id: "National ID or passport of the owner",
  bank_proof: "A bank letter or statement in the company's name",
};

const BENEFITS = [
  "Verified badge on your store and products",
  "Rank higher when buyers search",
  "Buyers can see you are a real business",
  "Reply to quote requests from buyers across the Gulf",
];

export function Verification() {
  const account = useSellerAccount();
  if (account.isPending) {
    return <p className="text-sm text-text-muted" role="status">Loading verification…</p>;
  }
  if (account.isError) {
    return <FormError message="Could not load your verification. Reload the page to try again." />;
  }
  return <VerificationView account={account.data} />;
}

function VerificationView({ account }: { account: SellerAccount }) {
  const { profile, documents, verification } = account;
  const submit = useSubmitForReview();
  const current = new Map(documents.map((doc) => [doc.type, doc]));
  const [selected, setSelected] = useState<DocumentType>(
    verification.missingDocuments[0] ?? verification.requiredDocuments[0] ?? "commercial_registration",
  );
  const locked = verification.status === "pending";
  const canChange = Boolean(profile) && !locked;
  const showSubmit = verification.status === "draft" || verification.status === "rejected";

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2 leading-[normal]">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">Verification</h1>
          <p className="text-base text-text-muted">
            Documents that prove {profile?.companyName ?? "your company"} is a real business.
          </p>
        </div>
        {showSubmit ? (
          <button
            type="button"
            disabled={!verification.canSubmit || submit.isPending}
            onClick={() => submit.mutate()}
            className={cn(
              "flex h-[52px] items-center justify-center rounded-full bg-side-accent px-7 text-base font-semibold whitespace-nowrap text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
              focusRing,
            )}
          >
            {submit.isPending ? "Submitting…" : verification.status === "rejected" ? "Submit again" : "Submit for review"}
          </button>
        ) : null}
      </div>

      <FormError message={submit.error instanceof ApiError ? submit.error.message : submit.error ? "Could not submit. Please try again." : undefined} />

      <StatusCard account={account} />

      <div className="flex flex-1 flex-col gap-5 lg:flex-row lg:items-stretch">
        <section aria-label="Documents" className="flex min-w-0 flex-1 flex-col rounded-[24px] bg-panel px-5 py-[22px] sm:px-6">
          <h2 className="pb-2.5 text-lg leading-[normal] font-medium text-text-strong">Documents</h2>
          <ul className="flex flex-col">
            {verification.requiredDocuments.map((type, index) => (
              <DocumentRow
                key={type}
                type={type}
                doc={current.get(type)}
                submitted={verification.status !== "draft"}
                divider={index > 0}
                canChange={canChange}
                onUpload={() => setSelected(type)}
              />
            ))}
          </ul>
        </section>

        <div className="flex w-full shrink-0 flex-col gap-5 lg:w-[360px]">
          {locked ? null : (
            <UploadPanel type={selected} hasProfile={Boolean(profile)} replacing={current.has(selected)} />
          )}
          <section aria-label="Why verify" className="flex flex-1 flex-col gap-3 rounded-[24px] bg-panel px-6 py-[22px]">
            <h2 className="text-lg leading-[normal] font-medium text-text-strong">Why verify</h2>
            <ul className="flex flex-col gap-3">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2.5 text-[13px] leading-[normal] text-text-body">
                  <Icon name="check-circle" className="size-4 text-success" />
                  {benefit}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function StatusCard({ account }: { account: SellerAccount }) {
  const { profile, documents, verification } = account;
  const required = verification.requiredDocuments;
  const relevant = documents.filter((doc) => required.includes(doc.type));
  const approvedCount = relevant.filter((doc) => doc.status === "approved").length;
  const uploadedCount = required.length - verification.missingDocuments.length;
  const count = verification.status === "draft" ? uploadedCount : approvedCount;
  const countLabel = verification.status === "draft" ? "uploaded" : "approved";

  const content: Record<SellerAccount["verification"]["status"], { title: string; text: string; icon: IconName; tone: Tone; hint: string }> = {
    draft: {
      title: "Not verified yet",
      text: profile
        ? "Upload the documents below, then submit them for review."
        : "Complete your company profile first, then upload your documents.",
      icon: "file",
      tone: "neutral",
      hint: verification.missingDocuments.length > 0 ? "Upload every document to submit" : "Ready to submit for review",
    },
    pending: {
      title: "In review",
      text: "We are checking your documents. You will get an email when the review is done.",
      icon: "clock",
      tone: "warning",
      hint: "Documents are locked during the review",
    },
    approved: {
      title: "Verified seller",
      text: "Buyers see a verified badge on your store and every product.",
      icon: "check-circle",
      tone: "success",
      hint: "Changing a document starts a new review",
    },
    rejected: {
      title: "Changes needed",
      text: verification.rejectionReason ?? "Some documents were not accepted. Replace them and submit again.",
      icon: "help-circle",
      tone: "danger",
      hint: "Replace the rejected documents, then submit again",
    },
  };
  const view = content[verification.status];
  const iconBg: Record<Tone, string> = {
    success: "bg-success/16 text-success",
    warning: "bg-seller-orange/12 text-seller-orange",
    danger: "bg-destructive/12 text-destructive",
    neutral: "bg-surface text-text-body",
  };

  return (
    <section
      aria-label="Verification status"
      className="flex flex-col gap-[18px] rounded-[24px] bg-panel px-5 py-[22px] sm:flex-row sm:items-center sm:px-6"
    >
      <span className={cn("flex size-[60px] shrink-0 items-center justify-center rounded-full", iconBg[view.tone])}>
        <Icon name={view.icon} className="size-7" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[22px] font-medium text-text-strong">{view.title}</h2>
          {verification.status === "approved" && profile ? (
            <StatusChip tone="success">{GCC_COUNTRY_NAMES[profile.country]}</StatusChip>
          ) : verification.status === "pending" ? null : (
            <StatusChip tone={VERIFICATION_STATUS[verification.status].tone}>{VERIFICATION_STATUS[verification.status].label}</StatusChip>
          )}
        </div>
        <p className="text-sm break-words text-text-subtle">{view.text}</p>
        {!profile ? (
          <Link href="/seller/company-profile" className={cn("mt-1 w-fit rounded-sm text-sm font-medium text-text-strong underline", focusRing)}>
            Complete company profile
          </Link>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2 leading-[normal] sm:w-[260px]">
        <p className="text-[13px] font-medium text-text-body">
          {count} of {required.length} documents {countLabel}
        </p>
        <div
          role="progressbar"
          aria-label={`Documents ${countLabel}`}
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-valuenow={count}
          className="h-1.5 overflow-hidden rounded-full bg-black/8"
        >
          <div className="h-full rounded-full bg-success" style={{ width: `${(count / Math.max(required.length, 1)) * 100}%` }} />
        </div>
        <p className="text-xs text-text-subtle">{view.hint}</p>
      </div>
    </section>
  );
}

const TYPE_NAME: Record<string, string> = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG" };

/** e.g. "PDF · 240 KB · 12 Nov 2026" */
function fileSummary(doc: SellerDocument): string {
  const size = doc.sizeBytes >= 1024 * 1024 ? `${(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`;
  const date = new Date(doc.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return [TYPE_NAME[doc.contentType] ?? "File", size, date].join(" · ");
}

function DocumentRow({
  type,
  doc,
  submitted,
  divider,
  canChange,
  onUpload,
}: {
  type: DocumentType;
  doc: SellerDocument | undefined;
  submitted: boolean;
  divider: boolean;
  canChange: boolean;
  onUpload: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  /** Set when the browser blocked the new tab: the admin opens it with a real link instead (this page is never replaced). */
  const [blockedUrl, setBlockedUrl] = useState<string>();

  const status = !doc
    ? { label: "Required", tone: "warning" as const }
    : doc.status === "pending" && !submitted
      ? { label: "Uploaded", tone: "neutral" as const }
      : DOCUMENT_STATUS[doc.status];
  const detail =
    doc?.status === "rejected" && doc.rejectionReason
      ? doc.rejectionReason
      : doc
        ? [doc.documentNumber, fileSummary(doc)].filter(Boolean).join(" · ")
        : MISSING_TEXT[type];

  /** Open the file in a new tab through a 5-minute signed link. */
  async function view() {
    if (!doc) return;
    setError(undefined);
    setBlockedUrl(undefined);
    setOpening(true);
    // Open the tab now (inside the click), so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    try {
      const link = await getDocumentLink(doc.id);
      if (!link.url.startsWith("https://")) throw new Error("Unexpected link");
      if (tab) {
        tab.opener = null;
        tab.location.replace(link.url);
      } else {
        setBlockedUrl(link.url);
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiError ? err.message : "Could not open the document. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <li className={cn("flex flex-col gap-1", divider && "border-t border-line")}>
      <div className="flex flex-wrap items-center gap-3.5 py-[13px] sm:flex-nowrap">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-text-body">
          <Icon name="file" className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
          <p className="text-sm font-medium text-text-strong">{DOCUMENT_LABELS[type]}</p>
          <p className={cn("truncate text-xs", doc?.status === "rejected" ? "text-destructive" : "text-text-subtle")}>{detail}</p>
        </div>
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <div className="flex gap-2">
          {doc ? (
            <button
              type="button"
              onClick={view}
              disabled={opening}
              className={cn(
                "flex h-[34px] items-center justify-center rounded-full border border-black/30 px-4 text-[13px] leading-[normal] font-medium text-text-strong hover:bg-black/4 disabled:opacity-60",
                focusRing,
              )}
            >
              {opening ? "Opening…" : "View"}
            </button>
          ) : null}
          {canChange ? (
            <button
              type="button"
              onClick={onUpload}
              className={cn(
                "flex h-[34px] items-center justify-center rounded-full px-4 text-[13px] leading-[normal] font-medium",
                doc ? "border border-black/30 text-text-strong hover:bg-black/4" : "bg-side-accent text-white hover:opacity-90",
                focusRing,
              )}
            >
              {doc ? "Replace" : "Upload"}
            </button>
          ) : null}
        </div>
      </div>
      {blockedUrl ? (
        <a href={blockedUrl} target="_blank" rel="noopener noreferrer" onClick={() => setBlockedUrl(undefined)} className="w-fit pb-2 text-[13px] font-medium text-text-strong underline">
          Your browser blocked the new tab. Open the document
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="pb-2 text-[13px] leading-[normal] text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** Side card: upload (or replace) the selected document, by drag and drop or the file chooser. */
function UploadPanel({
  type,
  hasProfile,
  replacing,
}: {
  type: DocumentType;
  hasProfile: boolean;
  replacing: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const numberId = useId();
  const [documentNumber, setDocumentNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const submitDocument = useSubmitDocument();
  const disabled = !hasProfile || busy;

  async function send(file: File) {
    setDone(undefined);
    const problem = checkFile("seller_document", file);
    if (problem) return setError(problem);
    setError(undefined);
    setBusy(true);
    try {
      const uploadId = await uploadFile("seller", "seller_document", file);
      await submitDocument.mutateAsync({ type, uploadId, documentNumber: documentNumber.trim() || null });
      setDocumentNumber("");
      setDone(`${DOCUMENT_LABELS[type]} uploaded.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The upload did not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void send(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) void send(file);
  }

  return (
    <section aria-label={`Upload ${DOCUMENT_LABELS[type]}`} className="flex flex-col gap-3 rounded-[24px] bg-panel px-6 py-[22px]">
      <h2 className="text-lg leading-[normal] font-medium text-text-strong">
        {replacing ? "Replace " : ""}
        {DOCUMENT_LABELS[type]}
      </h2>

      {!hasProfile ? (
        <p className="text-sm leading-normal text-text-muted">
          <Link href="/seller/company-profile" className={cn("rounded-sm font-medium text-text-strong underline", focusRing)}>
            Complete your company profile
          </Link>{" "}
          before uploading documents.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={numberId} className="flex items-center gap-1.5 leading-[normal]">
            <span className="text-sm font-medium text-text-strong">{NUMBER_LABEL[type].label}</span>
            <span className="text-[13px] text-text-subtle">Optional</span>
          </label>
          <input
            id={numberId}
            value={documentNumber}
            maxLength={64}
            placeholder={NUMBER_LABEL[type].placeholder}
            onChange={(event) => setDocumentNumber(event.target.value)}
            disabled={busy}
            className={cn(inputClass, "h-11 text-[15px]")}
          />
        </div>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-disabled={disabled}
        className={cn(
          "flex flex-col items-center gap-2 rounded-[16px] border-[1.5px] border-dashed px-4 py-[22px] text-center leading-[normal]",
          dragging ? "border-side-accent bg-seller-orange/5" : "border-black/22",
          disabled && "opacity-50",
        )}
      >
        <Icon name="upload" className="size-[22px] text-text-strong" />
        <p className="text-sm font-medium text-text-strong">{busy ? "Uploading…" : "Drop the file here"}</p>
        <p className="text-xs text-text-subtle">{describeRules("seller_document")}</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex h-[34px] items-center justify-center rounded-full bg-sidebar-bg px-4 text-[13px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed",
            focusRing,
          )}
        >
          Browse files
        </button>
        <input ref={fileInput} type="file" accept={acceptFor("seller_document")} className="hidden" onChange={onChange} />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] leading-[normal] text-destructive">
          {error}
        </p>
      ) : done ? (
        <p role="status" className="text-[13px] leading-[normal] text-text-muted">
          {done}
        </p>
      ) : null}
    </section>
  );
}
