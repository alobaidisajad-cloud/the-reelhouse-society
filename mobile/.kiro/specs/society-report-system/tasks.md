# Implementation Plan: Society Report System

## Overview

This plan implements the complete Society Report System: a content reporting, blocking/muting, and moderation enforcement framework. The approach starts with foundational types and stores, then builds service extensions, shared UI components, screen integrations, feed filtering, offline queue integration, database schema documentation, and admin Tribunal enhancements. Each task is independently implementable and builds on prior work.

## Tasks

- [x] 1. Define shared types, enums, and Zod schemas
  - [x] 1.1 Create `src/types/moderation.ts` with all shared types and Zod schemas
    - Define `ReportableContentType` Zod enum (log, list, log_comment, list_comment, dossier, dossier_comment, lounge_message, profile)
    - Define `ReportReason` Zod enum (spoiler_unmarked, harassment, hate_speech, spam, inappropriate, impersonation, misinformation, copyright, other)
    - Define `BlockType` Zod enum (block, mute)
    - Define `ModAction` Zod enum (dismiss, delete_content, warn, mute_user, suspend, ban, permanent_exile)
    - Define `ReportPayloadSchema` with UUID validation, 500-char details max, refinement for "other" reason requiring non-empty details
    - Define `BlockRecordSchema`, `ActionMetaSchema`, `ModActionRecordSchema`
    - Define `ReportResult` type union (submitted, queued, duplicate, error)
    - Export all types and schemas
    - _Requirements: 4.5, 9.1, 9.2, 9.3_

- [x] 2. Implement BlockStore with MMKV persistence
  - [x] 2.1 Create `src/stores/blockStore.ts` with Zustand store
    - Implement full `BlockState` interface with `blocked`, `muted`, `_blockedIndex`, `_mutedIndex`
    - Implement `isBlocked(userId)` and `isMuted(userId)` as O(1) Set.has() lookups
    - Implement `isHidden(userId)` returning `isBlocked(userId) || isMuted(userId)`
    - Implement `blockUser(targetId)` with optimistic update, MMKV persist, Supabase upsert, and rollback on failure
    - Implement `unblockUser(targetId)` with optimistic update, MMKV persist, Supabase delete, and rollback
    - Implement `muteUser(targetId)` with optimistic update, MMKV persist, Supabase insert, and rollback
    - Implement `unmuteUser(targetId)` with optimistic update, MMKV persist, Supabase delete, and rollback
    - Implement block supersedes mute logic (blockUser removes from _mutedIndex)
    - Self-block assertion (`targetId !== currentUser.id`)
    - React Query cache invalidation on block/mute changes (feed, search keys)
    - Haptic feedback and reelToast confirmations
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.10_

  - [x] 2.2 Implement MMKV persistence and hydration in BlockStore
    - Implement `hydrateFromCache(userId)` reading from `reelhouse_blocks_{userId}` key
    - Handle missing cache gracefully (empty indices, no error)
    - Handle corrupted JSON (clear key, log to Sentry, proceed empty)
    - Implement `persistToCache(userId)` writing `{ blocked, muted, lastSynced }` JSON
    - Implement `syncFromServer(userId)` calling `get_user_blocks` RPC, updating indices, persisting
    - Silent failure on network error during sync (retain cache)
    - Implement `clearOnLogout()` deleting MMKV key and resetting state
    - Wire into resetAllStores pattern
    - _Requirements: 2.7, 2.8, 2.9, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 2.3 Write property tests for BlockStore (Property 1: Block supersedes mute)
    - **Property 1: Block supersedes mute (exclusivity invariant)**
    - For any target, muteUser then blockUser results in isBlocked=true, isMuted=false
    - Use fast-check with uuid() arbitraries
    - **Validates: Requirements 2.3, 2.6**

  - [ ]* 2.4 Write property tests for BlockStore (Property 2: Operations update indices)
    - **Property 2: Block/mute operations correctly update indices**
    - blockUser → isBlocked=true; muteUser → isMuted=true; unblockUser → isBlocked=false; unmuteUser → isMuted=false
    - Use fast-check with uuid() arbitraries, pre(target !== self)
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.6**

  - [ ]* 2.5 Write property tests for BlockStore (Property 9: MMKV round-trip)
    - **Property 9: MMKV block list round-trip**
    - persistToCache then hydrateFromCache preserves all blocked and muted IDs
    - Use fast-check with arrays of uuid()
    - **Validates: Requirements 10.1, 10.5**

  - [ ]* 2.6 Write property test for BlockStore (Property 10: Logout clears state)
    - **Property 10: Logout clears all block/mute state**
    - For any non-empty store, clearOnLogout results in empty indices and deleted MMKV key
    - **Validates: Requirements 2.9**

