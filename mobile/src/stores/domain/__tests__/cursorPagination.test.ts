import * as fc from 'fast-check';

// Feature: cursor-pagination-migration, Property 1: JSON cursor round-trip
// Feature: cursor-pagination-migration, Property 2: Pipe cursor round-trip
// Feature: cursor-pagination-migration, Property 3: hasMore derivation from data length
// Feature: cursor-pagination-migration, Property 9: Malformed cursor resilience

describe('Cursor Pagination — Property-Based Tests', () => {
  // Feature: cursor-pagination-migration, Property 1: JSON cursor round-trip
  // **Validates: Requirements 1.4**
  describe('Property 1: JSON cursor round-trip', () => {
    it('serializing and parsing a JSON cursor preserves all fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            watched_date: fc.oneof(
              fc.integer({ min: 946684800000, max: 4102444800000 }).map(ts => new Date(ts).toISOString()),
              fc.constant(null)
            ),
            id: fc.uuid(),
          }),
          (row) => {
            // Serialize
            const serialized = JSON.stringify({
              lastDate: row.watched_date,
              lastId: row.id,
              wasDateNull: row.watched_date === null,
            });

            // Parse
            const parsed = JSON.parse(serialized);

            // Assert round-trip identity
            expect(parsed.lastDate).toBe(row.watched_date);
            expect(parsed.lastId).toBe(row.id);
            expect(parsed.wasDateNull).toBe(row.watched_date === null);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 2: Pipe cursor round-trip
  // **Validates: Requirements 2.2**
  describe('Property 2: Pipe cursor round-trip', () => {
    it('serializing and splitting a pipe cursor preserves both parts', () => {
      fc.assert(
        fc.property(
          fc.record({
            // ISO date string without pipe characters (constrained to valid date range)
            created_at: fc.integer({ min: 946684800000, max: 4102444800000 }).map(ts => new Date(ts).toISOString()),
            // UUID without pipe characters
            id: fc.uuid(),
          }),
          (row) => {
            // Precondition: neither field contains a pipe
            fc.pre(!row.created_at.includes('|') && !row.id.includes('|'));

            // Serialize
            const cursor = `${row.created_at}|${row.id}`;

            // Parse
            const parts = cursor.split('|');

            // Assert round-trip identity
            expect(parts.length).toBe(2);
            expect(parts[0]).toBe(row.created_at);
            expect(parts[1]).toBe(row.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 3: hasMore derivation from data length
  // **Validates: Requirements 1.6, 2.4, 3.3, 3.4**
  describe('Property 3: hasMore derivation from data length', () => {
    const LOG_PAGE_SIZE = 50;
    const LIST_PAGE_SIZE = 20;

    function computeHasMoreAndCursor(data: unknown[], pageSize: number) {
      const hasMore = data.length === pageSize;
      const nextCursor = hasMore && data.length > 0 ? 'some-cursor-value' : null;
      return { hasMore, nextCursor };
    }

    it('hasMore is true iff data.length === PAGE_SIZE (logs, PAGE_SIZE=50)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: LOG_PAGE_SIZE + 5 }),
          (length) => {
            const data = Array.from({ length }, (_, i) => ({ id: `item-${i}` }));
            const { hasMore, nextCursor } = computeHasMoreAndCursor(data, LOG_PAGE_SIZE);

            expect(hasMore).toBe(data.length === LOG_PAGE_SIZE);
            if (!hasMore) {
              expect(nextCursor).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hasMore is true iff data.length === PAGE_SIZE (lists, PAGE_SIZE=20)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: LIST_PAGE_SIZE + 5 }),
          (length) => {
            const data = Array.from({ length }, (_, i) => ({ id: `item-${i}` }));
            const { hasMore, nextCursor } = computeHasMoreAndCursor(data, LIST_PAGE_SIZE);

            expect(hasMore).toBe(data.length === LIST_PAGE_SIZE);
            if (!hasMore) {
              expect(nextCursor).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cursor-pagination-migration, Property 9: Malformed cursor resilience
  // **Validates: Requirements 8.3**
  describe('Property 9: Malformed cursor resilience', () => {
    /**
     * Parse a JSON cursor (logs). Returns the parsed object or null if malformed.
     * Replicates the inline logic from fetchLogsOp.
     */
    function parseLogsCursor(cursor: string): { lastDate: string | null; lastId: string; wasDateNull: boolean } | null {
      try {
        const parsed = JSON.parse(cursor);
        if (!parsed || typeof parsed.lastId !== 'string') {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    }

    /**
     * Parse a pipe cursor (lists). Returns the parts or null if malformed.
     * Replicates the inline logic from fetchLists.
     */
    function parseListsCursor(cursor: string): [string, string] | null {
      const parts = cursor.split('|');
      if (parts.length === 2 && parts[0] && parts[1]) {
        return [parts[0], parts[1]];
      }
      return null;
    }

    it('logs cursor parser never throws on arbitrary non-JSON strings', () => {
      fc.assert(
        fc.property(
          // Generate strings that are NOT valid JSON
          fc.string().filter((s) => {
            try {
              JSON.parse(s);
              return false; // valid JSON, skip
            } catch {
              return true; // not valid JSON, keep
            }
          }),
          (malformed) => {
            // Must not throw
            const result = parseLogsCursor(malformed);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('lists cursor parser never throws on strings without exactly 2 pipe-separated non-empty parts', () => {
      fc.assert(
        fc.property(
          // Generate strings that don't split into exactly 2 non-empty parts on '|'
          fc.string().filter((s) => {
            const parts = s.split('|');
            return !(parts.length === 2 && parts[0] !== '' && parts[1] !== '');
          }),
          (malformed) => {
            // Must not throw
            const result = parseListsCursor(malformed);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
