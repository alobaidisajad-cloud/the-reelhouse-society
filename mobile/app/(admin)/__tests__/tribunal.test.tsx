/**
 * tribunal.test.tsx — Integration tests for TribunalScreen
 *
 * These tests RENDER the component and simulate real user interactions,
 * verifying that button presses flow through to the service layer.
 */

// ── Mock declarations (hoisted above jest.mock) ──────────────────────────────

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import TribunalScreen from '../tribunal';

const mockResolveReportV2 = jest.fn().mockResolvedValue(undefined);
const mockBulkDismiss = jest.fn().mockResolvedValue(undefined);
const mockGetPriorityQueue = jest.fn().mockResolvedValue([]);
const mockGetPendingReports = jest.fn().mockResolvedValue([]);
const mockGetUserModerationHistory = jest.fn().mockResolvedValue([]);

jest.mock('@/src/services/ModerationService', () => ({
  ModerationService: {
    resolveReportV2: (...args: any[]) => mockResolveReportV2(...args),
    bulkDismiss: (...args: any[]) => mockBulkDismiss(...args),
    getPriorityQueue: (...args: any[]) => mockGetPriorityQueue(...args),
    getPendingReports: (...args: any[]) => mockGetPendingReports(...args),
    getUserModerationHistory: (...args: any[]) => mockGetUserModerationHistory(...args),
  },
}));

const mockAuthStore: { user: any } = { user: null };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: () => mockAuthStore,
}));

// Mock expo-linear-gradient (native)
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) =>
      React.createElement(View, { ...props, testID: 'linear-gradient' }, children),
  };
});

// Mock react-native-gesture-handler (native)
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => React.createElement(View, null, children),
    GestureDetector: ({ children }: any) => React.createElement(View, null, children),
    Gesture: { Pan: () => ({ onChange: jest.fn().mockReturnThis(), onEnd: jest.fn().mockReturnThis() }) },
  };
});

// Mock TactileEngine (used by PressableScale)
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: {
    selection: jest.fn(),
    navigate: jest.fn(),
    mutate: jest.fn(),
    destroy: jest.fn(),
  },
}));

// Mock reelToast (avoids native toast rendering)
jest.mock('@/src/utils/reelToast', () => {
  const toast = jest.fn();
  toast.error = jest.fn();
  toast.success = jest.fn();
  return { __esModule: true, default: toast };
});