- [x] 3. Implement ReportStore with offline queue integration
  - [x] 3.1 Create `src/stores/reportStore.ts` with Zustand store
    - Implement `ReportState` interface with `isSubmitting`, `recentReports` Set
    - Implement `submitReport(payload)` with Zod validation, connectivity check, online/offline routing
    - Online path: call `supabase.rpc('submit_report', ...)`, handle rate limit errors
    - Offline path: call `enqueueMutation({ type: 'submit_report', payload })`
    - Implement `hasReported(contentId)` duplicate check against recentReports Set
    - Add content_id to recentReports on successful submission or enqueue
    - Handle optional block_target toggle (call blockStore.blockUser)
    - Haptic feedback and reelToast for all outcome states (submitted, queued, duplicate, rate limit)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 9.4_

  - [x] 3.2 Add `submit_report` mutation type to offline queue
    - Add `'submit_report'` to `QueuedMutation.type` union in `src/utils/offlineQueue.ts`
    - Add `submit_report` entry to `MutationSchemaMap` in `src/types/mutations.ts` with full Zod schema
    - Add `submit_report` case to `src/utils/mutationExecutor.ts` calling `supabase.rpc('submit_report', ...)`
    - Ensure FIFO order preservation on queue flush
    - _Requirements: 1.2, 1.3_

  - [ ]* 3.3 Write property tests for ReportStore (Property 5: Duplicate prevention)
    - **Property 5: Duplicate report prevention**
    - After successful submit/enqueue, same content_id yields status 'duplicate'
    - Use fast-check with uuid() for content_id
    - **Validates: Requirements 1.4, 1.6**

  - [ ]* 3.4 Write property tests for ReportStore (Property 7: Schema validation)
    - **Property 7: Report payload schema validation**
    - Invalid UUIDs, details > 500 chars, reason='other' with empty details all reject
    - Valid payloads matching all constraints pass
    - Use fast-check with string() and uuid() arbitraries
    - **Validates: Requirements 9.1, 9.2, 9.3, 4.5, 1.5**

  - [ ]* 3.5 Write property test for ReportStore (Property 8: Invalid payload no side effects)
    - **Property 8: Invalid payload produces no side effects**
    - Failed validation results in no RPC call, no enqueue, unchanged recentReports
    - **Validates: Requirements 9.4**

- [x] 4. Checkpoint - Ensure stores and types are solid
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend ModerationService with new RPC calls
  - [x] 5.1 Add block/mute CRUD methods to `src/services/ModerationService.ts`
    - Add `getBlockList(userId)` calling `get_user_blocks` RPC
    - Add `insertBlock(blockerId, blockedId, type)` upserting to `user_blocks`
    - Add `removeBlock(blockerId, blockedId)` deleting from `user_blocks`
    - Zod validation on all inputs before Supabase calls
    - _Requirements: 2.1, 2.2, 2.4, 7.1_

  - [x] 5.2 Add admin moderation methods to ModerationService
    - Add `resolveReportV2(reportId, action, meta)` calling `resolve_moderation_report_v2` RPC
    - Add `issueWarning(userId, reason)` with proper admin validation
    - Add `suspendUser(userId, durationHours, reason)` with duration enforcement
    - Add `bulkDismiss(reportIds)` calling `bulk_dismiss_reports` RPC
    - Add `getPriorityQueue()` calling `get_priority_reports` RPC with cursor pagination
    - Add `getReportHistory(filters)` with cursor-based pagination
    - Add `getUserModerationHistory(userId)` for admin user context
    - Error mapping for unauthorized, already-resolved, and rate-limit responses
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.9_

