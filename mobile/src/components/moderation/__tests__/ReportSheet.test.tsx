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
    // As the real ones draw: the root keeps its style, and a detector draws no view of its own
    // (a stand-in View between the frame and the sheet held the sheet's height in a capture).
    GestureHandlerRootView: ({ children, style }: any) => React.createElement(View, { style }, children),
    GestureDetector: ({ children }: any) => children,
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
      // Named by both lines it shows: what the reason is, then what it means.
      const expectedLabels = (ReportReason.options as readonly string[]).map((reason) => {
        const { label, sublabel } = REPORT_REASON_LABELS[reason as keyof typeof REPORT_REASON_LABELS];
        return `${label}. ${sublabel}`;
      });

      chips.forEach((chip, index) => {
        expect(chip.props.accessibilityLabel).toBe(expectedLabels[index]);
      });
    });

    it('only one reason can be selected at a time: choosing a second lets go of the first', async () => {
      const { getAllByRole } = render(<ReportSheet {...defaultProps} />);
      const selected = () => getAllByRole('radio')
        .map((chip, i) => (chip.props.accessibilityState.selected ? i : -1))
        .filter((i) => i >= 0);

      await act(async () => { await fireEvent.press(getAllByRole('radio')[0]); });
      expect(selected()).toEqual([0]);

      await act(async () => { await fireEvent.press(getAllByRole('radio')[3]); });
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

  // P4.39: the refusal is said under the details, with them, and the member is sent there.
  describe('"other" with no description, pressed', () => {
    it('says why under the details, in their hint, focuses them, and files nothing; described, the reason goes', async () => {
      const { AccessibilityInfo } = require('react-native');
      jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear();
      const r = render(<ReportSheet {...defaultProps} />);
      await act(async () => { await fireEvent.press(r.getByLabelText(/^OTHER\./)); });
      await act(async () => { await fireEvent.press(r.getByLabelText('File report')); });
      expect(mockSubmitReport).not.toHaveBeenCalled();
      expect(r.getByText('Please describe the infraction.')).toBeTruthy();
      expect(r.getByLabelText('Additional details').props.accessibilityHint).toBe('Please describe the infraction.');
      expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
      await act(async () => { await fireEvent.changeText(r.getByLabelText('Additional details'), 'A stolen review.'); });
      expect(r.queryByText('Please describe the infraction.')).toBeNull();
      expect(r.getByLabelText('Additional details').props.accessibilityHint).toBe('Describe the infraction in more detail');
    });
  });

  describe('Character counter', () => {
    it('the details field stops at 500 characters, and its counter says so', async () => {
      // The field opens only once a reason is chosen.
      const { getAllByRole, getByLabelText, getByText } = render(<ReportSheet {...defaultProps} />);
      await act(async () => { await fireEvent.press(getAllByRole('radio')[0]); });

      expect(getByLabelText('Additional details').props.maxLength).toBe(500);
      expect(getByText('0/500')).toBeTruthy();
    });

    it('the counter turns to crimson ink at 450 characters, and not before', async () => {
      const { getAllByRole, getByLabelText, getByText } = render(<ReportSheet {...defaultProps} />);
      await act(async () => { await fireEvent.press(getAllByRole('radio')[0]); });
      const counterColor = (count: number) => StyleSheet.flatten(getByText(`${count}/500`).props.style).color;

      await act(async () => { await fireEvent.changeText(getByLabelText('Additional details'), 'x'.repeat(449)); });
      expect(counterColor(449)).toBe(colors.fog);

      await act(async () => { await fireEvent.changeText(getByLabelText('Additional details'), 'x'.repeat(450)); });
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
      const { queryByLabelText, getByLabelText, rerender } = render(
        <ReportSheet {...defaultProps} visible={false} />
      );

      expect(queryByLabelText('File report')).toBeNull();
      // And the same ask finds it once it is shown: the absence was the sheet's.
      rerender(<ReportSheet {...defaultProps} visible />);
      expect(getByLabelText('File report')).toBeTruthy();
    });
  });
});

