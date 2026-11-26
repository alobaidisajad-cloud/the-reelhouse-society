/**
 * aVerdictOnACaseThatMovedOnIsTold.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * Another moderator, or the member reported, may act on a case while it is on this docket.
 *   · A case another moderator already judged stayed on the docket, and every verdict on it toasted
 *     the house's raw words. The house now refuses it as ALREADY_JUDGED: the case leaves the
 *     docket, said as judged by another moderator.
 *   · REMOVE CONTENT on a piece its author already deleted was carried out over nothing: the member
 *     was told of a removal and it went on their record. It is no longer offered once the evidence
 *     reads destroyed, and a removal the house refuses as PIECE_GONE keeps the case, takes the
 *     button away and says what is left to do.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TribunalScreen from '../tribunal';
import reelToast from '@/src/utils/reelToast';
import { ONE_PRESS_MS } from '@/src/utils/onePress';

const mockResolveReportV2 = jest.fn();
const mockGetPendingReports = jest.fn();
const mockGetReportEvidence = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    resolveReportV2: (...args: unknown[]) => mockResolveReportV2(...args),
    bulkDismiss: jest.fn().mockResolvedValue(0),
    getPriorityQueue: jest.fn().mockResolvedValue([]),
    getPendingReports: (...args: unknown[]) => mockGetPendingReports(...args),
    getModerationHistoryForUsers: jest.fn().mockResolvedValue({}),
    getReportEvidence: (...args: unknown[]) => mockGetReportEvidence(...args),
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

/** The house's refusal of a verdict, as supabase-js hands it back. */
const refusal = (word: 'ALREADY_JUDGED' | 'PIECE_GONE') => ({ code: 'P0002', message: word, details: null, hint: null });

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

/** The one card's control by its label: the docket here holds the case under test first. */
const firstOf = <T,>(all: T[]): T => {
  const first = all[0];
  expect(first).toBeDefined();
  return first!;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetPendingReports.mockResolvedValue({ rows: [CASE, OTHER_CASE], total: 2 });
  mockResolveReportV2.mockResolvedValue(undefined);
  mockGetReportEvidence.mockResolvedValue({ found: true, title: 'A record', body: 'The words', route: '/log/content-abc' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a case another moderator already judged', () => {
  it('leaves the docket when its dismissal is refused as already judged, and says so in plain words', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce(refusal('ALREADY_JUDGED'));

    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Dismiss report'))); });
    const dismiss = lastAlertButtons(alertSpy).find((b) => b.text === 'Dismiss');
    expect(dismiss).toBeDefined();
    await act(async () => { dismiss!.onPress!(); });

    await waitFor(() => expect(r.queryByText('HATE SPEECH IN FILM REVIEW')).toBeNull());
    expect(r.getByText('SPAM DISPATCH FLOODING')).toBeTruthy();
    expect(reelToast).toHaveBeenCalledWith('Already judged by another moderator.');
    expect(reelToast.error).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('leaves the docket when a warning is refused as already judged', async () => {
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce(refusal('ALREADY_JUDGED'));

    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Warn: issue a warning'))); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Reason for this action'), 'Repeated abuse'); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Render verdict: issue warning')); });

    await waitFor(() => expect(mockResolveReportV2).toHaveBeenCalledWith('report-001', 'warn', expect.anything()));
    await waitFor(() => expect(r.queryByText('HATE SPEECH IN FILM REVIEW')).toBeNull());
    expect(reelToast).toHaveBeenCalledWith('Already judged by another moderator.');
  });

  it('stays on the docket, as before, when a verdict fails for any other reason', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce(new Error('Network request failed'));

    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Dismiss report'))); });
    const dismiss = lastAlertButtons(alertSpy).find((b) => b.text === 'Dismiss');
    expect(dismiss).toBeDefined();
    await act(async () => { dismiss!.onPress!(); });

    await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('Network request failed'));
    expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy();
    alertSpy.mockRestore();
  });
});

describe('a case about the moderator (the kinds pass: who may judge a case)', () => {
  it('stays on the docket when the house refuses its verdict as OWN_CASE, and says another moderator must judge it', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce({ code: '42501', message: 'OWN_CASE', details: null, hint: null });

    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Dismiss report'))); });
    const dismiss = lastAlertButtons(alertSpy).find((b) => b.text === 'Dismiss');
    expect(dismiss).toBeDefined();
    await act(async () => { dismiss!.onPress!(); });

    await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('This case is about you: another moderator must judge it.'));
    expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy();
    expect(reelToast).not.toHaveBeenCalledWith('Already judged by another moderator.');
    alertSpy.mockRestore();
  });
});