- [x] 6. Implement ContentActionSheet component
  - [x] 6.1 Create `src/components/moderation/ContentActionSheet.tsx`
    - Implement `ContentActionSheetProps` interface (visible, targetUserId, targetUsername, contentType, contentId, callbacks)
    - BlurView backdrop with intensity=30, tint="dark", tap-to-dismiss
    - Sheet container with ink background, sepia border glow, border-radius 16
    - Handle bar (40x4, centered, subtle white opacity)
    - Spring-based enter/exit animations (translateY 800→0, 350ms in / 250ms out)
    - Pan gesture dismiss (translationY > 100 or velocityY > 500)
    - Dynamic option rows: Report, Block/Unblock, Mute/Unmute based on `showUnblock`/`showUnmute` props
    - Proper icons from lucide (ShieldAlert, Ban, VolumeX, Volume2, Unlock)
    - Destructive text styling for Block option (colors.bloodReel)
    - Haptic feedback on option selection (TactileEngine.selection)
    - Full accessibility labels on all interactive elements
    - _Requirements: 8.7_

- [x] 7. Implement ReportSheet component
  - [x] 7.1 Create `src/components/moderation/ReportSheet.tsx`
    - Implement `ReportSheetProps` interface (visible, contentType, contentId, targetUserId, targetUsername, onDismiss)
    - BlurView backdrop identical to ContentActionSheet
    - Sheet container at 75% height with scrollable interior
    - Header: "REPORT TO THE TRIBUNAL" in Rye display font with text shadow
    - Subtext: confidentiality notice in CourierPrime body font
    - Reason chips as vertically stacked PressableScale rows with radio-select behavior
    - Selected state: sepia border, faint sepia background, parchment text, glow effect
    - Unselected state: ash border, transparent background, bone text
    - Spring scale animation on chip select (1.02 with damping 18, stiffness 400)
    - All 9 reason labels with society-themed sublabels per design spec
    - Animated TextInput for additional context (FadeInDown, 500 char max, live counter)
    - Character counter color shift at 450 chars (fog → bloodReel)
    - "Also block this member" toggle row with native Switch component
    - "FILE REPORT" submit button (full width, bloodReel background, disabled at opacity 0.4 when no reason)
    - "DISMISS" cancel link (underlined, fog color, centered)
    - Wire to ReportStore.submitReport on submit
    - Haptic feedback: mutate on submit, selection on dismiss
    - Gesture dismiss via pan-down
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.7_

  - [ ]* 7.2 Write unit tests for ReportSheet
    - Test reason chip single-selection behavior (selecting B deselects A)
    - Test submit button disabled when no reason selected
    - Test "other" reason requires non-empty details
    - Test character counter renders correctly
    - Test block toggle state management
    - _Requirements: 4.3, 1.5_

- [x] 8. Implement content filtering utility
  - [x] 8.1 Create `src/utils/filterContentByBlocks.ts`
    - Implement generic `filterContentByBlocks<T>(items: T[], getUserId: (item: T) => string): T[]`
    - Use BlockStore.isHidden() for O(1) per-item checks
    - Return new array (never mutate input)
    - O(n) total time complexity
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 8.2 Write property tests for filterContentByBlocks (Property 3: Excludes blocked/muted)
    - **Property 3: Content filter excludes all blocked and muted users**
    - For any items and blocked set, filtered result has no items from blocked/muted authors
    - Use fast-check with arrays of records and sets of uuids
    - **Validates: Requirements 3.1**

  - [ ]* 8.3 Write property tests for filterContentByBlocks (Property 4: No input mutation)
    - **Property 4: Content filter does not mutate input**
    - Original array unchanged after filtering (same length, elements, order)
    - Use fast-check with array snapshots
    - **Validates: Requirements 3.2**

