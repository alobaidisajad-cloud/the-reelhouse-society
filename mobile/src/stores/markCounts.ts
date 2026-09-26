/**
 * markCounts — how many members have certified a log, and how many critiques
 * it holds, as ONE number per log that every screen reads.
 *
 * ── WHY A STORE ──────────────────────────────────────────────────────────────
 * The same log is drawn in three places: its card on the Reel, its card on a
 * film's archive, and its own page. Each fetches separately, at a different
 * moment. If each drew the count it fetched, certifying on the log page and
 * pressing back would show the card's old number — the app contradicting
 * itself about a mark the member just made. So every fetch TELLS this store
 * what the server said, every tap is recorded here, and every bar READS here.
 *
 * ── THE ONE RULE ─────────────────────────────────────────────────────────────
 *   shown = what the server last said + the member's taps it had not seen yet
 *
 * "Not seen yet" is decided by time. Each answer carries the moment its request
 * was SENT. A tap is stamped when the server CONFIRMS it — so a tap confirmed
 * before a request was sent is certainly inside that answer, and is dropped
 * when the answer arrives. A tap still in flight is never dropped: an answer
 * that raced it cannot have counted it for certain, and dropping it would make
 * the member's own mark blink out and back.
 *
 * Why not derive it from the heart instead (count − mine-then + mine-now)? The
 * heart's source, `_endorsedIndex`, loads on its own schedule and holds only the
 * newest 500 — so "mine then" would be a guess, and the guess is wrong on every
 * cold start where the feed lands before the index does. Counting taps needs to
 * know nothing about what the member did before this session.
 *
 * ── NOT PERSISTED, CLEARED ON SIGN-OUT ───────────────────────────────────────
 * Counts are read with the viewer's visibility (a blocked member's critiques
 * are not counted for the member who blocked them), so a count belongs to the
 * viewer who fetched it. Sign-out empties the store; nothing is written to disk.
 */
import { create } from 'zustand';
import { registerStoreReset } from './resetAllStores';

export type MarkKind = 'certify' | 'critique';

/**
 * One tap: +1 or −1, and when the server confirmed it (Infinity while in
 * flight). `queued` marks one that went into the offline queue: it stays in
 * flight until the queue delivers it (`settleDelivered`), not until it is
 * queued — a refresh can land before the queue does.
 */
export interface Tap { by: 1 | -1; at: number; queued?: boolean }

interface Told { value: number; askedAt: number }

interface MarkCountsState {
  told: Record<MarkKind, Record<string, Told>>;
  taps: Record<MarkKind, Record<string, Tap[]>>;
}

const empty = (): MarkCountsState => ({
  told: { certify: {}, critique: {} },
  taps: { certify: {}, critique: {} },
});

export const useMarkCounts = create<MarkCountsState>(() => empty());

/** A count as the server reported it, or nothing when the source could not say. */
export interface TellRow { id: string; certify?: number | null; critique?: number | null }

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * What the server said, for a batch of logs, and when the question was SENT
 * (`Date.now()` taken before the request). A field the source did not carry is
 * left as it was — an answer without counts is not an answer of zero.
 */
export function tellMarkCounts(rows: TellRow[], askedAt: number): void {
  if (rows.length === 0) return;
  useMarkCounts.setState((s) => {
    const told = { certify: { ...s.told.certify }, critique: { ...s.told.critique } };
    const taps = { certify: { ...s.taps.certify }, critique: { ...s.taps.critique } };
    for (const row of rows) {
      for (const kind of ['certify', 'critique'] as const) {
        const value = row[kind];
        if (!usable(value)) continue;
        // An older answer arriving late never overwrites a newer one.
        const had = told[kind][row.id];
        if (had && had.askedAt > askedAt) continue;
        told[kind][row.id] = { value: Math.floor(value), askedAt };
        const pending = taps[kind][row.id];
        if (pending) {
          const unseen = pending.filter((t) => t.at >= askedAt);
          if (unseen.length) taps[kind][row.id] = unseen;
          else delete taps[kind][row.id];
        }
      }
    }
    return { told, taps };
  });
}

/** Record a tap the moment it is made. Returns the tap, to settle or withdraw. */
export function beginTap(kind: MarkKind, id: string, by: 1 | -1): Tap {
  const tap: Tap = { by, at: Infinity };
  useMarkCounts.setState((s) => ({
    taps: { ...s.taps, [kind]: { ...s.taps[kind], [id]: [...(s.taps[kind][id] ?? []), tap] } },
  }));
  return tap;
}

