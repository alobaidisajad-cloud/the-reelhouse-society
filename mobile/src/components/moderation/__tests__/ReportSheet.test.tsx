/**
 * ReportSheet.test.tsx - Unit tests for the ReportSheet component
 * Validates: Requirements 4.3, 1.5
 *
 * Tests cover:
 * - Reason chip single-selection behavior (selecting B deselects A)
 * - Submit button disabled when no reason selected
 * - "other" reason requires non-empty details
 * - Character counter renders correctly
 * - Block toggle state management
 *
 * Uses direct component render validation and store mock verification.
 */

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { REPORT_REASON_LABELS, ReportReason } from '@/src/types/moderation';
import { colors } from '@/src/theme/theme';
import ReportSheet from '../ReportSheet';

// Mock gesture handler (native module)
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => React.createElement(View, null, children),
    GestureDetector: ({ children }: any) => React.createElement(View, null, children),
    Gesture: {
      Pan: () => ({
        onChange: jest.fn().mockReturnThis(),
        onEnd: jest.fn().mockReturnThis(),
      }),
    },
  };
});

// Mock expo-blur
jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

// Mock TactileEngine
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: {
    selection: jest.fn(),
    mutate: jest.fn(),
    navigate: jest.fn(),
    destroy: jest.fn(),
  },
}));

// Mock reelToast
jest.mock('@/src/utils/reelToast', () => {
  const toast = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: toast };
});

// Mock auth store
const mockUser = { id: 'reporter-uuid-1234-5678-abcd', role: 'member' };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: jest.fn((selector: any) => selector({ user: mockUser })),
}));

// Mock report store
const mockSubmitReport = jest.fn().mockResolvedValue({ status: 'submitted' });
jest.mock('@/src/stores/reportStore', () => ({
  useReportStore: jest.fn((selector: any) =>
    selector({ submitReport: mockSubmitReport, isSubmitting: false })
  ),
}));

// Mock settings store
jest.mock('@/src/stores/settings', () => ({
  useSettingsStore: { getState: () => ({ tactileAudioEnabled: true }) },
}));

const defaultProps = {
  visible: true,
  contentType: 'log' as const,
  contentId: 'content-uuid-1234-5678-abcd',
  targetUserId: 'target-uuid-1234-5678-abcd',
  targetUsername: 'cinephile42',
  onDismiss: jest.fn(),
};

