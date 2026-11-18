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

/** expo's importance numbers, from the module itself (never the jest stand-in's copy). */
const IMPORTANCE = jest.requireActual('expo-notifications/build/NotificationChannelManager.types').AndroidImportance as
  Record<'NONE' | 'MIN' | 'LOW' | 'DEFAULT' | 'HIGH' | 'MAX', number>;

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
    expect(Math.max(...weights)).toBeLessThan(IMPORTANCE.MAX);
  });

  it("gives each its weight by expo's numbers: every notice shown, the quietest without sound, none folded away", () => {
    const weights = Object.fromEntries(NOTICE_CHANNELS.map((c) => [c.id, c.importance]));
    expect(weights).toEqual({
      critiques: IMPORTANCE.HIGH, members: IMPORTANCE.DEFAULT, honours: IMPORTANCE.LOW,
      'the-house': IMPORTANCE.HIGH, default: IMPORTANCE.DEFAULT,
    });
    // Below LOW a notice is folded away (MIN) or never shown (NONE): Android's own 2 and 3, read by expo.
    expect(Object.values(weights).filter((w) => w < IMPORTANCE.LOW)).toEqual([]);
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

/**
 * Review round 12: a salon's door (a request to enter, an admission) and a ballot's close came as
 * the house's own word: titled "The ReelHouse Society" or by the salon alone, in "From the house"
 * at its weight. A critique taken as the answer was pushed as "A New Critique". Each now has its own
 * kind and title, in a channel every installed build already makes. composeBanner is run here as
 * notify-push runs it (an edge function's source, which no app render reaches).
 */
describe('a salon’s door, a ballot’s close and an answer', () => {
  type Banner = (record: Record<string, unknown>) => { title: string; body: string };
  function serverBanner(): Banner {
    const src = readCode('supabase/functions/notify-push/index.ts');
    const from = src.indexOf('const TYPE_TITLES');
    const to = src.indexOf('serve(');
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const ts = jest.requireActual('typescript') as typeof import('typescript');
    const js = ts.transpileModule(`${src.slice(from, to)}\nreturn composeBanner;`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    return new Function(js)() as Banner;
  }

  it('a salon’s door rings with the members, a ballot’s close with the critiques: channels a launched build made', () => {
    expect(KIND_CHANNEL.salon).toBe('members');
    expect(KIND_CHANNEL.ballot).toBe('critiques');
    expect(serverMap()).toEqual(expect.objectContaining({ salon: 'members', ballot: 'critiques' }));
    expect(LAUNCHED).toEqual(expect.arrayContaining(['members', 'critiques']));
  });

  it('each is titled as what it is on the lock screen', () => {
    const banner = serverBanner();
    expect(banner({ type: 'salon', from_username: 'orson', message: 'is asking to enter The Back Row.', related_lounge_id: '11111111-1111-4111-8111-111111111111' }))
      .toEqual({ title: 'The Lounge', body: '@orson is asking to enter The Back Row.' });
    expect(banner({ type: 'salon', message: 'You were admitted to The Back Row.', related_lounge_id: '11111111-1111-4111-8111-111111111111' }))
      .toEqual({ title: 'The Lounge', body: 'You were admitted to The Back Row.' });
    expect(banner({ type: 'ballot', message: 'The ballot “Best of 1958” you voted in has closed.' }))
      .toEqual({ title: 'The Count Is In', body: 'The ballot “Best of 1958” you voted in has closed.' });
    expect(banner({ type: 'comment', from_username: 'agnes', message: 'took your critique as the answer.', metadata: { answer: true, comment_id: 'c1' } }).title)
      .toBe('Taken as the Answer');
    // A critique is still a critique; a house notice about a salon written before round 12 still The Lounge.
    expect(banner({ type: 'comment', from_username: 'agnes', message: 'left a critique on your take.', metadata: { comment_id: 'c1' } }).title)
      .toBe('A New Critique');
    expect(banner({ type: 'system', message: 'is asking to enter The Back Row.', related_lounge_id: '11111111-1111-4111-8111-111111111111' }).title)
      .toBe('The Lounge');
  });

  it('reads the notice’s metadata from the house, the answer’s mark with it', () => {
    const src = readCode('supabase/functions/notify-push/index.ts');
    const columns = /const NOTICE_COLUMNS = '([^']*)'/.exec(src)?.[1] ?? '';
    expect(columns.split(',').map((c) => c.trim())).toContain('metadata');
  });
});
