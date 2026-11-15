/**
 * aReportsBlockIsCarriedOutWhateverItsAnswer.test.ts — "report and block" blocks, whatever the report.
 *
 * Only a report filed, or kept offline before it was tried, blocked. A thing reported before
 * (said by the phone, or by the house's 23505), and a report kept after the send failed on the
 * network, closed the sheet with the author still seen. A block asked as one member is never
 * carried out as the next.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useReportStore } from '../reportStore';

const ME = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const LOG = '33333333-3333-4333-8333-333333333333';

const mockBlockUser = jest.fn();
let mockSignedIn: string | null = ME;
let mockOnline = true;
let mockNetworkError = false;

/** What the house answers submit_report, asked each time it is called. */
const mockAnswer = jest.fn((): unknown => null);
const mockHouse = supabaseFake({ rpc: { submit_report: () => mockAnswer() } });
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@react-native-community/netinfo', () => ({
  configure: jest.fn(),
  fetch: jest.fn(() => Promise.resolve({ isConnected: mockOnline, isInternetReachable: mockOnline })),
}));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true) }));
jest.mock('../../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../utils/networkError', () => ({ isNetworkError: jest.fn(() => mockNetworkError) }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ blockUser: mockBlockUser }) } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockSignedIn ? { id: mockSignedIn } : null }) } }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

const rpc = mockAnswer;
const report = (block = true) => useReportStore.getState().submitReport({
  reporter_id: ME, content_id: LOG, content_type: 'log', reason: 'harassment', block_target: block, target_user_id: AUTHOR,
});

beforeEach(() => {
  mockBlockUser.mockReset().mockResolvedValue(undefined);
  mockSignedIn = ME;
  mockOnline = true;
  mockNetworkError = false;
  rpc.mockReset().mockReturnValue(null);
  useReportStore.setState({ isSubmitting: false, recentReports: new Set<string>() });
});

describe('report and block', () => {
  it('filed: blocks', async () => {
    await expect(report()).resolves.toEqual({ status: 'submitted' });
    expect(mockBlockUser).toHaveBeenCalledWith(AUTHOR);
  });

  it('kept offline before it was tried: blocks', async () => {
    mockOnline = false;
    await expect(report()).resolves.toEqual({ status: 'queued' });
    expect(mockBlockUser).toHaveBeenCalledWith(AUTHOR);
  });

  it('kept after the send failed on the network: blocks', async () => {
    mockNetworkError = true;
    rpc.mockReturnValue({ error: { code: '', message: 'Network request failed' } });
    await expect(report()).resolves.toEqual({ status: 'queued' });
    expect(mockBlockUser).toHaveBeenCalledWith(AUTHOR);
  });

  it('already filed, the house says (23505): blocks', async () => {
    rpc.mockReturnValue({ error: { code: '23505', message: 'duplicate key' } });
    await expect(report()).resolves.toMatchObject({ status: 'duplicate' });
    expect(mockBlockUser).toHaveBeenCalledWith(AUTHOR);
  });

  it('already filed, the phone remembers: blocks, and asks the house nothing', async () => {
    useReportStore.setState({ recentReports: new Set([LOG]) });
    await expect(report()).resolves.toMatchObject({ status: 'duplicate' });
    expect(rpc).not.toHaveBeenCalled();
    expect(mockBlockUser).toHaveBeenCalledWith(AUTHOR);
  });

  it('a report without block blocks no one, whatever its answer', async () => {
    useReportStore.setState({ recentReports: new Set([LOG]) });
    await report(false);
    expect(mockBlockUser).not.toHaveBeenCalled();
  });

  it('never as the next member: signed out while it was asked, nothing is blocked', async () => {
    rpc.mockImplementation(() => { mockSignedIn = null; return { error: { code: '23505', message: 'duplicate key' } }; });
    await report();
    expect(mockBlockUser).not.toHaveBeenCalled();
  });
});
