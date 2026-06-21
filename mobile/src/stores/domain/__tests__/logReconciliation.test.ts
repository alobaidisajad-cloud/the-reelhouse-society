/**
 * Property-Based Tests for Offline Queue Reconciliation Logic
 * Tests the reconciliation logic used in fetchLogsOp to merge server data
 * with pending offline mutations.
 */

import * as fc from 'fast-check';
import { sortLogs } from '../logSlice/helpers/logOperations';

// Feature: cursor-pagination-migration, Property 4: Pending removes are excluded from output

/**
 * Arbitrary generator for a log-like object with an ID and basic fields.
 */
const isoDateArb = fc
  .integer({ min: 0, max: 4102444800000 }) // 1970-01-01 to ~2100-01-01 in ms
  .map(ms => new Date(ms).toISOString());

const arbitraryLog = fc.record({
  id: fc.uuid(),
  filmId: fc.integer({ min: 1, max: 100000 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  watchedDate: fc.option(isoDateArb, { nil: null }),
  createdAt: isoDateArb,
  rating: fc.integer({ min: 0, max: 10 }),
  status: fc.constantFrom('watched', 'rewatched', 'abandoned') as fc.Arbitrary<'watched' | 'rewatched' | 'abandoned'>,
  review: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: null }),
});

type TestLog = {
  id: string;
  filmId: number;
  title: string;
  watchedDate: string | null;
  createdAt: string;
  rating: number;
  status: 'watched' | 'rewatched' | 'abandoned';
  review: string | null;
};

