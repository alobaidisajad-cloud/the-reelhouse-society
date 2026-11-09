/**
 * aPushIsPresentedAsTheAppsOwn.test.ts — the sealed E2E run puts a notice on the phone as a delivered
 * push (WORKLIST P4.22, P4.26), and no other build answers the link it uses.
 *
 * The run reads the message notify-push sent to the Expo stand-in and opens
 * reelhouse://e2e/present?message=…; the E2E build presents it through expo-notifications with its
 * own title, body, data and channel, so a tap reaches the app's own tap handler. Any other build
 * reads the address as one the app does not have.
 */
import { messageOf, presentFromLink } from '../e2ePresent';
import { redirectSystemPath } from '@/app/+native-intent';

const mockSchedule = jest.fn(async () => 'n1');
jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...(a as [])) }));
let mockE2E = true;
jest.mock('@/src/utils/e2eTrace', () => ({ get E2E_BUILD() { return mockE2E; }, e2eTrace: jest.fn() }));

const MESSAGE = { to: 'ExponentPushToken[x]', title: 'A new follower', body: 'mara follows you', data: { type: 'follow', notificationId: 'n-7' }, sound: 'default', channelId: 'notif_follows' };
const link = (m: unknown) => `reelhouse://e2e/present?message=${encodeURIComponent(JSON.stringify(m))}`;

beforeEach(() => { mockE2E = true; mockSchedule.mockClear(); });

it('presents the message as notify-push built it, in its own channel, in the E2E build', async () => {
  expect(await presentFromLink(link(MESSAGE))).toBe(true);
  expect(mockSchedule).toHaveBeenCalledWith({
    content: { title: 'A new follower', body: 'mara follows you', data: { type: 'follow', notificationId: 'n-7' }, sound: 'default' },
    trigger: { channelId: 'notif_follows' },
  });
});

it('presents nothing for a link with no message, or one that is not a message', async () => {
  expect(await presentFromLink('reelhouse://e2e/present')).toBe(false);
  expect(await presentFromLink('reelhouse://e2e/present?message=%7Bnot%20json')).toBe(false);
  expect(mockSchedule).not.toHaveBeenCalled();
  expect(messageOf(link({ title: 7, data: { type: 'follow', n: 3 } }))).toEqual({ title: '', body: '', data: { type: 'follow' }, sound: null, channelId: null });
});

it('opens the Lobby behind the notice it presents, in the E2E build', () => {
  expect(redirectSystemPath({ path: link(MESSAGE), initial: false })).toBe('/');
});

it('answers the link in no other build: nothing presented, the address left as it came', async () => {
  mockE2E = false;
  expect(await presentFromLink(link(MESSAGE))).toBe(false);
  expect(redirectSystemPath({ path: link(MESSAGE), initial: false })).toBe(link(MESSAGE));
  expect(mockSchedule).not.toHaveBeenCalled();
});
