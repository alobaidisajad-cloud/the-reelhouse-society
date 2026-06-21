/**
 * timeAgo — Unified relative time formatting utility.
 * 
 * Returns human-readable time-ago strings with consistent formatting
 * across all screens (log detail, user profile, etc).
 * 
 * Extracted from log/[id].tsx and user/[username].tsx 
 * to eliminate duplicate implementations with inconsistent edge-case handling.
 */

export function timeAgo(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return typeof dateStr === 'string' ? dateStr.split('T')[0] : '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d AGO`;
  if (days < 30) return `${Math.floor(days / 7)}w AGO`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

/**
 * Lowercase variant for inline text contexts (e.g. activity feeds).
 */
export function timeAgoLower(dateStr: string | Date | undefined | null): string {
  return timeAgo(dateStr).toLowerCase();
}

/**
 * Standard date formatting for dates that don't need relative time.
 */
export function formatDate(dateStr: string | Date | undefined | null, format: 'short' | 'long' = 'short'): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return typeof dateStr === 'string' ? dateStr.split('T')[0] : '';
  if (format === 'long') {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

/**
 * Month/Year format (e.g. for "MEMBER SINCE")
 */
export function formatDateMonthYear(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return typeof dateStr === 'string' ? dateStr.split('T')[0] : '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

/**
 * formatting strictly for TMDB YYYY-MM-DD or YYYY strings.
 * Enforces native UTC parsing to prevent JS timezone shift bugs globally.
 */
export function formatTMDBDate(dateStr: string | undefined | null, format: 'short' | 'long' = 'short'): string | undefined {
  if (!dateStr) return undefined;
  
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const day = parseInt(parts[2], 10);
    
    // Construct in explicit UTC to prevent local timezone offsets from shifting the day
    const d = new Date(Date.UTC(year, month, day));
    
    return d.toLocaleDateString('en-US', { 
      timeZone: 'UTC', 
      month: format === 'long' ? 'long' : 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }).toUpperCase();
  }
  
  // Safe fallback for 'YYYY' which TMDB returns when exact date is unknown
  if (parts.length === 1 && parts[0].length === 4) {
    return parts[0];
  }
  
  return dateStr;
}
