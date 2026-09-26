/**
 * tellMarks — what one fetch learned about the posts it brought, told once.
 *
 * Every fetch that brings logs or stacks learns two things about each: its
 * counts, and whether the viewer has certified it. Both go to the stores every
 * screen reads — the counts to `markCounts`, the viewer's mark to the heart
 * index (`learnEndorsements`) — with the moment the question was ASKED, which
 * is how each store knows whether a tap made since then outranks the answer.
 *
 * One function, so no fetch can tell one store and forget the other.
 */
import { useFilmStore } from './films';
import { tellMarkCounts } from './markCounts';

export interface MarkRow {
  id: string;
  certify?: number | null;
  critique?: number | null;
  /** The viewer's own certification: true, false, or null when the source could not say. */
  certified?: boolean | null;
}

export function tellMarks(kind: 'log' | 'list', rows: MarkRow[], askedAt: number): void {
  if (rows.length === 0) return;
  tellMarkCounts(rows, askedAt);
  useFilmStore.getState().learnEndorsements(kind, rows.map((r) => ({ id: r.id, certified: r.certified })), askedAt);
}
