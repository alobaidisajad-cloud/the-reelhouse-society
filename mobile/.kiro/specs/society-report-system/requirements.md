# Requirements Document

## Introduction

The Society Report System provides a comprehensive content reporting, user blocking/muting, and moderation enforcement framework for the ReelHouse mobile app. It enables members to report inappropriate content across all content types (logs, stacks, comments, lounge messages, dossiers, profiles), block or mute other members for client-side content filtering, and provides admin tooling (the Tribunal) for graduated enforcement actions with full audit trail and notification delivery. The system supports offline operation via MMKV queue and adheres to the Nitrate Noir design language.

## Glossary

- **ReportSheet**: Bottom sheet modal UI component that captures user report input with reason selection, optional details text, and block toggle
- **ContentActionSheet**: Reusable bottom ActionSheet component providing Report/Block/Mute trigger options on content surfaces
- **BlockStore**: Zustand store managing blocked and muted user lists with O(1) Set-based lookups, MMKV persistence, and Supabase sync
- **ReportStore**: Zustand store managing report submission state, offline queueing, and duplicate prevention
- **Tribunal**: Admin-only screen for reviewing, resolving, and actioning pending reports with graduated enforcement
- **ModerationService**: Backend service layer handling report CRUD, moderation actions, and admin operations via Supabase RPCs
- **OfflineQueue**: MMKV-backed mutation queue that persists operations when the device lacks network connectivity
- **MMKV**: High-performance key-value storage used for local persistence of block lists and offline mutations
- **RLS**: Row Level Security — Supabase/PostgreSQL feature ensuring users can only access data they are authorized to view or modify
- **ModAction**: Enumerated moderation enforcement actions (dismiss, delete_content, warn, mute_user, suspend, ban, permanent_exile)
- **ReportableContentType**: Enumerated content types that can be reported (log, list, log_comment, list_comment, dossier, dossier_comment, lounge_message, profile)
- **ReportReason**: Enumerated report reasons (spoiler_unmarked, harassment, hate_speech, spam, inappropriate, impersonation, misinformation, copyright, other)
- **Nitrate_Noir**: The visual design language used across the app — aged tungsten tones, cinematic typography, spring-based micro-interactions

## Requirements

### Requirement 1: Report Submission

**User Story:** As a member, I want to report inappropriate content so that the Tribunal can review and take action on violations of Society rules.

#### Acceptance Criteria

1. WHEN a user selects a report reason and submits the ReportSheet, THE ReportStore SHALL validate the payload against ReportPayloadSchema and submit the report to the Supabase `submit_report` RPC
2. WHEN the device is offline at the time of report submission, THE ReportStore SHALL enqueue the report mutation to the OfflineQueue via MMKV and display a "Report queued" confirmation toast
3. WHEN the device regains connectivity, THE OfflineQueue SHALL flush pending report mutations to the Supabase `submit_report` RPC in FIFO order
4. WHEN a user attempts to report the same content_id a second time within the same session, THE ReportStore SHALL reject the submission and display a "You've already reported this content" toast
5. WHEN the report reason is "other", THE ReportSheet SHALL require a non-empty details text before enabling the submit button
6. WHEN a valid report is successfully submitted online, THE ReportStore SHALL add the content_id to the recentReports set and display a "Report filed" confirmation toast with success haptic
7. IF the Supabase RPC returns a rate limit error, THEN THE ReportStore SHALL display a "Too many reports. Please wait." error toast without enqueueing to the offline queue

### Requirement 2: Block and Mute System

**User Story:** As a member, I want to block or mute other members so that their content is hidden from my feeds and I no longer see their activity.

#### Acceptance Criteria

1. WHEN a user blocks another member, THE BlockStore SHALL immediately add the target to the _blockedIndex Set, persist to MMKV, and then upsert a row into the `user_blocks` table with type 'block'
2. WHEN a user mutes another member, THE BlockStore SHALL immediately add the target to the _mutedIndex Set, persist to MMKV, and then insert a row into the `user_blocks` table with type 'mute'
3. WHEN a user blocks a member they previously muted, THE BlockStore SHALL remove the target from _mutedIndex and add to _blockedIndex, replacing the mute with a block (block supersedes mute)
4. WHEN a user unblocks a member, THE BlockStore SHALL remove the target from _blockedIndex, persist to MMKV, and delete the corresponding row from `user_blocks`
5. WHEN the server upsert or delete fails after an optimistic local update, THE BlockStore SHALL rollback the local state, re-persist to MMKV, and display a "Block failed. Please try again." error toast
6. THE BlockStore SHALL provide `isBlocked(userId)` and `isMuted(userId)` predicates with O(1) time complexity via Set.has() lookups
7. WHEN the app launches, THE BlockStore SHALL hydrate _blockedIndex and _mutedIndex from the MMKV cache before the first render, enabling instant cold-start filtering without a network round-trip
8. WHEN MMKV cache data is corrupted during hydration, THE BlockStore SHALL clear the corrupted cache key, log the error to Sentry, and proceed with empty block/mute indices
9. WHEN the user logs out, THE BlockStore SHALL delete the MMKV cache key and reset all in-memory state to empty
10. WHEN a user attempts to block themselves, THE BlockStore SHALL reject the operation without modifying state (enforced by client assertion and database CHECK constraint)