// ── Round 14: the sheet rises with the keys and keeps its room ──────────────
describe('ReportSheet with the keyboard up', () => {
  type Handler = (e?: unknown) => void;
  let listeners: Record<string, Handler[]>;
  const { Keyboard, Platform, ScrollView } = jest.requireActual('react-native') as typeof import('react-native');
  const { overlayTop, SHEET_BOTTOM_GAP } = jest.requireActual('@/src/components/layout/navMetrics') as typeof import('@/src/components/layout/navMetrics');
  const was = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'ios';
    listeners = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
      (listeners[event] ??= []).push(fn);
      return { remove: () => { listeners[event] = (listeners[event] ?? []).filter((x) => x !== fn); } };
    }) as never);
  });
  afterEach(() => {
    Platform.OS = was;
    jest.restoreAllMocks();
  });
  /** The keys rise to `height`, and the sheet is drawn again (the jest Reanimated draws a style as it renders). */
  const keysUp = async (r: ReturnType<typeof render>, height: number) => {
    await act(async () => {
      (listeners.keyboardWillShow ?? []).forEach((fn) => fn({ duration: 250, endCoordinates: { height, screenY: 0, screenX: 0, width: 0 } }));
    });
    await act(async () => { r.rerender(<ReportSheet {...defaultProps} />); });
  };
  type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
  const all = (n: Node | string | null, out: Node[] = []): Node[] => {
    if (!n || typeof n === 'string') return out;
    out.push(n);
    n.children?.forEach((c) => all(c, out));
    return out;
  };
  const tree = (r: ReturnType<typeof render>) => [r.toJSON() as unknown as Node | Node[]].flat().flatMap((n) => all(n));
  const styleOf = (n: Node) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;

  it('the keys lift the whole sheet, which keeps its height and stops below the status bar', async () => {
    // A reason chosen, so the details field stands in the form; the keys an iPad shows with its
    // prediction bar (400pt). On the shortest large window, 841x701, the form had 48pt left for its
    // 80pt field: CI measures the sheet with the keys up at every width (zz-sheets.gen, layout.cjs's
    // field-taller-than-its-scroll CUT); this holds the shape that makes the room.
    const r = render(<ReportSheet {...defaultProps} />);
    await act(async () => { await fireEvent.press(r.getAllByRole('radio')[2]!); });
    await keysUp(r, 400);
    const frameNode = tree(r).find((n) => n.props.testID === 'report-frame');
    expect(frameNode).toBeDefined();
    const frame = styleOf(frameNode!);
    // the frame runs from below the status bar to the foot, and the keys pad its foot
    expect(frame.top).toBe(overlayTop(0));
    expect(frame.bottom).toBe(0);
    expect(frame.paddingBottom).toBe(400);
    expect(frame.justifyContent).toBe('flex-end');
    // the sheet inside keeps its own height and foot: the keys come out of the frame, not the form
    const sheet = all(frameNode!).find((n) => n !== frameNode && styleOf(n).borderTopLeftRadius === 16);
    expect(sheet).toBeDefined();
    // on iOS the keys cover the home indicator: the foot is the sheet's own gap alone
    expect(styleOf(sheet!).paddingBottom).toBe(SHEET_BOTTOM_GAP);
    expect(styleOf(sheet!).flexShrink).toBe(1);
    expect(typeof styleOf(sheet!).height).toBe('number');
  });

  it('typing the details where the room is short, the field is kept in view', async () => {
    const r = render(<ReportSheet {...defaultProps} />);
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: (o: unknown) => void }, 'scrollTo');
    await act(async () => { await fireEvent.press(r.getAllByRole('radio')[2]!); });
    // the details stand 520pt down the form
    const box = tree(r).find((n) => typeof n.props.onLayout === 'function' && all(n).some((m) => m.props.accessibilityLabel === 'Additional details')
      && !all(n).some((m) => m.props.accessibilityLabel === 'File report'));
    expect(box).toBeDefined();
    await act(async () => { (box!.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 520, width: 340, height: 120 } } }); });
    await act(async () => { await fireEvent(r.getByLabelText('Additional details'), 'focus'); });
    await keysUp(r, 400);
    const form = tree(r).find((n) => typeof n.props.onLayout === 'function' && n.props.keyboardShouldPersistTaps === 'handled');
    expect(form).toBeDefined();
    await act(async () => { (form!.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 230 } } }); });
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 508, animated: false });
  });
});
