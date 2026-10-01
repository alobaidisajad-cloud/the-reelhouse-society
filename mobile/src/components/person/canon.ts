/**
 * THE CANON — the record, newest first, but the RECORD comes first.
 *
 * Work that exists now leads; announced and undated films keep their place in
 * the file but sit at the end of it (an undated entry is never "the newest",
 * or a long career would open on an untitled placeholder).
 *
 * `today` is the member's own calendar day (timeAgo.localCalendarDate) — never
 * a UTC one, or a member in Los Angeles at 5pm would already be "tomorrow" and
 * see tomorrow's releases ranked as released. It is passed in, not read here,
 * so the order is a function of its inputs and is tested as one.
 */
export interface CanonCredit {
  release_date?: string | null;
  popularity?: number | null;
}

/** 0 released · 1 announced · 2 undated. */
export function canonRank(c: CanonCredit, today: string): 0 | 1 | 2 {
  return !c.release_date ? 2 : c.release_date > today ? 1 : 0;
}

export function sortCanon<T extends CanonCredit>(canon: readonly T[], today: string): T[] {
  return [...canon].sort((a, b) => {
    const ra = canonRank(a, today), rb = canonRank(b, today);
    if (ra !== rb) return ra - rb;
    const dateA = a.release_date || '';
    const dateB = b.release_date || '';
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    return (b.popularity || 0) - (a.popularity || 0);
  });
}
