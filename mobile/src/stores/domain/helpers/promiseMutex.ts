/**
 * promiseMutex — FIFO serialisation per key, with active garbage collection.
 *
 * Extracted from `interactionSlice`, which had the only correct implementation
 * of this in the codebase. The watchlist solved the same problem 200 lines away
 * by chaining a promise per film id into Zustand state and never deleting the
 * entry — so the map only ever grew, and every write spread a copy of the whole
 * object to store one key.
 *
 * Two properties this file exists to guarantee:
 *
 * 1. **FIFO per key.** Rapid taps on the same film must reach the database in
 *    order, or a remove can overtake an add.
 * 2. **The map empties itself.** An entry is deleted once its task settles, so
 *    nothing accumulates across a session.
 */

const _mutexes = new Map<string, Promise<void>>();

export function runWithMutex(key: string, task: () => Promise<void>): Promise<void> {
    const previous = _mutexes.get(key) ?? Promise.resolve();

    // `then(task, task)` — run on BOTH settle paths. A failed task must not
    // strand every later task queued behind it on the same key.
    const current = previous.then(task, task);
    _mutexes.set(key, current);

    // Delete on settle, but ONLY if this is still the newest task for the key —
    // otherwise a slow early task would evict the entry a later one is queued on.
    //
    // The `.catch` is not optional. This cleanup chain is discarded, so when
    // `current` rejects, the derived promise would reject with nobody listening
    // and raise an unhandled rejection. The real rejection still reaches the
    // caller through the returned `current`.
    current
        .finally(() => {
            if (_mutexes.get(key) === current) _mutexes.delete(key);
        })
        .catch(() => { /* delivered via the returned promise; see above */ });

    return current;
}

/**
 * Drop every queued task on logout.
 *
 * Without this the map outlives the session, and the next member's first write
 * to a key chains onto a promise belonging to the previous one — waiting on
 * their network call before starting. Entries delete themselves as they settle,
 * so this is about the handover, not about growth.
 *
 * In-flight work is not cancelled — a promise cannot be — but nothing new
 * queues behind it, and the staleness guard stops its result from landing.
 */
export function clearAllMutexes(): void {
    _mutexes.clear();
}

/** Test-only view. Never read this in app code. */
export function _mutexCountForTests(): number {
    return _mutexes.size;
}
