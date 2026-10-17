/**
 * aCutLabelIsHeard.test.tsx — in the E2E build, the app's Text that may lose words by its own
 * settings (numberOfLines, adjustsFontSizeToFit) says `text.cut` once each time its laid-out
 * lines lose them (src/utils/cutText.ts), and its caller's onLayout and onTextLayout still run.
 * A Text that cannot cut itself, or one in any other build, adds no handler at all.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockTrace = jest.fn();
let mockE2E = true;
jest.mock('@/src/utils/e2eTrace', () => ({
  get E2E_BUILD() { return mockE2E; },
  e2eTrace: (...a: unknown[]) => mockTrace(...a),
}));

// eslint-disable-next-line import/first -- after the mock it reads
import { Text } from '../index';
// eslint-disable-next-line import/first -- after the mock, with the module it reads
import TextAncestorContext from 'react-native/Libraries/Text/TextAncestorContext';

const laid = (lines: { text: string; width?: number; height?: number }[]) => ({
  nativeEvent: { lines: lines.map((l) => ({ x: 0, y: 0, ascender: 0, descender: 0, capHeight: 0, xHeight: 0, width: l.width ?? 100, height: l.height ?? 20, text: l.text })) },
});
const boxed = (width: number, height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
const LABEL = 'FOUNDING MEMBER OF THE SOCIETY';

beforeEach(() => { mockTrace.mockClear(); mockE2E = true; });

it('says a label cut to one line, once, with its words and how it was cut, when its words laid out freely are longer than its box', async () => {
  const { getByText, getAllByText } = render(<Text numberOfLines={1}>{LABEL}</Text>);
  const t = getByText(LABEL);
  await fireEvent(t, 'layout', boxed(100, 20));
  await fireEvent(t, 'textLayout', laid([{ text: 'FOUNDING MEMBER OF' }]));
  // Not yet said: the twin, unseen, with no limit of lines and no width, is drawn to be asked.
  expect(mockTrace).not.toHaveBeenCalled();
  const twin = getAllByText(LABEL, { includeHiddenElements: true })[1];
  if (!twin) throw new Error('no twin was drawn');
  expect(twin.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ position: 'absolute', opacity: 0 })]));
  expect([twin.props.numberOfLines, twin.props.adjustsFontSizeToFit]).toEqual([undefined, undefined]);
  await fireEvent(twin, 'textLayout', laid([{ text: LABEL, width: 160 }]));
  await fireEvent(twin, 'textLayout', laid([{ text: LABEL, width: 160 }]));
  expect(mockTrace.mock.calls).toEqual([['text.cut', { words: LABEL, cut: 'ended early', lines: 1, numberOfLines: 1 }]]);
});

it('says nothing of a label Android reports cut that is no longer than its box, as at bold text (runs 39004285239, 39010071533)', async () => {
  const { getByText, getAllByText } = render(<Text numberOfLines={1}>{LABEL}</Text>);
  const t = getByText(LABEL);
  await fireEvent(t, 'layout', boxed(100, 20));
  await fireEvent(t, 'textLayout', laid([{ text: 'FOUNDING MEMBER OF THE' }]));
  const twin = getAllByText(LABEL, { includeHiddenElements: true })[1];
  if (!twin) throw new Error('no twin was drawn');
  await fireEvent(twin, 'textLayout', laid([{ text: LABEL, width: 100.6 }]));
  expect(mockTrace).not.toHaveBeenCalled();
});

it('measures a label that shrinks to fit at the smallest size it may shrink to', async () => {
  const shrinking = async (natural: number) => {
    mockTrace.mockClear();
    const { getByText, getAllByText, unmount } = render(<Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{LABEL}</Text>);
    await fireEvent(getByText(LABEL), 'layout', boxed(100, 20));
    await fireEvent(getByText(LABEL), 'textLayout', laid([{ text: 'FOUNDING' }]));
    const twin = getAllByText(LABEL, { includeHiddenElements: true })[1];
    if (!twin) throw new Error('no twin was drawn');
    await fireEvent(twin, 'textLayout', laid([{ text: LABEL, width: natural }]));
    const calls = mockTrace.mock.calls.length;
    unmount();
    return calls;
  };
  // 120 points at 0.8 is 96: it fits once shrunk. 140 at 0.8 is 112: cut even at its smallest.
  expect([await shrinking(120), await shrinking(140)]).toEqual([0, 1]);
});

it('watches no Text inside another, which has no box of its own', () => {
  // React Native's own Text says so through this context; jest's stand-in for it does not, so it is said here.
  const { getByText } = render(<TextAncestorContext value><Text numberOfLines={1}>{LABEL}</Text></TextAncestorContext>);
  const inner = getByText(LABEL);
  expect([inner.props.onTextLayout, inner.props.onLayout]).toEqual([undefined, undefined]);
});

it('says nothing of a label that shows every word, and says it again once it is cut anew', async () => {
  const { getByText } = render(<Text numberOfLines={2}>{LABEL}</Text>);
  const t = getByText(LABEL);
  await fireEvent(t, 'layout', boxed(100, 40));
  await fireEvent(t, 'textLayout', laid([{ text: 'FOUNDING MEMBER ' }, { text: 'OF THE SOCIETY' }]));
  expect(mockTrace).not.toHaveBeenCalled();
  await fireEvent(t, 'textLayout', laid([{ text: 'FOUNDING MEMBER ' }, { text: 'OF THE SOCIETY', width: 140 }]));
  expect(mockTrace.mock.calls).toEqual([['text.cut', { words: LABEL, cut: 'wider than its box', lines: 2, numberOfLines: 2 }]]);
});

it("runs its caller's own onLayout and onTextLayout", async () => {
  const onLayout = jest.fn();
  const onTextLayout = jest.fn();
  const { getByText } = render(<Text numberOfLines={1} onLayout={onLayout} onTextLayout={onTextLayout}>{LABEL}</Text>);
  const t = getByText(LABEL);
  await fireEvent(t, 'layout', boxed(100, 20));
  await fireEvent(t, 'textLayout', laid([{ text: LABEL }]));
  expect([onLayout.mock.calls.length, onTextLayout.mock.calls.length]).toEqual([1, 1]);
});

it('adds no handler to a Text that cannot cut itself, or in any other build', () => {
  const free = render(<Text>{LABEL}</Text>).getByText(LABEL);
  expect([free.props.onTextLayout, free.props.onLayout]).toEqual([undefined, undefined]);
  mockE2E = false;
  const shipped = render(<Text numberOfLines={1}>{LABEL}</Text>).getByText(LABEL);
  expect([shipped.props.onTextLayout, shipped.props.onLayout]).toEqual([undefined, undefined]);
});
