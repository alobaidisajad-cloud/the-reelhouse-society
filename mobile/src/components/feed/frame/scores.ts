/**
 * An Auteur's breakdown, read from the log's stored scores: one short name per score, the frame's
 * and the log page's alike.
 *
 * AUTOPSY LAW: v2 payloads (`_v >= 2`) hold only the scores the member filed — a stored 0 there
 * is a verdict, drawn as 0. Legacy payloads wrote 0 for every untouched score (their editor could
 * not express a zero), so a legacy zero is unscored and dropped. None left: nothing was filed.
 */
export interface AutopsyStats {
  [key: string]: number;
}

export interface Score { key: string; label: string; value: number }

export function getAutopsyStats(autopsy?: Record<string, number> | null): Score[] {
  if (!autopsy || typeof autopsy !== 'object') return [];
  const isV2 = typeof autopsy._v === 'number' && autopsy._v >= 2;
  const pick = (...candidates: unknown[]) => {
    for (const c of candidates) {
      const n = typeof c === 'number' ? c : c != null ? parseFloat(String(c)) : NaN;
      if (!isNaN(n)) return Math.min(10, Math.max(0, n));
    }
    return null;
  };
  const axes: { key: string; label: string; value: number | null }[] = [
    { key: 'story', label: 'STORY', value: pick(autopsy.story, autopsy.screenplay) },
    { key: 'script', label: 'SCRIPT', value: pick(autopsy.script, autopsy.screenplay) },
    { key: 'acting', label: 'ACTING', value: pick(autopsy.acting, autopsy.direction) },
    { key: 'cinematography', label: 'CINEMA', value: pick(autopsy.cinematography) },
    { key: 'editing', label: 'EDIT', value: pick(autopsy.editing, autopsy.pacing) },
    { key: 'sound', label: 'SOUND', value: pick(autopsy.sound) },
  ];
  return axes.filter((a): a is Score => a.value !== null && (isV2 || a.value > 0));
}

/** True when the payload carries at least one score genuinely filed. */
export function hasRatedAutopsy(autopsy?: Record<string, number> | null): boolean {
  return getAutopsyStats(autopsy).length > 0;
}
