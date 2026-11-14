/**
 * The scrollbar over everything the screen draws, on both platforms. Android stacks siblings by
 * elevation before zIndex: at zIndex 999 but elevation 3 (its glow), the person page's veil
 * (elevation 90) was drawn over the thumb on Android alone, where its track runs under the veil.
 */
import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { render } from '@testing-library/react-native';
import { CinematicScrollbar, SCROLLBAR_STANDS } from '../CinematicScrollbar';

const flat = (s: unknown) => (StyleSheet.flatten(s as ViewStyle) ?? {}) as ViewStyle;

function Bar() {
  const scrollY = useSharedValue(0);
  const scrollHeight = useSharedValue(2000);
  const viewHeight = useSharedValue(800);
  const isScrolling = useSharedValue(true);
  return <CinematicScrollbar scrollY={scrollY} scrollHeight={scrollHeight} viewHeight={viewHeight} isScrolling={isScrolling} topInset={60} />;
}

describe('the scrollbar', () => {
  it('stands over the page by its elevation as by its zIndex, and glows from the thumb inside', () => {
    const tree = render(<Bar />).toJSON() as unknown as { props: { style: unknown }; children: { props: { style: unknown } }[] };
    const stand = flat(tree.props.style);
    expect(stand).toMatchObject({ position: 'absolute', zIndex: SCROLLBAR_STANDS, elevation: SCROLLBAR_STANDS });
    // It draws nothing itself, so Android casts no shadow from its elevation.
    expect(stand).not.toHaveProperty('backgroundColor');
    expect(stand).not.toHaveProperty('shadowColor');
    expect(SCROLLBAR_STANDS).toBeGreaterThan(90);
    expect(tree.children).toHaveLength(1);
    const thumb = flat(tree.children.find(() => true)?.props.style);
    expect(thumb).toMatchObject({ elevation: 3, borderRadius: 2.5 });
    expect(thumb.backgroundColor).toBeTruthy();
  });
});
