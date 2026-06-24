/**
 * dateUtils.ts — Date Formatting Utilities
 * ─────────────────────────────────────────
 * Pure functions for date grouping and formatting.
 * Extracted from [username].tsx to enable reuse across profile tabs.
 */

import type { ProfileLog, ProfileVaultItem } from '@/src/types';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Format a Date to a title-case "Month Year" grouping label (e.g. "January 2026").
 * Used internally for month-section keys in groupByMonth. Distinct from
 * timeAgo.ts's formatDateMonthYear, which renders an upper-case display string
 * from a string|Date|null input — kept separately named to avoid confusion.
 */
export function formatMonthYearLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Group an array of logs or vault items by month, using the specified date key.
 * Returns an object keyed by "MONTH YEAR" strings with arrays of items as values.
 */
export function groupByMonth<T extends ProfileLog | ProfileVaultItem>(
  items: T[],
  dateKey: keyof T = 'watchedDate' as keyof T,
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const item of items) {
    const dateValue = (item[dateKey] as string) || item.createdAt || new Date().toISOString();
    const d = new Date(dateValue);
    const title = formatMonthYearLabel(d);
    if (!grouped[title]) grouped[title] = [];
    grouped[title].push(item);
  }
  return grouped;
}
