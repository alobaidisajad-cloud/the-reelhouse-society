/**
 * theGroundSpansTheWindow.test.tsx — on a window wider than the page, the house's ink reaches its edges.
 *
 * Every page stands in the reading column (READING_MAX, centred). The column was the navigator's
 * content style itself, so beyond it stood the screen's own ground, the system's: on the iPad
 * simulator (ios-launch 43460332274, the iPad's first photographs) a dark page on a white window,
 * and the sign-in sheet on a white card. The screen's content style is now the ink, the window's
 * whole width (SCREEN_GROUND); the page and its toast stand in the column inside it, drawn by the
 * layout every route is wrapped in (toastScreenLayout), presented or pushed alike.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { toastScreenLayout } from '@/src/components/ToastHost';
import { readingColumn } from '@/src/components/layout/navMetrics';
import { colors } from '@/src/theme/theme';

jest.mock('@/src/components/layout/E2ERouteMark', () => ({ E2ERouteMark: () => null }));

const nav = { isFocused: () => true, addListener: () => () => {} };

/** The style of the box the page is drawn in, as the route's layout wraps it. */
function pageBox(presentation?: string) {
  const r = render(<>{toastScreenLayout({ children: <Text>the page</Text>, navigation: nav, options: { presentation }, route: {}, theme: {} } as never)}</>);
  const page = r.getByText('the page');
  let at = page.parent;
  while (at && (StyleSheet.flatten(at.props.style) ?? {}).maxWidth === undefined) at = at.parent;
  const style = at ? StyleSheet.flatten(at.props.style) : null;
  r.unmount();
  return style;
}

it('draws a pushed page in the reading column', () => {
  expect(pageBox()).toEqual(readingColumn);
});

it('draws a presented page (a sheet, a modal) in the reading column too', () => {
  for (const presentation of ['modal', 'formSheet', 'transparentModal']) expect([presentation, pageBox(presentation)]).toEqual([presentation, readingColumn]);
});

it('gives every screen the ink from edge to edge, no column of its own', () => {
  const { SCREEN_GROUND } = jest.requireActual('@/app/_layout') as { SCREEN_GROUND: Record<string, unknown> };
  expect(SCREEN_GROUND).toEqual({ flex: 1, backgroundColor: colors.ink });
  const layout = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '_layout.tsx'), 'utf8');
  expect(layout).toMatch(/contentStyle: SCREEN_GROUND,/);
  expect(layout).not.toMatch(/contentStyle:[^\n]*readingColumn/);
});
