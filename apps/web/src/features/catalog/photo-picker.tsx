"use client";

import { PRODUCT_LIMITS } from "@/schemas";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "@/components/layout/icon";
import { focusRing } from "@/features/seller/parts";
import { acceptFor, checkFile, uploadFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Figma "Seller – Add product" › Photos: a dashed drop zone ("Drag photos
 * here or browse"), up to 6 photos, the first is the cover.
 *
 * Each picked file is uploaded at once (signed link, then checked by the
 * API, which re-encodes it and strips its metadata). The local preview is
 * a blob: URL; saved photos show their public URL.
 */
export interface PhotoItem {
  key: string;
  uploadId: string | null;
  previewUrl: string;
  state: "uploading" | "ready" | "failed";
  error?: string;
  /** Local previews are revoked when removed. */
  local: boolean;
}

export function PhotoPicker({
  items,
  onChange,
  labelledBy,
}: {
  items: PhotoItem[];
  onChange: (update: (items: PhotoItem[]) => PhotoItem[]) => void;
  labelledBy: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string>();
  const room = PRODUCT_LIMITS.photos - items.length;

  // Release local previews when the form closes.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => item.local && URL.revokeObjectURL(item.previewUrl)), []);

  function add(files: File[]) {
    setNotice(undefined);
    const accepted = files.slice(0, Math.max(room, 0));
    if (files.length > accepted.length) setNotice(`Up to ${PRODUCT_LIMITS.photos} photos. Remove one to add another.`);
    for (const file of accepted) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const problem = checkFile("product_photo", file);
      const previewUrl = URL.createObjectURL(file);
      onChange((current) => [...current, { key, uploadId: null, previewUrl, local: true, state: problem ? "failed" : "uploading", error: problem ?? undefined }]);
      if (problem) continue;
      uploadFile("seller", "product_photo", file)
        .then((uploadId) => onChange((current) => current.map((item) => (item.key === key ? { ...item, uploadId, state: "ready" } : item))))
        .catch((error: unknown) => {
          const message = error instanceof ApiError ? error.message : "The upload did not finish. Please try again.";
          onChange((current) => current.map((item) => (item.key === key ? { ...item, state: "failed", error: message } : item)));
        });
    }
  }

  function remove(key: string) {
    onChange((current) => {
      const item = current.find((entry) => entry.key === key);
      if (item?.local) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.key !== key);
    });
  }

  function makeCover(key: string) {
    onChange((current) => {
      const item = current.find((entry) => entry.key === key);
      return item ? [item, ...current.filter((entry) => entry.key !== key)] : current;
    });
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    add([...event.dataTransfer.files]);
  }

  return (
    <div className="flex flex-col gap-3">
      {room > 0 ? (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-[#c9c9cf] bg-surface px-6 py-[22px] text-center sm:flex-row sm:gap-4 sm:text-left",
            dragging && "border-side-accent bg-side-accent/5",
            "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-blue/40",
          )}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0b0d17] text-white">
            <Icon name="upload" className="size-5" />
          </span>
          <span className="flex flex-col gap-0.5 leading-[normal]">
            <span className="text-base text-text-strong">
              Drag photos here or <span className="font-semibold text-side-accent">browse</span>
            </span>
            <span className="text-sm text-text-muted">
              JPG, PNG or WebP, up to {PRODUCT_LIMITS.photos} photos. The first one is the cover.
            </span>
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={acceptFor("product_photo")}
            aria-labelledby={labelledBy}
            className="sr-only"
            onChange={(event) => {
              add([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}

      {notice ? <p className="text-[13px] text-text-muted">{notice}</p> : null}

      {items.length > 0 ? (
        <ul aria-label="Product photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((item, index) => (
            <li key={item.key} className="flex flex-col gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-[12px] border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: previews and public photos, sized by CSS */}
                <img src={item.previewUrl} alt="" className={cn("size-full object-cover", item.state !== "ready" && "opacity-50")} />
                {index === 0 && item.state === "ready" ? (
                  <span className="absolute top-2 left-2 rounded-full bg-[#0b0d17] px-2 py-0.5 text-[11px] font-medium text-white">Cover</span>
                ) : null}
                {item.state === "uploading" ? (
                  <span role="status" className="absolute inset-0 flex items-center justify-center text-xs font-medium text-text-strong">
                    Uploading…
                  </span>
                ) : null}
              </div>
              {item.state === "failed" ? <p className="text-xs leading-snug text-destructive">{item.error}</p> : null}
              <div className="flex gap-2 text-xs font-medium">
                {index > 0 && item.state === "ready" ? (
                  <button type="button" onClick={() => makeCover(item.key)} className={cn("rounded-sm text-text-strong hover:underline", focusRing)}>
                    Make cover
                  </button>
                ) : null}
                <button type="button" onClick={() => remove(item.key)} className={cn("rounded-sm text-text-muted hover:text-destructive", focusRing)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
