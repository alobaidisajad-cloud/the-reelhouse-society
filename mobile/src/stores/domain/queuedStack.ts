/**
 * queuedStack — a stack as the house sent it, with the member's own changes to it still in the queue
 * laid over it, in the order they were made: a film added offline stays on the stack, one taken off
 * stays off, and an edit (its name, its words, private or ranked, its films set in order) stays made,
 * however often the stack is read again. The member's stacks (listSlice) and a stack's page both read
 * through it, so neither drops a change that still waits to be sent.
 */

export interface QueuedStackWrite {
  type: string;
  payload: Record<string, unknown>;
  owner?: string;
}

export interface StackShape<F extends { id: number }> {
  title: string;
  description?: string;
  isPrivate?: boolean;
  isRanked?: boolean;
  films: F[];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * The stack with its queued changes laid over it, and how many films those changes add or take
 * away. `whole` says the films held are the whole stack: when they are only its first page, an added
 * film's place is past every page the house sends, so it is drawn once the house has it, and a film
 * list set by an edit is not laid over a part.
 */
export function overlayQueuedStack<F extends { id: number }, S extends StackShape<F>>(
  listId: string,
  stack: S,
  queue: readonly QueuedStackWrite[],
  memberId: string | null | undefined,
  film: (id: number, title: string, poster: string | null) => F,
  whole = true,
): { stack: S; sizeChange: number } {
  let out: S = stack;
  let films = stack.films;
  let sizeChange = 0;
  for (const q of queue) {
    const p = q.payload ?? {};
    if (p.list_id !== listId) continue;
    // Only this member's: a queue left by another member on this phone is never laid on.
    if (q.owner !== undefined && q.owner !== memberId) continue;
    if (p.user_id !== undefined && p.user_id !== memberId) continue;
    const filmId = Number(p.film_id);
    if (q.type === 'add_film_to_list') {
      if (!whole || films.some((f) => f.id === filmId)) continue;
      sizeChange += 1;
      films = [...films, film(filmId, str(p.film_title) ?? 'Unknown', str(p.poster_path))];
    } else if (q.type === 'remove_film_from_list') {
      const held = films.some((f) => f.id === filmId);
      if (held) films = films.filter((f) => f.id !== filmId);
      if (held || !whole) sizeChange -= 1;
    } else if (q.type === 'update_list') {
      const u = (p.updates ?? {}) as Record<string, unknown>;
      out = {
        ...out,
        ...(str(u.title) !== null ? { title: str(u.title) } : {}),
        ...(str(u.description) !== null ? { description: str(u.description) } : {}),
        ...(typeof u.is_private === 'boolean' ? { isPrivate: u.is_private } : {}),
        ...(typeof u.is_ranked === 'boolean' ? { isRanked: u.is_ranked } : {}),
      };
      if (whole && Array.isArray(p.films)) {
        const set = (p.films as Record<string, unknown>[]).map((f) => film(
          Number(f.film_id ?? f.id), str(f.film_title) ?? str(f.title) ?? 'Unknown', str(f.poster_path) ?? str(f.poster),
        ));
        sizeChange += set.length - films.length;
        films = set;
      }
    }
  }
  return { stack: films === stack.films && out === stack ? stack : { ...out, films }, sizeChange };
}

/** The films a queued change takes off a stack: a later page read from the house still holds them. */
export function filmsQueuedOff(listId: string, queue: readonly QueuedStackWrite[], memberId: string | null | undefined): Set<number> {
  const off = new Set<number>();
  for (const q of queue) {
    const p = q.payload ?? {};
    if (p.list_id !== listId || (q.owner !== undefined && q.owner !== memberId)) continue;
    if (q.type === 'remove_film_from_list') off.add(Number(p.film_id));
    else if (q.type === 'add_film_to_list') off.delete(Number(p.film_id));
  }
  return off;
}
