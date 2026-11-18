/**
 * everyVerdictIsReachedByAScreenReader.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A moderator using VoiceOver could judge no case: each case card was a Pressable left an
 * accessibility element, so iOS read the whole card as ONE dimmed "button" and never went
 * inside it to DISMISS, WARN, REMOVE CONTENT, SUSPEND, BAN, PERMANENT EXILE, the accused or the
 * evidence. Outside SELECT the card now only holds its controls; in SELECT it is the case's
 * checkbox, named for the case.
 *
 * And a Voice Control moderator saying "Tap Render Verdict" was not heard: the button showing
 * RENDER VERDICT was named "Execute ISSUE WARNING". It is named by the words it shows.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { testQueryClient } from '@/test-utils/testQueryClient';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { stopAround } from '@/test-utils/voiceOver';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import TribunalScreen from '../tribunal';

const mockGetPendingReports = jest.fn();
jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    resolveReportV2: jest.fn().mockResolvedValue(undefined),
    bulkDismiss: jest.fn().mockResolvedValue(0),
    getPriorityQueue: jest.fn().mockResolvedValue([]),
    getPendingReports: (...args: unknown[]) => mockGetPendingReports(...args),
    getModerationHistoryForUsers: jest.fn().mockResolvedValue({}),
    getReportEvidence: jest.fn().mockResolvedValue({ found: true, title: 'A record', body: 'The words', route: '/log/content-abc' }),
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

function renderTribunal() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <TribunalScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetPendingReports.mockResolvedValue({ rows: [CASE], total: 1 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a moderator using VoiceOver on the docket', () => {
  it('reaches every verdict, the accused and the evidence, each as its own stop, not lost inside the case card', async () => {
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    for (const name of [
      'Dismiss report', 'Warn: issue a warning', 'Remove the reported content', 'Suspend member', 'Ban member',
      'Permanent exile: ban this member for good', 'The accused: offender_one. Open their file.', 'Summon the evidence',
    ]) {
      // Said by name, so a failure prints a line, not the whole card the control is lost in.
      const around = stopAround(r.getByLabelText(name));
      expect({ name, insideAStop: around !== null }).toEqual({ name, insideAStop: false });
    }
  });

  it('hears each case in SELECT as one checkbox named for the case, with nothing inside it to stop on', async () => {
    const r = renderTribunal();
    await waitFor(() => expect(r.getByLabelText('Enter multi-select mode')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Enter multi-select mode')); });
    const boxes = await waitFor(() => r.getAllByRole('checkbox'));
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box).toBeDefined();
    expect(box!.props.accessibilityLabel).toMatch(/^Case filed .+: hate speech in film review, against @offender_one$/);
    expect(box!.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    // The accused's file is still drawn, but it is the checkbox that speaks and takes the tap.
    expect(within(box!).queryByLabelText('The accused: offender_one. Open their file.')).toBeNull();
  });
});

describe('a moderator using Voice Control on the verdict sheet', () => {
  it('can say the words the button shows: it is named "Render verdict"', async () => {
    const r = renderTribunal();
    await waitFor(() => expect(r.getByText('HATE SPEECH IN FILM REVIEW')).toBeTruthy());
    await act(async () => { await fireEvent.press(r.getByLabelText('Warn: issue a warning')); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Reason for this action'), 'Repeated abuse'); });
    const button = r.getByLabelText('Render verdict: issue warning');
    expect(within(button).getByText('RENDER VERDICT')).toBeTruthy();
  });
});
