# Implementation Plan: Cursor Pagination Migration

## Overview

Migrate `fetchLogsOp` and `fetchLists` from offset-based `.range()` pagination to cursor-based keyset pagination. This involves replacing `logsPage`/`listsPage` number state with `_logsCursor`/`_listsCursor` string state, removing `.range()` calls, adding `.limit()` + cursor filter logic, and validating correctness with property-based tests using `fast-check`.

## Tasks

- [x] 1. Migrate fetchLogsOp to JSON cursor pagination
  - [x] 1.1 Update LogSlice interface and initial state
    - In `src/stores/domain/logSlice.ts`: replace `logsPage: number` with `_logsCursor: string | null` in the `LogSlice` interface
    - Update initial state in `createLogSlice` from `logsPage: 0` to `_logsCursor: null`
    - Remove `logsPage` from the interface and initial state entirely
    - _Requirements: 3.1, 3.3, 3.5, 8.1_

  - [x] 1.2 Rewrite fetchLogsOp query construction
    - In `src/stores/domain/logSlice/helpers/logOperations.ts`:
    - Remove `.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)` and the `page` variable
    - Add `.limit(PAGE_SIZE)` to the query chain
    - Add cursor parsing: `const cursor = loadMore ? state._logsCursor : null`
    - Wrap `JSON.parse(cursor)` in try/catch — on failure treat as null (fresh fetch)
    - Add NULL date handling: if `parsed.wasDateNull` → `.is('watched_date', null).lt('id', parsed.lastId)`
    - Add non-null date handling: else → `.or('watched_date.lt."${safeDate}",and(watched_date.eq."${safeDate}",id.lt.${safeId}),watched_date.is.null')`
    - Escape double-quotes in `lastDate` with `.replace(/"/g, '""')`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 8.3_

  - [x] 1.3 Compute next cursor and update set() call
    - Compute `nextCursor` from last row: `JSON.stringify({ lastDate: lastRow.watched_date, lastId: lastRow.id, wasDateNull: lastRow.watched_date === null })`
    - Set `nextCursor = null` when `data.length < PAGE_SIZE` or no data
    - Replace `logsPage: page + 1` in the `set()` call with `_logsCursor: nextCursor`
    - Preserve all offline queue reconciliation logic (pendingRemoves, pendingUpdates, pendingAdds)
    - Preserve Map-based deduplication and `sortLogs`
    - Preserve background `Image.prefetch`
    - _Requirements: 1.4, 1.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1_

- [x] 2. Migrate fetchLists to pipe cursor pagination
  - [x] 2.1 Update ListSlice interface and initial state
    - In `src/stores/domain/listSlice.ts`: replace `listsPage: number` with `_listsCursor: string | null` in the `ListSlice` interface
    - Update initial state from `listsPage: 0` to `_listsCursor: null`
    - Remove `listsPage` from the interface and initial state entirely
    - _Requirements: 3.2, 3.4, 3.6, 8.2_

  - [x] 2.2 Rewrite fetchLists query construction
    - Remove the `page` variable and `.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)`
    - Add `.limit(PAGE_SIZE)` to the query chain
    - Add `.order('id', { ascending: false })` as a tiebreaker for deterministic cursor ordering
    - Add cursor parsing: `const cursor = loadMore ? state._listsCursor : null`
    - Split cursor on `'|'` — if `parts.length !== 2`, treat as null (fresh fetch)
    - Add cursor filter: `.or('created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})')`
    - Preserve nested foreign table join `list_items ( id, film_id, film_title, poster_path, position )`
    - Preserve `.order('position', { foreignTable: 'list_items', ascending: true })`
    - _Requirements: 2.1, 2.3, 7.1, 7.2, 7.3, 8.3_

  - [x] 2.3 Compute next cursor and update set() call
    - Compute `nextCursor` from last row: `` `${lastRow.created_at}|${lastRow.id}` ``
    - Set `nextCursor = null` when `data.length < PAGE_SIZE` or no data
    - Replace `listsPage: page + 1` in the `set()` call with `_listsCursor: nextCursor`
    - Preserve chunked `Image.prefetch` (5 at a time with 1s delay)
    - _Requirements: 2.2, 2.4, 6.2_

