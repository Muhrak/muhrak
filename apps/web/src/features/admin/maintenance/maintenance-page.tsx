"use client";

import {
  MAINTENANCE_MAX_HOURS,
  MAINTENANCE_SCOPE_LABELS,
  MAINTENANCE_WARNING_HOURS,
  maintenanceMessageSchema,
  type AdminMaintenance,
  type MaintenanceScope,
  type MaintenanceWindow,
} from "@/schemas";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/layout/icon";
import { MaintenanceCard, MaintenanceScreen } from "@/features/maintenance/screen";
import {
  formatDuration,
  formatGulfDate,
  formatGulfDayTime,
  formatGulfRange,
  formatGulfTime,
  gulfInputToIso,
  isoToGulfInput,
} from "@/features/maintenance/time";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { focusRing, Panel, StatusChip } from "../sellers/parts";
import { useAdminMaintenance, useMaintenanceAction, useMaintenanceHistory, type MaintenanceAction } from "./api";
import { LogoLoader } from "@/components/ui/logo-loader";
import { useToast } from "@/components/ui/toast";

/**
 * Figma "Admin – Maintenance Mode (Dark)" (414:5122), converted to light
 * like the Sellers page. Left out (developer decision, 15 Nov 2026):
 * "Payments only" and "Pause payouts" (no payments yet), "Email sellers
 * 24 h before" (the site banner warns everyone), the theme toggle and the
 * "Super admin" badge (one admin type). "Admins can still log in" is
 * always on: the admin console never goes offline.
 *
 * Every change opens a dialog that asks for the admin's password again.
 * The API checks everything again (times, one window at a time, the
 * password); this page only helps fill it in.
 */

const SCOPES: MaintenanceScope[] = ["whole_site", "buyer", "seller"];
const DEFAULT_MESSAGE = "We are upgrading Muhrak to make it better. We will be back shortly.";

const scopeText = (scope: MaintenanceScope) => (scope === "whole_site" ? "The whole site" : MAINTENANCE_SCOPE_LABELS[scope]);

/** "Sara M." */
function shortName(fullName: string) {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "";
  return `${words[0]} ${words[words.length - 1]![0]}.`;
}

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

