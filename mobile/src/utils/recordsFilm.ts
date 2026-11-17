/**
 * The film of a record the phone holds, by the record's id: what a queued replay from an older
 * build, which named only its record, is matched to its film by (mutationExecutor). The films
 * store says how it is found as it is made (stores/films.ts); the queue asks here, so it never
 * loads a store itself (the stores import the queue).
 */
let finder: ((logId: string) => number | null) | null = null;

/** How a record's film is found: set once, by the store that holds the records. */
export function findRecordsFilmBy(find: (logId: string) => number | null): void {
  finder = find;
}

/** The film of the record the phone holds by this id, or null when it holds none. */
export function filmOfRecord(logId: string): number | null {
  return finder ? finder(logId) : null;
}
