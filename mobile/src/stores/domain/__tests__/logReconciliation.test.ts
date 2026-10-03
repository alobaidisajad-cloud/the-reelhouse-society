/**
 * logReconciliation.test.ts — the archive, with the writes still in the queue.
 * ─────────────────────────────────────────────────────────────────────────────
 * When the archive is read, writes the member made offline have not reached the
 * house yet: a removed log is still on the page the server sends, a changed one
 * still shows the old rating, a new one is not there at all. fetchLogsOp lays
 * the queue over the page so none of that flickers back.
 *
 * These properties used to re-implement that logic inline and test the copy —
 * they could not fail whatever the store did. They now drive the store's own
 * functions. And they hold the rule the copy never had: an unclean sign-out can
 * leave ANOTHER member's writes in the queue, and none of them may reach this
 * member's archive.
 */
import * as fc from 'fast-check';

import { oneOfEachLog, overlayQueuedLogs, sortLogs } from '../logSlice/helpers/logOperations';

const ME = 'member-me';
const SOMEONE_ELSE = 'member-who-left';

const isoDateArb = fc
  .integer({ min: 0, max: 4102444800000 }) // 1970-01-01 to ~2100-01-01 in ms
  .map((ms) => new Date(ms).toISOString());

/** A row as the server sends it. */
const rowArb = fc.record({
  id: fc.uuid(),
  user_id: fc.constant(ME),
  film_id: fc.integer({ min: 1, max: 100000 }),
  film_title: fc.string({ minLength: 1, maxLength: 50 }),
  watched_date: fc.option(isoDateArb, { nil: null }),
  created_at: isoDateArb,
  rating: fc.integer({ min: 0, max: 5 }),
  status: fc.constantFrom('watched', 'rewatched', 'abandoned'),
  review: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
});
type Row = { id: string; user_id: string; film_id: number; film_title: string; rating: number; [k: string]: unknown };

const remove = (id: string, owner = ME) => ({ type: 'remove_log', payload: { log_id: id, user_id: owner } });
const change = (id: string, updates: Record<string, unknown>) => ({ type: 'update_log', payload: { id, updates } });
const add = (row: Row, owner = ME) => ({ type: 'add_log', payload: { ...row, user_id: owner } });

describe('a queued removal hides its row', () => {
  it('no removed log is drawn, and every other row stands, in order', () => {
    fc.assert(fc.property(fc.uniqueArray(rowArb, { selector: (r) => r.id, maxLength: 30 }), fc.array(fc.uuid(), { maxLength: 10 }), (rows, stray) => {
      const removed = [...rows.filter((_, i) => i % 2 === 0).map((r) => r.id), ...stray];
      const { page } = overlayQueuedLogs(ME, rows, removed.map((id) => remove(id)));
      const gone = new Set(removed);
      expect(page.map((l) => l.id)).toEqual(rows.filter((r) => !gone.has(r.id)).map((r) => r.id));
    }), { numRuns: 100 });
  });
});

describe('a queued change is laid over its row', () => {
  it('the row carries every change made to it, in the order they were made', () => {
    fc.assert(fc.property(
      fc.uniqueArray(rowArb, { selector: (r) => r.id, minLength: 1, maxLength: 20 }),
      fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 20 }),
      (rows, ratings) => {
        const queue = ratings.map((rating, i) => change(rows[i % rows.length].id, { rating }));
        const { page } = overlayQueuedLogs(ME, rows, queue);
        rows.forEach((r, i) => {
          const last = [...queue].reverse().find((q) => q.payload.id === r.id);
          const drawn = page.find((l) => l.id === r.id)!;
          expect(drawn.rating).toBe(last ? (last.payload.updates as { rating: number }).rating : r.rating);
          // and nothing it did not change
          expect([drawn.title, drawn.filmId]).toEqual([rows[i].film_title, rows[i].film_id]);
        });
      },
    ), { numRuns: 100 });
  });
});

