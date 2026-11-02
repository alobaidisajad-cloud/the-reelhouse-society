/**
 * An edit is laid only over what its member edited (SYN-28).
 *
 * An edit queued on a phone may be sent days later, after the same record was changed from
 * another device or the website. Written whole, it put back what was there before. Each edit
 * now carries `was`: the fields it changes as the phone showed them when the member changed
 * them. The row is read; a field changed elsewhere since is refused, never laid over; a field
 * the member left as it was is not sent, so a change made elsewhere to it stays; the rest is
 * written only if the row has not moved since it was read.
 *
 * Stacks are kept by save_stack itself (p_read_at): their films are rows of their own.
 */
import { cleanForStorage } from './sanitizeInput';

type Row = Record<string, unknown>;

/** The refusal: HTTP 412, as save_stack's PT412, which the queue gives back (sortRefused). */
export const CHANGED_SINCE_CODE = 'PT412';

export const LOG_CHANGED_SINCE = 'This record was changed elsewhere after you opened it. Nothing was changed here: open it again to see it as it is.';
export const FILING_CHANGED_SINCE = 'This filing was changed elsewhere after you opened it. Nothing was changed here: open it again to see it as it is.';

export function changedSince(message: string): Error {
  return Object.assign(new Error(message), { code: CHANGED_SINCE_CODE, status: 412 });
}

export function isChangedSince(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === CHANGED_SINCE_CODE;
}

const empty = (v: unknown) => v === null || v === undefined || v === '';

/**
 * One value as the house would store it, beside another: an empty is an empty (null, '' or
 * missing), a number is its value (numeric may arrive as text), words are compared cleaned
 * (the house cleans what it stores; cleanForStorage does all it does, and more).
 */
export function same(a: unknown, b: unknown): boolean {
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'string' && typeof b === 'string') return cleanForStorage(a) === cleanForStorage(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const x = a as Row;
    const y = b as Row;
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((k) => same(x[k], y[k]));
  }
  return a === b;
}

/** Tries before a row that keeps moving between the read and the write is sent again later. */
const TRIES = 3;

export type KeptWrite = 'written' | 'unchanged' | 'gone' | 'refused';

/**
 * Writes `changes` over a row only where it still holds `was`.
 * - `read`: the row, with `version` and every column `changes` may name; null when gone.
 * - `write`: the update, on condition the row's `version` is still `at`; the rows it wrote.
 * - `free`: columns merged, not compared (a log's viewings: `merge` joins both sides).
 * - `asStored`: a column's value as the house keeps it (a log's day: the phone holds noon UTC).
 * Answers 'refused' when the house matched no row although the row has not moved (a policy:
 * withheld, ended, not theirs); throws changedSince(refusal) for a field changed elsewhere.
 */
export async function keepWhatChangedSince(o: {
  changes: Row;
  was: Row;
  version: string;
  refusal: string;
  read: () => Promise<Row | null>;
  write: (send: Row, at: unknown) => Promise<readonly unknown[] | null>;
  free?: readonly string[];
  merge?: (send: Row, row: Row) => Row;
  asStored?: (column: string, value: unknown) => unknown;
}): Promise<KeptWrite> {
  const at = (k: string, v: unknown) => (o.asStored ? o.asStored(k, v) : v);
  const alike = (k: string, a: unknown, b: unknown) => same(at(k, a), at(k, b));
  let row = await o.read();
  for (let tried = 0; ; tried++) {
    if (!row) return 'gone';
    const send: Row = {};
    for (const [k, v] of Object.entries(o.changes)) {
      // Merged, or with nothing to compare against: written as before.
      if (o.free?.includes(k) || !(k in o.was)) { send[k] = v; continue; }
      // Left as it was by the member: what is there now stays, whoever wrote it.
      if (alike(k, v, o.was[k])) continue;
      if (alike(k, row[k], o.was[k]) || alike(k, row[k], v)) { send[k] = v; continue; }
      throw changedSince(o.refusal);
    }
    const merged = o.merge ? o.merge(send, row) : send;
    if (Object.keys(merged).length === 0) return 'unchanged';
    const readAt = row[o.version];
    const wrote = await o.write(merged, readAt);
    if (wrote && wrote.length > 0) return 'written';
    const again = await o.read();
    if (!again) return 'gone';
    if (again[o.version] === readAt) return 'refused';
    // Written between this read and this write: read again and judge again.
    if (tried + 1 >= TRIES) {
      throw Object.assign(new Error('The record kept changing while this edit was sent.'), { status: 503 });
    }
    row = again;
  }
}

/** The fields of `changes` that `held` holds, as `was`: a field it did not read is not claimed. */
export function wasOf(changes: Row, held: Row): Row {
  const was: Row = {};
  for (const k of Object.keys(changes)) if (k in held && held[k] !== undefined) was[k] = held[k];
  return was;
}
