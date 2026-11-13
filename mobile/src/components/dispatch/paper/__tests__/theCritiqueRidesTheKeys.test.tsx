/**
 * theCritiqueRidesTheKeys.test.tsx — a filing's critique composer stays on the keys while one is up.
 *
 * The composer is docked under the filing's page (app/dispatch/[id].tsx). The page's scroll adjusts
 * its own inset for the keyboard, which moves nothing beside it: on iOS the field and FILE stood
 * under the keyboard (the save-in-reach sweep, 2026-11-13). The composer now rises by the keyboard on
 * iOS; on Android the app's root already ends at the keyboard (KeyboardRoom), so it keeps its rest.
 */
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { CritiqueComposer } from '../PaperCritiques';

const was = Platform.OS;
const keyboard = { height: { value: 0 }, state: { value: 0 } };
const ME = { name: 'kane', memberNo: 42, tier: 'auteur', avatar: null } as never;

beforeEach(() => {
  keyboard.height.value = 0;
  (Reanimated.useAnimatedKeyboard as jest.Mock).mockImplementation(() => keyboard);
});
afterEach(() => {
  Platform.OS = was;
  (Reanimated.useAnimatedKeyboard as jest.Mock).mockReset();
});

type Node = { props: Record<string, unknown>; children: (Node | string)[] | null };

/** The composer's own foot (its root's paddingBottom), and whether FILE is drawn inside it. */
async function drawn() {
  const r = await render(<CritiqueComposer me={ME} value="Patient, not slow." bottomInset={44} />);
  const root = r.toJSON() as unknown as Node;
  const foot = (StyleSheet.flatten(root.props.style as never) as { paddingBottom?: number }).paddingBottom;
  const holds = JSON.stringify(root).includes('"FILE"');
  r.unmount();
  return { foot, holds };
}

it('on iOS, rises by the keyboard and the room above it, FILE with it', async () => {
  Platform.OS = 'ios';
  keyboard.height.value = 336;
  expect(await drawn()).toEqual({ foot: 346, holds: true });
});

it('on iOS with no keyboard, rests on its foot above the home indicator', async () => {
  Platform.OS = 'ios';
  expect(await drawn()).toEqual({ foot: 44, holds: true });
});

it('on Android, keeps its rest: the root already ends at the keyboard', async () => {
  Platform.OS = 'android';
  keyboard.height.value = 336;
  expect(await drawn()).toEqual({ foot: 44, holds: true });
});
