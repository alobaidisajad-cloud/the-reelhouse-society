/**
 * importReceipt.ts — the record of exactly what one import created, so it can
 * be taken back.
 *
 * WHY THIS EXISTS
 * Every other import safeguard removes a guess: the source fingerprint settles
 * the rating scale, a whole-file scan settles the date format, a confidence
 * gate refuses uncertain film matches. One case survives all of that and is
 * genuinely undecidable — a hand-made spreadsheet with no recognisable source,
 * no half-values and nothing above 5. Out-of-5 and out-of-10 produce byte
 * identical data there; no algorithm can separate them, ours included.
 *
 * The honest protection for that is not a question the member cannot answer at
 * the scale of 3,000 reviews. It is reversibility. This turns the worst case
 * from "your ratings are permanently wrong and re-importing will not repair
 * them" into "tap undo".
 *
 * THE SAFETY RULE
 * A receipt records ONLY rows the import genuinely created. It never records a
 * row that already existed and was merged into, because undo deletes what the
 * receipt names — and deleting something the member already owned would make
 * undo more destructive than the mistake it exists to correct.
 */

/** One import's footprint. Everything here is safe to delete, and nothing else is. */
export interface ImportReceipt {
  /** Schema version — a receipt written by an older build must not be replayed
   *  blind by a newer one with different semantics. */
  v: 1;
  /** ISO timestamp of the import. */
  at: string;
  /** Whose import this was. Guards against a receipt surviving a sign-out and
   *  being applied to a different account on the same device. */
  userId: string;
  /** Human label for the confirmation prompt, e.g. "letterboxd.zip". */
  sourceLabel: string;

  /** logs rows INSERTED (ignoreDuplicates: true, so never a pre-existing row). */
  logIds: string[];
  /** watchlists rows INSERTED. */
  watchlistIds: string[];
  /** physical_archive rows INSERTED. */
  physicalArchiveIds: string[];

  /** Stacks the import CREATED. Deleting these removes the whole list; their
   *  items go with them via the list_items FK cascade. */
  listsCreated: string[];
  /** Films added to stacks that ALREADY EXISTED. Only the added films are
   *  named, so undo empties what the import put in and leaves the member's own
   *  curation — and the stack itself — untouched. */
  listItemsAdded: { listId: string; filmIds: number[] }[];
}

/** A blank receipt to accumulate into during an import. */
export function emptyReceipt(userId: string, sourceLabel: string): ImportReceipt {
  return {
    v: 1,
    at: new Date().toISOString(),
    userId,
    sourceLabel,
    logIds: [],
    watchlistIds: [],
    physicalArchiveIds: [],
    listsCreated: [],
    listItemsAdded: [],
  };
}

/** Total rows an undo would remove — drives the confirmation copy. */
export function receiptSize(r: ImportReceipt): number {
  return (
    r.logIds.length +
    r.watchlistIds.length +
    r.physicalArchiveIds.length +
    r.listsCreated.length +
    r.listItemsAdded.reduce((n, l) => n + l.filmIds.length, 0)
  );
}

/** True when there is genuinely nothing to take back. */
export function receiptIsEmpty(r: ImportReceipt): boolean {
  return receiptSize(r) === 0;
}

/**
 * Validates an untrusted stored receipt before anything is deleted with it.
 * MMKV contents are not a trusted input: a truncated write, a build that
 * changed the shape, or a receipt left behind by a previous account must never
 * reach the delete path. Anything that fails returns null and undo stays off.
 */
export function parseReceipt(raw: unknown, expectedUserId: string): ImportReceipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (r.v !== 1) return null;
  if (typeof r.at !== 'string' || typeof r.userId !== 'string') return null;
  // A receipt belongs to the account that made it. Never replay across accounts.
  if (r.userId !== expectedUserId) return null;

  const strArray = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : null;

  const logIds = strArray(r.logIds);
  const watchlistIds = strArray(r.watchlistIds);
  const physicalArchiveIds = strArray(r.physicalArchiveIds);
  const listsCreated = strArray(r.listsCreated);
  if (!logIds || !watchlistIds || !physicalArchiveIds || !listsCreated) return null;

  if (!Array.isArray(r.listItemsAdded)) return null;
  const listItemsAdded: ImportReceipt['listItemsAdded'] = [];
  for (const entry of r.listItemsAdded) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.listId !== 'string') return null;
    if (!Array.isArray(e.filmIds) || !e.filmIds.every(x => typeof x === 'number' && Number.isFinite(x))) return null;
    listItemsAdded.push({ listId: e.listId, filmIds: e.filmIds as number[] });
  }

  return {
    v: 1,
    at: r.at,
    userId: r.userId,
    sourceLabel: typeof r.sourceLabel === 'string' ? r.sourceLabel : 'your archive',
    logIds,
    watchlistIds,
    physicalArchiveIds,
    listsCreated,
    listItemsAdded,
  };
}
