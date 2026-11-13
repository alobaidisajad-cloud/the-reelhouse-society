/**
 * logSealBar.test.tsx — the act this page exists for.
 *
 * The seal lives outside LogForm (it is docked to the modal, a sibling of the
 * scroll), so the composer's own render tests never touch it. It had never been
 * mounted at all.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import LogSealBar from '../LogSealBar';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});

const base: React.ComponentProps<typeof LogSealBar> = {
  status: 'watched',
  rating: 0,
  review: '',
  abandonedReason: '',
  date: '2026-08-16',
  watchedWith: '',
  physicalMedia: 'None',
  submitting: false,
  sealed: false,
  isEditing: false,
  onSeal: jest.fn(),
};

const bar = (over: Partial<React.ComponentProps<typeof LogSealBar>> = {}) => render(<LogSealBar {...base} {...over} />);

describe('it says what it wants, instead of throwing an error', () => {
  it('asks for a verdict or a few words when it has neither', () => {
    expect(bar().getByText(/A VERDICT, OR A FEW WORDS/)).toBeTruthy();
  });

  it('asks the right question of a film you walked out of', () => {
    const r = bar({ status: 'abandoned' as const, abandonedReason: '' });
    expect(r.getByText(/WHY DID YOU STOP\?/)).toBeTruthy();
    expect(r.queryByText(/A VERDICT/)).toBeNull();
  });

  it('a rating alone is enough', () => {
    expect(bar({ rating: 4 }).queryByText(/A VERDICT, OR A FEW WORDS/)).toBeNull();
  });

  it('so are a few words with no rating', () => {
    // The record does not require a score — a critique alone can seal it.
    expect(bar({ review: 'Rain on the window all night.' }).queryByText(/A VERDICT/)).toBeNull();
  });
});

describe('the line is the record’s own filing mark', () => {
  it('shows what will actually be filed', () => {
    const r = bar({ rating: 4, watchedWith: 'yusuf', physicalMedia: '4K UHD' });
    const line = String(r.getByText(/^FILED/).props.children);
    expect(line).toContain('AUG 16, 2026');
    expect(line).toContain('WITH YUSUF');
    expect(line).toContain('4K UHD');
  });

  it('never announces the composer’s "None" as a format', () => {
    const r = bar({ rating: 4, physicalMedia: 'None' });
    expect(r.getByTestId('submit-log-button')).toBeTruthy(); // the bar is drawn
    expect(r.queryByText(/NONE/)).toBeNull();
  });

  it('never prints a bare "FILED ·" with nothing after it', () => {
    // An unreadable date leaves the mark empty. The label must go with it
    // rather than trailing a separator into nothing.
    const r = bar({ rating: 4, date: 'whenever' });
    const filed = r.queryByText(/FILED/);
    if (filed) {
      expect(String(filed.props.children).replace(/,/g, '')).not.toMatch(/FILED\s*·\s*$/);
    }
    expect(r.queryByText('whenever')).toBeNull();
  });
});

describe('the press', () => {
  it('reads its own reason aloud when it is dim', () => {
    // accessibilityLiveRegion is Android-only, so the reason travels in the
    // label — a button that says "Seal the record" and does nothing is a dead
    // end for anyone who cannot see that it is dim.
    const label = bar().getByTestId('submit-log-button').props.accessibilityLabel;
    expect(label).toMatch(/Seal the record/i);
    expect(label).toMatch(/rating or critique/i);
  });

  it('says only its name once the record is worth sealing', () => {
    const label = bar({ rating: 4 }).getByTestId('submit-log-button').props.accessibilityLabel;
    expect(label).toBe('SEAL THE RECORD');
  });

  it('still answers while dim, so nobody taps a control that ignores them', async () => {
    const onSeal = jest.fn();
    await fireEvent.press(bar({ onSeal }).getByTestId('submit-log-button'));
    expect(onSeal).toHaveBeenCalled();
  });

  it('will not fire twice while a record is being filed', async () => {
    const onSeal = jest.fn();
    await fireEvent.press(bar({ onSeal, submitting: true, rating: 4 }).getByTestId('submit-log-button'));
    expect(onSeal).not.toHaveBeenCalled();
  });

  it('names the act for what it is', () => {
    expect(bar({ rating: 4 }).getByText('SEAL THE RECORD')).toBeTruthy();
    expect(bar({ rating: 4, isEditing: true }).getByText('RESEAL THE RECORD')).toBeTruthy();
    expect(bar({ rating: 4, submitting: true }).getByText('SEALING RECORD…')).toBeTruthy();
    expect(bar({ rating: 4, sealed: true }).getByText('✦ RECORD SEALED')).toBeTruthy();
  });
});

describe('while the member writes', () => {
  // A keyboard up, as Reanimated reports it on the UI thread: the reaction answers at once.
  const Reanimated = jest.requireMock('react-native-reanimated');
  const typing = (height: number) => {
    (Reanimated.useAnimatedKeyboard as jest.Mock).mockImplementation(() => ({ height: { value: height }, state: { value: height > 0 ? 2 : 0 } }));
    (Reanimated.useAnimatedReaction as jest.Mock).mockImplementation((prepare: () => unknown, react: (n: unknown, b: unknown) => void) => {
      require('react').useEffect(() => { react(prepare(), false); }, []);
    });
  };
  afterEach(() => {
    (Reanimated.useAnimatedKeyboard as jest.Mock).mockImplementation(() => ({ height: { value: 0 }, state: { value: 0 } }));
    (Reanimated.useAnimatedReaction as jest.Mock).mockImplementation(() => undefined);
  });

  it('keeps the press on the keys, so the record is sealed without putting the keyboard away', async () => {
    typing(300);
    const onSeal = jest.fn();
    const r = bar({ rating: 4, onSeal });
    // The press stays, named, and answers (it slid away once: Sealed E2E 43242130602).
    expect(r.getByText('SEAL THE RECORD')).toBeTruthy();
    await fireEvent.press(r.getByTestId('submit-log-button'));
    expect(onSeal).toHaveBeenCalled();
    // The filing line waits for the keyboard to go: the bar is the press alone.
    expect(r.queryByText(/^FILED ·/)).toBeNull();
    // Drawn, not merely mounted: the bar (the press's outermost holder) is neither faded out nor
    // pushed down past the keys, as it was when it slid away.
    const { StyleSheet } = jest.requireActual('react-native');
    let node = r.getByTestId('submit-log-button').parent;
    let style: Record<string, unknown> = {};
    while (node) { if (node.props?.style) style = StyleSheet.flatten(node.props.style) ?? style; node = node.parent; }
    expect(style.opacity ?? 1).toBe(1);
    const down = ((style.transform as { translateY?: number }[] | undefined) ?? []).reduce((y, t) => y + (t.translateY ?? 0), 0);
    expect(down).toBeLessThanOrEqual(0);
  });

  it('says on the press itself what is wanted, while the record is not yet worth sealing', () => {
    typing(300);
    // The filing line is gone while writing, so the dim press says it (the drawing shown to the owner).
    expect(bar().getByText('A VERDICT, OR A FEW WORDS')).toBeTruthy();
    expect(bar({ status: 'abandoned' }).getByText('WHY DID YOU STOP?')).toBeTruthy();
    // Worth sealing, it names the act; and a screen reader hears the act and the reason either way.
    expect(bar({ rating: 4 }).getByText('SEAL THE RECORD')).toBeTruthy();
    expect(bar().getByTestId('submit-log-button').props.accessibilityLabel).toMatch(/^SEAL THE RECORD\. /);
  });

  // What is read on a control is in its name (the captures' UNSAID check, God-Tier 43460339159): the
  // press showing "A VERDICT, OR A FEW WORDS" was heard as the act and the reason, never those words.
  it('says aloud the words the press shows while it asks for more, after the act', () => {
    typing(300);
    expect(bar().getByTestId('submit-log-button').props.accessibilityLabel)
      .toMatch(/^SEAL THE RECORD\. A VERDICT, OR A FEW WORDS\. /);
    expect(bar({ status: 'abandoned' }).getByTestId('submit-log-button').props.accessibilityLabel)
      .toMatch(/^SEAL THE RECORD\. WHY DID YOU STOP\? [A-Z]/);
    typing(0);
    expect(bar().getByTestId('submit-log-button').props.accessibilityLabel).not.toMatch(/A VERDICT, OR A FEW WORDS/);
  });

  it('gives the filing line back when the keyboard goes', () => {
    typing(0);
    expect(bar({ rating: 4 }).getByText(/^FILED ·/)).toBeTruthy();
  });
});
