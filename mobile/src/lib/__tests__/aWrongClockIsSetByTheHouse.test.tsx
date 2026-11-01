/**
 * A phone's wrong clock is set by the house (P4.32).
 *
 * Every answer the house gives carries its time. A phone whose clock is hours off hears it and
 * weighs every house time by the house's clock: "… AGO" is the post's true age, a suspension
 * ends when the house ends it, and of two copies of a draft written on two phones, each an hour
 * off the other way, the one written last is the newer. A phone within the header's second keeps
 * its own clock.
 */
import { act, renderHook } from '@testing-library/react-native';
import {
  HOUSE_CLOCK_SLACK_MS, HOUSE_CLOCK_SLOWEST_MS, __forgetTheHouse, heardTheHouse, houseIso, houseNow, houseOffset, onHouseClockMoved,
} from '../houseClock';
import { fetchWithinLimit } from '../supabase';
import { useTimeAgo } from '@/src/hooks/useClock';
import { standingOf } from '@/src/utils/standing';
import { timeAgo } from '@/src/utils/timeAgo';
import { readDraft, writeDraft } from '@/src/utils/memberDrafts';
import { whichCopy } from '@/src/utils/draftSync';

const mockStore: Record<string, string> = {};
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    set: (k: string, v: string) => { mockStore[k] = v; },
    getString: (k: string) => mockStore[k],
    delete: (k: string) => { delete mockStore[k]; },
    getAllKeys: () => Object.keys(mockStore),
  },
  isStorageEncrypted: () => true,
  withinKeystoreDeadline: <T,>(ask: Promise<T>) => ask,
}));

/** The house's clock, as each test has it. */
const HOUSE = Date.UTC(2026, 10, 1, 10, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** A `Date` header as the house writes one: to the second. */
const header = (at: number) => new Date(at).toUTCString();

/** A phone `skew` off the house, at house time `at`, that hears the house in a 200 ms trip. */
function phoneHears(skew: number, at = HOUSE) {
  jest.spyOn(Date, 'now').mockReturnValue(at + skew);
  heardTheHouse(header(at), at + skew - 100, at + skew + 100);
}

beforeEach(() => {
  __forgetTheHouse();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
});
afterEach(() => jest.restoreAllMocks());

describe('the house clock', () => {
  it("sets a phone three hours ahead to the house's time, within a second", () => {
    phoneHears(3 * HOUR);
    expect(Math.abs(houseNow() - HOUSE)).toBeLessThanOrEqual(1000);
  });

  it('sets a phone a day behind', () => {
    phoneHears(-24 * HOUR);
    expect(Math.abs(houseNow() - HOUSE)).toBeLessThanOrEqual(1000);
  });

  it('leaves a phone within the slack on its own clock', () => {
    phoneHears(HOUSE_CLOCK_SLACK_MS - 600);
    expect(houseOffset()).toBe(0);
  });

  it('is not moved by an answer too slow to place, an unreadable header, or no header', () => {
    jest.spyOn(Date, 'now').mockReturnValue(HOUSE + 3 * HOUR);
    heardTheHouse(header(HOUSE), HOUSE + 3 * HOUR - HOUSE_CLOCK_SLOWEST_MS - 1, HOUSE + 3 * HOUR);
    heardTheHouse('not a date', HOUSE + 3 * HOUR - 100, HOUSE + 3 * HOUR);
    heardTheHouse(null, HOUSE + 3 * HOUR - 100, HOUSE + 3 * HOUR);
    heardTheHouse(header(HOUSE), HOUSE + 3 * HOUR, HOUSE + 3 * HOUR - 100);
    expect(houseOffset()).toBe(0);
  });

  it('holds still for the header\'s second, and moves when the phone is set right; each move is told', () => {
    const told = jest.fn();
    const stop = onHouseClockMoved(told);
    phoneHears(3 * HOUR);
    const first = houseOffset();
    phoneHears(3 * HOUR + 900, HOUSE + MINUTE);
    expect(houseOffset()).toBe(first);
    phoneHears(0, HOUSE + 2 * MINUTE);
    expect(houseOffset()).toBe(0);
    expect(told).toHaveBeenCalledTimes(2);
    stop();
  });

  it("is heard from every answer the app's requests take in", async () => {
    jest.spyOn(Date, 'now').mockReturnValue(HOUSE + 3 * HOUR);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200, headers: { date: header(HOUSE) } }));
    await fetchWithinLimit('https://house.example/rest/v1/films');
    expect(Math.abs(houseNow() - HOUSE)).toBeLessThanOrEqual(1000);
  });
});

describe('a phone three hours ahead, once it has heard the house', () => {
  it('reads a post filed a minute ago as a minute old', () => {
    phoneHears(3 * HOUR);
    expect(timeAgo(new Date(HOUSE - MINUTE).toISOString())).toBe('1 MIN. AGO');
  });

  it('redraws "… AGO" the moment the house is heard', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(HOUSE + 3 * HOUR);
    const at = new Date(HOUSE - MINUTE).toISOString();
    const { result } = await renderHook(() => useTimeAgo(at));
    expect(result.current).toBe('3 HRS. AGO');
    await act(async () => { heardTheHouse(header(HOUSE), HOUSE + 3 * HOUR - 100, HOUSE + 3 * HOUR + 100); });
    expect(result.current).toBe('1 MIN. AGO');
  });

  it('keeps a suspension that ends in an hour by the house', () => {
    phoneHears(3 * HOUR);
    const until = new Date(HOUSE + HOUR).toISOString();
    expect(standingOf({ suspended_until: until })).toEqual({ kind: 'suspended', until });
  });
});

describe('a phone three hours behind, once it has heard the house', () => {
  it('ends a suspension the house ended an hour ago', () => {
    phoneHears(-3 * HOUR);
    expect(standingOf({ suspended_until: new Date(HOUSE - HOUR).toISOString() })).toBeNull();
  });

  it('dates what it writes by the house', () => {
    phoneHears(-3 * HOUR);
    expect(Math.abs(Date.parse(houseIso()) - HOUSE)).toBeLessThanOrEqual(1000);
  });
});

describe('two phones, an hour off the house each way', () => {
  it('finds the copy written last the newer, wherever it was written', () => {
    // Phone A, an hour ahead, writes at ten by the house.
    phoneHears(HOUR, HOUSE);
    writeDraft('me', 'dossier', { body: 'first' });
    const a = readDraft<{ body: string }>('me', 'dossier')?.savedAt;
    // Phone B, an hour behind, writes half an hour later by the house.
    __forgetTheHouse();
    phoneHears(-HOUR, HOUSE + 30 * MINUTE);
    writeDraft('me', 'dossier', { body: 'second' });
    const b = readDraft<{ body: string }>('me', 'dossier')?.savedAt;
    // On phone A, B's copy is the newer one and is put to the member, not overwritten.
    expect(whichCopy(a, b)).toBe('ask');
    expect(whichCopy(b, a)).toBe('local');
  });
});