describe('a piece its author already deleted', () => {
  it('is not offered for removal once its evidence reads destroyed; the case can still be dismissed or judged', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [CASE], total: 1 });
    mockGetReportEvidence.mockResolvedValue({ found: false });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Remove the reported content')).toBeTruthy());

    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });

    await waitFor(() => expect(r.getByText('The evidence has been destroyed — the page no longer exists.')).toBeTruthy());
    expect(r.queryByLabelText('Remove the reported content')).toBeNull();
    expect(r.getByLabelText('Dismiss report')).toBeTruthy();
    expect(r.getByLabelText('Warn: issue a warning')).toBeTruthy();
  });

  it('is still offered for removal while its evidence stands', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [CASE], total: 1 });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Summon the evidence')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });
    await waitFor(() => expect(r.getByText('OPEN THE PAGE →')).toBeTruthy());
    expect(r.getByLabelText('Remove the reported content')).toBeTruthy();
  });

  it('a removal the house refuses as already gone keeps the case, takes REMOVE CONTENT away, and says what is left', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [CASE], total: 1 });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Remove the reported content')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce(refusal('PIECE_GONE'));

    await act(async () => { await fireEvent.press(r.getByLabelText('Remove the reported content')); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Reason for this action'), 'Slurs'); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Render verdict: remove content')); });

    await waitFor(() => expect(mockResolveReportV2).toHaveBeenCalledWith('report-001', 'delete_content', expect.anything()));
    await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('The piece is already gone. Dismiss the case, or judge the member.'));
    expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy();
    expect(r.getByText('The evidence has been destroyed — the page no longer exists.')).toBeTruthy();
    expect(r.queryByLabelText('Remove the reported content')).toBeNull();
    expect(reelToast).not.toHaveBeenCalledWith('Directive executed. Action recorded in the archives.');
  });
});

/** Stage C, every word written is kept: a sheet closed, or a verdict refused, lost the reason. */
describe('the reason for a verdict', () => {
  const { readDraft } = require('@/src/utils/memberDrafts');
  const kept = (id: string) => readDraft('admin-uuid-001', 'verdict', id)?.data.body;
  beforeEach(() => { require('@/src/stores/mmkv-storage').storage.clearAll(); });
  const reason = (r: ReturnType<typeof render>) => r.getByLabelText('Reason for this action');

  it('is kept per case: the sheet closed and opened again on the case opens on it; another case on its own', async () => {
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Warn: issue a warning'))); });
    await act(async () => { await fireEvent.changeText(reason(r), 'Repeated abuse in the review.'); });
    const xs = r.getAllByLabelText('Close');
    await act(async () => { await fireEvent.press(xs[xs.length - 1]!); });
    expect(kept('report-001')).toBe('Repeated abuse in the review.');
    // The other case opens on none; the first again on its reason.
    await act(async () => { jest.advanceTimersByTime(ONE_PRESS_MS); });
    await act(async () => { await fireEvent.press(r.getAllByLabelText('Warn: issue a warning')[1]!); });
    expect(reason(r).props.value).toBe('');
    const ys = r.getAllByLabelText('Close');
    await act(async () => { await fireEvent.press(ys[ys.length - 1]!); });
    await act(async () => { jest.advanceTimersByTime(ONE_PRESS_MS); });
    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Warn: issue a warning'))); });
    expect(reason(r).props.value).toBe('Repeated abuse in the review.');
  });

  it('refused, with the case still standing, is put back for the case; judged, it is let go', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [CASE], total: 1 });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Remove the reported content')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce(refusal('PIECE_GONE'));
    await act(async () => { await fireEvent.press(r.getByLabelText('Remove the reported content')); });
    await act(async () => { await fireEvent.changeText(reason(r), 'Slurs'); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Render verdict: remove content')); });
    await waitFor(() => expect(reelToast.error).toHaveBeenCalledWith('The piece is already gone. Dismiss the case, or judge the member.'));
    expect(kept('report-001')).toBe('Slurs');
    await act(async () => { jest.advanceTimersByTime(ONE_PRESS_MS); });
    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Warn: issue a warning'))); });
    expect(reason(r).props.value).toBe('Slurs');
    await act(async () => { await fireEvent.press(r.getByLabelText('Render verdict: issue warning')); });
    await waitFor(() => expect(reelToast).toHaveBeenCalledWith('Directive executed. Action recorded in the archives.'));
    expect(kept('report-001')).toBeUndefined();
  });

  it('refused as already judged is let go with the case', async () => {
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    mockResolveReportV2.mockRejectedValueOnce(refusal('ALREADY_JUDGED'));
    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Warn: issue a warning'))); });
    await act(async () => { await fireEvent.changeText(reason(r), 'Repeated abuse'); });
    await act(async () => { await fireEvent.press(r.getByLabelText('Render verdict: issue warning')); });
    await waitFor(() => expect(reelToast).toHaveBeenCalledWith('Already judged by another moderator.'));
    expect(kept('report-001')).toBeUndefined();
  });
});