- [x] 9. Checkpoint - Ensure components and utilities are solid
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integrate UI on Log Detail screen
  - [x] 10.1 Add report/block/mute trigger to `app/log/[id].tsx`
    - Add MoreHorizontal icon button to header row (right of Share button), visible when `!isOwner`
    - Wire ContentActionSheet with contentType='log', content/user IDs from log data
    - Wire ReportSheet triggered from ContentActionSheet's onReport callback
    - Connect onBlock → blockStore.blockUser, onMute → blockStore.muteUser
    - Style moreBtn per design spec (paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8)
    - _Requirements: 8.1_

- [x] 11. Integrate UI on User Profile screen
  - [x] 11.1 Add report/block/mute trigger to `app/user/[username].tsx`
    - Add MoreVertical icon button in profile header action bar, visible when `!isSelf`
    - Wire ContentActionSheet with contentType='profile', dynamic options based on isBlocked/isMuted state
    - Show Block/Unblock and Mute/Unmute based on current BlockStore state for target user
    - Wire ReportSheet triggered from onReport
    - Connect onBlock/onUnblock/onMute/onUnmute to BlockStore actions
    - _Requirements: 8.2_

- [x] 12. Integrate UI on Stacks Detail screen
  - [x] 12.1 Add report/block/mute trigger to `app/stacks/[id].tsx`
    - Add MoreHorizontal icon button to header row, visible when `!isOwner`
    - Wire ContentActionSheet with contentType='list', content/user IDs from stack data
    - Wire ReportSheet from onReport callback
    - Connect onBlock → blockStore.blockUser, onMute → blockStore.muteUser
    - ActionSheet labels: "REPORT STACK", "BLOCK CURATOR", "MUTE CURATOR"
    - _Requirements: 8.3_

- [x] 13. Integrate UI on Lounge Chat screen
  - [x] 13.1 Extend existing ActionSheet in `src/components/lounge/ActionSheet.tsx`
    - Add `onReport` and `onBlock` props to ActionSheetProps interface
    - Append Report Message and Block options after existing COPY TEXT, before DELETE
    - Condition: only visible when `!internalIsSelf`
    - Icons: ShieldAlert for report (fog), Ban for block (bloodReel)
    - Wire callbacks to parent component's handlers
    - _Requirements: 8.4_

  - [x] 13.2 Wire report/block handlers in `app/lounge/[id].tsx`
    - Add state for selected message and report sheet visibility
    - Pass onReport and onBlock callbacks to ActionSheet
    - onReport: close ActionSheet, open ReportSheet with contentType='lounge_message'
    - onBlock: close ActionSheet, call blockStore.blockUser with message author's user_id
    - _Requirements: 8.4_

- [x] 14. Integrate UI on Dossier Detail screen
  - [x] 14.1 Add report/block/mute trigger to `app/dossier/[id].tsx`
    - Add MoreHorizontal icon button to header, visible when `user?.id !== dossier?.user_id`
    - Wire ContentActionSheet with contentType='dossier', content/user IDs
    - Wire ReportSheet from onReport
    - Connect onBlock → blockStore.blockUser, onMute → blockStore.muteUser
    - ActionSheet labels: "REPORT DISPATCH", "BLOCK AUTHOR", "MUTE AUTHOR"
    - _Requirements: 8.5_

