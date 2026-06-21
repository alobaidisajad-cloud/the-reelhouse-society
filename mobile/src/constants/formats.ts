/**
 * formats.ts — Physical Media Format Metadata
 * ─────────────────────────────────────────────
 * T3-20: Extracted from [username].tsx for reusability.
 * Used by: Profile vault tab (format counts), archive feature.
 */
import { colors } from '@/src/theme/theme';

export const FORMAT_META: Record<string, { label: string; color: string }> = {
  '4k':        { label: '4K UHD',     color: '#a855f7' },
  'bluray':    { label: 'Blu-ray',    color: '#3b82f6' },
  'dvd':       { label: 'DVD',        color: '#f59e0b' },
  'vhs':       { label: 'VHS',        color: '#ef4444' },
  'laserdisc': { label: 'LaserDisc',  color: '#10b981' },
  'steelbook': { label: 'Steelbook',  color: '#6366f1' },
  'criterion': { label: 'Criterion',  color: colors.sepia },
} as const;

/** All supported format IDs */
export const FORMAT_IDS = Object.keys(FORMAT_META);
