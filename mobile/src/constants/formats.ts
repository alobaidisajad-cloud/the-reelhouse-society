/**
 * formats.ts — the physical formats a copy can be catalogued as: each one's
 * label and spine colour, and the order the Physical Archive's shelves stand in.
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

/**
 * The order the Physical Archive's shelves stand in: by CARRIER, newest first —
 * 4K, Blu-ray, DVD, LaserDisc, VHS — then the two that describe an EDITION
 * rather than a carrier, at the end because they are the prized shelf.
 *
 * Anything not named here still gets a shelf; it simply falls to the bottom.
 */
export const FORMAT_SHELVES = ['4k', 'bluray', 'dvd', 'laserdisc', 'vhs', 'steelbook', 'criterion'] as const;

/** Where a format's shelf stands. Unknown formats sort last, then by name. */
export function shelfRank(id: string): number {
  const i = (FORMAT_SHELVES as readonly string[]).indexOf(id);
  return i === -1 ? FORMAT_SHELVES.length : i;
}
