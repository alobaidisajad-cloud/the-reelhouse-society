# Implementation Plan: Notification Grouping

## Overview

Implement client-side notification grouping for endorsement notifications. A pure `groupNotifications()` utility collapses identical endorsements into grouped rows in the notifications modal, with batch store methods for mark-read and dismiss operations. No server, database, or store schema changes required.

## Tasks

- [x] 1. Create grouping utility with types
  - [x] 1.1 Create `src/utils/groupNotifications.ts` with types and pure grouping function
    - Define `IndividualDisplayItem`, `GroupedDisplayItem`, and `DisplayItem` union type
    - Implement `getGroupKey()` helper that derives stable keys from notification type + target
    - Implement `extractFilmName()` helper for message parsing
    - Implement `groupNotifications(notifications, now?)` with single-pass O(n) algorithm
    - Phase 1: Bucket eligible endorsements by GroupKey within 72h window
    - Phase 2: Emit groups (≥3 items) or dissolve undersized buckets to individuals
    - Phase 3: Merge and sort all DisplayItems by most recent timestamp descending
    - Export all types and the main function
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 11.1, 11.2_

- [x] 2. Add batch store methods
  - [x] 2.1 Add `markGroupRead` and `dismissGroup` methods to `src/stores/notificationStore.ts`
    - Add `markGroupRead: (ids: string[]) => Promise<void>` to the store interface and implementation
    - Optimistically set `read: true` for all matching IDs and decrement `_unreadCount`
    - Execute single Supabase `.update({ read: true }).in('id', ids)` batch query
    - Rollback state on error with `logger.warn`
    - Add `dismissGroup: (ids: string[]) => Promise<void>` to the store interface and implementation
    - Optimistically filter out all matching IDs and decrement `_unreadCount`
    - Execute single Supabase `.delete().in('id', ids)` batch query
    - Rollback state on error with `logger.warn`
    - Guard both methods: return immediately if `ids` is empty
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 11.3_

- [ ] 3. Checkpoint - Verify core logic compiles
  - Ensure TypeScript compilation passes with `npx tsc --noEmit`, ask the user if questions arise.

- [x] 4. Integrate grouping into notifications modal
  - [x] 4.1 Create `GroupedNotificationItem` component and integrate `groupNotifications` in `app/(modals)/notifications-modal.tsx`
    - Import `groupNotifications` and `DisplayItem` from `@/src/utils/groupNotifications`
    - Import `markGroupRead` and `dismissGroup` from the notification store
    - Add `useMemo(() => groupNotifications(notifications), [notifications])` to compute `displayItems`
    - Create `GroupedNotificationItem` component with count badge, aggregated message, poster thumbnail, and unread indicator
    - Handle tap: call `markGroupRead(ids)` if `hasUnread`, then navigate to film page via `nav.push`
    - Handle dismiss: call `TactileEngine.warn()` then `dismissGroup(ids)`
    - Update `renderItem` callback to branch on `item.kind === 'group'` vs `'individual'`
    - Update FlashList `data` prop to use `displayItems` instead of raw `notifications`
    - Update `keyExtractor` to use `groupKey` for groups, `notification.id` for individuals
    - _Requirements: 1.1, 1.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 10.1, 10.2, 10.3_

- [ ] 5. Checkpoint - Verify full compilation and existing tests
  - Ensure `npx tsc --noEmit` passes and `npx jest --passWithNoTests` runs without failures, ask the user if questions arise.

- [ ] 6. Unit tests for grouping utility
  - [ ]* 6.1 Write unit tests in `src/utils/__tests__/groupNotifications.test.ts`
    - Test empty array returns empty array
    - Test all non-endorse notifications pass through as individuals
    - Test 2 same-target endorsements stay individual (below threshold)
    - Test 3 same-target endorsements collapse into 1 group
    - Test mixed types (endorsements + comments) produce correct groups + individuals
    - Test time window boundary: endorsements outside 72h are not grouped
    - Test multiple distinct groups form correctly
    - Test GroupKey derivation via `film_id` and message pattern fallback
    - Test `hasUnread` accuracy (true if any unread, false if all read)
    - Test `created_at` equals most recent notification in group
    - Test `count` equals `ids.length`
    - Test output sorted by most recent timestamp descending
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 11.1, 11.2_

- [ ] 7. Property-based tests for grouping utility
  - [ ]* 7.1 Write property test for Conservation (Property 1)
    - **Property 1: Conservation**
    - Sum of counts across all output DisplayItems equals input array length; every input ID appears exactly once
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 7.2 Write property test for No ID Duplication (Property 2)
    - **Property 2: No ID Duplication**
    - Collection of all notification IDs extracted from output contains no duplicates
    - **Validates: Requirements 3.3**

  - [ ]* 7.3 Write property test for Minimum Group Size (Property 3)
    - **Property 3: Minimum Group Size**
    - Every GroupedDisplayItem has `count >= 3`
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 7.4 Write property test for Type Constraint (Property 4)
    - **Property 4: Type Constraint**
    - Every GroupedDisplayItem has `type === 'endorse'` and all underlying notifications are type `endorse`
    - **Validates: Requirements 2.1**

  - [ ]* 7.5 Write property test for Time Window (Property 5)
    - **Property 5: Time Window**
    - Every notification in a group has `created_at` within 72 hours of `now`
    - **Validates: Requirements 2.2**

  - [ ]* 7.6 Write property test for Homogeneity (Property 6)
    - **Property 6: Homogeneity**
    - All notifications in a group produce the same GroupKey matching the group's `groupKey` field
    - **Validates: Requirements 2.5, 4.5**

  - [ ]* 7.7 Write property test for Unread Accuracy (Property 7)
    - **Property 7: Unread Accuracy**
    - `hasUnread` is true iff at least one notification in the group has `read === false`
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 7.8 Write property test for Chronological Order (Property 8)
    - **Property 8: Chronological Order**
    - Output DisplayItem array is sorted in descending order by timestamp
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 7.9 Write property test for Purity / No Mutation (Property 9)
    - **Property 9: Purity (No Mutation)**
    - Calling `groupNotifications` does not modify the input array or contained objects
    - **Validates: Requirements 1.3, 10.3**

  - [ ]* 7.10 Write property test for Store Invariant — Unread Count (Property 10)
    - **Property 10: Store Invariant — Unread Count Accuracy**
    - After `markGroupRead` or `dismissGroup`, `_unreadCount` equals count of notifications where `read === false`
    - **Validates: Requirements 6.3, 7.3**

  - [ ]* 7.11 Write property test for Count-IDs Consistency (Property 11)
    - **Property 11: Count-IDs Consistency**
    - Every GroupedDisplayItem has `count === ids.length`
    - **Validates: Requirements 4.1**

  - [ ]* 7.12 Write property test for Most Recent Timestamp (Property 12)
    - **Property 12: Most Recent Timestamp**
    - Every GroupedDisplayItem `created_at` equals the max `created_at` of its notifications
    - **Validates: Requirements 4.2**

- [ ] 8. Final checkpoint - Full verification
  - Ensure `npx tsc --noEmit` passes and `npx jest` runs all tests green, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check` (already installed)
- Unit tests validate specific examples and edge cases
- The project uses Jest as the test runner (`jest-expo` preset)
- All grouping logic is a pure view-layer transformation — existing store, API, and persistence behavior is unchanged

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["4.1"] },
    { "id": 2, "tasks": ["6.1", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.11", "7.12"] },
    { "id": 3, "tasks": ["7.10"] }
  ]
}
```
