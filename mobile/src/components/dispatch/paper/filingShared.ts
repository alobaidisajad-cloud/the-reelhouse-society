/**
 * filingShared — a filing's line as it leaves the house: the line sent to another app, the one the
 * share sheet previews (the same, so the preview shows what goes), and the title of its card in a
 * salon. Its headline when it has one; else its words, unless they are marked as a spoiler
 * (sharedWords), when the line says only what it is and that it holds spoilers.
 */
import { SPOILERS_LEADER, sharedWords } from '@/src/utils/sharedWords';
import { nameOf } from '@/src/components/dispatch/paper/paperMetrics';

export interface SharedFiling {
  kind: string;
  title?: string | null;
  body?: string | null;
  spoilerLabel?: string | null;
  film?: { title?: string | null } | null;
}

/** "TAKE on Vertigo · SPOILERS": a filing whose words stay in the house, said as what it is. */
export function filingShareLine(f: SharedFiling): string {
  const headline = (f.title ?? '').trim();
  if (headline) return headline;
  const words = sharedWords(f.body, f.spoilerLabel);
  if (words) return words;
  const on = f.film?.title ? ` on ${f.film.title}` : '';
  return `${nameOf(f.kind)}${on}${f.spoilerLabel ? ' · SPOILERS' : ''}`;
}

/** An essay's opening on its shared clipping: none of its words when they are marked as a spoiler. */
export function filingShareOpening(f: SharedFiling & { fullContent?: string | null }): string {
  return sharedWords(f.fullContent ?? f.body, f.spoilerLabel) ?? (f.spoilerLabel ? SPOILERS_LEADER : '');
}

/**
 * The line of the spine pinned over a filing's page, beside its kind ("TAKE: ..."): its opening words,
 * or, marked as a spoiler, its film and that it holds spoilers ("On Vertigo · SPOILERS"), never the
 * words the page veils, and never its kind twice.
 */
export function filingSpineLine(f: SharedFiling): string {
  const headline = (f.title ?? '').trim();
  if (headline) return headline;
  const words = sharedWords(f.body, f.spoilerLabel);
  if (words) return words;
  return [f.film?.title ? `On ${f.film.title}` : '', f.spoilerLabel ? 'SPOILERS' : ''].filter(Boolean).join(' · ');
}
