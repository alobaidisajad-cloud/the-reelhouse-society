/**
 * aReportRisesOnceItsSheetIsGone.test.tsx — REPORT, pressed on an action sheet, opens the report
 * sheet only once the action sheet is gone.
 *
 * Each screen closed the action sheet and opened the report sheet in one breath: both Modals, the
 * first still falling for 250ms while the second was asked to rise. A Modal opened while another
 * is still on the screen is the iOS trap, and the report sheet never rose (review round 1,
 * 2026-11-14: the salon, the Dispatch, a log, a stack, a member's file, a log in a list). The
 * sheets themselves hold the report until they are gone, so no screen can open it early.
 */
import React, { act, useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ContentActionSheet } from '../ContentActionSheet';
import { ActionSheet } from '@/src/components/lounge/ActionSheet';
import { LogModerationHost, askAboutLog } from '../LogModerationHost';
import { SHEET_FALL_MS } from '@/src/hooks/useSheetPresence';
import { ARRIVAL_GRACE_MS } from '@/src/hooks/useArrival';

jest.mock('../ReportSheet', () => {
  const { Text: T } = require('react-native');
  return { __esModule: true, default: ({ visible, contentId }: { visible: boolean; contentId: string }) => (visible ? <T>{`reporting ${contentId}`}</T> : null) };
});

jest.mock('react-native-gesture-handler', () => {
  const ReactLocal = require('react');
  const RN = require('react-native');
  const pan: Record<string, unknown> = {};
  pan.onChange = () => pan;
  pan.onEnd = () => pan;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: (p: object) => ReactLocal.createElement(RN.View, p),
  };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** As each screen holds it: open until closed, its report sheet asked for by onReport. */
function Screen() {
  const [open, setOpen] = useState(true);
  const [reporting, setReporting] = useState(false);
  return (
    <>
      <ContentActionSheet
        visible={open}
        targetUserId="u2" targetUsername="kane" contentType="log" contentId="l1"
        onClose={() => setOpen(false)}
        onReport={() => { setOpen(false); setReporting(true); }}
        onBlock={() => setOpen(false)}
      />
      {reporting ? <Text>the report sheet</Text> : null}
    </>
  );
}

describe('the action sheet\'s REPORT', () => {
  it('closes the sheet, and asks for the report sheet only once it is gone', async () => {
    const r = render(<Screen />);
    await fireEvent.press(r.getByLabelText('Report kane to the Tribunal'));
    // Falling, the report sheet is not yet asked for.
    expect(r.queryByText('the report sheet')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(SHEET_FALL_MS + ARRIVAL_GRACE_MS + 10); });
    expect(r.getByText('the report sheet')).toBeTruthy();
    expect(r.queryByLabelText('Report kane to the Tribunal')).toBeNull();
  });

  it('in a salon, hands the message to report once the sheet is gone', async () => {
    const msg = { id: 'm1', user_id: 'u2', username: 'kane', content: 'Hello.', created_at: '2026-11-14T10:00:00.000Z' } as never;
    const reported: unknown[] = [];
    function Room() {
      const [open, setOpen] = useState(true);
      return (
        <ActionSheet
          visible={open} msg={open ? msg : null} isSelf={false} canReact canReply
          onClose={() => setOpen(false)} onReply={() => {}} onDelete={() => {}}
          onReport={(m) => reported.push(m)} onBlock={() => {}}
        />
      );
    }
    const r = render(<Room />);
    await fireEvent.press(r.getByText('REPORT MESSAGE'));
    expect(reported).toEqual([]);
    await act(async () => { jest.advanceTimersByTime(SHEET_FALL_MS + ARRIVAL_GRACE_MS + 10); });
    expect(reported).toEqual([msg]);
  });

  it('for a log in a list, reports the log the sheet was asked about, once the sheet is gone', async () => {
    const r = render(<LogModerationHost />);
    await act(async () => { askAboutLog({ logId: 'l9', userId: 'u2', username: 'kane' }); });
    await fireEvent.press(r.getByLabelText('Report kane to the Tribunal'));
    expect(r.queryByText('reporting l9')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(SHEET_FALL_MS + ARRIVAL_GRACE_MS + 10); });
    expect(r.getByText('reporting l9')).toBeTruthy();
  });
});
