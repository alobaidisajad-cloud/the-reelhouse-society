/**
 * Every notice arrives in a channel the app made, one per kind, each with its own weight (P4.26).
 *
 * The app creates its channels at start (src/lib/noticeChannels.ts); notify-push names each
 * message's channel from the same map, which it keeps as its own copy (an edge function cannot
 * import the app). This holds the two equal, every kind the database allows to a channel the app
 * makes, the weights apart, and the channels a launched build makes never fewer.
 */
import { readCode } from '@/test-utils/readCode';
import { KIND_CHANNEL, NOTICE_CHANNELS, ensureNoticeChannels } from '../noticeChannels';

/** The channels the first Android build with push (the launch build) makes: a later build adds, never removes. */
const LAUNCHED = ['critiques', 'members', 'honours', 'the-house', 'default'];

/** notify-push's KIND_CHANNEL, read from its source. */
function serverMap(): Record<string, string> {
  const src = readCode('supabase/functions/notify-push/index.ts');
  const body = /const KIND_CHANNEL: Record<string, string> = \{(?<map>[^}]*)\}/.exec(src)?.groups?.map;
  if (!body) throw new Error('notify-push has no KIND_CHANNEL map');
  return Object.fromEntries([...body.matchAll(/(?<kind>\w+):\s*'(?<channel>[^']+)'/g)].map((m) => [m.groups?.kind, m.groups?.channel]));
}

/** The kinds the database allows (notifications_type_check in the live schema). */
function kinds(): string[] {
  const src = readCode('supabase/schema/live-schema.sql');
  const check = /CONSTRAINT notifications_type_check CHECK \(\(type = ANY \(ARRAY\[(?<list>[^\]]*)\]/.exec(src)?.groups?.list;
  if (!check) throw new Error('the schema has no notifications_type_check');
  return [...check.matchAll(/'(?<kind>\w+)'::text/g)].map((m) => m.groups?.kind ?? '');
}

describe('the notice channels', () => {
  const ids = NOTICE_CHANNELS.map((c) => c.id);

  it('the server sends each kind where the app sends it', () => {
    expect(serverMap()).toEqual(KIND_CHANNEL);
  });

  it('every kind the database allows has a channel the app makes', () => {
    const all = kinds();
    expect(all.length).toBeGreaterThan(5);
    expect(all.filter((k) => !ids.includes(KIND_CHANNEL[k] ?? ''))).toEqual([]);
  });

  it('weighs them apart: a certification never rings like word from the house', () => {
    const weight = (id: string) => NOTICE_CHANNELS.find((c) => c.id === id)?.importance ?? Number.NaN;
    const weights = NOTICE_CHANNELS.map((c) => c.importance);
    expect(new Set(weights).size).toBeGreaterThan(1);
    expect(weight('honours')).toBeLessThan(weight('the-house'));
    expect(Math.max(...weights)).toBeLessThan(5);
  });

  it('keeps every channel a launched build made, and names each once', () => {
    expect(LAUNCHED.filter((id) => !ids.includes(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('makes all of them on Android, nothing elsewhere, and a refusal never throws', async () => {
    const RN = require('react-native');
    const Notifications = require('expo-notifications');
    const made = jest.spyOn(Notifications, 'setNotificationChannelAsync').mockResolvedValue(null);
    const was = RN.Platform.OS;
    try {
      RN.Platform.OS = 'ios';
      await ensureNoticeChannels();
      expect(made).not.toHaveBeenCalled();
      RN.Platform.OS = 'android';
      await ensureNoticeChannels();
      expect(made).toHaveBeenCalledTimes(ids.length);
      for (const id of ids) expect(made).toHaveBeenCalledWith(id, expect.objectContaining({ importance: expect.any(Number) }));
      made.mockRejectedValueOnce(new Error('no'));
      await expect(ensureNoticeChannels()).resolves.toBeUndefined();
    } finally {
      RN.Platform.OS = was;
      made.mockRestore();
    }
  });
});
