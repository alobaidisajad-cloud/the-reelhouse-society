/**
 * aVerdictRedrawsOnlyTheCasesItChanged.test.tsx — the docket draws again only the cases that changed
 * ─────────────────────────────────────────────────────────────────────────────
 * Every case on THE DOCKET is a card of a dozen controls. Drawn inside the screen's own render, every
 * case was drawn again at every change on the screen: a verdict, the docket read again behind it, a
 * page more, a record read. Each case is now drawn again only when something it shows changed. Each
 * accused's picture is drawn once each time its case is, so the pictures drawn tell which cases were.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TribunalScreen from '../tribunal';

const mockResolveReportV2 = jest.fn();
const mockGetPendingReports = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  REPORTS_PAGE_SIZE: 10,
  ModerationService: {
    resolveReportV2: (...args: unknown[]) => mockResolveReportV2(...args),
    bulkDismiss: jest.fn().mockResolvedValue(0),
    getPriorityQueue: jest.fn().mockResolvedValue([]),
    getPendingReports: (...args: unknown[]) => mockGetPendingReports(...args),
    getModerationHistoryForUsers: jest.fn().mockResolvedValue({}),
    getReportEvidence: jest.fn().mockResolvedValue({ found: true, title: 'A record', body: 'The words', route: '/log/x' }),
    getPendingCount: jest.fn().mockResolvedValue(0),
  },
}));

/** The pictures drawn, by their address: one per accused, drawn each time their case is. */
const mockDrawn: string[] = [];
jest.mock('@/src/components/Picture', () => {
  const actual = jest.requireActual('@/src/components/Picture');
  return {
    ...actual,
    RemoteImage: (props: { uri?: string | null }) => {
      mockDrawn.push(String(props.uri));
      return actual.RemoteImage(props);
    },
  };
});

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

/** `count` cases, the first the newest, each against its own member, whose picture is `picture-<n>`. */
const cases = (count: number) => Array.from({ length: count }, (_, i) => i + 1).map((i) => ({
  id: `case-${i}`,
  content_type: 'log',
  content_id: `content-${i}`,
  reason: `Pending ${i}`,
  details: null,
  status: 'pending',
  created_at: new Date(Date.UTC(2026, 10, 10, 12) - i * 60_000).toISOString(),
  reporter: { id: 'reporter-1', username: 'watchful_member' },
  target_user_id: `member-${i}`,
  target_user: { id: `member-${i}`, username: `accused_${i}`, warning_count: 0, avatar_url: `picture-${i}` },
  report_count: 2,
}));
type Case = ReturnType<typeof cases>[number];

/** The pending docket as the house reads it: ten at a time, from the boundary case on (not past it). */
const pendingHouse = (rows: () => Case[]) => async (cursor?: string) => {
  const from = cursor ? rows().filter((r) => r.created_at <= cursor) : rows();
  return { rows: from.slice(0, 10), total: cursor ? null : rows().length };
};

type Button = { text: string; onPress?: () => void };

/** The docket drawn, every record read: what is drawn from here on is drawn again. */
async function docketOf(rows: () => Case[]) {
  mockGetPendingReports.mockImplementation(pendingHouse(rows));
  const r = render(<QueryClientProvider client={testQueryClient()}><TribunalScreen /></QueryClientProvider>);
  await waitFor(() => expect(r.getByText('PENDING 1')).toBeTruthy());
  await waitFor(() => expect(r.queryByText('Retrieving the record…')).toBeNull());
  mockDrawn.length = 0;
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockDrawn.length = 0;
  mockResolveReportV2.mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

it('a verdict, and the docket read again behind it, draw again none of the cases left on the docket', async () => {
  let rows = cases(8);
  const r = await docketOf(() => rows);
  const alertSpy = jest.spyOn(Alert, 'alert');
  rows = rows.filter((c) => c.id !== 'case-2');
  await act(async () => { await fireEvent.press(r.getAllByLabelText('Dismiss report')[1]!); });
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1] as unknown[] | undefined;
  const dismiss = (call?.[2] as Button[] | undefined)?.find((b) => b.text === 'Dismiss');
  expect(dismiss?.onPress).toBeDefined();
  await act(async () => { dismiss!.onPress!(); });
  await waitFor(() => expect(mockGetPendingReports).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(r.queryByText('PENDING 2')).toBeNull());
  expect(r.getByText('PENDING 8')).toBeTruthy();
  // Every case after the judged one comes back from the read a copy (it moved up a place), the
  // same words in it: none of them is drawn again.
  expect(mockDrawn).toEqual([]);
  alertSpy.mockRestore();
});

it('a page more draws the cases it brings, and none of the cases already on the docket', async () => {
  const rows = cases(14);
  const r = await docketOf(() => rows);
  await act(async () => { await fireEvent.press(r.getByLabelText('Load earlier: 4 more')); });
  await waitFor(() => expect(r.getByText('PENDING 14')).toBeTruthy());
  await waitFor(() => expect(r.queryByText('Retrieving the record…')).toBeNull());
  // Each case the page brought is drawn as it comes, and again as its member's record is read.
  expect([...new Set(mockDrawn)].sort()).toEqual(['picture-11', 'picture-12', 'picture-13', 'picture-14']);
});