export function MaintenancePage() {
  const state = useAdminMaintenance();
  const [scope, setScope] = useState<MaintenanceScope>("whole_site");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [formError, setFormError] = useState<string>();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [preview, setPreview] = useState(false);

  const current = state.data?.current ?? null;
  const busy = current !== null; // one window at a time
  const messageCheck = maintenanceMessageSchema.safeParse(message);
  const previewMessage = messageCheck.success ? messageCheck.data : message.trim() || DEFAULT_MESSAGE;
  const previewEnd = current?.state === "active" ? current.endsAt : gulfInputToIso(endsAt);

  function checkMessage(): string | null {
    if (!messageCheck.success) {
      setFormError(messageCheck.error.issues[0]?.message ?? "Check the message");
      return null;
    }
    return messageCheck.data;
  }

  function openSchedule(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    const text = checkMessage();
    if (!text) return;
    const start = gulfInputToIso(startsAt);
    const end = gulfInputToIso(endsAt);
    if (!start || !end) return setFormError("Choose when it starts and ends.");
    if (new Date(start).getTime() <= Date.now()) return setFormError("The start must be in the future. To start now, use Turn on now.");
    if (end <= start) return setFormError("The end must be after the start.");
    if (new Date(end).getTime() - new Date(start).getTime() > MAINTENANCE_MAX_HOURS * 3_600_000) {
      return setFormError(`The window can last at most ${MAINTENANCE_MAX_HOURS} hours.`);
    }
    setDialog({ kind: "schedule", scope, message: text, startsAt: start, endsAt: end });
  }

  function openStart() {
    setFormError(undefined);
    const text = checkMessage();
    if (!text) return;
    const end = gulfInputToIso(endsAt);
    setDialog({ kind: "start", scope, message: text, endsAt: end && new Date(end).getTime() > Date.now() ? endsAt : "" });
  }

  return (
    <>
      <div className="flex flex-col gap-2 leading-[normal]">
        <h1 className="text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">Maintenance Mode</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-base text-text-muted">Take the site offline safely for upgrades.</p>
          <span className="flex h-6 items-center gap-1.5 rounded-full bg-sidebar-bg px-2.5 text-[13px] font-medium text-white">
            <span aria-hidden className="size-1.5 rounded-full bg-admin-orange" />
            Admin
          </span>
        </div>
      </div>

      {state.isPending ? (
        <LogoLoader className="py-16" />
      ) : state.isError ? (
        <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load the maintenance status. Reload the page.
        </p>
      ) : (
        <>
          <StatusCard data={state.data} onTurnOn={openStart} onTurnOff={(item) => setDialog({ kind: "end", window: item })} onCancel={(item) => setDialog({ kind: "cancel", window: item })} />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <Panel label="Schedule a maintenance window" className="gap-4">
              <form onSubmit={openSchedule} noValidate className="flex flex-1 flex-col gap-4">
                <div className="flex flex-col gap-1 leading-[normal]">
                  <h2 className="text-xl font-medium text-text-strong">Schedule a maintenance window</h2>
                  <p className="text-[13px] text-text-subtle">Users get a warning banner {MAINTENANCE_WARNING_HOURS} hours before</p>
                </div>
                {busy ? (
                  <p className="rounded-[12px] bg-surface px-4 py-3 text-[13px] leading-[1.4] text-text-body">
                    One window at a time. {current.state === "active" ? "Turn maintenance off" : "Cancel the scheduled window"} before scheduling another.
                  </p>
                ) : null}
                <fieldset disabled={busy} className="flex flex-col gap-4 disabled:opacity-60">
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <DateField label="Starts" hint="Gulf time" value={startsAt} onChange={setStartsAt} />
                    <DateField label="Ends" hint="Gulf time" value={endsAt} onChange={setEndsAt} min={startsAt} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p id="scope-label" className="text-[13px] leading-[normal] text-text-muted">What goes offline</p>
                    <div role="radiogroup" aria-labelledby="scope-label" className="flex flex-wrap gap-2">
                      {SCOPES.map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={scope === value}
                          onClick={() => setScope(value)}
                          className={cn(
                            "h-9 rounded-full border px-3.5 text-sm font-medium",
                            scope === value ? "border-sidebar-bg bg-sidebar-bg text-white" : "border-line text-text-strong hover:bg-surface",
                            focusRing,
                          )}
                        >
                          {MAINTENANCE_SCOPE_LABELS[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="maintenance-message" className="flex items-center justify-between text-[13px] leading-[normal] text-text-muted">
                      Message shown to users
                      <span className="text-text-subtle">{message.trim().length}/300</span>
                    </label>
                    <textarea
                      id="maintenance-message"
                      rows={3}
                      maxLength={300}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      className={cn("min-h-24 w-full resize-none rounded-[12px] border border-line px-[15px] py-3 text-[15px] leading-[1.3] text-text-strong", focusRing)}
                    />
                  </div>
                </fieldset>
                <div className="flex items-center gap-3 leading-[normal]">
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p className="text-[15px] text-text-strong">Admins can still log in</p>
                    <p className="text-xs text-text-subtle">The admin console never goes offline, so you can always turn maintenance off</p>
                  </div>
                  <StatusChip tone="success">Always on</StatusChip>
                </div>
                {formError ? (
                  <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap justify-end gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setPreview(true)}
                    className={cn("h-9 rounded-full border border-black/30 px-4 text-[13px] font-medium text-text-strong hover:bg-black/4", focusRing)}
                  >
                    Preview page
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className={cn("h-9 rounded-full bg-admin-orange px-4 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50", focusRing)}
                  >
                    Schedule window
                  </button>
                </div>
              </form>
            </Panel>

            <div className="flex flex-col gap-5">
              <Panel label="What users will see" className="gap-3">
                <h2 className="text-xl leading-[normal] font-medium text-text-strong">What users will see</h2>
                <div className="rounded-[16px] border border-line bg-surface px-6 py-[31px]">
                  <MaintenanceCard
                    message={current?.state === "active" ? current.message : previewMessage}
                    endsAt={previewEnd}
                    tone={(current?.state === "active" ? current.scope : scope) === "seller" ? "seller" : "buyer"}
                  />
                </div>
              </Panel>
              <History currentId={current?.id} />
            </div>
          </div>
        </>
      )}

      {preview ? (
        <PreviewOverlay onClose={() => setPreview(false)}>
          <MaintenanceScreen message={previewMessage} endsAt={previewEnd} tone={scope === "seller" ? "seller" : "buyer"} />
        </PreviewOverlay>
      ) : null}
      {dialog ? <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- status card

function StatusCard({
  data,
  onTurnOn,
  onTurnOff,
  onCancel,
}: {
  data: AdminMaintenance;
  onTurnOn: () => void;
  onTurnOff: (item: MaintenanceWindow) => void;
  onCancel: (item: MaintenanceWindow) => void;
}) {
  const { current, last } = data;
  const active = current?.state === "active" ? current : null;
  const scheduled = current?.state === "scheduled" ? current : null;

  let icon: ReactNode;
  let title: string;
  let text: string;
  if (active) {
    icon = <Circle tone="on" />;
    title = "Maintenance mode is on";
    text = `${scopeText(active.scope)} has been offline since ${formatGulfDayTime(active.startsAt)}${
      active.endsAt ? `, back by ${formatGulfTime(active.endsAt)} Gulf time.` : " Gulf time. It stays on until you turn it off."
    } The admin console stays up.`;
  } else if (scheduled) {
    icon = <Circle tone="scheduled" />;
    title = "Maintenance is scheduled";
    const warnFrom = new Date(new Date(scheduled.startsAt).getTime() - MAINTENANCE_WARNING_HOURS * 3_600_000).toISOString();
    text = `${scopeText(scheduled.scope)} goes offline ${formatGulfRange(scheduled.startsAt, scheduled.endsAt)} Gulf time. Users see a warning banner from ${formatGulfDayTime(warnFrom)}.`;
  } else {
    icon = <Circle tone="off" />;
    title = "Maintenance mode is off";
    text = "muhrak.com is live for all buyers, sellers and admins.";
    if (last?.closedAt) text += ` Last maintenance: ${formatGulfDate(last.startsAt).replace(/ \d{4}$/, "")}, ${formatGulfTime(last.startsAt)}–${formatGulfTime(last.closedAt)}.`;
  }

  return (
    <section
      aria-label="Maintenance status"
      className={cn("flex flex-wrap items-center gap-[18px] rounded-[24px] bg-panel px-5 py-[27px] sm:px-[27px]", active && "ring-2 ring-admin-orange/50")}
    >
      {icon}
      <div className="flex min-w-[220px] flex-1 flex-col gap-1 leading-[normal]">
        <p role="status" className="text-2xl font-medium text-text-strong">{title}</p>
        <p className="text-sm leading-[1.3] text-text-body">{text}</p>
      </div>
      {scheduled ? (
        <button
          type="button"
          onClick={() => onCancel(scheduled)}
          className={cn("h-9 rounded-full border border-black/30 px-4 text-[13px] font-medium text-text-strong hover:bg-black/4", focusRing)}
        >
          Cancel window
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <span id="turn-on-label" className="text-sm text-text-strong">{active ? "Turn off" : "Turn on now"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!active}
            aria-labelledby="turn-on-label"
            onClick={() => (active ? onTurnOff(active) : onTurnOn())}
            className={cn("relative h-7 w-[52px] shrink-0 rounded-full transition-colors", active ? "bg-admin-orange" : "bg-black/15", focusRing)}
          >
            <span aria-hidden className={cn("absolute top-1.5 size-4 rounded-full bg-white shadow-sm transition-[left]", active ? "left-[33px]" : "left-[3px]")} />
          </button>
        </div>
      )}
    </section>
  );
}

function Circle({ tone }: { tone: "off" | "on" | "scheduled" }) {
  const styles = {
    off: { bg: "bg-success/16", icon: "text-success", name: "check-circle" as const },
    on: { bg: "bg-admin-orange/12", icon: "text-admin-orange", name: "wrench" as const },
    scheduled: { bg: "bg-admin-orange/12", icon: "text-admin-orange", name: "clock" as const },
  }[tone];
  return (
    <span aria-hidden className={cn("flex size-[60px] shrink-0 items-center justify-center rounded-full", styles.bg)}>
      <Icon name={styles.name} className={cn("size-7", styles.icon)} />
    </span>
  );
}

// ---------------------------------------------------------------- form parts

function DateField({ label, hint, value, onChange, min }: { label: string; hint: string; value: string; onChange: (value: string) => void; min?: string }) {
  const id = useId();
  const [now] = useState(() => isoToGulfInput(new Date().toISOString()));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] leading-[normal] text-text-muted">
        {label} <span className="text-text-subtle">({hint})</span>
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={min || now}
        onChange={(event) => onChange(event.target.value)}
        className={cn("h-[46px] w-full rounded-[12px] border border-line px-[15px] text-[15px] text-text-strong", focusRing)}
      />
    </div>
  );
}

// ---------------------------------------------------------------- history

function History({ currentId }: { currentId: string | undefined }) {
  const list = useMaintenanceHistory();
  const rows = (list.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => item.id !== currentId);
  return (
    <Panel label="Past windows" className="flex-1">
      <h2 className="pb-2 text-xl leading-[normal] font-medium text-text-strong">Past windows</h2>
      {list.isPending ? (
        <LogoLoader className="py-8" />
      ) : list.isError ? (
        <p role="alert" className="py-4 text-sm text-destructive">Could not load past windows.</p>
      ) : rows.length === 0 ? (
        <p className="border-t border-line py-4 text-sm text-text-muted">No maintenance yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-t border-line py-2.5 leading-[normal]">
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="text-[15px] text-text-strong">{formatGulfDate(item.startsAt)}</p>
                <p className="text-xs text-text-subtle">
                  {item.state === "cancelled"
                    ? "Cancelled"
                    : item.closedAt
                      ? formatDuration(item.startsAt, item.closedAt)
                      : item.state === "active"
                        ? "Running"
                        : "Scheduled"}{" "}
                  · {MAINTENANCE_SCOPE_LABELS[item.scope].toLowerCase()}
                </p>
              </div>
              <p className="shrink-0 text-xs text-text-subtle" title={item.createdBy.fullName}>
                {shortName(item.createdBy.fullName)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <button
          type="button"
          onClick={() => list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className={cn("mt-3 h-9 self-center rounded-full border border-black/30 px-4 text-[13px] font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- overlays

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function PreviewOverlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div role="dialog" aria-modal="true" aria-label="Preview of the maintenance page" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface">
      <button
        type="button"
        autoFocus
        onClick={onClose}
        className={cn("fixed top-4 right-4 z-10 flex h-9 items-center gap-1.5 rounded-full bg-sidebar-bg px-4 text-[13px] font-medium text-white", focusRing)}
      >
        <X aria-hidden className="size-4" />
        Close preview
      </button>
      {children}
    </div>
  );
}

type DialogKind =
  | { kind: "start"; scope: MaintenanceScope; message: string; endsAt: string }
  | { kind: "schedule"; scope: MaintenanceScope; message: string; startsAt: string; endsAt: string }
  | { kind: "end"; window: MaintenanceWindow }
  | { kind: "cancel"; window: MaintenanceWindow };

const DIALOG_TEXT: Record<DialogKind["kind"], { title: string; action: string; danger: boolean }> = {
  start: { title: "Turn on maintenance now?", action: "Turn on now", danger: true },
  schedule: { title: "Schedule this window?", action: "Schedule window", danger: false },
  end: { title: "Turn maintenance off?", action: "Turn off", danger: false },
  cancel: { title: "Cancel the scheduled window?", action: "Cancel window", danger: false },
};

function ConfirmDialog({ dialog, onClose }: { dialog: DialogKind; onClose: () => void }) {
  const action = useMaintenanceAction();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [until, setUntil] = useState(dialog.kind === "start" ? dialog.endsAt : "");
  const [localError, setLocalError] = useState<string>();
  const passwordRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const close = () => {
    if (!action.isPending) onClose();
  };
  useEscape(close);
  useEffect(() => passwordRef.current?.focus(), []);

  const text = DIALOG_TEXT[dialog.kind];
  let summary: string;
  switch (dialog.kind) {
    case "start":
      summary = `${scopeText(dialog.scope)} goes offline as soon as you confirm. Buyers and sellers see the maintenance page; the admin console stays up.`;
      break;
    case "schedule":
      summary = `${scopeText(dialog.scope)} goes offline ${formatGulfRange(dialog.startsAt, dialog.endsAt)} Gulf time.`;
      break;
    case "end":
      summary = `${scopeText(dialog.window.scope)} comes back online for everyone as soon as you confirm.`;
      break;
    case "cancel":
      summary = `The window ${formatGulfRange(dialog.window.startsAt, dialog.window.endsAt)} Gulf time will not happen. The warning banner disappears.`;
      break;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (action.isPending) return;
    setLocalError(undefined);
    if (!password) return setLocalError("Enter your password.");
    let request: MaintenanceAction;
    switch (dialog.kind) {
      case "start": {
        const endsAt = until ? gulfInputToIso(until) : null;
        if (until && !endsAt) return setLocalError("Check the end time.");
        request = { kind: "start", input: { scope: dialog.scope, message: dialog.message, endsAt, password } };
        break;
      }
      case "schedule":
        request = { kind: "schedule", input: { scope: dialog.scope, message: dialog.message, startsAt: dialog.startsAt, endsAt: dialog.endsAt, password } };
        break;
      case "end":
        request = { kind: "end", windowId: dialog.window.id, input: { password } };
        break;
      case "cancel":
        request = { kind: "cancel", windowId: dialog.window.id, input: { password } };
        break;
    }
    const done = { start: "Maintenance started.", schedule: "Maintenance scheduled.", end: "Maintenance ended.", cancel: "Scheduled maintenance cancelled." }[dialog.kind];
    action.mutate(request, {
      onSuccess: () => {
        onClose();
        toast.success(done);
      },
      onError: () => setPassword(""),
    });
  }

  const error = localError ?? (action.error ? errorText(action.error) : undefined);
  const message = dialog.kind === "start" || dialog.kind === "schedule" ? dialog.message : dialog.window.message;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-[460px] flex-col gap-4 overflow-y-auto rounded-[24px] bg-panel px-6 py-6 font-portal">
        <h2 id={titleId} className="text-xl leading-[normal] font-medium text-text-strong">{text.title}</h2>
        <p className="text-sm leading-[1.4] text-text-body">{summary}</p>
        <blockquote className="rounded-[12px] bg-surface px-4 py-3 text-[13px] leading-[1.4] break-words whitespace-pre-line text-text-muted">{message}</blockquote>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {dialog.kind === "start" ? (
            <DateField label="Back by (optional)" hint={`Gulf time, at most ${MAINTENANCE_MAX_HOURS} h`} value={until} onChange={setUntil} />
          ) : null}
          <div className="flex flex-col gap-2">
            <label htmlFor="maintenance-password" className="text-[13px] leading-[normal] text-text-muted">Your admin password</label>
            <input
              ref={passwordRef}
              id="maintenance-password"
              type="password"
              autoComplete="current-password"
              maxLength={200}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={cn("h-[46px] w-full rounded-[12px] border border-line px-[15px] text-[15px] text-text-strong", focusRing)}
            />
            <p className="text-xs leading-[1.35] text-text-subtle">Asked for every change, so a signed-in browser alone cannot take the site offline.</p>
          </div>
          {error ? (
            <p role="alert" className="rounded-[12px] bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={close}
              disabled={action.isPending}
              className={cn("h-9 rounded-full border border-black/30 px-4 text-[13px] font-medium text-text-strong hover:bg-black/4 disabled:opacity-60", focusRing)}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={action.isPending}
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-60",
                text.danger ? "bg-admin-orange" : "bg-sidebar-bg",
                focusRing,
              )}
            >
              {action.isPending ? "Working…" : text.action}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