/**
 * The write went into the offline queue. It is NOT on the server yet, so it
 * stays in flight — kept on top of every answer — until the queue delivers it.
 */
export function queueTap(kind: MarkKind, id: string, tap: Tap): void {
  useMarkCounts.setState((s) => {
    const list = s.taps[kind][id];
    if (!list || !list.includes(tap)) return s;
    return { taps: { ...s.taps, [kind]: { ...s.taps[kind], [id]: list.map((t) => (t === tap ? { ...t, queued: true } : t)) } } };
  });
}

/** Which count a queued write moves, read from the queue's own payload. */
function deliveredMark(m: { type: string; payload: Record<string, unknown> }): [MarkKind, string] | null {
  const p = m.payload ?? {};
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  switch (m.type) {
    case 'endorse_log': return str(p.target_log_id) ? ['certify', str(p.target_log_id)!] : null;
    case 'endorse_list': return str(p.target_list_id) ? ['certify', str(p.target_list_id)!] : null;
    case 'remove_endorsement': {
      const id = str(p.target_log_id) ?? str(p.target_list_id);
      return id ? ['certify', id] : null;
    }
    case 'add_log_comment':
    case 'remove_log_comment': return str(p.log_id) ? ['critique', str(p.log_id)!] : null;
    default: return null;
  }
}

/**
 * The offline queue has finished with a write — delivered it, found it already
 * there, or given up on it. Either way the server's answer is the truth from
 * now on, so the queued taps for that mark settle now, oldest first (the queue
 * runs in order): an answer asked after this moment replaces them.
 */
export function settleDelivered(m: { type: string; payload: Record<string, unknown> }): void {
  const mark = deliveredMark(m);
  if (!mark) return;
  const [kind, id] = mark;
  useMarkCounts.setState((s) => {
    const list = s.taps[kind][id];
    const i = list ? list.findIndex((t) => t.queued && t.at === Infinity) : -1;
    if (!list || i < 0) return s;
    const next = list.slice();
    next[i] = { by: list[i].by, at: Date.now() };
    return { taps: { ...s.taps, [kind]: { ...s.taps[kind], [id]: next } } };
  });
}

/**
 * Has the member moved this mark since `askedAt`, or is a move still in
 * flight? Then an answer asked at `askedAt` cannot be trusted about their own
 * certification of it (see learnEndorsements in interactionSlice).
 */
export function tappedSince(kind: MarkKind, id: string, askedAt: number): boolean {
  const list = useMarkCounts.getState().taps[kind][id];
  return !!list && list.some((t) => t.at >= askedAt);
}

/**
 * The server has it. From now on an answer asked after this moment already
 * counts it.
 */
export function settleTap(kind: MarkKind, id: string, tap: Tap): void {
  useMarkCounts.setState((s) => {
    const list = s.taps[kind][id];
    if (!list || !list.includes(tap)) return s;
    return { taps: { ...s.taps, [kind]: { ...s.taps[kind], [id]: list.map((t) => (t === tap ? { ...t, at: Date.now() } : t)) } } };
  });
}

/** The write failed and was rolled back: the tap never happened. */
export function withdrawTap(kind: MarkKind, id: string, tap: Tap): void {
  useMarkCounts.setState((s) => {
    const list = s.taps[kind][id];
    if (!list || !list.includes(tap)) return s;
    const rest = list.filter((t) => t !== tap);
    const next = { ...s.taps[kind] };
    if (rest.length) next[id] = rest; else delete next[id];
    return { taps: { ...s.taps, [kind]: next } };
  });
}

/**
 * The number to draw, or null when nothing is known.
 *
 * `fallback` is a count the caller already holds from a cached page — shown
 * until a fresh answer arrives, with the session's taps on top (a cached page
 * predates every tap made since the app opened).
 */
export function selectMarkCount(s: MarkCountsState, kind: MarkKind, id: string, fallback?: number | null): number | null {
  const told = s.told[kind][id];
  const base = told ? told.value : usable(fallback) ? fallback : null;
  if (base === null) return null;
  const taps = s.taps[kind][id];
  const moved = taps ? taps.reduce((sum, t) => sum + t.by, 0) : 0;
  return Math.max(0, base + moved);
}

/** A bar's count. Re-renders only when THIS log's number changes. */
export function useMarkCount(kind: MarkKind, id: string, fallback?: number | null): number | null {
  return useMarkCounts((s) => selectMarkCount(s, kind, id, fallback));
}

export function resetMarkCounts(): void {
  useMarkCounts.setState(empty());
}

registerStoreReset(() => { resetMarkCounts(); });
