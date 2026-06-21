# Requirements Document

## Introduction

Migrate the last two offset-paginated data-fetching functions (`fetchLogsOp` in `logOperations.ts` and `fetchLists` in `listSlice.ts`) to cursor-based keyset pagination. This eliminates skipped/duplicated rows when data changes between page fetches and aligns with the established cursor patterns already used in `watchlistSlice.ts` and `archiveSlice.ts`.

## Glossary

- **Cursor**: An opaque string encoding the sort-key values of the last fetched row, used to request the next page without relying on row offsets.
- **JSON_Cursor**: A JSON-serialized cursor of the shape `{ lastDate: string | null, lastId: string, wasDateNull: boolean }`, used when the primary sort column is nullable.
- **Pipe_Cursor**: A pipe-delimited cursor of the shape `"<created_at>|<id>"`, used when the primary sort column is non-nullable.
- **Keyset_Pagination**: A pagination strategy that filters rows beyond the cursor position using inequality operators rather than OFFSET arithmetic.
- **PAGE_SIZE**: The fixed number of rows fetched per request (50 for logs, 20 for lists).
- **Offline_Queue**: A local queue of mutations (adds, updates, removes) not yet synced to the server.
- **LogSlice**: The Zustand store slice responsible for managing the user's film logs.
- **ListSlice**: The Zustand store slice responsible for managing the user's custom lists.
- **Supabase**: The Postgres-backed BaaS providing the `.from().select()` query builder.

## Requirements

### Requirement 1: fetchLogsOp JSON Cursor Pagination

**User Story:** As a user scrolling through my film logs, I want the next page to always show the correct next rows, so that I never see duplicates or miss entries when new logs are added concurrently.

#### Acceptance Criteria

1. WHEN fetchLogsOp is called with loadMore=true and a cursor exists, THE LogSlice SHALL apply the JSON cursor filter to the Supabase query before fetching rows
2. WHEN the JSON cursor has wasDateNull=true, THE LogSlice SHALL filter with `.is('watched_date', null).lt('id', cursor.lastId)`
3. WHEN the JSON cursor has a non-null lastDate, THE LogSlice SHALL filter with `.or('watched_date.lt."<lastDate>",and(watched_date.eq."<lastDate>",id.lt.<lastId>),watched_date.is.null')`
4. WHEN fetchLogsOp completes successfully, THE LogSlice SHALL compute the next cursor as `JSON.stringify({ lastDate: lastRow.watched_date, lastId: lastRow.id, wasDateNull: lastRow.watched_date === null })`
5. WHEN fetchLogsOp is called with loadMore=false, THE LogSlice SHALL reset the cursor to null before querying
6. WHEN the fetched data length is less than PAGE_SIZE, THE LogSlice SHALL set the cursor to null indicating no more pages

### Requirement 2: fetchLists Pipe Cursor Pagination

**User Story:** As a user browsing my custom lists, I want infinite scroll to always load the correct next batch of lists, so that I never see duplicates or skip lists.

#### Acceptance Criteria

1. WHEN fetchLists is called with loadMore=true and a cursor exists, THE ListSlice SHALL apply the pipe-delimited cursor filter using `.or('created_at.lt.<cursorDate>,and(created_at.eq.<cursorDate>,id.lt.<cursorId>)')`
2. WHEN fetchLists completes successfully, THE ListSlice SHALL compute the next cursor as `${lastRow.created_at}|${lastRow.id}`
3. WHEN fetchLists is called with loadMore=false, THE ListSlice SHALL reset the cursor to null before querying
4. WHEN the fetched data length is less than PAGE_SIZE, THE ListSlice SHALL set the cursor to null indicating no more pages

### Requirement 3: State Shape Migration

**User Story:** As a developer, I want the store state to use cursor strings instead of page numbers, so that the pagination model is consistent across all slices.

#### Acceptance Criteria

1. THE LogSlice SHALL replace the `logsPage: number` state field with `_logsCursor: string | null` initialized to null
2. THE ListSlice SHALL replace the `listsPage: number` state field with `_listsCursor: string | null` initialized to null
3. THE LogSlice SHALL retain the `logsHasMore: boolean` field with the same derivation logic (`data.length === PAGE_SIZE`)
4. THE ListSlice SHALL retain the `listsHasMore: boolean` field with the same derivation logic (`data.length === PAGE_SIZE`)
5. THE LogSlice SHALL retain the `_fetchingLogs: boolean` concurrency guard
6. THE ListSlice SHALL retain the `_fetchingLists: boolean` concurrency guard

### Requirement 4: Caller Interface Preservation

**User Story:** As a developer calling these functions, I want the public API to remain unchanged, so that no callers need modification.

#### Acceptance Criteria

1. THE LogSlice fetchLogs function SHALL continue to accept a single optional boolean parameter `loadMore` defaulting to false
2. THE ListSlice fetchLists function SHALL continue to accept a single optional boolean parameter `loadMore` defaulting to false
3. WHEN loadMore is false, THE LogSlice SHALL perform a fresh fetch replacing all existing data
4. WHEN loadMore is false, THE ListSlice SHALL perform a fresh fetch replacing all existing data

### Requirement 5: Offline Queue Reconciliation Preservation

**User Story:** As a user with pending offline mutations, I want my log list to correctly reflect pending changes after a server fetch, so that my optimistic UI remains consistent.

#### Acceptance Criteria

1. WHEN fetchLogsOp receives server data, THE LogSlice SHALL filter out rows whose IDs appear in the pending removes set
2. WHEN fetchLogsOp receives server data, THE LogSlice SHALL apply pending update payloads to matching rows before mapping
3. WHEN fetchLogsOp performs a fresh fetch (loadMore=false), THE LogSlice SHALL prepend pending add entries to the result list
4. THE LogSlice SHALL perform Map-based deduplication keyed by log ID after merging server and pending data
5. THE LogSlice SHALL apply the sortLogs helper to the deduplicated result

### Requirement 6: Background Prefetch Preservation

**User Story:** As a user, I want poster images for newly loaded items to be cached in the background, so that scrolling feels instant.

#### Acceptance Criteria

1. WHEN fetchLogsOp loads new log entries, THE LogSlice SHALL invoke Image.prefetch for poster URLs of newly fetched entries
2. WHEN fetchLists loads new list entries, THE ListSlice SHALL invoke chunked Image.prefetch (5 at a time with delay) for poster URLs of newly fetched entries

### Requirement 7: Nested Foreign Table Query Preservation

**User Story:** As a developer, I want the lists query to continue fetching list_items in the same request, so that list cards display film posters immediately.

#### Acceptance Criteria

1. THE ListSlice query SHALL continue to select the nested foreign table `list_items ( id, film_id, film_title, poster_path, position )`
2. THE ListSlice query SHALL continue to apply `.order('position', { foreignTable: 'list_items', ascending: true })` independently of cursor logic
3. THE ListSlice cursor filter SHALL only apply to the parent `lists` table ordering by `created_at DESC, id DESC`

### Requirement 8: Type Safety

**User Story:** As a developer, I want cursor state to be strongly typed, so that null checks are enforced at compile time.

#### Acceptance Criteria

1. THE LogSlice interface SHALL declare `_logsCursor` with type `string | null`
2. THE ListSlice interface SHALL declare `_listsCursor` with type `string | null`
3. IF the cursor string cannot be parsed (malformed JSON for logs, missing pipe for lists), THEN THE system SHALL treat it as null and perform a fresh fetch
