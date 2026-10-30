/**
 * What the member opens low on a page with a docked bar is brought above the bar, once, and only
 * when the member opened it. On a short phone the abandoned film's reasons opened under the log
 * sheet's seal, and a tap meant for "Too Slow" landed on the seal (nightly narrowest run
 * 40847116101, film_log).
 */
import React from 'react';
import { render, fireEvent, renderHook, act } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { REVEAL_MARGIN, RevealAboveDock, revealBy, useRevealHost } from '../RevealAboveDock';
import LogIndexEntry from '@/src/components/log/LogIndexEntry';
import LogForm from '@/src/components/log/LogForm';
import { st } from '@/src/components/log/LogModalStyles';
import { useLogFlow } from '@/src/hooks/useLogFlow';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@/src/components/log/EditorialDesk', () => () => null);
jest.mock('@/src/components/log/AuteurToolkit', () => () => null);
jest.mock('@/src/components/NitrateCalendar', () => () => null);

const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 120 } } };

describe('revealBy: how far the scroll moves', () => {
  const view = { top: 50, height: 636 };
  it('moves nothing when what was opened ends above the bar', () => {
    expect(revealBy({ top: 300, height: 100 }, view, 80)).toBe(0);
    // Its foot exactly the margin above the bar's top edge (50 + 636 - 80 = 606).
    expect(revealBy({ top: 494, height: 100 }, view, 80)).toBe(0);
  });
  it('moves by exactly what the bar hides, and the margin', () => {
    expect(revealBy({ top: 700, height: 100 }, view, 80)).toBe(700 + 100 + REVEAL_MARGIN - 606);
    expect(revealBy({ top: 495, height: 100 }, view, 80)).toBe(1);
  });
  it('never takes the top of something taller than the room out of the view', () => {
    expect(revealBy({ top: 400, height: 2000 }, view, 80)).toBe(400 - 50 - REVEAL_MARGIN);
  });
});

describe('useRevealHost: the scroll moves from where it stands', () => {
  it('scrolls by the hidden part, from its own offset', async () => {
    const { result } = await renderHook(() => useRevealHost(80));
    const scrollTo = jest.fn();
    (result.current.scroller as any).current = { measureInWindow: (cb: any) => cb(0, 50, 300, 636), scrollTo };
    await act(async () => { result.current.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 40 } } } as any); });
    result.current.reveal({ measureInWindow: (cb: any) => cb(0, 700, 300, 100) } as any);
    expect(scrollTo.mock.calls).toEqual([[{ y: 40 + 206, animated: true }]]);
  });
  it('does not scroll for what is already in view', async () => {
    const { result } = await renderHook(() => useRevealHost(80));
    const scrollTo = jest.fn();
    (result.current.scroller as any).current = { measureInWindow: (cb: any) => cb(0, 50, 300, 636), scrollTo };
    result.current.reveal({ measureInWindow: (cb: any) => cb(0, 200, 300, 100) } as any);
    expect(scrollTo.mock.calls).toEqual([]);
  });
});

/** The body an index entry opens: the view that holds what it was given. */
const bodyOf = (view: ReturnType<typeof render>) => view.getByTestId('entry-body').parent!;