describe('ReportSheet', () => {
  beforeEach(() => {
    mockSubmitReport.mockClear();
    defaultProps.onDismiss = jest.fn();
  });

  describe('Reason chip single-selection behavior', () => {
    it('renders all 9 reason chips with radio role and unselected state', () => {
      const { getAllByRole } = render(<ReportSheet {...defaultProps} />);

      const chips = getAllByRole('radio');
      expect(chips).toHaveLength(9);

      // All chips start unselected
      chips.forEach((chip) => {
        expect(chip.props.accessibilityState.selected).toBe(false);
      });
    });

    it('each chip has correct accessibility label matching reason labels', () => {
      const { getAllByRole } = render(<ReportSheet {...defaultProps} />);

      const chips = getAllByRole('radio');
      const expectedLabels = (ReportReason.options as readonly string[]).map(
        (reason) => REPORT_REASON_LABELS[reason as keyof typeof REPORT_REASON_LABELS].label
      );

      chips.forEach((chip, index) => {
        expect(chip.props.accessibilityLabel).toBe(expectedLabels[index]);
      });
    });

    it('only one reason can be selected at a time: choosing a second lets go of the first', async () => {
      const { getAllByRole } = render(<ReportSheet {...defaultProps} />);
      const selected = () => getAllByRole('radio')
        .map((chip, i) => (chip.props.accessibilityState.selected ? i : -1))
        .filter((i) => i >= 0);

      await act(async () => { fireEvent.press(getAllByRole('radio')[0]); });
      expect(selected()).toEqual([0]);

      await act(async () => { fireEvent.press(getAllByRole('radio')[3]); });
      expect(selected()).toEqual([3]);
    });
  });

  describe('Submit button disabled state', () => {
    it('submit button is disabled when no reason is selected (initial state)', () => {
      const { getByLabelText } = render(<ReportSheet {...defaultProps} />);

      const submitButton = getByLabelText('File report');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('submit button exists with correct role and label', () => {
      const { getByLabelText } = render(<ReportSheet {...defaultProps} />);

      const submitButton = getByLabelText('File report');
      expect(submitButton.props.accessibilityRole).toBe('button');
    });
  });

  describe('"other" reason requires non-empty details', () => {
    it('ReportPayloadSchema rejects "other" reason with empty details', () => {
      const { ReportPayloadSchema } = require('@/src/types/moderation');

      const invalidPayload = {
        reporter_id: '550e8400-e29b-41d4-a716-446655440000',
        content_id: '550e8400-e29b-41d4-a716-446655440001',
        content_type: 'log',
        reason: 'other',
        details: '',
        target_user_id: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = ReportPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('ReportPayloadSchema accepts "other" reason with non-empty details', () => {
      const { ReportPayloadSchema } = require('@/src/types/moderation');

      const validPayload = {
        reporter_id: '550e8400-e29b-41d4-a716-446655440000',
        content_id: '550e8400-e29b-41d4-a716-446655440001',
        content_type: 'log',
        reason: 'other',
        details: 'This user is impersonating a director',
        target_user_id: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = ReportPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('ReportPayloadSchema rejects details over 500 characters', () => {
      const { ReportPayloadSchema } = require('@/src/types/moderation');

      const invalidPayload = {
        reporter_id: '550e8400-e29b-41d4-a716-446655440000',
        content_id: '550e8400-e29b-41d4-a716-446655440001',
        content_type: 'log',
        reason: 'harassment',
        details: 'x'.repeat(501),
        target_user_id: '550e8400-e29b-41d4-a716-446655440002',
      };

      const result = ReportPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('Character counter', () => {
    it('the details field stops at 500 characters, and its counter says so', async () => {
      // The field opens only once a reason is chosen.
      const { getAllByRole, getByLabelText, getByText } = render(<ReportSheet {...defaultProps} />);
      await act(async () => { fireEvent.press(getAllByRole('radio')[0]); });

      expect(getByLabelText('Additional details').props.maxLength).toBe(500);
      expect(getByText('0/500')).toBeTruthy();
    });

    it('the counter turns to crimson ink at 450 characters, and not before', async () => {
      const { getAllByRole, getByLabelText, getByText } = render(<ReportSheet {...defaultProps} />);
      await act(async () => { fireEvent.press(getAllByRole('radio')[0]); });
      const counterColor = (count: number) => StyleSheet.flatten(getByText(`${count}/500`).props.style).color;

      await act(async () => { fireEvent.changeText(getByLabelText('Additional details'), 'x'.repeat(449)); });
      expect(counterColor(449)).toBe(colors.fog);

      await act(async () => { fireEvent.changeText(getByLabelText('Additional details'), 'x'.repeat(450)); });
      expect(counterColor(450)).toBe(colors.crimsonInk);
    });
  });

  describe('Block toggle state management', () => {
    it('block toggle defaults to off in initial render', () => {
      const { getByLabelText } = render(<ReportSheet {...defaultProps} />);

      const blockToggle = getByLabelText(`Also block ${defaultProps.targetUsername}`);
      expect(blockToggle.props.value).toBe(false);
    });

    it('block toggle has correct accessibility label with target username', () => {
      const { getByLabelText } = render(<ReportSheet {...defaultProps} />);

      const blockToggle = getByLabelText(`Also block ${defaultProps.targetUsername}`);
      expect(blockToggle).toBeTruthy();
      expect(blockToggle.props.accessibilityLabel).toBe(
        `Also block ${defaultProps.targetUsername}`
      );
    });

    it('component does not render when visible=false', () => {
      const { queryByLabelText } = render(
        <ReportSheet {...defaultProps} visible={false} />
      );

      expect(queryByLabelText('File report')).toBeNull();
    });
  });
});
