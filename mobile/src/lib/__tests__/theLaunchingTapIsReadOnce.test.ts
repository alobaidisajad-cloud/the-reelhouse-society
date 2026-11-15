/**
 * theLaunchingTapIsReadOnce.test.ts — review round 4 (navigation)
 * ────────────────────────────────────────────────────────────────
 * A member writing in the Log sheet, the app closed behind them by the phone, taps a push about a
 * new critique. Two things pushed a page as the app came up: the tap (its notice's page) and the
 * tabs' launch reopen (the writing room, over the last tab). Whichever came last was on top, so the
 * member could land in the sheet instead of the critique they tapped.
 *
 * The launching notification is now read once and shared: the tap is opened from it, once however
 * often the handler is set up, and the tabs' launch reopen stands aside when it is there.
 */
import * as Notifications from 'expo-notifications';
import { readCode } from '@/test-utils/readCode';

const RESPONSE = {
  notification: { request: { identifier: 'n-launch', content: { data: { notificationId: 'n1' } } } },
  actionIdentifier: 'default',
} as never;

/** The module afresh, as a launch meets it. */
const fresh = (): typeof import('../pushNotifications') => {
  let mod!: typeof import('../pushNotifications');
  jest.isolateModules(() => { mod = require('../pushNotifications'); });
  return mod;
};

beforeEach(() => {
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockReset().mockResolvedValue(RESPONSE);
  jest.mocked(Notifications.clearLastNotificationResponseAsync).mockClear();
});

it('is read from the system once, however many ask', async () => {
  const push = fresh();
  const [a, b] = await Promise.all([push.launchingNotification(), push.launchingNotification()]);
  expect(a).toBe(RESPONSE);
  expect(b).toBe(RESPONSE);
  expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
});

it('its tap is opened once, however often the handler is set up', async () => {
  const push = fresh();
  const tapped = jest.fn();
  await push.setupNotificationResponseHandler(tapped);
  await push.setupNotificationResponseHandler(tapped);
  expect(tapped).toHaveBeenCalledTimes(1);
  expect(tapped).toHaveBeenCalledWith({ notificationId: 'n1' });
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
});

it('a launch no tap made opens nothing', async () => {
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
  const push = fresh();
  const tapped = jest.fn();
  await push.setupNotificationResponseHandler(tapped);
  expect(tapped).not.toHaveBeenCalled();
  await expect(push.launchingNotification()).resolves.toBeNull();
});

it('a read that fails is no launching tap, and throws nothing', async () => {
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockRejectedValue(new Error('no module'));
  const push = fresh();
  await expect(push.launchingNotification()).resolves.toBeNull();
});

it('the tabs reopen neither a tab nor a room over a launch a tap made', () => {
  const tabs = readCode('app/(tabs)/_layout.tsx');
  // The reopen waits for the same answer the tap is opened from, and stands aside when it is there.
  expect(tabs).toMatch(/Promise\.all\(\[Linking\.getInitialURL\(\)\.catch\(\(\) => null\), launchingNotification\(\)\]\)\.then\(\(\[url, tapped\]\) =>/);
  expect(tabs).toMatch(/const tab = tapped \? null : tabToReopenAfter\(url\);/);
  expect(tabs).toMatch(/const room = pageOfLaunch\(url\) \|\| tapped \? null : roomToReopen\(/);
});
