/**
 * theTappedNoticeOpensIt.test.ts — a push notification, tapped, opens its notice.
 * ─────────────────────────────────────────────────────────────────────────────
 * notify-push sends `{ type, notificationId }`. The app looked for a `screen` or
 * a `url` nobody sends, so every tap opened the app wherever it was. The tap
 * that LAUNCHED a closed app was never heard at all, and the listener was added
 * again on every sign-in, so after signing back in one tap navigated twice.
 *
 * These hold: the payload contract on both sides, one destination shared with
 * the notices sheet, the tap opening it (or the sheet), each tap delivered
 * once, and one listener for the life of the app.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { noticeRoute } from '../noticeRoute';
import { NOTICES_SHEET, noticeIdOf, openNoticeFromPush } from '../openNoticeFromPush';
import { deliverEachTapOnce } from '@/src/lib/pushNotifications';
import { useNotificationStore, type AppNotification } from '@/src/stores/notificationStore';
import { nav } from '@/src/utils/typedRouter';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: '11111111-1111-4111-8111-111111111111' } };
  return { useAuthStore: Object.assign(() => state, { getState: () => state, subscribe: () => () => {} }), storage: { getString: () => undefined, set: () => {}, delete: () => {} } };
});
jest.mock('react-native/Libraries/Interaction/InteractionManager', () => ({
  __esModule: true,
  default: { runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => {} }; } },
  runAfterInteractions: (fn: () => void) => { fn(); return { cancel: () => {} }; },
}));

const MOBILE = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(MOBILE, p), 'utf8');

const ESSAY = '22222222-2222-4222-8222-222222222222';
const notice = (over: Partial<AppNotification>): AppNotification => ({
  id: 'n1', user_id: 'u', type: 'comment', message: 'left a critique', read: false,
  created_at: '2026-09-17T00:00:00Z', ...over,
});

beforeEach(() => {
  jest.mocked(nav.push).mockClear();
  jest.mocked(supabase.from).mockReset();
  useNotificationStore.setState({ notifications: [] });
});

describe('where a notice leads', () => {
  it('to what it is about, then the film, then the person', () => {
    expect(noticeRoute(notice({ group_key: `endorse:dossier:${ESSAY}` }))).toBe(`/dossier/${ESSAY}`);
    expect(noticeRoute(notice({ group_key: 'endorse:list:s1' }))).toBe('/stacks/s1');
    expect(noticeRoute(notice({ group_key: 'endorse:post:p1' }))).toBe('/dispatch/p1');
    expect(noticeRoute(notice({ group_key: 'endorse:log:l1', film_id: 603 }))).toBe('/film/603');
    expect(noticeRoute(notice({ film_id: 603, from_username: 'marguerite' }))).toBe('/film/603');
    expect(noticeRoute(notice({ type: 'follow', from_username: 'marguerite' }))).toBe('/user/marguerite');
    expect(noticeRoute(notice({}))).toBeNull();
  });

  it('the notices sheet asks the same function — the two cannot disagree', () => {
    const sheet = read('app/(modals)/notifications-modal.tsx');
    expect(sheet).toMatch(/const route = noticeRoute\(item\);/);
    expect(read('src/utils/openNoticeFromPush.ts')).toMatch(/noticeRoute\(notice\)/);
  });
});

describe('a tapped push', () => {
  it('opens a loaded notice where the sheet would, and marks it read', async () => {
    const markRead = jest.fn(async () => {});
    useNotificationStore.setState({ notifications: [notice({ id: 'n1', film_id: 603 })], markRead } as never);
    await expect(openNoticeFromPush('n1')).resolves.toBe('/film/603');
    expect(nav.push).toHaveBeenCalledWith('/film/603');
    expect(markRead).toHaveBeenCalledWith('n1');
  });

  it('reads a notice that is not loaded — by id, narrowed to this member', async () => {
    const eq = jest.fn();
    // Annotated: select() and eq() return `chain` itself.
    const chain: Record<string, jest.Mock> = {
      select: jest.fn(() => chain),
      eq: jest.fn((col: string, val: string) => { eq(col, val); return chain; }),
      maybeSingle: jest.fn(async () => ({
        data: { id: 'n9', user_id: 'u', type: 'follow', message: 'followed you', is_read: true, created_at: '2026-09-17T00:00:00Z', from_username: 'marguerite' },
        error: null,
      })),
    };
    jest.mocked(supabase.from).mockReturnValue(chain as never);
    const markRead = jest.fn(async () => {});
    useNotificationStore.setState({ markRead } as never);
    await expect(openNoticeFromPush('n9')).resolves.toBe('/user/marguerite');
    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(eq).toHaveBeenCalledWith('id', 'n9');
    expect(eq).toHaveBeenCalledWith('user_id', '11111111-1111-4111-8111-111111111111');
    // Already read on the server — not marked again.
    expect(markRead).not.toHaveBeenCalled();
  });

  it('a notice that cannot be found, or points nowhere, opens the notices sheet', async () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
    jest.mocked(supabase.from).mockReturnValue(chain as never);
    await expect(openNoticeFromPush('gone')).resolves.toBe(NOTICES_SHEET);
    useNotificationStore.setState({ notifications: [notice({ id: 'bare', read: true })] });
    await expect(openNoticeFromPush('bare')).resolves.toBe(NOTICES_SHEET);
    expect(NOTICES_SHEET).toBe('/notifications-modal');
  });

  it('reads the id the push carries, and nothing that is not one', () => {
    expect(noticeIdOf({ type: 'follow', notificationId: 'n1' })).toBe('n1');
    expect(noticeIdOf({ type: 'follow', notificationId: null })).toBeNull();
    expect(noticeIdOf({ type: 'follow', notificationId: '' })).toBeNull();
    expect(noticeIdOf(undefined)).toBeNull();
  });
});

describe('each tap is delivered once', () => {
  const response = (identifier: string, data: Record<string, string> | undefined) =>
    ({ notification: { request: { identifier, content: { data } } } });

  it('the launching tap seen by both the listener and the launch read opens once', () => {
    const onTap = jest.fn();
    const deliver = deliverEachTapOnce(onTap);
    deliver(response('req-1', { notificationId: 'n1' }));
    deliver(response('req-1', { notificationId: 'n1' }));
    deliver(response('req-2', { notificationId: 'n2' }));
    expect(onTap.mock.calls).toEqual([[{ notificationId: 'n1' }], [{ notificationId: 'n2' }]]);
  });

  it('a malformed response is ignored', () => {
    const onTap = jest.fn();
    const deliver = deliverEachTapOnce(onTap);
    deliver(undefined);
    deliver(response('req-3', undefined));
    expect(onTap).not.toHaveBeenCalled();
  });

  it('the launching response is read, delivered and cleared', () => {
    const push = read('src/lib/pushNotifications.ts');
    expect(push).toMatch(/getLastNotificationResponseAsync\(\)/);
    expect(push).toMatch(/clearLastNotificationResponseAsync/);
  });
});

describe('the contract, both sides', () => {
  it('notify-push sends the notice id — and the app reads exactly that key', () => {
    expect(read('supabase/functions/notify-push/index.ts')).toMatch(/notificationId: record\.id/);
    expect(read('src/utils/openNoticeFromPush.ts')).toMatch(/data\?\.notificationId/);
  });

  it('one tap listener for the life of the app — not one per sign-in — released on unmount', () => {
    const boot = read('src/providers/AppBootstrapper.tsx').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    const bootFn = boot.slice(boot.indexOf('async function boot('), boot.indexOf('function checkHandle('));
    expect(bootFn).not.toMatch(/setupNotificationResponseHandler/);
    expect((boot.match(/setupNotificationResponseHandler\(/g) ?? []).length).toBe(1);
    expect(boot).toMatch(/releaseTaps\?\.\(\);/);
    // A tap before the member is known waits for them; signing out drops it.
    expect(boot).toMatch(/pendingNotice = id;/);
    expect(boot).toMatch(/else if \(!state\.user\) \{\s*pendingNotice = null;/);
  });

  it('nothing reads a `screen` from a push any more', () => {
    const boot = read('src/providers/AppBootstrapper.tsx').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(boot).not.toMatch(/data\.screen/);
    expect(read('src/constants/deepLinks.ts')).not.toMatch(/export function isValidDeepLink/);
  });
});