- [x] 3. Checkpoint — verify builds and callers unaffected
  - Ensure TypeScript compiles without errors (`npx tsc --noEmit`)
  - Verify no other files reference `logsPage` or `listsPage` — if found, update them
  - Ensure the public API (`fetchLogs(loadMore?)` and `fetchLists(loadMore?)`) is unchanged
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Write property-based tests for cursor pagination
  - [x]* 4.1 Write property test: JSON cursor round-trip
    - Create `src/stores/domain/__tests__/cursorPagination.test.ts`
    - Generate random `{ watched_date: string | null, id: uuid }` rows
    - Verify `JSON.parse(JSON.stringify({ lastDate, lastId, wasDateNull }))` preserves all fields
    - Minimum 100 iterations
    - **Property 1: JSON cursor round-trip**
    - **Validates: Requirements 1.4**

  - [x]* 4.2 Write property test: Pipe cursor round-trip
    - In the same test file
    - Generate random `{ created_at: iso_string (no pipe), id: uuid (no pipe) }` rows
    - Verify `` `${created_at}|${id}`.split('|') `` produces exactly `[created_at, id]`
    - Minimum 100 iterations
    - **Property 2: Pipe cursor round-trip**
    - **Validates: Requirements 2.2**

  - [x]* 4.3 Write property test: hasMore derivation from data length
    - Generate random arrays of length 0..PAGE_SIZE+5
    - Verify `hasMore === (data.length === PAGE_SIZE)` and when `!hasMore`, cursor is null
    - Minimum 100 iterations
    - **Property 3: hasMore derivation from data length**
    - **Validates: Requirements 1.6, 2.4, 3.3, 3.4**

  - [x]* 4.4 Write property test: Malformed cursor resilience
    - Generate random strings that are NOT valid JSON / don't split into 2 parts
    - Verify the parse functions return null (no throw) indicating fresh-fetch behavior
    - Minimum 100 iterations
    - **Property 9: Malformed cursor resilience**
    - **Validates: Requirements 8.3**

- [x] 5. Write property-based tests for offline queue reconciliation
  - [x]* 5.1 Write property test: Pending removes exclusion
    - Create `src/stores/domain/__tests__/logReconciliation.test.ts`
    - Generate random log arrays + random remove ID sets
    - Verify no removed ID appears in the output
    - Minimum 100 iterations
    - **Property 4: Pending removes are excluded from output**
    - **Validates: Requirements 5.1**

  - [x]* 5.2 Write property test: Pending updates application
    - Generate random server rows + random update payloads keyed by ID
    - Verify matching output rows contain the update fields merged over originals
    - Minimum 100 iterations
    - **Property 5: Pending updates are applied to matching rows**
    - **Validates: Requirements 5.2**

  - [x]* 5.3 Write property test: Pending adds prepend on fresh fetch
    - Generate random pending add entries + random server rows with `loadMore=false`
    - Verify all add entries appear in the merged output
    - Minimum 100 iterations
    - **Property 6: Pending adds are prepended on fresh fetch**
    - **Validates: Requirements 5.3**

  - [x]* 5.4 Write property test: Deduplication invariant
    - Generate log arrays with intentional duplicate IDs
    - Verify output contains only unique IDs after Map-based deduplication
    - Minimum 100 iterations
    - **Property 7: Deduplication produces unique IDs**
    - **Validates: Requirements 5.4**

  - [x]* 5.5 Write property test: Sort order invariant
    - Generate random deduplicated log arrays
    - Verify `sortLogs` output is in descending order by `watchedDate` (fallback to `createdAt`)
    - Minimum 100 iterations
    - **Property 8: Sort order invariant**
    - **Validates: Requirements 5.5**

- [x] 6. Final checkpoint — all tests pass
  - Run `npm test` and verify all property-based and existing tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Tasks 1 and 2 are independent and can be parallelized
- Tasks 4 and 5 (property tests) depend on Tasks 1 and 2 for the implementation to test against
- `fast-check` v4.8.0 is already installed as a devDependency
- Jest is the test runner (`npm test` → `jest`)
- Each property test is tagged: `// Feature: cursor-pagination-migration, Property N: <title>`
- The watchlistSlice.ts pipe cursor pattern serves as the reference implementation for Task 2