### Requirement 3: Content Filtering

**User Story:** As a member, I want content from blocked and muted users hidden from my feeds so that I have a curated viewing experience without unwanted interactions.

#### Acceptance Criteria

1. THE filterContentByBlocks function SHALL exclude all items authored by users present in _blockedIndex or _mutedIndex from the returned array
2. THE filterContentByBlocks function SHALL not mutate the original input array
3. THE filterContentByBlocks function SHALL operate in O(n) time where n is the number of input items, with each per-item block check being O(1)
4. WHEN a user is blocked, THE feed queries SHALL immediately invalidate relevant React Query caches so blocked user content disappears from the current view
5. WHEN BlockStore hydration completes from MMKV, THE BlockStore SHALL trigger a non-blocking background sync via `get_user_blocks` RPC to catch cross-device changes

### Requirement 4: Report Content Types and Reasons

**User Story:** As a member, I want to report different types of content with specific violation reasons so that the Tribunal has clear context for their review.

#### Acceptance Criteria

1. THE ReportSheet SHALL accept reports for all ReportableContentType values: log, list, log_comment, list_comment, dossier, dossier_comment, lounge_message, and profile
2. THE ReportSheet SHALL display all ReportReason values as selectable reason chips: spoiler_unmarked, harassment, hate_speech, spam, inappropriate, impersonation, misinformation, copyright, and other
3. WHEN a reason chip is selected, THE ReportSheet SHALL display it in the selected visual state (sepia border, faint sepia background) and deselect any previously selected reason
4. WHEN a reason is selected, THE ReportSheet SHALL display an animated text input for additional context with a 500-character maximum and live character counter
5. THE ReportPayloadSchema SHALL validate that content_type is one of the defined ReportableContentType values and reason is one of the defined ReportReason values

### Requirement 5: Admin Tribunal Enforcement

**User Story:** As a Tribunal admin, I want to review pending reports and take graduated enforcement actions so that I can maintain Society standards with an audit trail.

#### Acceptance Criteria

1. WHEN an admin resolves a report, THE ModerationService SHALL call `resolve_moderation_report_v2` RPC which atomically updates the report status, executes the action, inserts an audit record into `mod_actions`, and creates notifications
2. WHEN the action is "warn", THE RPC SHALL insert a warning record into the `warnings` table and increment the target user's `warning_count` on their profile
3. WHEN the action is "suspend", THE RPC SHALL set the target user's `suspended_until` to now() plus the specified duration_hours and record the suspension_reason
4. WHEN the action is "ban" or "permanent_exile", THE RPC SHALL set the target user's `is_banned` to true and record the `banned_at` timestamp
5. WHEN the action is "delete_content", THE Edge Function SHALL delete the reported content from the appropriate table based on content_type mapping (log→logs, list→lists, dossier→dispatch_dossiers, lounge_message→lounge_messages, log_comment→log_comments, list_comment→list_comments, dossier_comment→dossier_comments)
6. WHEN an admin calls bulk dismiss, THE `bulk_dismiss_reports` RPC SHALL update all specified pending reports to resolved status and insert audit records for each in a single atomic transaction
7. THE `get_priority_reports` RPC SHALL return pending reports ordered by report_count (most-reported content first) with cursor-based pagination
8. IF a non-admin user calls `resolve_moderation_report_v2`, THEN THE RPC SHALL raise an "Unauthorized: admin role required" exception
9. IF the report has already been resolved, THEN THE RPC SHALL raise a "Report not found or already resolved" exception

### Requirement 6: Notification Integration

**User Story:** As a member, I want to be notified when my report is reviewed and when moderation action is taken on my account so that I stay informed about Tribunal decisions.

#### Acceptance Criteria

1. WHEN a report is resolved with `notify_user` set to true, THE `resolve_moderation_report_v2` RPC SHALL insert a notification for the reporter with type 'moderation' and the resolution outcome
2. WHEN a report is resolved with an action other than "dismiss" and `notify_user` is true, THE RPC SHALL insert a notification for the offender with the action taken and reason
3. WHEN the action is "dismiss", THE RPC SHALL notify only the reporter and SHALL NOT create a notification for the reported user
4. THE notification metadata SHALL include the report_id, action, and (for suspensions) the expires_at timestamp

