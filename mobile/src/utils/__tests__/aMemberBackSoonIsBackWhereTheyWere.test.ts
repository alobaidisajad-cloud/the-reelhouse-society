/**
 * aMemberBackSoonIsBackWhereTheyWere.test.ts — the tab a launch reopens.
 * ─────────────────────────────────────────────────────────────────────────────
 * The phone closes a backgrounded app when it wants the memory; the member did
 * not. Back within the half hour (one sitting), they are back on their tab;
 * later, the Lobby greets them. The half hour runs from the app's LAST USE, and
 * a value the phone cannot read reopens nothing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { LAST_TAB_KEY, pageOfLaunch, rememberTab, RETURN_WITHIN_MS, stampTab, tabToReopen, tabToReopenAfter } from '../lastTab';

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
  },
}));

const T = 1_800_000_000_000;
beforeEach(() => mockStore.clear());

it('back within the half hour: back on the tab they were on', () => {
  rememberTab('reels', T);
  expect(tabToReopen(T + 5 * 60 * 1000)).toBe('reels');
  expect(tabToReopen(T + RETURN_WITHIN_MS)).toBe('reels');
});

it('later than that: the Lobby (nothing to reopen)', () => {
  rememberTab('dispatch', T);
  expect(tabToReopen(T + RETURN_WITHIN_MS + 1)).toBeNull();
});

it('the half hour runs from the app’s last use, not from when the tab was chosen', () => {
  rememberTab('darkroom', T);
  stampTab(T + 2 * 60 * 60 * 1000); // read for two hours, then put away
  expect(tabToReopen(T + 2 * 60 * 60 * 1000 + 10 * 60 * 1000)).toBe('darkroom');
});

it('the Lobby itself, a page that is not a tab, a clock gone backwards, or a value it cannot read reopen nothing', () => {
  rememberTab('index', T);
  expect(tabToReopen(T + 1000)).toBeNull();
  rememberTab('lounge', T); // not on the bar (and `/lounge` is also a page of its own)
  expect(tabToReopen(T + 1000)).toBeNull();
  rememberTab('profile', T);
  expect(tabToReopen(T - 60_000)).toBeNull();
  mockStore.set(LAST_TAB_KEY, '{not json');
  expect(tabToReopen(T)).toBeNull();
  mockStore.set(LAST_TAB_KEY, JSON.stringify({ tab: 'settings', at: T }));
  expect(tabToReopen(T)).toBeNull();
});

it('the tab bar remembers each tab as it is shown, stamps the time as the app leaves, and reopens only a launch that began at the Lobby, by no link that names a page', () => {
  const layout = readFileSync(join(__dirname, '..', '..', '..', 'app', '(tabs)', '_layout.tsx'), 'utf8');
  expect(layout).toMatch(/screenListeners=\{\(\{ route \}\) => \(\{ focus: \(\) => rememberTab\(route\.name\) \}\)\}/);
  expect(layout).toMatch(/if \(next !== 'active'\) stampTab\(\)/);
  expect(layout).toMatch(/if \(launchedAt\.current === '\/'\) \{\s+void Linking\.getInitialURL\(\)\.catch\(\(\) => null\)\.then\(\(url\) => \{\s+const tab = tabToReopenAfter\(url\);/);
  // Only a member still on the Lobby once the link is read: one a link or a tap took on stays there.
  expect(layout).toMatch(/here\.current = pathname;/);
  expect(layout).toMatch(/if \(tab && !gone && here\.current === '\/'\) router\.navigate/);
  expect(layout).not.toMatch(/\btabToReopen\(\)/);
});

describe('a launch by a link goes where the link goes (route walk, 2026-10-21)', () => {
  it('names the page a launch link names, and none for the app or the site alone', () => {
    expect(pageOfLaunch('reelhouse://auth-callback?type=recovery&code=x')).toBe('auth-callback');
    expect(pageOfLaunch('reelhouse://film/129')).toBe('film/129');
    expect(pageOfLaunch('https://www.thereelhousesociety.com/film/129?ref=share')).toBe('film/129');
    for (const none of ['reelhouse://', 'reelhouse:///', 'https://www.thereelhousesociety.com/', 'https://www.thereelhousesociety.com', null, undefined, '', 'not a link']) {
      expect([none, pageOfLaunch(none)]).toEqual([none, '']);
    }
  });

  it('reopens the tab only for a launch that names no page', () => {
    rememberTab('profile', T);
    const soon = T + 60_000;
    expect([tabToReopenAfter(null, soon), tabToReopenAfter('reelhouse://', soon)]).toEqual(['profile', 'profile']);
    expect(['reelhouse://auth-callback', 'reelhouse://reset-password', 'https://www.thereelhousesociety.com/log/1'].map((url) => tabToReopenAfter(url, soon))).toEqual([null, null, null]);
  });
});
