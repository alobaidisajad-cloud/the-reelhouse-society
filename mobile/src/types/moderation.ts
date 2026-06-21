/**
 * moderation.ts — Society Report System Types & Schemas
 * ─────────────────────────────────────────────────────────
 * Shared type definitions and Zod schemas for the content reporting,
 * blocking/muting, and moderation enforcement framework.
 *
 * All surfaces (ReportSheet, ContentActionSheet, BlockStore, ReportStore,
 * ModerationService, Tribunal) import from this single source of truth.
 */
import { z } from 'zod';

// ── Content Types ──────────────────────────────────────────────────────────

/** All content surfaces that can be reported to the Tribunal. */
export const ReportableContentType = z.enum([
  'log',
  'list',
  'log_comment',
  'list_comment',
  'dossier',
  'dossier_comment',
  'lounge_message',
  'profile',
]);
/** Union type of all reportable content surfaces. */
export type ReportableContentType = z.infer<typeof ReportableContentType>;

// ── Report Reasons ─────────────────────────────────────────────────────────

/** Curated report reasons aligned with the Society aesthetic. */
export const ReportReason = z.enum([
  'spoiler_unmarked',
  'harassment',
  'hate_speech',
  'spam',
  'inappropriate',
  'impersonation',
  'misinformation',
  'copyright',
  'other',
]);
/** Union type of all valid report reason values. */
export type ReportReason = z.infer<typeof ReportReason>;

/** Human-readable labels and sublabels for each report reason (Society copy). */
export const REPORT_REASON_LABELS: Record<ReportReason, { label: string; sublabel: string }> = {
  spoiler_unmarked: { label: 'UNMARKED SPOILERS', sublabel: 'Contains untagged plot revelations' },
  harassment: { label: 'HARASSMENT', sublabel: 'Targeting or intimidating a Society member' },
  hate_speech: { label: 'HATE SPEECH', sublabel: 'Promotes hatred based on identity' },
  spam: { label: 'SPAM', sublabel: 'Unsolicited promotion or repetitive content' },
  inappropriate: { label: 'INAPPROPRIATE', sublabel: 'Explicit, violent, or disturbing material' },
  impersonation: { label: 'IMPERSONATION', sublabel: 'Masquerading as another member' },
  misinformation: { label: 'MISINFORMATION', sublabel: 'Deliberate falsehoods about films or persons' },
  copyright: { label: 'COPYRIGHT', sublabel: "Unauthorized reproduction of another's work" },
  other: { label: 'OTHER', sublabel: 'Describe the infraction below' },
};

// ── Block Types ────────────────────────────────────────────────────────────

/** Type of user-level content visibility restriction. */
export const BlockType = z.enum(['block', 'mute']);
/** Union type for block/mute distinction. */
export type BlockType = z.infer<typeof BlockType>;

// ── Moderation Actions ─────────────────────────────────────────────────────

/** Graduated enforcement actions available to Tribunal admins. */
export const ModAction = z.enum([
  'dismiss',
  'delete_content',
  'warn',
  'mute_user',
  'suspend',
  'ban',
  'permanent_exile',
]);
/** Union type of all moderation enforcement actions. */
export type ModAction = z.infer<typeof ModAction>;

// ── Report Payload Schema ──────────────────────────────────────────────────

/**
 * Schema for user-submitted report payloads.
 *
 * Validation rules:
 * - All IDs must be valid UUIDs
 * - `details` capped at 500 characters
 * - When reason is "other", non-empty trimmed details are required
 */
export const ReportPayloadSchema = z.object({
  /** UUID of the authenticated reporter. */
  reporter_id: z.string().uuid(),
  /** UUID of the content being reported. */
  content_id: z.string().uuid(),
  /** Surface type of the reported content. */
  content_type: ReportableContentType,
  /** Selected report reason. */
  reason: ReportReason,
  /** Optional free-text elaboration (max 500 chars). */
  details: z.string().max(500).nullable().optional(),
  /** Whether to also block the target user after reporting. */
  block_target: z.boolean().optional(),
  /** UUID of the user who authored the reported content. */
  target_user_id: z.string().uuid(),
}).refine(
  (data) => data.reason !== 'other' || (data.details != null && data.details.trim().length > 0),
  { message: 'Details required when reason is "other"', path: ['details'] },
);
/** Typed report payload after validation. */
export type ReportPayload = z.infer<typeof ReportPayloadSchema>;

// ── Block Record Schema ────────────────────────────────────────────────────

/**
 * Schema for a persisted block/mute record from the `user_blocks` table.
 */
export const BlockRecordSchema = z.object({
  /** Primary key UUID. */
  id: z.string().uuid(),
  /** UUID of the user who initiated the block/mute. */
  blocker_id: z.string().uuid(),
  /** UUID of the user being blocked/muted. */
  blocked_id: z.string().uuid(),
  /** Whether this is a full block or a mute. */
  type: BlockType,
  /** ISO timestamp of when the record was created. */
  created_at: z.string(),
});
/** Typed block/mute record. */
export type BlockRecord = z.infer<typeof BlockRecordSchema>;

// ── Action Meta Schema (admin actions) ─────────────────────────────────────

/**
 * Metadata accompanying an admin moderation action.
 */
export const ActionMetaSchema = z.object({
  /** UUID of the admin performing the action. */
  admin_id: z.string().uuid(),
  /** Human-readable reason for the action. */
  reason: z.string().min(1),
  /** Duration in hours for time-limited actions (suspend). */
  duration_hours: z.number().positive().optional(),
  /** Whether to send a notification to the affected user. */
  notify_user: z.boolean().default(true),
});
/** Typed admin action metadata. */
export type ActionMeta = z.infer<typeof ActionMetaSchema>;

// ── Mod Action Record Schema (audit log) ───────────────────────────────────

/**
 * Schema for audit log entries in the `mod_actions` table.
 * Every enforcement action produces one record for accountability.
 */
export const ModActionRecordSchema = z.object({
  /** Primary key UUID. */
  id: z.string().uuid(),
  /** Associated report UUID (null for proactive actions). */
  report_id: z.string().uuid().nullable(),
  /** UUID of the user the action was taken against. */
  target_user_id: z.string().uuid(),
  /** UUID of the admin who performed the action. */
  admin_id: z.string().uuid(),
  /** The enforcement action taken. */
  action: ModAction,
  /** Admin-provided reason for the action. */
  reason: z.string(),
  /** Duration in hours (null for permanent or instant actions). */
  duration_hours: z.number().nullable(),
  /** ISO timestamp when a time-limited action expires (null if permanent). */
  expires_at: z.string().nullable(),
  /** ISO timestamp of when the action was performed. */
  created_at: z.string(),
});
/** Typed moderation audit log record. */
export type ModActionRecord = z.infer<typeof ModActionRecordSchema>;

// ── Report Result Type ─────────────────────────────────────────────────────

/**
 * Discriminated union representing the outcome of a report submission attempt.
 */
export type ReportResult =
  | { status: 'submitted' }
  | { status: 'queued' }
  | { status: 'duplicate'; message: string }
  | { status: 'error'; message: string };

// ── MMKV Persistence Format ────────────────────────────────────────────────

/**
 * Shape of the JSON blob persisted to MMKV under
 * the key `reelhouse_blocks_{userId}`.
 */
export interface PersistedBlockData {
  /** Array of blocked user UUIDs. */
  blocked: string[];
  /** Array of muted user UUIDs. */
  muted: string[];
  /** Unix ms timestamp of last successful server sync. */
  lastSynced: number;
}
