/**
 * Every channel reads what it missed (P4.8): per channel, the status goes SUBSCRIBED →
 * CHANNEL_ERROR → SUBSCRIBED and its data is read again. The salon's channel heard SUBSCRIBED only
 * to take a seat; the notices' channel heard nothing at all.
 */
import { supabase } from '@/src/lib/supabase';
import { useLoungeStore } from '../lounge';
import { useNotificationStore } from '../notificationStore';

let mockStatus: ((s: string) => void) | null = null;
const mockChannel: Record<string, unknown> = {};
Object.assign(mockChannel, {
  on: () => mockChannel,
  subscribe: (cb?: (s: string) => void) => { mockStatus = cb ?? null; return mockChannel; },
  track: jest.fn(),
  send: jest.fn(),
});
// The shared client's channel, made to hand its status callback over (jest.setup.ts stands in the rest).
beforeEach(() => { (supabase.channel as unknown as jest.Mock).mockImplementation(() => mockChannel); });
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));

const dropAndReturn = () => { mockStatus?.('SUBSCRIBED'); mockStatus?.('CHANNEL_ERROR'); mockStatus?.('SUBSCRIBED'); };

it('the salon’s channel back after a drop catches the room up', () => {
  const catchUp = jest.fn(async () => {});
  useLoungeStore.setState({ catchUpMessages: catchUp });
  const leave = useLoungeStore.getState().subscribeToLounge('11111111-1111-4111-8111-111111111111', { seated: false });
  dropAndReturn();
  expect(catchUp).toHaveBeenCalledTimes(1);
  leave();
});

it('the notices’ channel back after a drop reads the notices again', () => {
  const read = jest.fn(async () => {});
  useNotificationStore.setState({ fetchNotifications: read });
  const leave = useNotificationStore.getState().setupRealtime();
  dropAndReturn();
  expect(read).toHaveBeenCalledTimes(1);
  if (typeof leave === 'function') leave();
});
