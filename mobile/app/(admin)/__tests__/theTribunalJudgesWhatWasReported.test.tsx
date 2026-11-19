/**
 * theTribunalJudgesWhatWasReported.test.tsx — review round 14
 * ─────────────────────────────────────────────────────────────────────────────
 *   · THE DOCKET, where the Tribunal opens, read no member's enforcement record: a repeat offender
 *     read as a first offence. Its cases now carry the record, as URGENT's do.
 *   · The words a member reported were never kept: an author who edited or deleted them before the
 *     verdict handed the moderator a clean exhibit, or "destroyed". The house keeps them when the
 *     report is filed, and the case shows them beside what stands now.
 *   · REMOVE CONTENT was never offered for a page or a salon, and a ban froze both: a slur in a bio
 *     or a salon's name stood as long as the ban did. It is offered, saying what it takes from each.
 *   · A verdict lifted or overturned on appeal reads so on the record, never as a strike.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import TribunalScreen, { EnforcementHistory, evidenceGoneSays, recordStanding } from '../tribunal';

const mockGetPendingReports = jest.fn();
const mockGetReportEvidence = jest.fn();
const mockGetHistory = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    resolveReportV2: jest.fn().mockResolvedValue(undefined),
    bulkDismiss: jest.fn().mockResolvedValue(0),
    getPriorityQueue: jest.fn().mockResolvedValue([]),
    getPendingReports: (...args: unknown[]) => mockGetPendingReports(...args),
    getModerationHistoryForUsers: (...args: unknown[]) => mockGetHistory(...args),
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
  useAuthStore: (sel?: (s: unknown) => unknown) => (sel ? sel(mockAuthStore) : mockAuthStore),
}));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: {
    selection: jest.fn(), navigate: jest.fn(), mutate: jest.fn(), destroy: jest.fn(), success: jest.fn(),
    error: jest.fn(), warn: jest.fn(), rigid: jest.fn(), soft: jest.fn(),
  },
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

const MEMBER = 'target-user-1';
const CASE = {
  id: 'report-001', content_type: 'log', content_id: 'content-abc', reason: 'harassment', details: null,
  status: 'pending', created_at: '2026-11-15T12:00:00Z', reporter: { id: 'reporter-1', username: 'watchful_member' },
  target_user_id: MEMBER, target_user: { id: MEMBER, username: 'offender_one', warning_count: 0 }, report_count: 1,
};
const PAGE_CASE = { ...CASE, id: 'report-002', content_type: 'profile', content_id: MEMBER, reason: 'hate_speech' };
const SALON_CASE = { ...CASE, id: 'report-003', content_type: 'lounge', content_id: 'salon-1', reason: 'hate_speech' };
const record = (id: string, action: string, reason: string, extra: Record<string, unknown> = {}) => ({
  id, report_id: null, target_user_id: MEMBER, admin_id: 'admin-2', action, reason, duration_hours: null,
  expires_at: null, created_at: '2026-10-01T10:00:00Z', ...extra,
});

function renderTribunal() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <TribunalScreen />
    </QueryClientProvider>,
  );
}

const firstOf = <T,>(all: T[]): T => {
  const first = all[0];
  expect(first).toBeDefined();
  return first!;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPendingReports.mockResolvedValue({ rows: [CASE], total: 1 });
  mockGetHistory.mockResolvedValue({});
  mockGetReportEvidence.mockResolvedValue({ found: true, title: 'A record', body: 'The words', route: '/log/content-abc' });
});

describe('THE DOCKET reads each member’s record', () => {
  it('a member suspended twice and with a piece removed reads as a repeat offender on THE DOCKET', async () => {
    mockGetHistory.mockResolvedValue({
      [MEMBER]: [
        record('m1', 'suspend', 'Second time abusive in critiques'),
        record('m2', 'suspend', 'Abusive in critiques'),
        record('m3', 'delete_content', 'A slur in a review'),
      ],
    });
    const r = renderTribunal();
    // The record as read (its strip says ENFORCEMENT RECORD while it is read too).
    await waitFor(() => expect(r.getByText('Second time abusive in critiques')).toBeTruthy());
    expect(mockGetHistory).toHaveBeenCalledWith([MEMBER]);
    // Both suspensions on the record (the verdict button says SUSPEND as well), and the removal.
    expect(r.getAllByText('SUSPEND')).toHaveLength(3);
    expect(r.getByText('Second time abusive in critiques')).toBeTruthy();
    expect(r.getByText('Abusive in critiques')).toBeTruthy();
    expect(r.getByText('DELETE_CONTENT')).toBeTruthy();
  });

  it('a record that could not be read is said so on THE DOCKET, never left blank', async () => {
    mockGetHistory.mockRejectedValue(new Error('network'));
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('The record could not be read.')).toBeTruthy());
  });
});

describe('the words as reported', () => {
  it('a piece edited since it was reported shows the reported words beside what stands now', async () => {
    mockGetReportEvidence.mockResolvedValue({
      found: true, title: 'Vertigo', body: 'A fine film.', route: '/log/content-abc', changed: true,
      reported: { title: 'Vertigo', body: 'Only a fool like @ana would love this.' },
    });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Summon the evidence')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });
    await waitFor(() => expect(r.getByText('AS REPORTED · EDITED SINCE')).toBeTruthy());
    expect(r.getByText('AS IT STANDS NOW')).toBeTruthy();
    expect(r.getByText('“Only a fool like @ana would love this.”')).toBeTruthy();
    expect(r.getByText('“A fine film.”')).toBeTruthy();
  });

  it('a piece deleted since it was reported reads destroyed, its reported words beside it', async () => {
    mockGetReportEvidence.mockResolvedValue({ found: false, reported: { body: 'The critique as it was filed.' } });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Summon the evidence')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });
    await waitFor(() => expect(r.getByText('The evidence has been destroyed — the page no longer exists.')).toBeTruthy());
    expect(r.getByText('THE WORDS AS REPORTED')).toBeTruthy();
    expect(r.getByText('“The critique as it was filed.”')).toBeTruthy();
    // Gone, so nothing to remove: the member is judged on the words reported.
    expect(r.queryByLabelText('Remove the reported content')).toBeNull();
  });

  it('a page reported shows its display name and picture as reported', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [PAGE_CASE], total: 1 });
    mockGetReportEvidence.mockResolvedValue({
      found: true, title: 'offender_one', body: 'bio words', display_name: 'Rude Name', avatar_url: 'https://example.com/a.jpg', route: '/user/offender_one',
    });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Summon the evidence')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });
    await waitFor(() => expect(r.getByText('Display name: Rude Name')).toBeTruthy());
    expect(r.getByLabelText('The page’s picture')).toBeTruthy();
  });

  it('a picture whose file is gone is said so, never left blank', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [PAGE_CASE], total: 1 });
    // An address the phone will not fetch draws what a picture that could not be had draws.
    mockGetReportEvidence.mockResolvedValue({
      found: true, title: 'offender_one', body: 'bio words', avatar_url: 'ftp://example.com/a.jpg', route: '/user/offender_one',
    });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Summon the evidence')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });
    await waitFor(() => expect(r.getByText('The page’s picture is no longer held.')).toBeTruthy());
  });

  it('a piece an earlier verdict withholds reads withheld, never destroyed', async () => {
    mockGetReportEvidence.mockResolvedValue({ found: false, withheld: true, appealed: true, reported: { body: 'The critique as it was filed.' } });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Summon the evidence')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Summon the evidence')); });
    await waitFor(() => expect(r.getByText('Withheld under an earlier verdict, awaiting its appeal.')).toBeTruthy());
    expect(r.queryByText('The evidence has been destroyed — the page no longer exists.')).toBeNull();
    expect(evidenceGoneSays({ withheld: true, appealed: false })).toBe('Withheld under an earlier verdict, while its member may appeal it.');
    expect(evidenceGoneSays({})).toBe('The evidence has been destroyed — the page no longer exists.');
  });
});

describe('REMOVE CONTENT on a page and a salon', () => {
  it('is offered on a page, and says it clears the words on it, never the handle', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [PAGE_CASE], total: 1 });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Remove content: clear the words on the page')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Remove content: clear the words on the page')); });
    expect(r.getByText(/bio, display name, picture and links\. Their handle stays/)).toBeTruthy();
  });

  it('is offered on a salon, and says it clears its name and words, never its rooms', async () => {
    mockGetPendingReports.mockResolvedValue({ rows: [SALON_CASE], total: 1 });
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Remove content: clear the salon’s name and words')).toBeTruthy());
    await act(async () => { await fireEvent.press(firstOf(r.getAllByLabelText('Remove content: clear the salon’s name and words'))); });
    expect(r.getByText(/name, description and cover are cleared; its rooms/)).toBeTruthy();
  });
});

describe('a verdict struck reads so on the record', () => {
  it('says how each verdict stands', () => {
    const now = Date.parse('2026-11-19T00:00:00Z');
    expect(recordStanding({ lifted_at: null, appeal_status: null }, now)).toBeNull();
    expect(recordStanding({ lifted_at: '2026-11-18T00:00:00Z', appeal_status: 'overturned' }, now)).toBe('OVERTURNED ON APPEAL');
    expect(recordStanding({ lifted_at: '2026-11-18T00:00:00Z', appeal_status: null }, now)).toBe('LIFTED');
    expect(recordStanding({ lifted_at: null, appeal_status: 'upheld' }, now)).toBe('UPHELD ON APPEAL');
    expect(recordStanding({ lifted_at: null, appeal_status: 'pending' }, now)).toBe('UNDER APPEAL');
    // Served to its end: served, never lifted, though a lift came after it ran out.
    expect(recordStanding({ lifted_at: null, appeal_status: null, expires_at: '2026-10-01T00:00:00Z' }, now)).toBe('SERVED');
    expect(recordStanding({ lifted_at: '2026-11-18T00:00:00Z', appeal_status: null, expires_at: '2026-10-01T00:00:00Z' }, now)).toBe('SERVED');
    expect(recordStanding({ lifted_at: '2026-11-18T00:00:00Z', appeal_status: null, expires_at: '2026-12-01T00:00:00Z' }, now)).toBe('LIFTED');
    expect(recordStanding({ lifted_at: null, appeal_status: null, expires_at: '2026-12-01T00:00:00Z' }, now)).toBeNull();
  });

  it('only a verdict overturned is drawn struck: a lift is mercy, a sentence served was given', () => {
    const r = render(
      <EnforcementHistory isLoading={false} history={[
        record('m1', 'suspend', 'Abusive', { lifted_at: '2026-11-18T00:00:00Z', appeal_status: 'overturned' }),
        record('m2', 'ban', 'Spam', { lifted_at: '2026-11-18T00:00:00Z' }),
        record('m3', 'suspend', 'Again', { expires_at: '2026-10-01T00:00:00Z' }),
      ] as never} />,
    );
    expect(r.getByText('SUSPEND · OVERTURNED ON APPEAL')).toBeTruthy();
    expect(r.getByText('BAN · LIFTED')).toBeTruthy();
    expect(r.getByText('SUSPEND · SERVED')).toBeTruthy();
    expect(r.getAllByTestId('record-struck', { includeHiddenElements: true })).toHaveLength(1);
    expect(r.getAllByTestId('record-holds', { includeHiddenElements: true })).toHaveLength(2);
  });
});
