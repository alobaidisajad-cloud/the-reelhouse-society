/**
 * PressableScale's touch weight — a control a slip on costs something is 48 a side, and not a
 * pixel of it moves (DECISIONS 4.4).
 *
 * The box a finger, VoiceOver and TalkBack read grows by padding, and gives the growth back in
 * margin. A control that draws on its box (a fill, a border) keeps that drawing on an inner box at
 * its own size. These pin the sum the phone does once the control is measured, and the drawing does
 * after layout (mockups/tools/harness.cjs).
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { act, render } from '@testing-library/react-native';
import PressableScale, { grownFor, touchAxes } from '../PressableScale';

const flat = (s: unknown) => (StyleSheet.flatten(s as ViewStyle) ?? {}) as ViewStyle;

describe('grownFor: the sum', () => {
  it('grows a sized control by half its shortfall on each side, and takes the same back from its margin', () => {
    const g = grownFor({ width: 20, height: 30, marginLeft: 8 }, null)!;
    expect(g.by).toEqual({ Horizontal: 14, Vertical: 9 });
    expect(g.outer).toMatchObject({
      width: 48, height: 48, paddingLeft: 14, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
      marginLeft: -6, marginRight: -14, marginTop: -9, marginBottom: -9,
    });
    expect(g.inner).toBeNull();
  });

  it('adds the growth to a padding the control already has', () => {
    expect(grownFor({ paddingHorizontal: 6 }, { w: 40, h: 12 })!.outer).toMatchObject({ paddingLeft: 10, paddingTop: 18 });
  });

  it('grows nothing it has not measured, then exactly what it measured', () => {
    expect(grownFor({}, null)!.by).toEqual({ Horizontal: 0, Vertical: 0 });
    expect(grownFor({}, null)!.at).toEqual({ Horizontal: false, Vertical: false });
    expect(grownFor({}, { w: 40, h: 12 })!.by).toEqual({ Horizontal: 4, Vertical: 18 });
    expect(grownFor({}, { w: 120, h: 52 })!.by).toEqual({ Horizontal: 0, Vertical: 0 });
  });

  it('a minimum the style names grows with the padding, or the box would not grow at all', () => {
    expect(grownFor({ minWidth: 44, minHeight: 44 }, { w: 44, h: 44 })!.outer).toMatchObject({
      minWidth: 48, minHeight: 48, paddingTop: 2, marginTop: -2, paddingLeft: 2, marginLeft: -2,
    });
  });

  it('a control already 48 by its style is left as it is', () => {
    expect(grownFor({ width: 48, height: 48 }, null)).toBeNull();
    expect(grownFor({ minHeight: 48 }, { w: 30, h: 50 })!.by).toEqual({ Horizontal: 9, Vertical: 0 });
  });

  it('keeps a drawn ground on the inner box, at its own size, and only placing on the outer', () => {
    const g = grownFor({ backgroundColor: 'red', borderWidth: 1, padding: 6, width: 30, height: 20, position: 'absolute', top: 4, alignSelf: 'center' }, null)!;
    expect(g.inner).toMatchObject({ backgroundColor: 'red', borderWidth: 1, paddingTop: 6, width: 30, height: 20 });
    expect(g.outer).toMatchObject({ position: 'absolute', top: 4, alignSelf: 'center', paddingTop: 14, marginTop: -14, paddingLeft: 9 });
    expect(g.outer).not.toHaveProperty('backgroundColor');
    expect(g.outer).not.toHaveProperty('width');
    expect(g.inner).not.toHaveProperty('position');
  });
});

describe('touchAxes: where growth has nowhere to come from', () => {
  it('not an axis with a margin that is not a number', () => {
    expect(touchAxes({ marginLeft: 'auto' })).toEqual({ Vertical: true, Horizontal: false });
  });
  it('not an axis sized as a share of the parent', () => {
    expect(touchAxes({ width: '50%' })).toEqual({ Vertical: true, Horizontal: false });
  });
  it('not an axis already at the floor', () => {
    expect(touchAxes({ minHeight: 48, width: 60 })).toEqual({ Vertical: false, Horizontal: false });
  });
});

describe('a weighted control on the phone', () => {
  it('grows to the floor once it is laid out, its own padding kept, and its halo goes', async () => {
    const api = render(
      <View>
        <PressableScale testID="it" touch="destructive" style={{ paddingHorizontal: 6 }} accessibilityLabel="Delete stack" onPress={() => {}}>
          <Text>DELETE</Text>
        </PressableScale>
      </View>,
    );
    expect(api.getByTestId('it').props.hitSlop).toEqual({ top: 15, bottom: 15, left: 15, right: 15 });
    // As laid out before it grew: its content and its own padding.
    await act(async () => { api.getByTestId('it').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 72, height: 14 } } }); });
    expect(flat(api.getByTestId('it').props.style)).toMatchObject({ paddingTop: 17, paddingBottom: 17, marginTop: -17, marginBottom: -17, paddingLeft: 6 });
    expect(api.getByTestId('it').props.hitSlop).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    // Laid out again at its new size, it stays as it is: the growth is not counted as content.
    await act(async () => { api.getByTestId('it').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 72, height: 48 } } }); });
    expect(flat(api.getByTestId('it').props.style)).toMatchObject({ paddingTop: 17, marginTop: -17 });
  });

  it('a box its parent holds is not grown again on a measure its own growth shrank', async () => {
    const api = render(
      <View>
        <PressableScale testID="held" touch="wayOut" accessibilityLabel="Go back" onPress={() => {}}><Text>BACK</Text></PressableScale>
      </View>,
    );
    const lay = (width: number, height: number) => act(async () => {
      api.getByTestId('held').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    });
    await lay(60, 14);
    expect(flat(api.getByTestId('held').props.style)).toMatchObject({ paddingTop: 17 });
    // Laid out again at the same 14: its parent did not let it grow. It stays as it is.
    await lay(60, 14);
    await lay(60, 14);
    expect(flat(api.getByTestId('held').props.style)).toMatchObject({ paddingTop: 17, marginTop: -17 });
  });

  it('given room one way, it grows that way only, and its own halo goes on that axis alone', async () => {
    const api = render(
      <View>
        <PressableScale testID="logo" room="vertical" hitSlop={5} style={{ width: 38, height: 38 }} accessibilityLabel="JW. Opens JustWatch" onPress={() => {}}>
          <Text>JW</Text>
        </PressableScale>
      </View>,
    );
    expect(flat(api.getByTestId('logo').props.style)).toMatchObject({ height: 48, width: 38, paddingTop: 5, marginTop: -5, paddingLeft: 0 });
    expect(api.getByTestId('logo').props.hitSlop).toEqual({ top: 0, bottom: 0, left: 5, right: 5 });
  });

  it('a control without a weight is drawn as it always was, and does not measure itself', () => {
    const api = render(<PressableScale testID="plain" style={{ padding: 4 }} accessibilityLabel="More" onPress={() => {}}><Text>…</Text></PressableScale>);
    expect(flat(api.getByTestId('plain').props.style)).toMatchObject({ padding: 4 });
    expect(api.getByTestId('plain').props.onLayout).toBeUndefined();
  });
});
