"use client";

import { DOCUMENT_LABELS, GCC_COUNTRY_NAMES, type AdminSellerDetail, type SellerDocument } from "@/schemas";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/layout/icon";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getDocumentLink, useReviewSeller, useReviewSellerUpdate, useSellerDetail } from "./api";
import { Avatar, DOCUMENT_STATUS, focusRing, formatDate, Panel, place, StatusChip, VERIFICATION } from "./parts";
import { LogoLoader } from "@/components/ui/logo-loader";
import { useToast } from "@/components/ui/toast";

/**
 * Review one seller: company details, every document (open it, then
 * approve or reject with a reason), the decision, and the history.
 * No Figma frame exists for this page; it follows the "Admin – Sellers"
 * and "Seller – Verification" styles.
 */
export function ReviewPage({ userId }: { userId: string }) {
  const detail = useSellerDetail(userId);
  return (
    <>
      <Link href="/admin/sellers" className={cn("flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-text-muted hover:text-text-strong", focusRing)}>
        <ArrowLeft aria-hidden className="size-4" />
        Sellers
      </Link>
      {detail.isPending ? (
        <LogoLoader className="py-16" />
      ) : detail.isError ? (
        <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {detail.error instanceof ApiError && detail.error.status === 404 ? "This seller does not exist." : "Could not load this seller. Reload the page."}
        </p>
      ) : (
        // Re-mount the form when the server data changes, so stale choices never survive.
        <Review
          key={[
            detail.data.verification.status,
            ...detail.data.documents.map((d) => d.id + d.status),
            ...detail.data.documentUpdates.map((d) => d.id + d.status),
            detail.data.profileUpdate ? detail.data.profileUpdate.id + detail.data.profileUpdate.status : "",
          ].join()}
          seller={detail.data}
        />
      )}
    </>
  );
}

type Choice = { status: "approved" | "rejected" | null; reason: string };