- [x] 15. Integrate UI on Comments (long-press)
  - [x] 15.1 Add long-press report/block to comment rows across log, stack, dossier comments
    - Add `onLongPress` handler to comment PressableScale (delayLongPress: 400, haptic: "heavy")
    - Condition: `comment.user_id !== user?.id`
    - Open mini ContentActionSheet with reduced options (Report Annotation, Block)
    - Wire to ReportSheet with appropriate contentType (log_comment, list_comment, dossier_comment)
    - Apply to LogComments, StackComments, DossierComments components
    - _Requirements: 8.6_

- [x] 16. Integrate feed/search/lounge filtering via BlockStore
  - [x] 16.1 Apply block filtering to feed, search, and lounge queries
    - In feed query (useFeedQuery or equivalent): apply `filterContentByBlocks` via React Query `select` transform
    - In search results (useUniversalSearch): filter profiles, logs, lists results by isHidden
    - In lounge messages: filter messages from blocked/muted users
    - Ensure React Query cache invalidation on block/mute changes refreshes filtered views
    - Wire BlockStore hydration call during app bootstrap (before first render)
    - Trigger non-blocking `syncFromServer` after hydration completes
    - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 17. Checkpoint - Ensure all UI integrations work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Document database schema migration
  - [x] 18.1 Create `supabase/migrations/society_report_system.sql` migration file
    - Document the full SQL migration from the design: ALTER reports table, CREATE user_blocks, CREATE mod_actions, CREATE warnings
    - Include all CHECK constraints, UNIQUE constraints, indexes
    - Include profile column extensions (suspended_until, suspension_reason, warning_count, is_banned, banned_at)
    - Include all RLS policies (user_blocks, reports, mod_actions, warnings)
    - Include all RPC functions (submit_report, resolve_moderation_report_v2, bulk_dismiss_reports, get_priority_reports, get_user_blocks, is_blocked_by)
    - Add header comments explaining the migration purpose and execution order
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 19. Enhance Tribunal admin screen
  - [x] 19.1 Add warning and suspension actions to `app/(admin)/tribunal.tsx`
    - Add "Issue Warning" action button with reason text input
    - Add "Suspend" action button with duration picker (hours) and reason
    - Add "Ban" and "Permanent Exile" action buttons with confirmation dialogs
    - Wire to ModerationService.resolveReportV2 with appropriate ModAction
    - Display enforcement history per reported user (getUserModerationHistory)
    - Show warning count badge on repeat offenders
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 19.2 Add bulk dismiss and priority queue to Tribunal
    - Add multi-select mode for pending reports (checkbox per report row)
    - Add "Bulk Dismiss" button triggering ModerationService.bulkDismiss
    - Implement priority queue view via getPriorityQueue (most-reported content first)
    - Add cursor-based pagination ("Load More" at bottom)
    - Display report_count badge per content item
    - _Requirements: 5.6, 5.7_

  - [ ]* 19.3 Write unit tests for Tribunal admin flows
    - Test resolveReportV2 calls correct RPC with expected params
    - Test bulk dismiss sends array of report IDs
    - Test priority queue pagination
    - Test unauthorized access handling
    - _Requirements: 5.8, 5.9_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The database migration (Task 18) is a documentation task — the SQL should be applied via Supabase dashboard or CLI separately
- BlockStore hydration must happen before first render to prevent flash of blocked content
- All UI components follow the Nitrate Noir design language specified in the design document
- The existing Lounge ActionSheet pattern is reused/extended rather than replaced

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.2", "18.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "5.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "2.6", "3.3", "3.4", "3.5", "5.2", "8.1"] },
    { "id": 4, "tasks": ["6.1", "7.1", "8.2", "8.3"] },
    { "id": 5, "tasks": ["7.2", "16.1"] },
    { "id": 6, "tasks": ["10.1", "11.1", "12.1", "13.1", "14.1"] },
    { "id": 7, "tasks": ["13.2", "15.1"] },
    { "id": 8, "tasks": ["19.1"] },
    { "id": 9, "tasks": ["19.2", "19.3"] }
  ]
}
```
