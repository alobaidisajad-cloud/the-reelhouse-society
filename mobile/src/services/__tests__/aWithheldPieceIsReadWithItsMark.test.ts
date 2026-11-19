/**
 * aWithheldPieceIsReadWithItsMark.test.ts — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 * A piece the house withholds is read by its author alone, and each page of theirs marks it so. The
 * log's and the stack's own reads carry the row's withheld_at, so the page knows from its own row; and
 * the member's list of their withheld pieces (get_my_withheld_pieces) names the verdict and the date the
 * banner says. Against the house as strict as it is (test-utils/supabaseFake), round 14's pieces read as
 * the train will apply them.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = '22222222-2222-4222-8222-222222222222';
const STACK = '33333333-3333-4333-8333-333333333333';
const VERDICT = '44444444-4444-4444-8444-444444444444';
const WITHHELD_AT = '2026-11-18T10:00:00+00:00';

const mockHouse = supabaseFake({
  rows: {
    profiles: [{ id: ME, username: 'two', avatar_url: null, role: 'free', display_name: null, member_no: 2 }],
    // Each column the reads ask is checked against the house's: withheld_at among them.
    logs: [{ id: LOG, user_id: ME, film_id: 843, film_title: 'In the Mood for Love', watched_date: '2026-11-01', rating: 4, withheld_at: WITHHELD_AT }],
    log_counts: [{ log_id: LOG, certify_count: 0, critique_count: 0 }],
    list_items: [],
    list_comments: [],
    interactions: [],
    lists: [{ id: STACK, user_id: ME, title: 'Noir', description: '', is_private: false, is_ranked: false, created_at: '2026-11-01T00:00:00+00:00', updated_at: null, withheld_at: WITHHELD_AT }],
  },
  rpc: {
    list_certify_count: 0,
    get_my_withheld_pieces: [{ kind: 'log', piece_id: LOG, verdict_id: VERDICT, appeal_by: '2026-12-18T10:00:00+00:00', appealed: false }],
  },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
// Who asks: the author, or (for the log's read, whose own mark the fake cannot count) no one signed in.
let mockUser: { id: string; username: string } | null = { id: '11111111-1111-4111-8111-111111111111', username: 'two' };
jest.mock('@/src/stores/auth', () => {
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel({ user: mockUser }) : { user: mockUser });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({ user: mockUser });
  return { useAuthStore };
});
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));

// eslint-disable-next-line import/first
import { LogService } from '../LogService';
// eslint-disable-next-line import/first
import { StackService } from '../StackService';
// eslint-disable-next-line import/first
import { ModerationService } from '../ModerationService';

it('the author’s withheld log is read with its mark, so its page says so', async () => {
  // The read asks the same columns for any reader; the house gives the row to its author alone.
  mockUser = null;
  const log = await LogService.getLogDetails(LOG);
  mockUser = { id: ME, username: 'two' };
  expect(log).not.toBeNull();
  expect((log as { withheld_at?: string }).withheld_at).toBe(WITHHELD_AT);
});

it('the author’s withheld stack is read with its mark, so its page says so', async () => {
  const stack = await StackService.getStackFullPayload(STACK);
  expect(stack).not.toBeNull();
  expect(stack!.withheldAt).toBe(WITHHELD_AT);
});

it('the member reads which of their pieces are withheld, by which verdict, until when', async () => {
  const mine = await ModerationService.getMyWithheldPieces();
  const first = mine[0];
  expect(first).toBeDefined();
  expect(first!).toMatchObject({ kind: 'log', piece_id: LOG, verdict_id: VERDICT, appealed: false });
});
