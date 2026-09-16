/**
 * theHouseSaysWhy.test.ts — the server wrote the sentence; the member reads it.
 * ─────────────────────────────────────────────────────────────────────────────
 * A member whose rank has ended taps send in a salon they have spoken in for
 * months. The database refuses, in a sentence composed for a person:
 *
 *     The Lounge is an Archivist feature
 *
 * The app showed "Failed to send message." over a "tap to retry" that could
 * never succeed. `tierRefusal.ts` — which knows how to read that sentence — was
 * imported by nothing. `gates:check` verified its table against production
 * character for character, which is exactly what made it look connected.
 *
 * Driven through the REAL store, with the REAL tierRefusal and tierDoor. Only
 * the network, the toast, the telemetry sink and the traveller are stand-ins,
 * because those are what is being observed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { useLoungeStore } from '../lounge';
import { showTierDoor } from '../../utils/tierDoor';

const L1 = '11111111-1111-4111-8111-111111111111';
const U1 = '33333333-3333-4333-8333-333333333333';
const M1 = '55555555-5555-4555-8555-555555555555';

const REFUSED = { code: '42501', message: 'The Lounge is an Archivist feature' };

const mockFrom = jest.fn();
let mockUser: Record<string, unknown> | null = null;

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), channel: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn().mockReturnValue([]),
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
const mockRecord = jest.fn();
jest.mock('../../utils/gateTelemetry', () => ({ recordGateEvent: (...a: unknown[]) => mockRecord(...a) }));
const mockOpenSociety = jest.fn();
jest.mock('../../utils/openSociety', () => ({
  openSociety: (...a: unknown[]) => mockOpenSociety(...a),
  societyHref: jest.requireActual('../../utils/openSociety').societyHref,
}));
jest.mock('../../utils/TactileEngine', () => ({ __esModule: true, default: { selection: jest.fn() } }));
jest.mock('../../utils/mappers', () => ({
  mapMessageRow: (row: Record<string, unknown>) => row,
  LoungeMessageRow: {},
}));

const toast = jest.requireMock('../../utils/reelToast').default as { error: jest.Mock };

let result: { data: unknown; error: unknown } = { data: null, error: null };
const chain = (): Record<string, unknown> => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const k of ['insert', 'update', 'upsert', 'delete', 'select', 'eq', 'order', 'limit']) c[k] = self;
  c.single = async () => result;
  c.maybeSingle = async () => result;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
};

const stranger = { id: U1, username: 'wren', role: 'cinephile', tier: 'free' };
const lapsed = { ...stranger, entitlement_source: 'revenuecat' };

const failedMessage = () => ({
  id: M1, lounge_id: L1, user_id: U1, username: 'wren', content: 'Did anyone else hear the score drop out?',
  type: 'text', created_at: '2026-09-16T10:00:00Z', status: 'failed', reactions: [],
});

const toastTexts = () => toast.error.mock.calls.map((c) => String(c[0]));
const refusedEvents = () => mockRecord.mock.calls.filter((c) => c[0] === 'gate_refused');

let tick = 0;
beforeEach(() => {
  jest.useFakeTimers();
  // The send throttle remembers the last send per room at module level, so time
  // must only ever move FORWARD between tests. A random clock went backwards,
  // every later send was throttled into silence, and five assertions failed for
  // a reason that had nothing to do with refusals.
  tick += 1;
  jest.setSystemTime(new Date('2026-09-16T10:00:00Z').getTime() + tick * 60_000);
  result = { data: null, error: null };
  mockUser = stranger;
  mockFrom.mockReset().mockImplementation(() => chain());
  toast.error.mockReset();
  mockRecord.mockReset();
  mockOpenSociety.mockReset();
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: L1, sending: false, members: {}, typingUsers: {},
  } as never);
});
afterEach(() => jest.useRealTimers());

describe('the house says why', () => {
  describe('sending into a salon without the rank', () => {
    it('reads the SERVER’S sentence to the member — not "Failed to send message."', async () => {
      result = { data: null, error: REFUSED };
      const ok = await useLoungeStore.getState().sendMessage(L1, 'Did anyone else hear the score drop out?');

      expect(ok).toBe(false);
      expect(toastTexts()).toEqual(['The Lounge is an Archivist feature']);
      // The generic line is the defect. It must not appear at all, not even
      // second — toasts queue, so a second one reads as the last word.
      expect(toastTexts()).not.toContain('Failed to send message.');
    });

    it('and offers the way forward on the same line', async () => {
      result = { data: null, error: REFUSED };
      await useLoungeStore.getState().sendMessage(L1, 'Hello.');
      const action = toast.error.mock.calls[0]?.[1] as { label: string; onPress: () => void } | undefined;
      expect(action?.label).toBe('✦ ASCEND THE RANKS');

      action?.onPress();
      expect(mockOpenSociety).toHaveBeenCalledWith(
        `/membership?reason=the-lounge&rank=archivist&returnTo=%2Flounge%2F${L1}`,
      );
      // A tap on the door is a tap on a rope, and counts as one.
      expect(mockRecord).toHaveBeenCalledWith('gate_tapped',
        { featureId: 'the-lounge', rank: 'archivist', standing: 'stranger' });
    });

    it('a member whose dues LAPSED is not pitched as a stranger', async () => {
      // The whole point of reading the sentence. Someone who has spoken in this
      // room for months should hear that their standing lapsed.
      mockUser = lapsed;
      result = { data: null, error: REFUSED };
      await useLoungeStore.getState().sendMessage(L1, 'Hello.');
      const action = toast.error.mock.calls[0]?.[1] as { label: string } | undefined;
      expect(action?.label).toBe('✦ RESUME YOUR STANDING');
      expect(refusedEvents()[0]?.[1]).toEqual({ featureId: 'the-lounge', rank: 'archivist', standing: 'lapsed' });
    });

    it('KEEPS their sentence, with its retry — so it sends once they renew', async () => {
      // Removing the failed message would make them type it again as the price
      // of paying. The retry is what carries their words across the trip.
      result = { data: null, error: REFUSED };
      await useLoungeStore.getState().sendMessage(L1, 'Did anyone else hear the score drop out?');
      const kept = useLoungeStore.getState().currentMessages;
      expect(kept).toHaveLength(1);
      expect(kept[0]).toMatchObject({ content: 'Did anyone else hear the score drop out?', status: 'failed' });
    });

    it('counts the refusal — a server refusal means a rope was missing', async () => {
      result = { data: null, error: REFUSED };
      await useLoungeStore.getState().sendMessage(L1, 'Hello.');
      expect(refusedEvents()).toEqual([
        ['gate_refused', { featureId: 'the-lounge', rank: 'archivist', standing: 'stranger' }],
      ]);
    });
  });

  describe('a refusal that is NOT about rank keeps its own words', () => {
    it('a privacy refusal shares the code but no rank would fix it — no door, no pitch', async () => {
      // 42501 is also how a row-level rule says no. Offering "✦ ASCEND THE
      // RANKS" there would be selling something that cannot help.
      result = { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "lounge_messages"' } };
      await useLoungeStore.getState().sendMessage(L1, 'Hello.');
      expect(toastTexts()).toEqual(['Failed to send message.']);
      expect(toast.error.mock.calls[0]?.[1]).toBeUndefined();
      expect(refusedEvents()).toHaveLength(0);
    });

    it('the right sentence under the WRONG code is somebody’s free text, not the house', async () => {
      result = { data: null, error: { code: '23514', message: 'The Lounge is an Archivist feature' } };
      await useLoungeStore.getState().sendMessage(L1, 'Hello.');
      expect(toastTexts()).toEqual(['Failed to send message.']);
      expect(refusedEvents()).toHaveLength(0);
    });
  });

  describe('the retry', () => {
    it('does not answer a refusal with "Still could not send. Try again."', async () => {
      useLoungeStore.setState({ currentMessages: [failedMessage()] } as never);
      result = { data: null, error: REFUSED };
      await useLoungeStore.getState().retryMessage(M1);
      expect(toastTexts()).toEqual(['The Lounge is an Archivist feature']);
      expect(useLoungeStore.getState().currentMessages[0]).toMatchObject({ status: 'failed' });
    });

    it('but a genuine failure still says to try again, because trying again can work', async () => {
      useLoungeStore.setState({ currentMessages: [failedMessage()] } as never);
      // A check violation: not a network blip (those re-queue quietly — a
      // statement timeout was the first fixture here and never reached this
      // branch) and not a refusal. The plain failure branch, reached for real.
      result = { data: null, error: { code: '23514', message: 'new row violates check constraint' } };
      await useLoungeStore.getState().retryMessage(M1);
      expect(toastTexts()).toEqual(['Still could not send. Try again.']);
    });
  });

  describe('the door can keep a promise alongside the refusal', () => {
    it('the house’s sentence first, then what the caller can vouch for', () => {
      const handled = showTierDoor(
        { code: '42501', message: 'The Dispatch is an Auteur feature' },
        { returnTo: '/dispatch/compose?kind=dossier', also: 'Your words are kept.' },
      );
      expect(handled).toBe(true);
      expect(toastTexts()).toEqual(['The Dispatch is an Auteur feature. Your words are kept.']);
      const action = toast.error.mock.calls[0]?.[1] as { onPress: () => void };
      action.onPress();
      expect(mockOpenSociety).toHaveBeenCalledWith(
        '/membership?reason=essays&rank=auteur&returnTo=%2Fdispatch%2Fcompose%3Fkind%3Ddossier',
      );
    });

    it('and says nothing extra when there is nothing to vouch for', () => {
      showTierDoor({ code: '42501', message: 'The Vault is an Archivist feature' });
      expect(toastTexts()).toEqual(['The Vault is an Archivist feature']);
    });
  });

  describe('no caller talks over the house', () => {
    it('the share sheet does not add "Try again" under a refusal', () => {
      /**
       * Toasts QUEUE. social-modal toasted "Failed to share. Try again." on every
       * false from sendMessage — which already speaks for every failure a
       * member can reach — so a refusal was followed by an instruction to do
       * the one thing that cannot help. The line may survive only in the catch,
       * for a genuine crash that sendMessage never got to describe.
       */
      const src = readFileSync(join(__dirname, '..', '..', '..', 'app', '(modals)', 'social-modal.tsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
      const share = src.slice(src.indexOf('const handleShareToLounge'), src.indexOf('}, [user?.id, mode,'));
      // Tripwire: the slice must be the real handler, or both checks pass on ''.
      expect(share).toMatch(/await sendMessage\(/);
      const lines = [...share.matchAll(/reelToast\.error\('Failed to share\. Try again\.'\)/g)];
      expect(lines).toHaveLength(1);
      expect(share.slice(share.indexOf('} catch (err)'))).toMatch(/Failed to share\. Try again\./);
    });

    it('and every other caller of sendMessage already stays quiet on false', () => {
      const root = join(__dirname, '..', '..', '..');
      const strip = (p: string) => readFileSync(join(root, p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
      const room = strip('app/lounge/[id].tsx');
      const sheet = strip('src/components/ShareToLoungeModal.tsx');
      expect(room).toMatch(/sendMessage\(id, input\.trim\(\)/);
      expect(sheet).toMatch(/sendMessage\(/);
      for (const s of [room, sheet]) expect(s).not.toMatch(/if \(!(ok|success|sent)\)[\s\S]{0,40}reelToast\.error/);
    });
  });

  describe('reacting', () => {
    it('a refused mark used to vanish in silence — now the house answers', async () => {
      useLoungeStore.setState({ currentMessages: [{ ...failedMessage(), status: 'sent' }] } as never);
      result = { data: null, error: REFUSED };
      await useLoungeStore.getState().toggleReaction(M1, 'bravo' as never);
      expect(toastTexts()).toEqual(['The Lounge is an Archivist feature']);
      // And the optimistic mark is still taken back.
      expect(useLoungeStore.getState().currentMessages[0].reactions ?? []).toHaveLength(0);
    });

    it('any other failure keeps its quiet revert', async () => {
      useLoungeStore.setState({ currentMessages: [{ ...failedMessage(), status: 'sent' }] } as never);
      result = { data: null, error: { code: '57014', message: 'timeout' } };
      await useLoungeStore.getState().toggleReaction(M1, 'bravo' as never);
      expect(toastTexts()).toEqual([]);
    });
  });
});
