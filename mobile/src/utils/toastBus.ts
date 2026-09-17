/**
 * toastBus — one queue, one clock, one voice; many places to draw.
 * ─────────────────────────────────────────────────────────────────────────────
 * A toast used to be owned by the component that drew it. There was one in the
 * root layout, and on iOS it was invisible under anything presented natively —
 * every `presentation: 'modal'` route and every React Native <Modal> is a view
 * controller ABOVE the root, so a toast raised on the writing desk, a share
 * sheet or a report sheet drew behind the sheet it was raised on.
 *
 * Four modal routes worked around it by mounting their own copy. Every copy
 * heard every toast, so each one was drawn twice (visibly, on Android), spoken
 * twice (on iOS), and timed twice.
 *
 * So the toast is not owned by a drawing any more. This module owns it — the
 * queue, how long it stays, and the single announcement — and the things that
 * draw it are HOSTS that register here. Exactly one host draws at a time, and
 * it is always the one on top:
 *
 *   SHEETS    a host inside a React Native <Modal>. A mounted modal is on screen
 *             and above every route, so it outranks them all; the most recently
 *             opened sheet wins.
 *   SCREENS   a host every route gets from its navigator's `screenLayout`. Only
 *             a FOCUSED screen can draw, and the deepest focused one wins (a
 *             nested stack's screen over the route that holds it).
 *   ROOT      the host in the root layout, for the moment before any screen has
 *             registered.
 *
 * When a sheet closes or a modal route is dismissed with a toast still up, the
 * host underneath takes the SAME toast, mid-display, on the same clock — it
 * neither vanishes with the sheet nor starts again.
 *
 * With no host registered at all nothing can be drawn, and the toast is dropped
 * — exactly what happened before a listener existed.
 */
import { AccessibilityInfo, Platform } from 'react-native';

export type ToastType = 'success' | 'error' | 'info';
export interface ToastPayload {
  message: string;
  type: ToastType;
  id: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

/** A toast that asks for a response stays twice as long. */
export const toastDuration = (toast: Pick<ToastPayload, 'action'>) => (toast.action ? 5000 : 2500);
/** The exit animation's length, plus a beat — the toast is removed after it. */
export const TOAST_EXIT_MS = 450;
/** Toasts allowed to wait behind the one on screen. */
export const TOAST_WAITING_CAP = 4;

export type ToastTier = 'sheet' | 'screen' | 'root';
const TIER_RANK: Record<ToastTier, number> = { sheet: 2, screen: 1, root: 0 };

export interface ToastHostEntry {
  tier: ToastTier;
  /** How many screen layers deep this host sits. */
  depth: number;
  /** Screens only: whether the screen is the one on top of its navigator. */
  isFocused?: () => boolean;
}

export interface ToastSnapshot {
  toast: ToastPayload | null;
  /** The exit animation should run. */
  leaving: boolean;
  /** The one host allowed to draw the toast. */
  host: number | null;
  /**
   * True when the toast began while `host` was already the one drawing — so it
   * slides in. False when it was handed over mid-display — so it simply stays.
   */
  arrived: boolean;
}

// ── State ───────────────────────────────────────────────────────────────────
let lastToastId = 0;
let lastHostId = 0;
let registrations = 0;
const hosts = new Map<number, ToastHostEntry & { order: number }>();

let current: ToastPayload | null = null;
let waiting: ToastPayload[] = [];
let leaving = false;
let arrived = false;
let clock: ReturnType<typeof setTimeout> | null = null;

let snapshot: ToastSnapshot = { toast: null, leaving: false, host: null, arrived: false };
const subscribers = new Set<() => void>();

// ── Choosing the host ──────────────────────────────────────────────────────
function focused(entry: ToastHostEntry): boolean {
  if (entry.tier !== 'screen') return true;
  try {
    return entry.isFocused?.() === true;
  } catch {
    // A navigation object that has gone away is not on top of anything.
    return false;
  }
}

function chooseHost(): number | null {
  let best: number | null = null;
  let bestEntry: (ToastHostEntry & { order: number }) | null = null;
  for (const [id, entry] of hosts) {
    if (!focused(entry)) continue;
    const better = !bestEntry
      || TIER_RANK[entry.tier] > TIER_RANK[bestEntry.tier]
      || (TIER_RANK[entry.tier] === TIER_RANK[bestEntry.tier]
        && (entry.depth > bestEntry.depth
          || (entry.depth === bestEntry.depth && entry.order > bestEntry.order)));
    if (better) { best = id; bestEntry = entry; }
  }
  return best;
}

function publish() {
  const host = current ? chooseHost() : null;
  // A change of host with the toast already up is a handover, not an arrival.
  if (current && host !== snapshot.host && snapshot.toast?.id === current.id) arrived = false;
  const next: ToastSnapshot = { toast: current, leaving, host, arrived };
  if (next.toast === snapshot.toast && next.leaving === snapshot.leaving
    && next.host === snapshot.host && next.arrived === snapshot.arrived) return;
  snapshot = next;
  subscribers.forEach(fn => fn());
}

// ── The queue ──────────────────────────────────────────────────────────────
function stopClock() {
  if (clock) clearTimeout(clock);
  clock = null;
}

function begin(toast: ToastPayload) {
  current = toast;
  leaving = false;
  arrived = true;
  // `accessibilityLiveRegion` on the pill speaks on Android and is ANDROID ONLY.
  // iOS is spoken here, once per toast however many hosts exist. A toast that
  // carries an action is not announced: its host moves VoiceOver focus onto
  // the message, which reads it — and names the button — once.
  if (Platform.OS === 'ios' && !toast.action) {
    AccessibilityInfo.announceForAccessibility(toast.message);
  }
  clock = setTimeout(leave, toastDuration(toast));
  publish();
}

function leave() {
  leaving = true;
  publish();
  clock = setTimeout(() => {
    clock = null;
    current = null;
    leaving = false;
    const [next, ...rest] = waiting;
    waiting = rest;
    if (next) begin(next);
    else publish();
  }, TOAST_EXIT_MS);
}

function clear() {
  stopClock();
  current = null;
  waiting = [];
  leaving = false;
  arrived = false;
  publish();
}

// ── Public ─────────────────────────────────────────────────────────────────
/** Queue a toast. Returns its id, or null when there is nowhere to draw it. */
export function showToast(message: string, type: ToastType, action?: ToastPayload['action']): number | null {
  if (hosts.size === 0) return null;
  const toast: ToastPayload = { message, type, id: ++lastToastId, action };
  if (current) {
    waiting = [...waiting, toast].slice(-TOAST_WAITING_CAP);
    return toast.id;
  }
  begin(toast);
  return toast.id;
}

/** A fresh host id — taken once, when a host first renders. */
export function nextToastHostId(): number {
  return ++lastHostId;
}

/** Register a host. The returned function releases it. */
export function registerToastHost(id: number, entry: ToastHostEntry): () => void {
  hosts.set(id, { ...entry, order: ++registrations });
  publish();
  return () => {
    if (!hosts.delete(id)) return;
    if (hosts.size === 0) clear();
    else publish();
  };
}

/** A screen gained or lost focus — the host on top may have changed. */
export function toastHostsChanged(): void {
  publish();
}

export function subscribeToToasts(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function getToastSnapshot(): ToastSnapshot {
  return snapshot;
}
