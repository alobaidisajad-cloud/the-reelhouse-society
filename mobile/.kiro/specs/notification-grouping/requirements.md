# Requirements Document

## Introduction

This feature introduces client-side notification grouping for endorsement notifications in the Reelhouse mobile app. When a user receives many endorsement notifications for the same review (e.g., a viral moment), the system collapses them into a single grouped row in the notifications modal. The implementation is a pure view-layer transformation with no server, database, or store schema changes.

## Glossary

- **Grouping_Function**: The pure `groupNotifications()` utility that transforms a flat notification array into a mixed array of individual and grouped display items
- **DisplayItem**: A union type representing either an individual notification or a grouped notification in the rendered list
- **GroupedDisplayItem**: A display item representing multiple collapsed endorsement notifications sharing the same target
- **IndividualDisplayItem**: A display item wrapping a single notification passed through unchanged
- **GroupKey**: A stable string identifier derived from notification type and target (e.g., `endorse:film:123`) used to bucket notifications
- **Notification_Store**: The Zustand-based `useNotificationStore` managing the flat `notifications[]` array and related state
- **GroupedNotificationItem_Component**: The React Native UI component that renders a grouped display item row
- **Notifications_Modal**: The modal screen (`notifications-modal.tsx`) displaying the notification list via FlashList
- **Time_Window**: The 72-hour period (relative to current time) within which endorsement notifications are eligible for grouping
- **Minimum_Group_Size**: The threshold of 3 notifications required before a bucket is emitted as a group rather than dissolved into individual items

## Requirements

### Requirement 1: Grouping Transformation

**User Story:** As a user with many endorsement notifications, I want them collapsed into a single grouped row, so that my notifications list remains readable during viral moments.

#### Acceptance Criteria

1. WHEN the Notifications_Modal renders, THE Grouping_Function SHALL transform the flat notifications array into a DisplayItem array via `useMemo`
2. THE Grouping_Function SHALL process the notifications array in O(n) time complexity using a single-pass algorithm
3. THE Grouping_Function SHALL be a pure function with no side effects and no mutations to the input array
4. WHEN the notifications array reference changes, THE `useMemo` hook SHALL recompute the DisplayItem array

### Requirement 2: Group Eligibility Rules

**User Story:** As a user, I want only relevant endorsement notifications grouped together, so that unrelated notifications remain individually visible.

#### Acceptance Criteria

1. THE Grouping_Function SHALL only group notifications where the type is `endorse`
2. THE Grouping_Function SHALL only group notifications whose `created_at` timestamp is within the Time_Window of 72 hours relative to the current time
3. THE Grouping_Function SHALL require a Minimum_Group_Size of 3 notifications sharing the same GroupKey before emitting a GroupedDisplayItem
4. WHEN fewer than 3 notifications share the same GroupKey, THE Grouping_Function SHALL emit each as an IndividualDisplayItem
5. THE Grouping_Function SHALL derive the GroupKey from the notification's `film_id` (format: `endorse:film:{id}`) or from a message pattern match (format: `endorse:msg:{filmName}`)
6. IF a notification has no derivable GroupKey, THEN THE Grouping_Function SHALL treat the notification as non-groupable and emit it as an IndividualDisplayItem

### Requirement 3: Notification Conservation

**User Story:** As a user, I want every notification accounted for in the display list, so that no notifications are lost or duplicated by the grouping transformation.

#### Acceptance Criteria

1. THE Grouping_Function SHALL ensure every input notification appears exactly once in the output — either within a GroupedDisplayItem or as an IndividualDisplayItem
2. THE Grouping_Function SHALL ensure the total count across all output DisplayItems equals the input array length
3. THE Grouping_Function SHALL ensure no notification ID appears in more than one DisplayItem

### Requirement 4: GroupedDisplayItem Data Integrity

**User Story:** As a user viewing a grouped notification, I want the group metadata to accurately reflect the underlying notifications, so that I can trust the displayed information.

#### Acceptance Criteria

1. THE Grouping_Function SHALL set the GroupedDisplayItem `count` field equal to the number of notification IDs in the group
2. THE Grouping_Function SHALL set the GroupedDisplayItem `created_at` to the most recent `created_at` among all notifications in the group
3. THE Grouping_Function SHALL set the GroupedDisplayItem `hasUnread` to true if any notification in the group has `read` equal to false
4. THE Grouping_Function SHALL set the GroupedDisplayItem `hasUnread` to false if all notifications in the group have `read` equal to true
5. THE Grouping_Function SHALL ensure all notifications within a GroupedDisplayItem share the same GroupKey
6. THE Grouping_Function SHALL format the GroupedDisplayItem `message` as "{count} cinephiles endorsed your review of {filmName}"

