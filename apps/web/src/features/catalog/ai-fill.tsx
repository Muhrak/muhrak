"use client";

import type { AiSuggestion } from "@/schemas";
import { Camera, ImageIcon, Loader2, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { identifyPhoto } from "@/features/ai/api";
import { focusRing } from "@/features/seller/parts";
import { acceptFor, checkFile, uploadFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PhotoItem } from "./photo-picker";

/**
 * Day 7: "Fill in from a photo" on Add product. No Figma frame exists; built
 * in the style of the Add product cards, seller palette only.
 *
 * Phones and tablets (coarse pointer) get "Take photo" (rear camera) and
 * "Choose from gallery"; computers get "Browse a photo". The photo is
 * uploaded like any product photo and becomes the cover, then the API's AI
 * reads it and the form is filled in. The seller checks every field; nothing
 * is saved or published by the AI. If AI fails, the manual form is right there.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; previewUrl: string }
  | { kind: "reading"; previewUrl: string }
  | { kind: "filled"; previewUrl: string; count: number }
  | { kind: "message"; previewUrl?: string; text: string };

const FALLBACK = "We could not read this photo. Please fill in the details yourself, or try a clearer photo.";

export function AiFill({
  onStart,
  onPhoto,
  onSuggestion,
}: {
  /** A new photo was picked: clear what the AI filled in from the previous one. */
  onStart: () => void;
  /** Add the uploaded photo to the product's photos, as the cover. */
  onPhoto: (item: PhotoItem) => void;
  /** Fill the form; returns how many fields were filled. */
  onSuggestion: (suggestion: AiSuggestion) => number;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase.kind === "uploading" || phase.kind === "reading";

  // Stop polling if the seller leaves the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function start(file: File | undefined) {
    if (!file || busy) return;
    const problem = checkFile("product_photo", file);
    if (problem) {
      setPhase({ kind: "message", text: problem });
      return;
    }
    abortRef.current?.abort();
    onStart();
    const controller = new AbortController();
    abortRef.current = controller;

    // The preview URL is handed to the photo list, which revokes it when the photo is removed.
    const previewUrl = URL.createObjectURL(file);
    setPhase({ kind: "uploading", previewUrl });
    let uploadId: string;
    try {
      uploadId = await uploadFile("seller", "product_photo", file);
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      setPhase({ kind: "message", text: error instanceof ApiError ? error.message : "The upload did not finish. Please try again." });
      return;
    }
    if (controller.signal.aborted) return;
    onPhoto({ key: uploadId, uploadId, previewUrl, state: "ready", local: true });

    setPhase({ kind: "reading", previewUrl });
    try {
      const result = await identifyPhoto(uploadId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status !== "done" || !result.suggestion) {
        setPhase({ kind: "message", previewUrl, text: FALLBACK });
      } else if (!result.suggestion.isPart) {
        setPhase({
          kind: "message",
          previewUrl,
          text: "This photo does not look like a part. Try another photo, or fill in the details yourself.",
        });
      } else {
        const count = onSuggestion(result.suggestion);
        setPhase(
          count > 0
            ? { kind: "filled", previewUrl, count }
            : { kind: "message", previewUrl, text: "We could not make out the details from this photo. Please fill them in yourself." },
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      // ai_unavailable carries a friendly reason (switched off, daily limit); anything else gets the fallback.
      const text = error instanceof ApiError && error.code === "ai_unavailable" ? error.message : FALLBACK;
      setPhase({ kind: "message", previewUrl, text });
    }
  }

  const input = (ref: React.RefObject<HTMLInputElement | null>, camera: boolean) => (
    <input
      ref={ref}
      type="file"
      accept={acceptFor("product_photo")}
      // Opens the rear camera on phones; ignored by desktop browsers.
      capture={camera ? "environment" : undefined}
      tabIndex={-1}
      aria-hidden
      className="sr-only"
      onChange={(event) => {
        void start(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
  );

  return (
    <section aria-labelledby="ai-fill-title" className="flex flex-col gap-5 rounded-[24px] bg-panel px-5 pt-7 pb-[30px] sm:px-[30px]">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0b0d17] text-white">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1 leading-[normal]">
          <h2 id="ai-fill-title" className="text-xl font-medium text-text-strong">
            Fill in from a photo
          </h2>
          <p className="text-sm leading-normal text-text-muted">
            Muhrak AI reads the part and fills in the details below. Check every field before you publish.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Phones and tablets */}
        <ActionButton primary className="hidden pointer-coarse:flex" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden className="size-5" />
          Take photo
        </ActionButton>
        <ActionButton className="hidden pointer-coarse:flex" disabled={busy} onClick={() => galleryRef.current?.click()}>
          <ImageIcon aria-hidden className="size-5" />
          Choose from gallery
        </ActionButton>
        {/* Computers */}
        <ActionButton primary className="pointer-coarse:hidden" disabled={busy} onClick={() => galleryRef.current?.click()}>
          <Upload aria-hidden className="size-5" />
          Browse a photo
        </ActionButton>
        {input(cameraRef, true)}
        {input(galleryRef, false)}
      </div>

      {phase.kind !== "idle" ? <Progress phase={phase} /> : null}
    </section>
  );
}

function Progress({ phase }: { phase: Exclude<Phase, { kind: "idle" }> }) {
  const working = phase.kind === "uploading" || phase.kind === "reading";
  const text =
    phase.kind === "uploading"
      ? "Uploading the photo…"
      : phase.kind === "reading"
        ? "Reading the part… this takes a few seconds."
        : phase.kind === "filled"
          ? `Filled in ${phase.count} ${phase.count === 1 ? "field" : "fields"} from your photo. Fields marked “check” are less certain.`
          : phase.text;
  return (
    <div
      role={phase.kind === "message" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-3.5 rounded-[16px] px-4 py-3.5",
        phase.kind === "filled" ? "bg-seller-orange/12" : "bg-surface",
      )}
    >
      {phase.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, sized by CSS
        <img src={phase.previewUrl} alt="" className="size-12 shrink-0 rounded-[10px] border border-line object-cover" />
      ) : null}
      <p className="min-w-0 flex-1 text-sm leading-normal text-text-strong">{text}</p>
      {working ? <Loader2 aria-hidden className="size-5 shrink-0 animate-spin text-side-accent" /> : null}
    </div>
  );
}

function ActionButton({
  primary,
  className,
  children,
  ...rest
}: { primary?: boolean; className?: string; children: ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-base font-semibold whitespace-nowrap disabled:opacity-60",
        primary ? "bg-side-accent text-white hover:opacity-90" : "border-[1.5px] border-text-strong text-text-strong hover:bg-black/4",
        focusRing,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
