"use client";

import { useSyncExternalStore } from "react";

/**
 * The new-message bell (developer request, 21 Nov 2026): a short two-note
 * chime made with the Web Audio API, so there is no sound file to load.
 *
 * Browsers only allow sound in a tab after a click, tap or key press in that
 * tab since it loaded. Until then the bell cannot play; the sidebar's
 * "Message sound" switch shows that ("Click to turn on sound") and turns it
 * on. The switch is also the mute (kept in this browser only).
 */

const STORAGE_KEY = "muhrak.messageSound";
let context: AudioContext | null = null;
let lastRing = 0;
let enabled = readEnabled();
/** A message came in while the browser still blocked sound in this tab: the Centre shows a prompt. */
let missed = false;
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

/** Create or wake the audio context. Only works inside a click, tap or key press (or after one). */
function wake(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    context.onstatechange = notify;
  }
  const ctx = context;
  if (ctx.state === "suspended")
    void ctx.resume().then(() => {
      if (ctx.state === "running") missed = false;
      notify();
    }, () => {});
  else if (ctx.state === "running") missed = false;
  notify();
  return ctx;
}

/** Call from a click, tap or key press: lets the bell play from now on. */
export function unlockBell(): void {
  if (enabled) wake();
}

export function setMessageSound(on: boolean): void {
  enabled = on;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private window or blocked storage: the choice lasts until the page reloads.
  }
  if (on) wake();
  notify();
}

export type BellState = "on" | "blocked" | "off";

function snapshot(): BellState {
  if (!enabled) return "off";
  return context?.state === "running" ? "on" : "blocked";
}

/** "on" (will ring), "blocked" (needs a click in this tab first) or "off" (muted). */
export function useBellState(): BellState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => "on",
  );
}

/** True while a message has come in that the browser would not let ring (sound on, but no click in this tab yet). */
export function useMissedRing(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabled && missed && context?.state !== "running",
    () => false,
  );
}

/** From the prompt: turn sound on (this click allows it) and ring once so the person hears what it sounds like. */
export function turnOnSoundAndRing(): void {
  setMessageSound(true);
  const ctx = context;
  if (!ctx) return;
  if (ctx.state === "running") chime(ctx);
  else void ctx.resume().then(() => ctx.state === "running" && chime(ctx), () => {});
}

/** One bell-like note: a sine with a soft overtone, quick attack, long fade. */
function note(ctx: AudioContext, frequency: number, start: number, volume: number) {
  for (const [ratio, gainScale] of [
    [1, 1],
    [2.01, 0.25],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency * ratio;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume * gainScale, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.95);
  }
}

function chime(ctx: AudioContext) {
  const t = ctx.currentTime + 0.01;
  note(ctx, 1046.5, t, 0.12); // C6
  note(ctx, 1318.5, t + 0.13, 0.1); // E6
}

/** Ring once; several messages within 1.5 s ring only once. */
export function ringBell(): void {
  if (!enabled) return;
  if (!context || context.state !== "running") {
    missed = true;
    notify();
  }
  if (!context) return;
  const now = Date.now();
  if (now - lastRing < 1500) return;
  lastRing = now;
  const ctx = context;
  if (ctx.state === "running") chime(ctx);
  // The browser may pause audio in a tab left alone; it allows waking it again once the tab has had a click.
  else
    void ctx.resume().then(() => {
      if (ctx.state !== "running") return;
      missed = false;
      notify();
      chime(ctx);
    }, () => {});
}
