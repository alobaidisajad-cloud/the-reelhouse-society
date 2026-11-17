/**
 * aBulkDismissalCountsWhatTheHouseClosed.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * A bulk dismissal toasted the number of cases selected, though the house closes only the cases
 * still pending: one another moderator judged meanwhile was counted as dismissed by this one. The
 * toast now says what the house closed, and tells the cases judged by another apart; every case
 * selected leaves the docket, since none of them is pending any more.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TribunalScreen from '../tribunal';
import reelToast from '@/src/utils/reelToast';

const mockBulkDismiss = jest.fn();
const mockGetPendingReports = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    resolveReportV2: jest.fn().mockResolvedValue(undefined),
    bulkDismiss: (...args: unknown[]) => mockBulkDismiss(...args),
    getPriorityQueue: jest.fn().mockResolvedValue([]),
    getPendingReports: (...args: unknown[]) => mockGetPendingReports(...args),
    getModerationHistoryForUsers: jest.fn().mockResolvedValue({}),
    getReportEvidence: jest.fn().mockResolvedValue({ found: false }),
    getPendingCount: jest.fn().mockResolvedValue(0),
  },
}));

// The admin gave the second key this session: the Tribunal is drawn behind its door.
const mockHouse = supabaseFake({
  mfa: { level: 'aal2', code: '246810', factors: [{ id: '00000000-0000-4000-8000-000000000001', factor_type: 'totp', status: 'verified', friendly_name: 'Tribunal key' }] },
});
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const mockAuthStore = { user: { id: 'admin-uuid-001', role: 'admin', username: 'tribunal_admin' } };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => (sel ? sel(mockAuthStore) : mockAuthStore),
}));
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    GestureDetector: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    Gesture: { Pan: () => ({ onChange: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() }) },
  };
});
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: {
    selection: jest.fn(), navigate: jest.fn(), mutate: jest.fn(), destroy: jest.fn(), success: jest.fn(),
    error: jest.fn(), warn: jest.fn(), rigid: jest.fn(), soft: jest.fn(),
  },
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const cache = new Map<string, unknown>();
  return new Proxy({}, {
    get: (_t, name: string) => {
      if (name === '__esModule') return true;
      if (!cache.has(name)) cache.set(name, (props: Record<string, unknown>) => React.createElement(View, { ...props, testID: `icon-${name}` }));
      return cache.get(name);
    },
  });
});

const CASE = {
  id: 'report-001',
  content_type: 'log',
  content_id: 'content-abc',
  reason: 'Hate speech in film review',
  details: null,
  status: 'pending',
  created_at: '2024-06-15T12:00:00Z',
  reporter: { id: 'reporter-1', username: 'watchful_member' },
  target_user_id: 'target-user-1',
  target_user: { id: 'target-user-1', username: 'offender_one', warning_count: 0 },
  report_count: 1,
};
const OTHER_CASE = { ...CASE, id: 'report-002', reason: 'Spam dispatch flooding', content_id: 'content-def' };

type Button = { text: string; style?: string; onPress?: () => void };
const lastAlertButtons = (spy: jest.SpyInstance): Button[] => {
  const call = spy.mock.calls[spy.mock.calls.length - 1] as unknown[] | undefined;
  expect(call).toBeDefined();
  return call![2] as Button[];
};

function renderTribunal() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <TribunalScreen />
    </QueryClientProvider>,
  );
}

/** Selects both cases and dismisses them together, as the moderator does. */
async function dismissBoth(r: ReturnType<typeof renderTribunal>, alertSpy: jest.SpyInstance) {
  await waitFor(() => expect(r.getByLabelText('Enter multi-select mode')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Enter multi-select mode')); });
  await waitFor(() => expect(r.getAllByRole('checkbox')).toHaveLength(2));
  for (const box of r.getAllByRole('checkbox')) {
    await act(async () => { await fireEvent.press(box); });
  }
  await act(async () => { await fireEvent.press(r.getByLabelText('Bulk dismiss 2 reports')); });
  const dismiss = lastAlertButtons(alertSpy).find((b) => b.style === 'destructive');
  expect(dismiss).toBeDefined();
  await act(async () => { dismiss!.onPress!(); });
  await waitFor(() => expect(mockBulkDismiss).toHaveBeenCalledTimes(1));
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  alertSpy = jest.spyOn(Alert, 'alert');
  mockGetPendingReports.mockResolvedValue({ rows: [CASE, OTHER_CASE], total: 2 });
});

afterEach(() => {
  alertSpy.mockRestore();
  jest.useRealTimers();
});

describe('a bulk dismissal says what the house closed', () => {
  it('counts both cases when the house closed both', async () => {
    mockBulkDismiss.mockResolvedValue(2);
    const r = renderTribunal();
    await dismissBoth(r, alertSpy);

    await waitFor(() => expect(reelToast).toHaveBeenCalledWith('2 report(s) dismissed.'));
    await waitFor(() => expect(r.queryByText('HATE SPEECH IN FILM REVIEW')).toBeNull());
    expect(r.queryByText('SPAM DISPATCH FLOODING')).toBeNull();
  });

  it('counts one, and says the other was judged by another moderator, when the house closed only one; both leave the docket', async () => {
    mockBulkDismiss.mockResolvedValue(1);
    const r = renderTribunal();
    await dismissBoth(r, alertSpy);

    await waitFor(() => expect(reelToast).toHaveBeenCalledWith('1 report(s) dismissed. 1 already judged by another moderator.'));
    expect(reelToast).not.toHaveBeenCalledWith('2 report(s) dismissed.');
    await waitFor(() => expect(r.queryByText('HATE SPEECH IN FILM REVIEW')).toBeNull());
    expect(r.queryByText('SPAM DISPATCH FLOODING')).toBeNull();
  });

  it('says both were judged by another moderator when the house closed none; both leave the docket', async () => {
    mockBulkDismiss.mockResolvedValue(0);
    const r = renderTribunal();
    await dismissBoth(r, alertSpy);

    await waitFor(() => expect(reelToast).toHaveBeenCalledWith('Already judged by another moderator.'));
    expect(reelToast).not.toHaveBeenCalledWith('2 report(s) dismissed.');
    await waitFor(() => expect(r.queryByText('HATE SPEECH IN FILM REVIEW')).toBeNull());
    expect(r.queryByText('SPAM DISPATCH FLOODING')).toBeNull();
  });

  it('states no number when the answer holds no count', async () => {
    mockBulkDismiss.mockResolvedValue(null);
    const r = renderTribunal();
    await dismissBoth(r, alertSpy);

    await waitFor(() => expect(reelToast).toHaveBeenCalledWith('Cases dismissed.'));
    expect(reelToast).not.toHaveBeenCalledWith('2 report(s) dismissed.');
  });
});
