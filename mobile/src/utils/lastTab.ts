/**
 * lastTab — a member who comes back soon comes back where they were.
 * ─────────────────────────────────────────────────────────────────────────────
 * The phone closes an app it has put in the background whenever it wants the
 * memory, and the member never asked it to: a glance at a message was enough to
 * send them from the Reel they were reading back to the Lobby. So the tab they
 * were on is kept, with when the app was last in use, and a launch within the
 * half hour (the usual measure of one sitting) reopens it. After that the
 * Lobby greets them — the house's front door and the day's edition.
 *
 * Only a tab, never a page deeper in: a page may since be gone, or no longer
 * theirs to see; a tab is always there.
 */
import { storage } from '../stores/mmkv-storage';

export const LAST_TAB_KEY = 'last_tab';
/** One sitting. */
export const RETURN_WITHIN_MS = 30 * 60 * 1000;
/**
 * The five tabs on the bar (the Lobby, `index`, is where a launch begins anyway).
 * Not the hidden `lounge` tab: `/lounge` is also a page of its own outside the
 * tabs, and a launch must never guess which one it meant.
 */
export const TABS = ['index', 'dispatch', 'reels', 'darkroom', 'profile'] as const;
export type TabName = (typeof TABS)[number];

const isTab = (v: unknown): v is TabName => typeof v === 'string' && (TABS as readonly string[]).includes(v);

function read(): { tab: TabName; at: number } | null {
  try {
    const v = JSON.parse(storage.getString(LAST_TAB_KEY) ?? 'null') as { tab?: unknown; at?: unknown } | null;
    return v && isTab(v.tab) && typeof v.at === 'number' ? { tab: v.tab, at: v.at } : null;
  } catch {
    return null;
  }
}

/** The member is on this tab now. */
export function rememberTab(tab: string, now: number = Date.now()): void {
  if (isTab(tab)) storage.set(LAST_TAB_KEY, JSON.stringify({ tab, at: now }));
}

/** The app is leaving the screen: the half hour is counted from its last use, not from the tab's first. */
export function stampTab(now: number = Date.now()): void {
  const last = read();
  if (last) storage.set(LAST_TAB_KEY, JSON.stringify({ tab: last.tab, at: now }));
}

/** The tab to reopen at launch, if the member was here within the half hour; else none (the Lobby). */
export function tabToReopen(now: number = Date.now()): TabName | null {
  const last = read();
  if (!last || last.tab === 'index') return null;
  const since = now - last.at;
  return since >= 0 && since <= RETURN_WITHIN_MS ? last.tab : null;
}