describe('a queued log the house does not have yet', () => {
  it('stands ready to lead a fresh page, with its own changes, unless it was removed too', () => {
    fc.assert(fc.property(fc.uniqueArray(rowArb, { selector: (r) => r.id, minLength: 1, maxLength: 15 }), (queued) => {
      const takenBack = queued[0].id;
      const queue = [...queued.map((r) => add(r)), change(queued[queued.length - 1].id, { rating: 5 }), remove(takenBack)];
      const { queuedAdds } = overlayQueuedLogs(ME, [], queue);
      const expected = queued.filter((r) => r.id !== takenBack).map((r) => r.id);
      expect(queuedAdds.map((l) => l.id)).toEqual(expected);
      if (queued.length > 1) expect(queuedAdds[queuedAdds.length - 1].rating).toBe(5);
    }), { numRuns: 100 });
  });
});

describe('another member’s writes never reach this archive', () => {
  it('a log queued by the member who left is not drawn here', () => {
    fc.assert(fc.property(fc.uniqueArray(rowArb, { selector: (r) => r.id, minLength: 1, maxLength: 10 }), (theirs) => {
      const { queuedAdds } = overlayQueuedLogs(ME, [], theirs.map((r) => add(r, SOMEONE_ELSE)));
      expect(queuedAdds).toEqual([]);
    }), { numRuns: 50 });
  });

  it('nor does their removal hide one of this member’s logs', () => {
    fc.assert(fc.property(fc.uniqueArray(rowArb, { selector: (r) => r.id, minLength: 1, maxLength: 10 }), (mine) => {
      const { page } = overlayQueuedLogs(ME, mine, mine.map((r) => remove(r.id, SOMEONE_ELSE)));
      expect(page.map((l) => l.id)).toEqual(mine.map((r) => r.id));
    }), { numRuns: 50 });
  });

  it('while this member’s own writes in the same queue still apply', () => {
    fc.assert(fc.property(rowArb, rowArb, (mine, theirs) => {
      const { queuedAdds } = overlayQueuedLogs(ME, [], [add(theirs, SOMEONE_ELSE), add(mine)]);
      expect(queuedAdds.map((l) => l.id)).toEqual([mine.id]);
    }), { numRuns: 50 });
  });
});

describe('one entry per log', () => {
  it('keeps the LAST of each id, newest first', () => {
    fc.assert(fc.property(
      fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }).chain((ids) =>
        fc.array(rowArb.map((r) => ({ ...r })), { minLength: 2, maxLength: 30 }).chain((rows) =>
          fc.tuple(fc.constant(rows), fc.array(fc.constantFrom(...ids), { minLength: rows.length, maxLength: rows.length })))),
      ([rows, ids]) => {
        const logs = overlayQueuedLogs(ME, rows.map((r, i) => ({ ...r, id: ids[i] })), []).page;
        const out = oneOfEachLog(logs);
        expect(new Set(out.map((l) => l.id)).size).toBe(out.length);
        for (const l of out) {
          const last = [...logs].reverse().find((x) => x.id === l.id)!;
          expect(l.title).toBe(last.title);
        }
        expect(out).toEqual(sortLogs([...out]));
      },
    ), { numRuns: 100 });
  });
});

describe('the order', () => {
  it('is newest first by the date watched, falling back to the date logged', () => {
    fc.assert(fc.property(fc.uniqueArray(rowArb, { selector: (r) => r.id, maxLength: 30 }), (rows) => {
      const sorted = sortLogs(overlayQueuedLogs(ME, rows, []).page);
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i].watchedDate || sorted[i].createdAt || '1970-01-01T00:00:00Z';
        const b = sorted[i + 1].watchedDate || sorted[i + 1].createdAt || '1970-01-01T00:00:00Z';
        expect(b.localeCompare(a)).toBeLessThanOrEqual(0);
      }
      expect(sorted.map((l) => l.id).sort()).toEqual(rows.map((r) => r.id).sort());
    }), { numRuns: 100 });
  });
});
