/**
 * aCritiqueWaitsOnTheHousesPace.test.ts — round 14 (src/services/LogService.ts addLogComment,
 * src/services/StackService.ts addStackComment), against the house as strict as it is
 * (test-utils/supabaseFake).
 *
 * The house now paces each member's critiques (check_critique_pace: a room of 30, one more every
 * 20 seconds, 500 a day, 20 an hour on one piece), answering RH429 with the seconds to wait. A
 * critique on a record or a stack asked to wait a moment is waited for and filed, the member seeing
 * nothing; a longer wait is handed to the page, which says how long (housePace.critiquePaceSaid).
 */
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { LogService } from '../LogService';
import { StackService } from '../StackService';

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '22222222-2222-4222-8222-222222222222';
const STACK_ID = '44444444-4444-4444-8444-444444444444';
const CRITIQUE = '55555555-5555-4555-8555-555555555555';

jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: '33333333-3333-4333-8333-333333333333', username: 'visitor' } };
  return { useAuthStore: { getState: () => state } };
});
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

/** The house's answers to each critique filed, in order: its pace, then the row. */
let mockPaces: Record<string, unknown>[] = [];
const paced = (hint: string, details = 'member') => ({ code: 'RH429', message: 'RATE_LIMITED', details, hint });
const filedAs = (row: Record<string, unknown>) => (ask: Ask) => {
  const pace = mockPaces.shift();
  if (pace) return pace as { code: string; message: string };
  return ask.op === 'select' ? [] : [{ ...row, created_at: '2026-11-19T10:00:00Z' }];
};
const mockHouse = supabaseFake({
  answer: {
    log_comments: filedAs({ id: CRITIQUE, log_id: LOG_ID, user_id: ME, username: 'visitor', body: 'A third look.' }),
    list_comments: filedAs({ id: CRITIQUE, list_id: STACK_ID, user_id: ME, content: 'One more thought.' }),
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

beforeEach(() => { mockPaces = []; jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

/** Runs a filing, the house's clock moved on as it waits. */
async function filed<T>(going: Promise<T>): Promise<T> {
  const settled = going.then((v) => ({ v }), (e: unknown) => ({ e }));
  await jest.advanceTimersByTimeAsync(10_000);
  const out = await settled;
  if ('e' in out) throw out.e;
  return out.v;
}

describe('a critique on a record', () => {
  it('asked to wait a moment, waits and is filed', async () => {
    mockPaces = [paced('2')];
    const got = await filed(LogService.addLogComment({ id: CRITIQUE, log_id: LOG_ID, user_id: ME, body: 'A third look.' }));
    expect(got).toMatchObject({ id: CRITIQUE, body: 'A third look.' });
    expect(mockPaces).toEqual([]);
  });

  it('asked to wait an hour on that record, hands the wait to the page', async () => {
    mockPaces = [paced('3600', 'target')];
    await expect(filed(LogService.addLogComment({ id: CRITIQUE, log_id: LOG_ID, user_id: ME, body: 'A third look.' })))
      .rejects.toMatchObject({ code: 'RH429', details: 'target', hint: '3600' });
  });
});

describe('a critique on a stack', () => {
  it('asked to wait a moment, waits and is filed', async () => {
    mockPaces = [paced('2')];
    const got = await filed(StackService.addStackComment({ id: CRITIQUE, list_id: STACK_ID, user_id: ME, content: 'One more thought.' }));
    expect(got).toMatchObject({ id: CRITIQUE, content: 'One more thought.' });
    expect(mockPaces).toEqual([]);
  });

  it('asked to wait the day out, hands the wait to the page', async () => {
    mockPaces = [paced('32400')];
    await expect(filed(StackService.addStackComment({ id: CRITIQUE, list_id: STACK_ID, user_id: ME, content: 'One more thought.' })))
      .rejects.toMatchObject({ code: 'RH429', hint: '32400' });
  });
});