function Review({ seller }: { seller: AdminSellerDetail }) {
  const { profile, user, documents, verification, history } = seller;
  const review = useReviewSeller(user.id);
  const toast = useToast();
  const pending = verification.status === "pending";
  const current = documents.filter((doc) => verification.requiredDocuments.includes(doc.type));
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(current.map((doc) => [doc.id, { status: null, reason: "" }])),
  );
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string>();

  const decided = current.every((doc) => choices[doc.id]?.status);
  const allApproved = current.every((doc) => choices[doc.id]?.status === "approved");
  const missingReason = current.some((doc) => choices[doc.id]?.status === "rejected" && !choices[doc.id]?.reason.trim());

  function submit(decision: "approve" | "reject") {
    setLocalError(undefined);
    if (!decided) return setLocalError("Approve or reject every document first.");
    if (missingReason) return setLocalError("Give a reason for every rejected document.");
    if (decision === "reject" && !reason.trim()) return setLocalError("Write the reason the seller will see.");
    review.mutate({
      decision,
      reason: decision === "reject" ? reason.trim() : undefined,
      documents: current.map((doc) => ({
        id: doc.id,
        status: choices[doc.id]!.status!,
        reason: choices[doc.id]!.status === "rejected" ? choices[doc.id]!.reason.trim() : undefined,
      })),
    }, {
      onSuccess: () => toast.success(decision === "approve" ? "Seller approved." : "Seller rejected.", "The seller gets an email."),
    });
  }

  const serverError = review.error ? (review.error instanceof ApiError ? review.error.message : "Something went wrong. Please try again.") : undefined;

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={profile.companyName} onSurface />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 leading-[normal]">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] break-words text-text-strong sm:text-[36px]">{profile.companyName}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusChip tone={VERIFICATION[verification.status].tone}>{VERIFICATION[verification.status].label}</StatusChip>
            <p className="text-sm text-text-muted">
              {place(profile.country, profile.city)}
              {verification.submittedAt ? ` · submitted ${formatDate(verification.submittedAt)}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Panel label="Documents">
            <h2 className="pb-2 text-lg leading-[normal] font-medium text-text-strong">Documents</h2>
            {!pending ? (
              <p className="pb-2 text-sm text-text-muted">
                {verification.status === "draft"
                  ? "The seller has not submitted for review yet."
                  : verification.status === "approved"
                    ? "The documents in force. Files the seller replaces appear under Updates to review."
                    : "Decisions can only be made while the seller is in review."}
              </p>
            ) : null}
            <ul className="flex flex-col">
              {current.map((doc, index) => (
                <DocumentRow
                  key={doc.id}
                  sellerId={user.id}
                  doc={doc}
                  divider={index > 0}
                  editable={pending}
                  choice={choices[doc.id]!}
                  onChange={(choice) => setChoices((previous) => ({ ...previous, [doc.id]: choice }))}
                />
              ))}
            </ul>
            {verification.missingDocuments.length > 0 ? (
              <p className="pt-2 text-sm text-text-muted">
                Not uploaded: {verification.missingDocuments.map((type) => DOCUMENT_LABELS[type]).join(", ")}
              </p>
            ) : null}
          </Panel>

          {verification.status === "approved" ? <UpdatesPanel seller={seller} /> : null}

          {pending ? (
            <Panel label="Decision" className="gap-4">
              <h2 className="text-lg leading-[normal] font-medium text-text-strong">Decision</h2>
              <div className="flex flex-col gap-2">
                <label htmlFor="reason" className="flex items-center gap-1.5 text-sm font-medium text-text-strong">
                  Message to the seller <span className="text-[13px] font-normal text-text-subtle">Required to reject</span>
                </label>
                <textarea
                  id="reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. Your commercial registration has expired. Please upload the renewed certificate."
                  className={cn("w-full resize-none rounded-[12px] border border-line px-4 py-3 text-[15px] text-text-strong placeholder:text-text-subtle", focusRing)}
                />
              </div>
              {localError || serverError ? (
                <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {localError ?? serverError}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => submit("reject")}
                  className={cn("h-11 rounded-full border border-destructive/60 px-5 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60", focusRing)}
                >
                  Reject seller
                </button>
                <button
                  type="button"
                  disabled={review.isPending || !allApproved}
                  title={allApproved ? undefined : "Approve every document first"}
                  onClick={() => submit("approve")}
                  className={cn("h-11 rounded-full bg-sidebar-bg px-5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40", focusRing)}
                >
                  {review.isPending ? "Saving…" : "Approve seller"}
                </button>
              </div>
            </Panel>
          ) : verification.rejectionReason ? (
            <Panel label="Last decision">
              <h2 className="pb-2 text-lg leading-[normal] font-medium text-text-strong">Message sent to the seller</h2>
              <p className="text-sm whitespace-pre-line text-text-body">{verification.rejectionReason}</p>
            </Panel>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-5 lg:w-[360px]">
          <Panel label="Company" className="gap-3">
            <h2 className="text-lg leading-[normal] font-medium text-text-strong">Company</h2>
            {profile.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
              <img src={profile.logo.url} alt={`${profile.companyName} logo`} className="size-16 rounded-[16px] object-cover" referrerPolicy="no-referrer" />
            ) : null}
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm leading-normal">
              <dt className="text-text-subtle">Account</dt>
              <dd className="break-words text-text-strong">
                {user.fullName}
                <br />
                <span className="text-text-muted">{user.email}</span>
              </dd>
              <dt className="text-text-subtle">Phone</dt>
              <dd className="text-text-strong">{profile.phone}</dd>
              <dt className="text-text-subtle">Country</dt>
              <dd className="text-text-strong">{GCC_COUNTRY_NAMES[profile.country]}</dd>
              <dt className="text-text-subtle">City</dt>
              <dd className="text-text-strong">{profile.city}</dd>
              <dt className="text-text-subtle">VAT registered</dt>
              <dd className="text-text-strong">{profile.vatRegistered ? "Yes" : "No"}</dd>
              <dt className="text-text-subtle">Website</dt>
              <dd className="break-all text-text-strong">
                {profile.website ? (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                    {profile.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "–"
                )}
              </dd>
              <dt className="text-text-subtle">Brands</dt>
              <dd className="text-text-strong">{profile.brands.length ? profile.brands.join(", ") : "–"}</dd>
              <dt className="text-text-subtle">Joined</dt>
              <dd className="text-text-strong">{formatDate(user.createdAt)}</dd>
            </dl>
            {profile.about ? <p className="border-t border-line pt-3 text-sm whitespace-pre-line text-text-body">{profile.about}</p> : null}
          </Panel>

          <Panel label="History" className="gap-3">
            <h2 className="text-lg leading-[normal] font-medium text-text-strong">History</h2>
            {history.length === 0 ? (
              <p className="text-sm text-text-muted">No changes yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {history.map((event, index) => (
                  <li key={index} className="flex flex-col gap-0.5 text-sm leading-normal">
                    <p className="text-text-strong">
                      {VERIFICATION[event.toStatus].label}
                      <span className="text-text-subtle"> · {event.actorRole === "admin" ? event.actorName : "Seller"}</span>
                    </p>
                    <p className="text-xs text-text-subtle">{new Date(event.createdAt).toLocaleString("en-GB")}</p>
                    {event.reason ? <p className="text-[13px] text-text-body">{event.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * A verified seller's updates (21 Nov 2026): replaced documents and new
 * company details, each approved or rejected with a reason. The seller stays
 * verified either way; an approved document replaces the old one.
 */
function UpdatesPanel({ seller }: { seller: AdminSellerDetail }) {
  const { user, profile, documentUpdates, profileUpdate } = seller;
  const waitingDocs = documentUpdates.filter((doc) => doc.status === "pending");
  const waitingProfile = profileUpdate?.status === "pending" ? profileUpdate : null;
  const review = useReviewSellerUpdate(user.id);
  const toast = useToast();
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries([...waitingDocs.map((doc) => doc.id), ...(waitingProfile ? [waitingProfile.id] : [])].map((id) => [id, { status: null, reason: "" }])),
  );
  const [localError, setLocalError] = useState<string>();
  if (waitingDocs.length === 0 && !waitingProfile) {
    const rejected = [...documentUpdates.filter((doc) => doc.status === "rejected").map((doc) => DOCUMENT_LABELS[doc.type]), ...(profileUpdate?.status === "rejected" ? ["Company details"] : [])];
    return rejected.length ? (
      <Panel label="Updates">
        <h2 className="pb-1 text-lg leading-[normal] font-medium text-text-strong">Updates</h2>
        <p className="text-sm text-text-muted">Not accepted, waiting for the seller: {rejected.join(", ")}.</p>
      </Panel>
    ) : null;
  }
  const ids = Object.keys(choices);
  const decided = ids.every((id) => choices[id]?.status);
  const missingReason = ids.some((id) => choices[id]?.status === "rejected" && !choices[id]?.reason.trim());

  function submit() {
    setLocalError(undefined);
    if (!decided) return setLocalError("Approve or reject every update first.");
    if (missingReason) return setLocalError("Give a reason for every rejected update.");
    const decision = (id: string) => ({ id, status: choices[id]!.status!, reason: choices[id]!.status === "rejected" ? choices[id]!.reason.trim() : undefined });
    review.mutate(
      { profileUpdate: waitingProfile ? decision(waitingProfile.id) : null, documents: waitingDocs.map((doc) => decision(doc.id)) },
      { onSuccess: () => toast.success("Updates decided.", "The seller gets an email. They stay verified.") },
    );
  }
  const serverError = review.error ? (review.error instanceof ApiError ? review.error.message : "Something went wrong. Please try again.") : undefined;

  return (
    <Panel label="Updates to review" className="gap-3">
      <div className="flex flex-col gap-1 leading-[normal]">
        <h2 className="text-lg font-medium text-text-strong">Updates to review</h2>
        <p className="text-[13px] text-text-subtle">The seller stays verified. Approving a document replaces the one in force; rejecting keeps it.</p>
      </div>
      <ul className="flex flex-col">
        {waitingProfile ? (
          <li className="flex flex-col gap-2.5 py-3.5">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-text-body">
                <Icon name="file" className="size-[18px]" />
              </span>
              <div className="flex min-w-[160px] flex-1 flex-col gap-1 text-sm leading-[normal]">
                <p className="font-medium text-text-strong">Company details</p>
                <ChangeLine label="Name" from={profile.companyName} to={waitingProfile.companyName} />
                <ChangeLine label="Country" from={GCC_COUNTRY_NAMES[profile.country]} to={GCC_COUNTRY_NAMES[waitingProfile.country]} />
                <ChangeLine label="VAT registered" from={profile.vatRegistered ? "Yes" : "No"} to={waitingProfile.vatRegistered ? "Yes" : "No"} />
              </div>
              <DecisionToggle
                label="Company details"
                choice={choices[waitingProfile.id]!}
                onChange={(choice) => setChoices((previous) => ({ ...previous, [waitingProfile.id]: choice }))}
              />
            </div>
            {choices[waitingProfile.id]?.status === "rejected" ? (
              <ReasonInput label="Company details" choice={choices[waitingProfile.id]!} onChange={(choice) => setChoices((previous) => ({ ...previous, [waitingProfile.id]: choice }))} />
            ) : null}
          </li>
        ) : null}
        {waitingDocs.map((doc, index) => (
          <DocumentRow
            key={doc.id}
            sellerId={user.id}
            doc={doc}
            divider={index > 0 || Boolean(waitingProfile)}
            editable
            choice={choices[doc.id]!}
            onChange={(choice) => setChoices((previous) => ({ ...previous, [doc.id]: choice }))}
            note={doc.type === "bank_proof" ? "New bank details: payouts to this seller are paused until approved." : "Replaces the document in force."}
          />
        ))}
      </ul>
      {localError || serverError ? (
        <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {localError ?? serverError}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={review.isPending}
          onClick={submit}
          className={cn("h-11 rounded-full bg-sidebar-bg px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60", focusRing)}
        >
          {review.isPending ? "Saving…" : "Save decisions"}
        </button>
      </div>
    </Panel>
  );
}

function ChangeLine({ label, from, to }: { label: string; from: string; to: string }) {
  if (from === to) return <p className="text-text-subtle">{label}: {from}</p>;
  return (
    <p className="text-text-body">
      {label}: <span className="text-text-subtle line-through">{from}</span> → <span className="font-medium text-text-strong">{to}</span>
    </p>
  );
}

function DecisionToggle({ label, choice, onChange }: { label: string; choice: Choice; onChange: (choice: Choice) => void }) {
  return (
    <div role="radiogroup" aria-label={`Decision for ${label}`} className="flex gap-1 rounded-full bg-surface p-1">
      {(["approved", "rejected"] as const).map((status) => (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={choice.status === status}
          onClick={() => onChange({ ...choice, status })}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
            choice.status === status ? (status === "approved" ? "bg-sidebar-bg text-white" : "bg-destructive text-white") : "text-text-muted hover:text-text-strong",
            focusRing,
          )}
        >
          {status === "approved" ? "Approve" : "Reject"}
        </button>
      ))}
    </div>
  );
}

function ReasonInput({ label, choice, onChange }: { label: string; choice: Choice; onChange: (choice: Choice) => void }) {
  return (
    <input
      aria-label={`Why ${label} is rejected`}
      value={choice.reason}
      maxLength={300}
      onChange={(event) => onChange({ ...choice, reason: event.target.value })}
      placeholder="Reason the seller will see"
      className={cn("h-10 w-full rounded-[10px] border border-line px-3.5 text-sm text-text-strong placeholder:text-text-subtle sm:ml-[54px] sm:w-[calc(100%-54px)]", focusRing)}
    />
  );
}

function DocumentRow({
  sellerId,
  doc,
  divider,
  editable,
  choice,
  onChange,
  note,
}: {
  sellerId: string;
  doc: SellerDocument;
  divider: boolean;
  editable: boolean;
  choice: Choice;
  onChange: (choice: Choice) => void;
  /** Extra line under the file details (updates). */
  note?: string;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  /** Set when the browser blocked the new tab: the admin opens it with a real link instead (this page is never replaced). */
  const [blockedUrl, setBlockedUrl] = useState<string>();

  /** Open the file in a new tab through a 5-minute signed link (audit logged by the API). */
  async function view() {
    setError(undefined);
    setBlockedUrl(undefined);
    setOpening(true);
    const tab = window.open("", "_blank");
    try {
      const link = await getDocumentLink(sellerId, doc.id);
      if (!link.url.startsWith("https://")) throw new Error("Unexpected link");
      if (tab) {
        tab.opener = null;
        tab.location.replace(link.url);
      } else {
        setBlockedUrl(link.url);
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiError ? err.message : "Could not open the document.");
    } finally {
      setOpening(false);
    }
  }

  const fileType = { "application/pdf": "PDF", "image/jpeg": "JPG", "image/png": "PNG" }[doc.contentType] ?? "File";
  const size = doc.sizeBytes >= 1024 * 1024 ? `${(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`;

  return (
    <li className={cn("flex flex-col gap-2.5 py-3.5", divider && "border-t border-line")}>
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-surface text-text-body">
          <Icon name="file" className="size-[18px]" />
        </span>
        <div className="flex min-w-[160px] flex-1 flex-col gap-[3px] leading-[normal]">
          <p className="text-sm font-medium text-text-strong">{DOCUMENT_LABELS[doc.type]}</p>
          <p className="text-xs text-text-subtle">{[doc.documentNumber, fileType, size, formatDate(doc.uploadedAt)].filter(Boolean).join(" · ")}</p>
          {note ? <p className="text-xs text-text-body">{note}</p> : null}
        </div>
        {!editable ? <StatusChip tone={DOCUMENT_STATUS[doc.status].tone}>{DOCUMENT_STATUS[doc.status].label}</StatusChip> : null}
        <button
          type="button"
          onClick={view}
          disabled={opening}
          className={cn("h-[34px] rounded-full border border-black/30 px-4 text-[13px] font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
        >
          {opening ? "Opening…" : "View"}
        </button>
        {editable ? (
          <div role="radiogroup" aria-label={`Decision for ${DOCUMENT_LABELS[doc.type]}`} className="flex gap-1 rounded-full bg-surface p-1">
            {(["approved", "rejected"] as const).map((status) => (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={choice.status === status}
                onClick={() => onChange({ ...choice, status })}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
                  choice.status === status
                    ? status === "approved"
                      ? "bg-sidebar-bg text-white"
                      : "bg-destructive text-white"
                    : "text-text-muted hover:text-text-strong",
                  focusRing,
                )}
              >
                {status === "approved" ? "Approve" : "Reject"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {editable && choice.status === "rejected" ? (
        <input
          aria-label={`Why ${DOCUMENT_LABELS[doc.type]} is rejected`}
          value={choice.reason}
          maxLength={300}
          onChange={(event) => onChange({ ...choice, reason: event.target.value })}
          placeholder="Reason the seller will see, e.g. The ID has expired"
          className={cn("h-10 w-full rounded-[10px] border border-line px-3.5 text-sm text-text-strong placeholder:text-text-subtle sm:ml-[54px] sm:w-[calc(100%-54px)]", focusRing)}
        />
      ) : null}
      {!editable && doc.status === "rejected" && doc.rejectionReason ? (
        <p className="text-[13px] text-destructive sm:ml-[54px]">{doc.rejectionReason}</p>
      ) : null}
      {blockedUrl ? (
        <a href={blockedUrl} target="_blank" rel="noopener noreferrer" onClick={() => setBlockedUrl(undefined)} className="w-fit text-[13px] font-medium text-text-strong underline sm:ml-[54px]">
          Your browser blocked the new tab. Open the document
        </a>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-destructive sm:ml-[54px]">
          {error}
        </p>
      ) : null}
    </li>
  );
}