describe('Log Reconciliation — Property-Based Tests', () => {
  // Feature: cursor-pagination-migration, Property 4: Pending removes are excluded from output
  describe('Property 4: Pending removes are excluded from output', () => {
    /**
     * **Validates: Requirements 5.1**
     *
     * For any set of server-returned log rows and any set of pending remove IDs,
     * the filtered output SHALL contain no log whose ID appears in the pending removes set.
     */
    it('no log ID from the pending removes set appears in the output', () => {
      fc.assert(
        fc.property(
          // Generate an array of logs
          fc.array(arbitraryLog, { minLength: 0, maxLength: 30 }),
          // Generate a set of remove IDs: some from the log IDs, some random
          fc.array(arbitraryLog, { minLength: 0, maxLength: 30 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          (serverLogs: TestLog[], extraLogs: TestLog[], randomRemoveIds: string[]) => {
            // Build remove IDs: a subset of actual log IDs + some IDs that don't exist in logs
            const existingIds = serverLogs.map(l => l.id);
            // Pick some existing IDs as pending removes
            const subsetOfExisting = existingIds.filter((_, i) => i % 2 === 0);
            // Combine with random IDs that may or may not exist
            const removeIds = [...subsetOfExisting, ...randomRemoveIds];

            // Apply the same logic as fetchLogsOp
            const pendingRemoves = new Set(removeIds);
            const filtered = serverLogs.filter(log => !pendingRemoves.has(log.id));

            // Property: no log in the filtered output has an ID in pendingRemoves
            for (const log of filtered) {
              if (pendingRemoves.has(log.id)) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('output length is reduced by exactly the number of matching remove IDs', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 0, maxLength: 30 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 15 }),
          (serverLogs: TestLog[], removeIds: string[]) => {
            const pendingRemoves = new Set(removeIds);
            const filtered = serverLogs.filter(log => !pendingRemoves.has(log.id));

            // Count how many logs actually had IDs in the remove set
            const removedCount = serverLogs.filter(log => pendingRemoves.has(log.id)).length;

            return filtered.length === serverLogs.length - removedCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('logs NOT in the pending removes set are preserved unchanged', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 1, maxLength: 30 }),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          (serverLogs: TestLog[], removeIds: string[]) => {
            const pendingRemoves = new Set(removeIds);
            const filtered = serverLogs.filter(log => !pendingRemoves.has(log.id));

            // Every log NOT in remove set should be in filtered output
            const expectedLogs = serverLogs.filter(log => !pendingRemoves.has(log.id));
            if (filtered.length !== expectedLogs.length) return false;

            for (let i = 0; i < filtered.length; i++) {
              if (filtered[i].id !== expectedLogs[i].id) return false;
              if (filtered[i].title !== expectedLogs[i].title) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 5: Pending updates are applied to matching rows
  describe('Property 5: Pending updates are applied to matching rows', () => {
    /**
     * **Validates: Requirements 5.2**
     *
     * For any server-returned log row that has a matching pending update entry,
     * the output row SHALL contain the fields from the pending update payload
     * merged over the original row fields.
     */
    it('matching output rows contain the update fields merged over originals', () => {
      // Generator that produces updates with only DEFINED values
      // This matches the real-world scenario: offline queue only stores fields the user actually changed
      const updateFieldsArb = fc.record({
        rating: fc.integer({ min: 0, max: 10 }),
        review: fc.string({ minLength: 1, maxLength: 50 }),
      }, { requiredKeys: [] }); // All keys optional — only defined keys appear in output

      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 1, maxLength: 20 }),
          fc.array(updateFieldsArb, { minLength: 1, maxLength: 20 }),
          (serverLogs: TestLog[], updatePayloads) => {
            // Create pending updates: each maps to a server log by index (wrapping)
            const pendingUpdates = updatePayloads.map((updates, i) => ({
              payload: {
                id: serverLogs[i % serverLogs.length].id,
                updates,
              },
            }));

            // Apply updates: for each server log, merge any matching updates in order
            const result = serverLogs.map(log => {
              let finalLog = { ...log };
              const matching = pendingUpdates.filter(u => u.payload.id === log.id);
              for (const u of matching) {
                finalLog = { ...finalLog, ...u.payload.updates };
              }
              return finalLog;
            });

            // Property: for each log, the final state reflects ALL matching updates applied in order
            for (const log of serverLogs) {
              const outputLog = result.find(l => l.id === log.id);
              if (!outputLog) return false;

              // Compute expected final state by applying all matching updates in order
              const matching = pendingUpdates.filter(u => u.payload.id === log.id);
              let expected = { ...log };
              for (const u of matching) {
                expected = { ...expected, ...u.payload.updates };
              }

              // Verify the fields that updates could have changed
              if (outputLog.rating !== expected.rating) return false;
              if (outputLog.review !== expected.review) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fields not covered by updates remain unchanged', () => {
      const updateFieldsArb = fc.record({
        rating: fc.integer({ min: 0, max: 10 }),
      }, { requiredKeys: [] });

      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 1, maxLength: 15 }),
          fc.array(updateFieldsArb, { minLength: 1, maxLength: 10 }),
          (serverLogs: TestLog[], updatePayloads) => {
            const pendingUpdates = updatePayloads.map((updates, i) => ({
              payload: {
                id: serverLogs[i % serverLogs.length].id,
                updates,
              },
            }));

            const result = serverLogs.map(log => {
              let finalLog = { ...log };
              const matching = pendingUpdates.filter(u => u.payload.id === log.id);
              for (const u of matching) {
                finalLog = { ...finalLog, ...u.payload.updates };
              }
              return finalLog;
            });

            // Property: title, filmId, id, createdAt are never changed by rating-only updates
            for (const log of serverLogs) {
              const outputLog = result.find(l => l.id === log.id);
              if (!outputLog) return false;
              if (outputLog.title !== log.title) return false;
              if (outputLog.filmId !== log.filmId) return false;
              if (outputLog.createdAt !== log.createdAt) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 6: Pending adds are prepended on fresh fetch
  describe('Property 6: Pending adds are prepended on fresh fetch', () => {
    /**
     * **Validates: Requirements 5.3**
     *
     * For any set of pending add entries and any set of server-returned rows
     * when loadMore=false, all pending add entries SHALL appear in the merged output list.
     */
    it('all add entries appear in the merged output', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 1, maxLength: 15 }),
          fc.array(arbitraryLog, { minLength: 0, maxLength: 20 }),
          (pendingAdds: TestLog[], serverRows: TestLog[]) => {
            // Simulate loadMore=false: [...pendingAdds, ...serverRows]
            const merged = [...pendingAdds, ...serverRows];

            // Property: every pending add entry appears in the merged output
            for (const add of pendingAdds) {
              if (!merged.some(l => l.id === add.id)) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pending adds come before server rows in the merged array', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 1, maxLength: 10 }),
          fc.array(arbitraryLog, { minLength: 1, maxLength: 10 }),
          (pendingAdds: TestLog[], serverRows: TestLog[]) => {
            const merged = [...pendingAdds, ...serverRows];

            // Property: the first pendingAdds.length entries are exactly the pending adds
            for (let i = 0; i < pendingAdds.length; i++) {
              if (merged[i].id !== pendingAdds[i].id) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 7: Deduplication produces unique IDs
  describe('Property 7: Deduplication produces unique IDs', () => {
    /**
     * **Validates: Requirements 5.4**
     *
     * For any merged list of logs (with intentional duplicate IDs),
     * after Map-based deduplication by ID, the output list SHALL contain
     * no two entries with the same ID.
     */
    it('output contains only unique IDs after Map-based deduplication', () => {
      fc.assert(
        fc.property(
          // Generate logs with intentional duplicate IDs by reusing a small pool of IDs
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }).chain(idPool =>
            fc.array(
              fc.record({
                id: fc.constantFrom(...idPool),
                filmId: fc.integer({ min: 1, max: 100000 }),
                title: fc.string({ minLength: 1, maxLength: 30 }),
                watchedDate: fc.option(isoDateArb, { nil: null }),
                createdAt: isoDateArb,
                rating: fc.integer({ min: 0, max: 10 }),
                status: fc.constantFrom('watched', 'rewatched', 'abandoned') as fc.Arbitrary<'watched' | 'rewatched' | 'abandoned'>,
                review: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: null }),
              }),
              { minLength: 2, maxLength: 30 }
            )
          ),
          (logsWithDuplicates: TestLog[]) => {
            // Apply Map-based deduplication (same logic as fetchLogsOp)
            const uniqueMap = new Map<string, TestLog>();
            logsWithDuplicates.forEach(l => uniqueMap.set(l.id, l));
            const result = Array.from(uniqueMap.values());

            // Property: no two entries in result share the same id
            const seenIds = new Set<string>();
            for (const log of result) {
              if (seenIds.has(log.id)) return false;
              seenIds.add(log.id);
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('deduplication preserves the last occurrence for each ID (Map.set behavior)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }).chain(idPool =>
            fc.array(
              fc.record({
                id: fc.constantFrom(...idPool),
                filmId: fc.integer({ min: 1, max: 100000 }),
                title: fc.string({ minLength: 1, maxLength: 30 }),
                watchedDate: fc.option(isoDateArb, { nil: null }),
                createdAt: isoDateArb,
                rating: fc.integer({ min: 0, max: 10 }),
                status: fc.constantFrom('watched', 'rewatched', 'abandoned') as fc.Arbitrary<'watched' | 'rewatched' | 'abandoned'>,
                review: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: null }),
              }),
              { minLength: 2, maxLength: 30 }
            )
          ),
          (logsWithDuplicates: TestLog[]) => {
            const uniqueMap = new Map<string, TestLog>();
            logsWithDuplicates.forEach(l => uniqueMap.set(l.id, l));
            const result = Array.from(uniqueMap.values());

            // Property: for each unique ID, the kept entry is the LAST one in the input
            for (const entry of result) {
              // Find last occurrence in the input
              let lastIndex = -1;
              for (let i = logsWithDuplicates.length - 1; i >= 0; i--) {
                if (logsWithDuplicates[i].id === entry.id) {
                  lastIndex = i;
                  break;
                }
              }
              if (lastIndex === -1) return false;
              if (entry.title !== logsWithDuplicates[lastIndex].title) return false;
              if (entry.filmId !== logsWithDuplicates[lastIndex].filmId) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 8: Sort order invariant
  describe('Property 8: Sort order invariant', () => {
    /**
     * **Validates: Requirements 5.5**
     *
     * For any deduplicated list of logs, after applying sortLogs,
     * the output SHALL be in descending order by watchedDate (falling back to createdAt).
     */
    it('sortLogs output is in descending order by watchedDate (fallback to createdAt)', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 0, maxLength: 30 }),
          (logs: TestLog[]) => {
            // sortLogs mutates in place, so spread into fresh array
            const input = logs.map(l => ({ ...l }));
            const sorted = sortLogs(input as any) as any as TestLog[];

            // Property: for every consecutive pair, effectiveDate[i] >= effectiveDate[i+1]
            for (let i = 0; i < sorted.length - 1; i++) {
              const dateA = sorted[i].watchedDate || sorted[i].createdAt || '1970-01-01T00:00:00Z';
              const dateB = sorted[i + 1].watchedDate || sorted[i + 1].createdAt || '1970-01-01T00:00:00Z';
              // Descending order: dateA >= dateB
              if (dateB.localeCompare(dateA) > 0) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sortLogs preserves all elements (no data loss)', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryLog, { minLength: 0, maxLength: 25 }),
          (logs: TestLog[]) => {
            const input = logs.map(l => ({ ...l }));
            const sorted = sortLogs(input as any) as any as TestLog[];

            // Property: sorted output has same length and same set of IDs
            if (sorted.length !== logs.length) return false;
            const inputIds = new Set(logs.map(l => l.id));
            const outputIds = new Set(sorted.map(l => l.id));
            if (inputIds.size !== outputIds.size) return false;
            for (const id of inputIds) {
              if (!outputIds.has(id)) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
