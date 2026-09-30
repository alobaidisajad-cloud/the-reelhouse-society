/**
 * theHouseAsksToSendWordWhenItMeansSomething.test.ts — the one notice prompt
 * iOS grants is never spent cold.
 * ─────────────────────────────────────────────────────────────────────────────
 *   BOOT NEVER ASKS: it registers what the member already allowed, and that is all.
 *   THE HOUSE ASKS AT A MOMENT that wants word (a seat requested, a critique
 *   filed), in its own voice, and only a yes spends the system's prompt.
 *   IT ASKS ONLY WHILE UNDECIDED, and "Not now" is not asked again for two
 *   weeks; a member who allowed or refused has answered.
 */
import { Alert, type AlertButton } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../pushNotifications';
import { offerWord, PRIMER_ASKED_KEY, PRIMER_BODY, PRIMER_TITLE, PRIMER_WAIT_MS } from '../pushPrimer';

const mockStore = new Map<string, string>();
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { mockStore.delete(k); },
  },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('../supabase', () => ({ supabase: { rpc: async () => ({ data: null, error: null }) } }));
jest.mock('../../utils/logger', () => ({ logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));

const permissions = (status: 'granted' | 'denied' | 'undetermined') =>
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status } as never);
const NOW = 1_800_000_000_000;
let alert: jest.SpyInstance;

beforeEach(() => {
  mockStore.clear();
  jest.mocked(Notifications.requestPermissionsAsync).mockClear().mockResolvedValue({ status: 'granted' } as never);
  jest.mocked(Notifications.getExpoPushTokenAsync).mockClear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alert.mockRestore());

describe('boot never asks', () => {
  it('an undecided member is not prompted, and nothing is registered', async () => {
    permissions('undetermined');
    await expect(registerForPushNotifications('member-1')).resolves.toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('a member who allowed notices is registered, still without a prompt', async () => {
    permissions('granted');
    await expect(registerForPushNotifications('member-1')).resolves.toBe('test-push-token');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('the house asks at a moment that wants word', () => {
  it('asks in its own voice, and only a yes spends the system prompt — then registers', async () => {
    permissions('undetermined');
    await offerWord('seat', 'member-1', NOW);
    expect(alert).toHaveBeenCalledWith(PRIMER_TITLE, PRIMER_BODY.seat, expect.any(Array));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    const [notNow, yes] = alert.mock.calls[0][2] as AlertButton[];
    expect([notNow.text, notNow.style, yes.text]).toEqual(['Not now', 'cancel', 'Send word']);
    permissions('granted');
    yes.onPress?.();
    await new Promise((res) => setTimeout(res, 0));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
  });

  it('"Not now" spends nothing, and is not asked again for two weeks — then it may be', async () => {
    permissions('undetermined');
    await offerWord('critique', 'member-1', NOW);
    (alert.mock.calls[0][2] as AlertButton[])[0].onPress?.();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await offerWord('critique', 'member-1', NOW + PRIMER_WAIT_MS - 1);
    expect(alert).toHaveBeenCalledTimes(1);
    await offerWord('seat', 'member-1', NOW + PRIMER_WAIT_MS);
    expect(alert).toHaveBeenCalledTimes(2);
    expect(mockStore.get(PRIMER_ASKED_KEY)).toBe(String(NOW + PRIMER_WAIT_MS));
  });

  it('a member who has answered the system — yes or no — is never asked', async () => {
    for (const status of ['granted', 'denied'] as const) {
      permissions(status);
      await offerWord('seat', 'member-1', NOW);
    }
    expect(alert).not.toHaveBeenCalled();
  });

  it('each moment says why word is worth having', () => {
    expect(PRIMER_BODY.seat).toMatch(/admit/);
    expect(PRIMER_BODY.critique).toMatch(/certifies or answers/);
  });
});