describe('an index entry the member opens', () => {
  function Entry({ open, onPress }: { open: boolean; onPress: () => void }) {
    return (
      <LogIndexEntry name="FILED" value="TODAY" open={open} onPress={onPress}>
        <React.Fragment><TestBody /></React.Fragment>
      </LogIndexEntry>
    );
  }
  const TestBody = () => { const { View } = require('react-native'); return <View testID="entry-body" />; };

  it('is revealed once, on the layout that follows the press', async () => {
    const reveal = jest.fn();
    const onPress = jest.fn();
    const view = render(<RevealAboveDock.Provider value={reveal}><Entry open={false} onPress={onPress} /></RevealAboveDock.Provider>);
    await fireEvent.press(view.getByLabelText('FILED, TODAY'));
    expect(onPress.mock.calls.length).toBe(1);
    await view.rerender(<RevealAboveDock.Provider value={reveal}><Entry open onPress={onPress} /></RevealAboveDock.Provider>);
    await fireEvent(bodyOf(view), 'layout', layout);
    await fireEvent(bodyOf(view), 'layout', layout);
    expect(reveal.mock.calls.length).toBe(1);
  });

  it('never moves the page for an entry that was open when the page drew', async () => {
    const reveal = jest.fn();
    const view = render(<RevealAboveDock.Provider value={reveal}><Entry open onPress={jest.fn()} /></RevealAboveDock.Provider>);
    await fireEvent(bodyOf(view), 'layout', layout);
    expect(reveal.mock.calls.length).toBe(0);
  });

  it('is not revealed when the press closes it', async () => {
    const reveal = jest.fn();
    const view = render(<RevealAboveDock.Provider value={reveal}><Entry open onPress={jest.fn()} /></RevealAboveDock.Provider>);
    await fireEvent.press(view.getByLabelText('FILED, TODAY'));
    await fireEvent(bodyOf(view), 'layout', layout);
    expect(reveal.mock.calls.length).toBe(0);
  });
});

describe("the abandoned film's reasons", () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '603', filmTitle: 'The Matrix', filmPoster: '/poster.jpg', filmYear: '1999' });
  });
  function Harness({ reveal }: { reveal: jest.Mock }) {
    const flow = useLogFlow();
    return <RevealAboveDock.Provider value={reveal}><LogForm flow={flow} user={null} /></RevealAboveDock.Provider>;
  }
  // The row that holds the reasons: from a reason, up to the view laid out as the row.
  type Found = ReturnType<ReturnType<typeof render>['getByLabelText']>;
  const reasonsRow = (view: ReturnType<typeof render>): Found => {
    let n: Found | null = view.getByLabelText('Too Slow');
    while (n && !(n.props.style === st.tagRow && typeof n.props.onLayout === 'function')) n = n.parent;
    if (!n) throw new Error('no reasons row');
    return n;
  };

  it('are revealed when the member chooses ABANDONED, and once', async () => {
    const reveal = jest.fn();
    const view = render(<Harness reveal={reveal} />);
    await fireEvent.press(view.getByLabelText('abandoned'));
    expect(view.getByText('Too Slow')).toBeTruthy();
    await fireEvent(reasonsRow(view), 'layout', layout);
    await fireEvent(reasonsRow(view), 'layout', layout);
    expect(reveal.mock.calls.length).toBe(1);
  });

  it('are not revealed again by choosing ABANDONED when it is already chosen', async () => {
    const reveal = jest.fn();
    const view = render(<Harness reveal={reveal} />);
    await fireEvent.press(view.getByLabelText('abandoned'));
    await fireEvent(reasonsRow(view), 'layout', layout);
    // Past PressableScale's 400 ms debounce, so the second press lands: counted as an opening,
    // it would reveal the row again on its next layout.
    await act(async () => { await new Promise((done) => setTimeout(done, 450)); });
    await fireEvent.press(view.getByLabelText('abandoned'));
    await fireEvent(reasonsRow(view), 'layout', layout);
    expect(reveal.mock.calls.length).toBe(1);
  });

  it('are revealed again when chosen anew after another verdict', async () => {
    const reveal = jest.fn();
    const view = render(<Harness reveal={reveal} />);
    await fireEvent.press(view.getByLabelText('abandoned'));
    await fireEvent(reasonsRow(view), 'layout', layout);
    await fireEvent.press(view.getByLabelText('watched'));
    expect(view.queryByText('Too Slow')).toBeNull();
    await act(async () => { await new Promise((done) => setTimeout(done, 450)); });
    await fireEvent.press(view.getByLabelText('abandoned'));
    await fireEvent(reasonsRow(view), 'layout', layout);
    expect(reveal.mock.calls.length).toBe(2);
  });
});
