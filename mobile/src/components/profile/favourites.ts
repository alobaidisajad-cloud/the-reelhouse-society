/**
 * The three mounts of the altarpiece — read once, the same way, everywhere.
 *
 * Two components interpret `preferences.favorites`: the triptych draws it, and
 * the Auteur backdrop dresses the whole page from it. They must agree on which
 * film is "the centre", so the rule lives here and not in either of them.
 *
 * ── WHY THE MOUNTS ARE POSITIONAL ────────────────────────────────────────────
 * `handleClearSlot` has always written a literal `null` into the array — so a
 * member who clears their first favourite has `[null, A, B]` stored. The old
 * reader did `.filter(Boolean)` and THEN indexed, which quietly slid A into
 * first place: you removed one film and a different one was promoted without
 * being asked. On the old equal-thirds row that was merely surprising. On the
 * altarpiece the first slot is the centre panel — the largest thing on the
 * page, and the film the backdrop is cut from — so the same shrug would
 * re-dress somebody's entire profile behind their back.
 *
 * A hole is now a hole. Index 0 is the centre, 1 is the left wing, 2 is the
 * right wing, and the only way a wing reaches the centre is the member asking
 * for it.
 */

export interface FavouriteFilm {
  id: number;
  title: string;
  poster_path: string;
  /**
   * Release year, for the gallery label.
   *
   * Optional because it is NEW: nothing stored before this build carries one,
   * and there is no honest way to invent it for the favourites already on file
   * (the search result it came from is long gone). Newly chosen films record
   * it, so labels fill in as members curate — a label with no year simply
   * closes up rather than showing a guess.
   */
  year?: string;
}

/** How many mounts the altarpiece has. Not a magic 3 scattered across files. */
export const MOUNT_COUNT = 3;

/** Index 0 is the centre panel; 1 and 2 are the wings. */
export const CENTRE_MOUNT = 0;

/**
 * One stored entry → a film, or nothing.
 *
 * Entries arrive in three shapes, all of them real:
 *   • an object, the normal case;
 *   • a bare string, from an old build that stored titles only — it keeps its
 *     title and gets no poster, which the mount draws as a titled plate rather
 *     than a broken image;
 *   • `null`, from a cleared slot.
 */
function toFilm(entry: unknown): FavouriteFilm | null {
  if (typeof entry === 'string') {
    const title = entry.trim();
    return title ? { id: -1, title, poster_path: '' } : null;
  }
  if (entry && typeof entry === 'object') {
    const o = entry as Partial<FavouriteFilm>;
    const title = typeof o.title === 'string' ? o.title : '';
    const poster = typeof o.poster_path === 'string' ? o.poster_path : '';
    // An entry with neither a title nor a poster is not a film, it is residue.
    if (!title && !poster) return null;
    // A four-digit year or nothing — never a partial date and never a number
    // that would render as `2019.0` or `NaN` under a label.
    const year = typeof o.year === 'string' && /^\d{4}$/.test(o.year) ? o.year : undefined;
    return { id: typeof o.id === 'number' && o.id ? o.id : -1, title, poster_path: poster, year };
  }
  return null;
}

/** The three mounts, in hanging order, holes preserved. */
export function readMounts(raw: unknown): (FavouriteFilm | null)[] {
  const list = Array.isArray(raw) ? raw : [];
  const mounts: (FavouriteFilm | null)[] = [];
  for (let i = 0; i < MOUNT_COUNT; i++) mounts.push(toFilm(list[i]));
  return mounts;
}

/**
 * The film the page is dressed from.
 *
 * The centre panel wins — the backdrop and the altarpiece should be cut from
 * the same film, which is the whole reason the centre is the largest thing on
 * the page. If the centre stands empty we fall to the first wing that holds
 * something, rather than stripping an Auteur's backdrop over one empty mount,
 * and a film with no poster can dress nothing, so it is skipped.
 *
 * ── WHY THERE IS NO EXPLICIT "CENTRE FIRST" BRANCH ───────────────────────────
 * There was one, and a mutation pass proved it could never change the answer:
 * `readMounts` returns STORED order, in which the centre is index 0, so a plain
 * scan already prefers it in every case. The branch read as intent and executed
 * as nothing. What actually carries the rule is the order of this loop, so that
 * is what the comment — and the test — has to be about: iterate the mounts in
 * STORED order, never in HANGING order (wing, centre, wing), which would hand
 * the page's backdrop to the left wing.
 */
export function pickBackdropFilm(raw: unknown): FavouriteFilm | null {
  for (const m of readMounts(raw)) if (m?.poster_path) return m;
  return null;
}
