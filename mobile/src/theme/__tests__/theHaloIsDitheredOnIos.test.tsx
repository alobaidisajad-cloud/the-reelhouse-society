/**
 * theHaloIsDitheredOnIos.test.tsx — the candlelight halo, drawn smooth on both platforms.
 *
 * iOS draws a native gradient without dither: on the iPhone the halo above the sign-in seal held
 * one level of light for 12 to 40 px at a time, rings on the dark ground (ios-launch 43371370114),
 * where Android's was dithered (no run over 2 px). So iOS draws it in Skia, dithered, with the very
 * stops of the native gradient it replaces; Android keeps its native one.
 */
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

import { CandlelightHalo, candlelightImage } from '@/src/components/auth/AuthChrome';
import { rgbaOf } from '@/src/theme/light';
import { colors } from '@/src/theme/theme';

const was = Platform.OS;
afterEach(() => { Platform.OS = was; });

describe('on iOS', () => {
  it('draws the halo in Skia, dithered, with the native gradient’s own stops and circle', () => {
    Platform.OS = 'ios';
    const r = render(<CandlelightHalo size={180} intensity={0.38} />);
    const json = JSON.stringify(r.toJSON());
    const tree = r.toJSON() as { props: { testID: string; nativeID: string; style: { width: number } } };
    expect(tree.props.testID).toBe('candlelight-halo');
    // The native background it stands for, carried for the drawings, and no native gradient drawn.
    expect(tree.props.nativeID).toBe(candlelightImage(180, 0.38));
    expect(json).not.toMatch(/experimental_backgroundImage/);
    // The Skia elements, as the mock draws them (host elements carrying their props).
    type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] | null };
    const find = (n: Node | string | null, type: string): Node | null => {
      if (!n || typeof n === 'string') return null;
      if (n.type === type) return n;
      for (const c of n.children ?? []) { const hit = find(c, type); if (hit) return hit; }
      return null;
    };
    const rect = find(r.toJSON() as Node, 'SkiaRect');
    expect(rect?.props).toMatchObject({ x: 0, y: 0, width: 180, height: 180, dither: true });
    const gradient = find(r.toJSON() as Node, 'SkiaRadialGradient');
    expect(gradient?.props).toMatchObject({
      c: { x: 90, y: 90 }, r: 90, positions: [0, 0.42, 1],
      colors: [rgbaOf(colors.flicker, 0.38), rgbaOf(colors.sepia, 0.38 * 0.32), rgbaOf(colors.sepia, 0)],
    });
  });
});

describe('on Android', () => {
  it('keeps the native gradient, which Android draws dithered', () => {
    Platform.OS = 'android';
    const tree = render(<CandlelightHalo size={180} intensity={0.38} />).toJSON() as { props: { style: Record<string, unknown> } };
    expect(tree.props.style.experimental_backgroundImage).toBe(candlelightImage(180, 0.38));
  });
});
