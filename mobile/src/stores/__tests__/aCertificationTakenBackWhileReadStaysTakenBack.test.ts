/**
 * aCertificationTakenBackWhileReadStaysTakenBack.test.ts — the member's certifications read while
 * they act are never drawn over the act.
 * ─────────────────────────────────────────────────────────────────────────────
 * The read of what a member has certified (records, and stacks) merges into what the phone holds.
 * Asked before the member took a certification back, and answered after, it laid the old mark over
 * the act: the heart drawn full again on a record the member had just let go. Each read here is held
 * open, the member acts, and the read is let go: the act stands.
 */
import { heldClient } from '@/test-utils/heldClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLogStore } from '../films';

const LOG = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';
const STACK = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';

const ME = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
/** The member's certifications as the house holds them: of the record, and of the stack. */
const held = () => heldClient(supabaseFake({ rows: { interactions: [
  { id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', user_id: ME, type: 'endorse_log', target_log_id: LOG, created_at: '2026-11-01T00:00:00Z' },
  { id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', user_id: ME, type: 'endorse_list', target_list_id: STACK, created_at: '2026-11-01T00:00:00Z' },
] } }).client);
let mockHeld = held();
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHeld.client; } }));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', username: 'kane' } }), subscribe: () => () => undefined },
}));
/** Each write of a certification, held until the test lets it go: out online while the read lands. */
const mockWrites: (() => void)[] = [];
jest.mock('../../services/InteractionService', () => {
  const held = () => new Promise<void>((resolve) => { mockWrites.push(resolve); });
  return { InteractionService: { addEndorsement: held, removeEndorsement: held } };
});
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));

const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const mark = (targetId: string, type: 'endorse' | 'endorse_list') => ({ type, targetId, timestamp: '2026-11-01T00:00:00Z' });

beforeEach(() => {
  mockHeld = held();
  mockWrites.length = 0;
  useLogStore.setState({
    interactions: [mark(LOG, 'endorse'), mark(STACK, 'endorse_list')],
    _endorsedIndex: { [LOG]: mark(LOG, 'endorse') }, _listEndorsedIndex: { [STACK]: mark(STACK, 'endorse_list') },
  } as never);
});

it('a record\'s certification taken back while they are read stays taken back', async () => {
  const read = useLogStore.getState().fetchEndorsements();
  void useLogStore.getState().toggleEndorse(LOG);
  await settle();
  expect(useLogStore.getState()._endorsedIndex[LOG]).toBeUndefined();
  await mockHeld.release('interactions');
  await read;
  expect(useLogStore.getState()._endorsedIndex[LOG]).toBeUndefined();
  for (const w of mockWrites) w();
  await settle();
  expect(useLogStore.getState()._endorsedIndex[LOG]).toBeUndefined();
});

it('a stack\'s certification taken back while they are read stays taken back', async () => {
  const read = useLogStore.getState().fetchListEndorsements();
  void useLogStore.getState().toggleListEndorse(STACK);
  await settle();
  expect(useLogStore.getState()._listEndorsedIndex[STACK]).toBeUndefined();
  await mockHeld.release('interactions');
  await read;
  expect(useLogStore.getState()._listEndorsedIndex[STACK]).toBeUndefined();
  for (const w of mockWrites) w();
  await settle();
  expect(useLogStore.getState()._listEndorsedIndex[STACK]).toBeUndefined();
});

it('a mark the member did not touch is laid as read', async () => {
  useLogStore.setState({ interactions: [], _endorsedIndex: {} } as never);
  const read = useLogStore.getState().fetchEndorsements();
  await mockHeld.release('interactions');
  await read;
  expect(useLogStore.getState()._endorsedIndex[LOG]).toBeTruthy();
});
