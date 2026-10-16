/**
 * aTabDrawsItsIconOnce.test.tsx — each tab's icon is drawn once, by its own
 * button (HapticTab), and no screen sets React Navigation's tabBarIcon.
 *
 * tabBarIcon draws every icon twice, stacked, and swaps their wrappers'
 * opacity between 0 and 1 on each change of tab. On Android a wrapper at 1 is
 * folded away and one at 0 is made again in the same update, and the update
 * lost the making: "Unable to find viewState for tag N", React destroyed, in
 * the Sealed E2E on each change of tab (the views in the crash were the two
 * copies of one tab's icon and dot).
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { HapticTab } from '../HapticTab';
import { MOBILE, readCode } from '@/test-utils/readCode';
import { join, relative } from 'path';
import { files as universe } from '@/test-utils/universe';

const Tab = createBottomTabNavigator();
const Page = () => <Text>page</Text>;
const mark = (name: string) => (focused: boolean) => <Text testID={`icon-${name}`}>{focused ? 'chosen' : 'not'}</Text>;

/** Two tabs, their icons given the way `how` says. */
function Bar({ how }: { how: 'tabBarIcon' | 'button' }) {
  const opts = (name: string) => (how === 'tabBarIcon'
    ? { tabBarIcon: ({ focused }: { focused: boolean }) => mark(name)(focused), tabBarButtonTestID: `${name}-tab` }
    : { tabBarButton: (p: BottomTabBarButtonProps) => <HapticTab {...p} icon={mark(name)} />, tabBarButtonTestID: `${name}-tab` });
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ tabBarShowLabel: false, tabBarButton: HapticTab }}>
        <Tab.Screen name="lobby" component={Page} options={opts('lobby')} />
        <Tab.Screen name="darkroom" component={Page} options={opts('darkroom')} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const copies = (r: ReturnType<typeof render>, name: string) =>
  r.queryAllByTestId(`icon-${name}`, { includeHiddenElements: true }).map((n) => n.props.children);

describe('a tab draws its icon once', () => {
  it('tabBarIcon would draw each icon twice, chosen and not, stacked (the danger, shown)', () => {
    const r = render(<Bar how="tabBarIcon" />);
    expect(copies(r, 'lobby').sort()).toEqual(['chosen', 'not']);
    expect(copies(r, 'darkroom').sort()).toEqual(['chosen', 'not']);
  });

  it('the button draws one, chosen as its tab is, before and after a change of tab', async () => {
    const r = render(<Bar how="button" />);
    expect([copies(r, 'lobby'), copies(r, 'darkroom')]).toEqual([['chosen'], ['not']]);
    await act(async () => { await fireEvent.press(r.getByTestId('darkroom-tab')); });
    expect([copies(r, 'lobby'), copies(r, 'darkroom')]).toEqual([['not'], ['chosen']]);
  });
});

describe('no screen sets tabBarIcon', () => {
  const files = universe('appCode');
  const setsIt = (code: string) => /\btabBarIcon\s*:/.test(code);

  it('in any file of the app (comments aside)', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.filter((f) => setsIt(readCode(f))).map((f) => relative(MOBILE, f))).toEqual([]);
  });

  it('the finder says NO to one that does', () => {
    expect(setsIt("options={{ title: 'Lobby', tabBarIcon: renderLobbyIcon }}")).toBe(true);
    expect(setsIt('// tabBarIcon: renderLobbyIcon')).toBe(true);
    expect(setsIt(readCode(join(MOBILE, 'src', 'components', 'HapticTab.tsx')))).toBe(false);
  });

  it('every tab the bar shows has its own button, with its icon', () => {
    const layout = readCode(join(MOBILE, 'app', '(tabs)', '_layout.tsx'));
    const shown = [...layout.matchAll(/<Tabs\.Screen\s+name="(\w+)"\s+options=\{\{([\s\S]*?)\}\}\s*\/>/g)]
      .filter((m) => !/href:\s*null/.test(m[2]));
    expect(shown.map((m) => m[1])).toEqual(['dispatch', 'reels', 'index', 'darkroom', 'profile']);
    for (const m of shown) expect(m[2]).toMatch(/tabBarButton:\s*\w+Button,/);
  });
});