### Requirement 7: Database Schema and Security

**User Story:** As a system architect, I want proper database tables, indexes, RLS policies, and constraints so that the report system is secure, performant, and enforces data integrity at the database level.

#### Acceptance Criteria

1. THE `user_blocks` table SHALL enforce a UNIQUE constraint on (blocker_id, blocked_id) and a CHECK constraint that blocker_id != blocked_id
2. THE `reports` table SHALL enforce CHECK constraints on content_type (matching ReportableContentType values) and reason (matching ReportReason values)
3. THE RLS policies on `user_blocks` SHALL allow users to SELECT, INSERT, and DELETE only rows where blocker_id matches auth.uid(), with no UPDATE policy
4. THE RLS policies on `reports` SHALL allow users to INSERT and SELECT only their own reports, while admins can SELECT and UPDATE all reports
5. THE RLS policies on `mod_actions` SHALL allow only admins to INSERT and SELECT all records, while non-admin users can SELECT only rows where target_user_id matches auth.uid()
6. THE `submit_report` RPC SHALL enforce a rate limit of maximum 10 reports per user per hour, raising an exception when exceeded
7. THE `submit_report` RPC SHALL prevent self-reporting by raising an exception when content_type is 'profile' and reporter_id equals target_user_id
8. THE `mod_actions` table SHALL record every moderation action with report_id, target_user_id, admin_id, action, reason, duration_hours, expires_at, and created_at

### Requirement 8: UI Placement and Interaction

**User Story:** As a member, I want report, block, and mute options accessible from all content surfaces so that I can take action wherever I encounter problematic content.

#### Acceptance Criteria

1. WHEN viewing a log authored by another member, THE log detail screen SHALL display a MoreHorizontal icon button in the header that opens a ContentActionSheet with Report, Block, and Mute options
2. WHEN viewing a profile that is not the authenticated user's own, THE profile screen SHALL display a MoreVertical icon button that opens a ContentActionSheet with Report, Block/Unblock, and Mute/Unmute options reflecting current state
3. WHEN viewing a stack authored by another member, THE stacks detail screen SHALL display a MoreHorizontal icon button in the header that opens a ContentActionSheet with Report, Block Curator, and Mute Curator options
4. WHEN long-pressing a lounge message authored by another member, THE existing ActionSheet SHALL display additional Report Message and Block options below the existing actions
5. WHEN viewing a dossier authored by another member, THE dossier detail screen SHALL display a MoreHorizontal icon button in the header that opens a ContentActionSheet with Report, Block Author, and Mute Author options
6. WHEN long-pressing a comment authored by another member on logs, stacks, or dossiers, THE system SHALL display a mini ActionSheet with Report Annotation and Block options
7. THE ContentActionSheet and ReportSheet SHALL render with Nitrate Noir styling: BlurView backdrop, ink-colored sheet container, sepia border glow, spring-based enter/exit animations, and gesture dismissal (pan down > 100px or velocity > 500)

### Requirement 9: Report Payload Validation

**User Story:** As a developer, I want all report payloads validated via Zod schemas so that invalid data never reaches the database.

#### Acceptance Criteria

1. THE ReportPayloadSchema SHALL validate that reporter_id, content_id, and target_user_id are valid UUIDs
2. THE ReportPayloadSchema SHALL validate that details is at most 500 characters when provided
3. THE ReportPayloadSchema SHALL enforce via refinement that when reason is "other", the details field must be a non-empty trimmed string
4. WHEN a payload fails Zod validation, THE ReportStore SHALL not submit or enqueue the report and the ReportSheet SHALL display inline validation feedback

### Requirement 10: MMKV Persistence and Sync

**User Story:** As a member, I want my block list available instantly on app launch without waiting for network so that blocked content is never visible even for a moment.

#### Acceptance Criteria

1. THE BlockStore SHALL persist block/mute data to MMKV using the key pattern `reelhouse_blocks_{userId}` containing arrays of blocked and muted user IDs plus a lastSynced timestamp
2. WHEN hydrateFromCache is called with a userId that has no cached data, THE BlockStore SHALL proceed with empty indices without throwing an error
3. WHEN syncFromServer completes successfully, THE BlockStore SHALL update local indices to match server data and persist the updated state to MMKV
4. WHEN syncFromServer encounters a network error, THE BlockStore SHALL retain the existing MMKV cache state without modification (silent failure)
5. THE MMKV persistence format SHALL serialize as JSON containing `{ blocked: string[], muted: string[], lastSynced: number }`
