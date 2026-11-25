/**
 * theDocketsReadAgainKeepTheirLaterPages.test.tsx — a verdict keeps the cases read past page one
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DOCKET and URGENT are read page by page, and both are read again after every verdict. Read
 * again by their first page alone, each would drop every case the moderator had read past it, and
 * the moderator would be thrown back to the top after each judgment. Read again, each comes back as
 * far as it was read, as the house now holds it: the judged case gone, every other one in its place.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TribunalScreen from '../tribunal';

const mockResolveReportV2 = jest.fn();
const mockGetPendingReports = jest.fn();
const mockGetPriorityQueue = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  // THE DOCKET's page, as PENDING_PAGE below.
  REPORTS_PAGE_SIZE: 10,
  ModerationService: {
    resolveReportV2: (...args: unknown[]) => mockResolveReportV2(...args),
    bulkDismiss: jest.fn().mockResolvedValue(0),
    getPriorityQueue: (...args: unknown[]) => mockGetPriorityQueue(...args),
    getPendingReports: (...args: unknown[]) => mockGetPendingReports(...args),
    getModerationHistoryForUsers: jest.fn().mockResolvedValue({}),
    getReportEvidence: jest.fn().mockResolvedValue({ found: true, title: 'A record', body: 'The words', route: '/log/x' }),
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
  useAuthStore: Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel(mockAuthStore) : mockAuthStore), { getState: () => mockAuthStore }),
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

/** THE DOCKET's page here: small, so a docket of two pages is a few cases to draw, not dozens. */
const PENDING_PAGE = 10;
/** URGENT's page, as the Tribunal reads it. */
const PRIORITY_PAGE = 20;
/** `count` cases, the first the newest, each a minute older than the one before. */
const cases = (word: string, count: number) => Array.from({ length: count }, (_, i) => i + 1).map((i) => ({
  id: `${word}-${i}`,
  content_type: 'log',
  content_id: `content-${i}`,
  reason: `${word} ${i}`,
  details: null,
  status: 'pending',
  created_at: new Date(Date.UTC(2026, 10, 10, 12) - i * 60_000).toISOString(),
  reporter: { id: 'reporter-1', username: 'watchful_member' },
  target_user_id: `member-${i}`,
  target_user: { id: `member-${i}`, username: `accused_${i}`, warning_count: 0 },
  report_count: 2,
}));
type Case = ReturnType<typeof cases>[number];

/** The pending docket as the house reads it: a page at a time, from the boundary case on (not past it). */
const pendingHouse = (rows: () => Case[]) => async (cursor?: string) => {
  const from = cursor ? rows().filter((r) => r.created_at <= cursor) : rows();
  return { rows: from.slice(0, PENDING_PAGE), total: cursor ? null : rows().length };
};
/** The priority queue as the house reads it: past the cursor's case, at most `limit`. */
const priorityHouse = (rows: () => Case[]) => async (limit: number, cursor?: { id: string }) => {
  const from = cursor ? rows().findIndex((r) => r.id === cursor.id) + 1 : 0;
  return rows().slice(from, from + limit);
};

type Button = { text: string; onPress?: () => void };
/** Dismisses the case on the docket at `place`, through its confirmation. */
async function dismissAt(r: ReturnType<typeof render>, place: number, alertSpy: jest.SpyInstance) {
  const button = r.getAllByLabelText('Dismiss report')[place];
  expect(button).toBeDefined();
  await act(async () => { await fireEvent.press(button!); });
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as unknown[] | undefined;
  const dismiss = (call?.[2] as Button[] | undefined)?.find((b) => b.text === 'Dismiss');
  expect(dismiss?.onPress).toBeDefined();
  await act(async () => { dismiss!.onPress!(); });
}

function renderTribunal() {
  return render(<QueryClientProvider client={testQueryClient()}><TribunalScreen /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockResolveReportV2.mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

it('THE DOCKET: a verdict reads the docket again as far as the moderator had read, not its first page alone', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  // Two pages: the first, and five cases more.
  let rows = cases('Pending', PENDING_PAGE + 5);
  mockGetPendingReports.mockImplementation(pendingHouse(() => rows));
  mockGetPriorityQueue.mockResolvedValue([]);
  const r = renderTribunal();
  await waitFor(() => expect(r.getByText('PENDING 1')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Load earlier: 5 more')); });
  await waitFor(() => expect(r.getByText('PENDING 15')).toBeTruthy());
  expect(r.queryByLabelText(/^Load earlier/)).toBeNull();

  rows = rows.filter((c) => c.id !== 'Pending-2');
  await dismissAt(r, 1, alertSpy);
  await waitFor(() => expect(mockGetPendingReports.mock.calls.filter(([cursor]) => cursor === undefined)).toHaveLength(2));
  await waitFor(() => expect(r.queryByText('PENDING 2')).toBeNull());
  expect(r.getByText('PENDING 15')).toBeTruthy();
  expect(r.getByText('PENDING 11')).toBeTruthy();
  expect(r.queryByLabelText(/^Load earlier/)).toBeNull();
  alertSpy.mockRestore();
});

it('URGENT: a verdict reads the queue again as far as the moderator had read, not its first page alone', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  // Two pages: the first, and five cases more.
  let rows = cases('Urgent', PRIORITY_PAGE + 5);
  mockGetPendingReports.mockResolvedValue({ rows: [], total: 0 });
  mockGetPriorityQueue.mockImplementation(priorityHouse(() => rows));
  const r = renderTribunal();
  await waitFor(() => expect(r.getByLabelText('Urgent: the priority queue')).toBeTruthy());
  await act(async () => { await fireEvent.press(r.getByLabelText('Urgent: the priority queue')); });
  await waitFor(() => expect(r.getByText('URGENT 1')).toBeTruthy());
  // The first page landed before the next is asked, past a double tap's window.
  await waitFor(() => expect(r.getAllByLabelText('Dismiss report')).toHaveLength(PRIORITY_PAGE));
  await act(async () => { jest.advanceTimersByTime(1000); });
  await act(async () => { await fireEvent.press(r.getByLabelText('Load more priority reports')); });
  await waitFor(() => expect(r.getAllByLabelText('Dismiss report')).toHaveLength(PRIORITY_PAGE + 5));
  expect(r.getByText('URGENT 25')).toBeTruthy();
  expect(r.queryByLabelText('Load more priority reports')).toBeNull();

  rows = rows.filter((c) => c.id !== 'Urgent-2');
  await dismissAt(r, 1, alertSpy);
  await waitFor(() => expect(mockGetPriorityQueue.mock.calls.filter(([, cursor]) => cursor === undefined)).toHaveLength(2));
  await waitFor(() => expect(r.queryByText('URGENT 2')).toBeNull());
  expect(r.getByText('URGENT 25')).toBeTruthy();
  expect(r.getByText('URGENT 21')).toBeTruthy();
  expect(r.queryByLabelText('Load more priority reports')).toBeNull();
  alertSpy.mockRestore();
});