// Mock lucide-react-native icons (SVG native components)
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const icon = (name: string) => (props: any) =>
    React.createElement(View, { ...props, testID: `icon-${name}` });
  return {
    AlertTriangle: icon('AlertTriangle'),
    ArrowLeft: icon('ArrowLeft'),
    Ban: icon('Ban'),
    Check: icon('Check'),
    CheckSquare: icon('CheckSquare'),
    Clock: icon('Clock'),
    Layers: icon('Layers'),
    List: icon('List'),
    ShieldAlert: icon('ShieldAlert'),
    Skull: icon('Skull'),
    Square: icon('Square'),
    X: icon('X'),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderTribunal() {
  const queryClient = createTestQueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TribunalScreen />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

// ── Test Data ────────────────────────────────────────────────────────────────

const ADMIN_USER = { id: 'admin-uuid-001', role: 'admin', username: 'tribunal_admin' };
const NON_ADMIN_USER = { id: 'user-uuid-002', role: 'free', username: 'regular_joe' };

const MOCK_REPORTS = [
  {
    id: 'report-001',
    content_type: 'log',
    content_id: 'content-abc',
    reason: 'Hate speech in film review',
    details: 'Used slurs targeting ethnic group',
    status: 'pending',
    created_at: '2024-06-15T12:00:00Z',
    reporter: { id: 'reporter-1', username: 'watchful_member' },
    target_user_id: 'target-user-1',
    target_user: { id: 'target-user-1', username: 'offender_one', warning_count: 0 },
    report_count: 1,
  },
  {
    id: 'report-002',
    content_type: 'dispatch',
    content_id: 'content-def',
    reason: 'Spam dispatch flooding',
    details: null,
    status: 'pending',
    created_at: '2024-06-14T08:30:00Z',
    reporter: { id: 'reporter-2', username: 'clean_cinema' },
    target_user_id: 'target-user-2',
    target_user: { id: 'target-user-2', username: 'spammer_two', warning_count: 3 },
    report_count: 1,
  },
];

const PRIORITY_REPORTS = [
  {
    id: 'priority-001',
    content_type: 'profile',
    content_id: 'profile-xyz',
    reason: 'Impersonation',
    details: 'Pretending to be a director',
    status: 'pending',
    created_at: '2024-06-16T10:00:00Z',
    reporter: { id: 'reporter-3', username: 'vigilant_user' },
    target_user_id: 'target-user-3',
    target_user: { id: 'target-user-3', username: 'fake_director', warning_count: 1 },
    report_count: 5,
  },
  {
    id: 'priority-002',
    content_type: 'log',
    content_id: 'content-ghi',
    reason: 'Harassment',
    details: 'Repeated targeted abuse',
    status: 'pending',
    created_at: '2024-06-15T14:00:00Z',
    reporter: { id: 'reporter-4', username: 'concerned_cinephile' },
    target_user_id: 'target-user-4',
    target_user: { id: 'target-user-4', username: 'harasser', warning_count: 0 },
    report_count: 1,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TribunalScreen Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetPendingReports.mockResolvedValue([]);
    mockGetPriorityQueue.mockResolvedValue([]);
    mockGetUserModerationHistory.mockResolvedValue([]);
    mockResolveReportV2.mockResolvedValue(undefined);
    mockBulkDismiss.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 1. Non-admin sees empty screen ─────────────────────────────────────

  describe('Non-admin access', () => {
    it('renders an empty container for non-admin users', () => {
      mockAuthStore.user = NON_ADMIN_USER;

      const { toJSON } = renderTribunal();
      const tree = toJSON();

      // The component returns <View style={s.container} /> which is just an empty View
      // It should NOT contain report cards, buttons, or tribunal UI
      expect(tree).toBeTruthy();
      // The pending reports query should NOT have been called (enabled: false)
      expect(mockGetPendingReports).not.toHaveBeenCalled();
    });
  });

  // ── 2. Admin sees pending reports ──────────────────────────────────────

  describe('Admin sees pending reports', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('renders report cards with correct content', async () => {
      const { getByText } = renderTribunal();

      await waitFor(() => {
        expect(getByText('Hate speech in film review')).toBeTruthy();
      });

      // Verify content type badge
      expect(getByText('LOG')).toBeTruthy();
      expect(getByText('DISPATCH')).toBeTruthy();

      // Verify reporter username
      expect(getByText('@watchful_member')).toBeTruthy();
      expect(getByText('@clean_cinema')).toBeTruthy();
    });
  });

  // ── 3. Tapping WARN opens action modal ─────────────────────────────────

  describe('Warn action modal', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('opens modal with ISSUE WARNING title when pressing warn button', async () => {
      const { getAllByLabelText, getByText } = renderTribunal();

      await waitFor(() => {
        expect(getAllByLabelText('Issue warning').length).toBeGreaterThan(0);
      });

      await act(async () => {
        fireEvent.press(getAllByLabelText('Issue warning')[0]);
      });

      await waitFor(() => {
        expect(getByText('ISSUE WARNING')).toBeTruthy();
      });

      // Verify the reason text input placeholder is visible
      expect(getByText('REASON')).toBeTruthy();
    });
  });

  // ── 4. Submitting warn action calls resolveReportV2 ────────────────────

  describe('Warn submission', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('calls resolveReportV2 with correct params when submitting warn', async () => {
      const { getAllByLabelText, getByPlaceholderText, getByLabelText } = renderTribunal();

      // Wait for reports to load
      await waitFor(() => {
        expect(getAllByLabelText('Issue warning').length).toBeGreaterThan(0);
      });

      // Open warn modal on first report
      await act(async () => {
        fireEvent.press(getAllByLabelText('Issue warning')[0]);
      });

      // Type reason
      await waitFor(() => {
        expect(getByPlaceholderText('Describe the reason for this action...')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          getByPlaceholderText('Describe the reason for this action...'),
          'Repeated harassment of other members',
        );
      });

      // Submit
      await act(async () => {
        fireEvent.press(getByLabelText('Execute ISSUE WARNING'));
      });

      await waitFor(() => {
        expect(mockResolveReportV2).toHaveBeenCalledTimes(1);
        expect(mockResolveReportV2).toHaveBeenCalledWith(
          'report-001',
          'warn',
          expect.objectContaining({
            admin_id: 'admin-uuid-001',
            reason: 'Repeated harassment of other members',
          }),
        );
      });
    });
  });

  // ── 5. Tapping SUSPEND opens modal with duration field ─────────────────

  describe('Suspend modal with duration field', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('shows duration input and reason input when pressing suspend', async () => {
      const { getAllByLabelText, getByPlaceholderText } = renderTribunal();

      await waitFor(() => {
        expect(getAllByLabelText('Suspend member').length).toBeGreaterThan(0);
      });

      await act(async () => {
        fireEvent.press(getAllByLabelText('Suspend member')[0]);
      });

      await waitFor(() => {
        // Duration field
        expect(getByPlaceholderText('e.g. 24, 48, 72')).toBeTruthy();
        // Reason field
        expect(getByPlaceholderText('Describe the reason for this action...')).toBeTruthy();
      });
    });
  });

  // ── 6. Submit suspend with duration calls resolveReportV2 ──────────────

  describe('Suspend submission with duration', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('calls resolveReportV2 with duration_hours when submitting suspend', async () => {
      const { getAllByLabelText, getByPlaceholderText, getByLabelText } = renderTribunal();

      await waitFor(() => {
        expect(getAllByLabelText('Suspend member').length).toBeGreaterThan(0);
      });

      // Open suspend modal
      await act(async () => {
        fireEvent.press(getAllByLabelText('Suspend member')[0]);
      });

      // Fill duration
      await waitFor(() => {
        expect(getByPlaceholderText('e.g. 24, 48, 72')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(getByPlaceholderText('e.g. 24, 48, 72'), '48');
      });

      // Fill reason
      await act(async () => {
        fireEvent.changeText(
          getByPlaceholderText('Describe the reason for this action...'),
          'Spamming lounge messages',
        );
      });

      // Submit
      await act(async () => {
        fireEvent.press(getByLabelText('Execute SUSPEND MEMBER'));
      });

      await waitFor(() => {
        expect(mockResolveReportV2).toHaveBeenCalledTimes(1);
        expect(mockResolveReportV2).toHaveBeenCalledWith(
          'report-001',
          'suspend',
          expect.objectContaining({
            admin_id: 'admin-uuid-001',
            reason: 'Spamming lounge messages',
            duration_hours: 48,
          }),
        );
      });
    });
  });

  // ── 6b. Tapping DISMISS routes through admin-verified resolveReportV2 ────

  describe('Dismiss action', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('calls resolveReportV2 (not the legacy unguarded RPC) when confirming dismiss', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const { getAllByLabelText } = renderTribunal();

      await waitFor(() => {
        expect(getAllByLabelText('Dismiss report').length).toBeGreaterThan(0);
      });

      await act(async () => {
        fireEvent.press(getAllByLabelText('Dismiss report')[0]);
      });

      expect(alertSpy).toHaveBeenCalledWith(
        'Dismiss Report',
        expect.any(String),
        expect.any(Array),
      );

      const alertButtons = alertSpy.mock.calls[0][2] as any[];
      const confirmButton = alertButtons.find((b: any) => b.text === 'Dismiss');

      await act(async () => {
        confirmButton.onPress();
      });

      await waitFor(() => {
        expect(mockResolveReportV2).toHaveBeenCalledTimes(1);
        expect(mockResolveReportV2).toHaveBeenCalledWith(
          'report-001',
          'dismiss',
          expect.objectContaining({ admin_id: 'admin-uuid-001' }),
        );
      });

      alertSpy.mockRestore();
    });
  });

  // ── 7. Multi-select mode and bulk dismiss ──────────────────────────────

  describe('Multi-select and bulk dismiss', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('enters multi-select, selects reports, and bulk dismisses via Alert', async () => {
      // Spy on Alert.alert to intercept and trigger confirm callback
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByLabelText, getAllByRole } = renderTribunal();

      // Wait for reports to render
      await waitFor(() => {
        expect(getByLabelText('Enter multi-select mode')).toBeTruthy();
      });

      // Enter multi-select mode
      await act(async () => {
        fireEvent.press(getByLabelText('Enter multi-select mode'));
      });

      // Now cards become checkboxes — select them
      await waitFor(() => {
        const checkboxes = getAllByRole('checkbox');
        expect(checkboxes.length).toBe(2);
      });

      const checkboxes = getAllByRole('checkbox');

      await act(async () => {
        fireEvent.press(checkboxes[0]);
        fireEvent.press(checkboxes[1]);
      });

      // Press bulk dismiss button
      await waitFor(() => {
        expect(getByLabelText('Bulk dismiss 2 reports')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(getByLabelText('Bulk dismiss 2 reports'));
      });

      // Alert should have been called
      expect(alertSpy).toHaveBeenCalledWith(
        'Bulk Dismiss',
        expect.stringContaining('2'),
        expect.any(Array),
      );

      // Trigger the destructive button callback (2nd button, index 1)
      const alertButtons = alertSpy.mock.calls[0][2] as any[];
      const dismissButton = alertButtons.find((b: any) => b.style === 'destructive');

      await act(async () => {
        dismissButton.onPress();
      });

      await waitFor(() => {
        expect(mockBulkDismiss).toHaveBeenCalledTimes(1);
        expect(mockBulkDismiss).toHaveBeenCalledWith(
          expect.arrayContaining(['report-001', 'report-002']),
          'admin-uuid-001',
          'Bulk dismissed by Tribunal admin',
        );
      });

      alertSpy.mockRestore();
    });
  });

  // ── 8. Priority view toggle ────────────────────────────────────────────

  describe('Priority view toggle', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
      mockGetPriorityQueue.mockResolvedValue(PRIORITY_REPORTS);
    });

    it('calls getPriorityQueue when switching to PRIORITY tab', async () => {
      const { getByLabelText, getByText } = renderTribunal();

      // Wait for initial pending load
      await waitFor(() => {
        expect(getByText('Hate speech in film review')).toBeTruthy();
      });

      // Press PRIORITY tab
      await act(async () => {
        fireEvent.press(getByLabelText('Priority queue view'));
      });

      await waitFor(() => {
        expect(mockGetPriorityQueue).toHaveBeenCalledWith(20);
      });

      // Report count badge should appear for items with count > 1
      await waitFor(() => {
        expect(getByText('5')).toBeTruthy(); // report_count badge for priority-001
      });
    });
  });

  // ── 9. Load More pagination ────────────────────────────────────────────

  describe('Load More pagination', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue([]);
      // Return exactly 20 items so hasMorePriority = true
      const twentyItems = Array.from({ length: 20 }, (_, i) => ({
        id: `priority-${String(i).padStart(3, '0')}`,
        content_type: 'log',
        content_id: `content-${i}`,
        reason: `Reason ${i}`,
        status: 'pending',
        created_at: '2024-06-16T10:00:00Z',
        reporter: { id: `reporter-${i}`, username: `user_${i}` },
        target_user_id: `target-${i}`,
        target_user: { id: `target-${i}`, username: `target_${i}`, warning_count: 0 },
        report_count: 1,
      }));
      mockGetPriorityQueue.mockResolvedValue(twentyItems);
    });

    it('calls getPriorityQueue with last item ID as cursor when pressing LOAD MORE', async () => {
      const { getByLabelText, getByText } = renderTribunal();

      // Switch to priority view
      await act(async () => {
        fireEvent.press(getByLabelText('Priority queue view'));
      });

      // Wait for data to load
      await waitFor(() => {
        expect(getByText('Reason 0')).toBeTruthy();
      });

      // The load more button should be visible (20 items = full page = hasMore)
      await waitFor(() => {
        expect(getByLabelText('Load more priority reports')).toBeTruthy();
      });

      // Set up mock for the next page call
      mockGetPriorityQueue.mockResolvedValueOnce([]);

      // Press load more
      await act(async () => {
        fireEvent.press(getByLabelText('Load more priority reports'));
      });

      // Verify getPriorityQueue was called with cursor (last item's ID)
      await waitFor(() => {
        expect(mockGetPriorityQueue).toHaveBeenCalledWith(20, 'priority-019');
      });
    });
  });

  // ── 10. Warning count badge for repeat offenders ───────────────────────

  describe('Warning count badge', () => {
    beforeEach(() => {
      mockAuthStore.user = ADMIN_USER;
      mockGetPendingReports.mockResolvedValue(MOCK_REPORTS);
    });

    it('shows warning badge for users with warning_count > 0', async () => {
      const { getByText } = renderTribunal();

      // MOCK_REPORTS[1] has target_user.warning_count = 3
      await waitFor(() => {
        expect(getByText('Spam dispatch flooding')).toBeTruthy();
      });

      // The WarningBadge renders the count as text
      await waitFor(() => {
        expect(getByText('3')).toBeTruthy();
      });
    });
  });
});