### Requirement 5: Output Ordering

**User Story:** As a user, I want my notifications displayed in chronological order (most recent first), so that I see the latest activity at the top.

#### Acceptance Criteria

1. THE Grouping_Function SHALL sort the output DisplayItem array in descending order by most recent timestamp
2. WHEN comparing timestamps for ordering, THE Grouping_Function SHALL use the GroupedDisplayItem `created_at` for groups and the notification `created_at` for individual items

### Requirement 6: Batch Mark Read

**User Story:** As a user tapping a grouped notification, I want all notifications in the group marked as read in one action, so that I do not need to dismiss each individually.

#### Acceptance Criteria

1. WHEN a user taps a GroupedNotificationItem_Component, THE Notification_Store SHALL mark all notification IDs in the group as read using a single batch operation
2. THE Notification_Store `markGroupRead` method SHALL optimistically update all matching notifications to `read: true` before the server responds
3. THE Notification_Store `markGroupRead` method SHALL decrement `_unreadCount` by the number of previously-unread notifications in the group
4. IF the Supabase batch update fails, THEN THE Notification_Store SHALL roll back the notifications array and `_unreadCount` to their previous values
5. THE Notification_Store `markGroupRead` method SHALL execute a single `.in('id', ids)` query rather than N individual requests

### Requirement 7: Batch Dismiss

**User Story:** As a user dismissing a grouped notification, I want the entire group removed in one action, so that I can efficiently clear my notifications.

#### Acceptance Criteria

1. WHEN a user dismisses a GroupedNotificationItem_Component, THE Notification_Store SHALL remove all notification IDs in the group from the notifications array
2. THE Notification_Store `dismissGroup` method SHALL optimistically remove all matching notifications before the server responds
3. THE Notification_Store `dismissGroup` method SHALL decrement `_unreadCount` by the number of unread notifications in the dismissed group
4. IF the Supabase batch delete fails, THEN THE Notification_Store SHALL roll back the notifications array and `_unreadCount` to their previous values
5. THE Notification_Store `dismissGroup` method SHALL execute a single `.in('id', ids)` delete query rather than N individual requests

### Requirement 8: Grouped Notification UI Rendering

**User Story:** As a user, I want grouped notifications to display a count badge, aggregated message, and poster thumbnail, so that I can quickly understand the group content.

#### Acceptance Criteria

1. WHEN the FlashList renders a DisplayItem with `kind` equal to `group`, THE Notifications_Modal SHALL render a GroupedNotificationItem_Component
2. WHEN the FlashList renders a DisplayItem with `kind` equal to `individual`, THE Notifications_Modal SHALL render the existing NotificationItem component
3. THE GroupedNotificationItem_Component SHALL display a count badge showing the number of notifications in the group
4. THE GroupedNotificationItem_Component SHALL display the pre-formatted group message
5. THE GroupedNotificationItem_Component SHALL display a poster thumbnail when `poster_path` is available
6. THE GroupedNotificationItem_Component SHALL display an unread indicator when `hasUnread` is true

### Requirement 9: Grouped Notification Navigation

**User Story:** As a user tapping a grouped notification, I want to navigate to the relevant film page, so that I can see the review that received endorsements.

#### Acceptance Criteria

1. WHEN a user taps a GroupedNotificationItem_Component with a `film_id`, THE Notifications_Modal SHALL close and navigate to the film detail page for that `film_id`
2. WHEN a user taps a GroupedNotificationItem_Component that has unread notifications, THE Notification_Store SHALL mark the group as read before navigation occurs

### Requirement 10: Zero Store Schema Changes

**User Story:** As a developer, I want the grouping feature to avoid modifying the existing store shape, so that all existing functionality (pagination, realtime, persistence) remains unaffected.

#### Acceptance Criteria

1. THE Notification_Store SHALL maintain the existing flat `notifications: AppNotification[]` array without structural modifications
2. THE Notification_Store SHALL preserve existing pagination, realtime injection, and MMKV persistence behavior unchanged
3. THE Grouping_Function SHALL operate exclusively on the output of the store without writing back to it

### Requirement 11: Error Handling

**User Story:** As a user, I want the notification list to degrade gracefully when data is malformed, so that one bad notification does not crash the entire list.

#### Acceptance Criteria

1. IF a notification has an invalid or unparseable `created_at` value, THEN THE Grouping_Function SHALL treat the notification as non-groupable and emit it as an IndividualDisplayItem
2. WHEN the notifications array is empty, THE Grouping_Function SHALL return an empty array
3. IF `markGroupRead` or `dismissGroup` receives an empty IDs array, THEN THE Notification_Store SHALL return immediately without modifying state
