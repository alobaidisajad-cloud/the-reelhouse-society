/**
 * PleaseUpdate — the whole app, for a build under the house's floor (src/lib/houseFloor.ts).
 *
 * Nothing else is drawn: the build is one the house no longer runs. One act, the store's own
 * page for the app; the phone's store does the rest.
 */
import React from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { MasterLogo } from '@/src/components/MasterLogo';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { StateWords } from '@/src/components/EmptyStates';
import { colors, fonts } from '@/src/theme/theme';
import { useBottomEdge, useOverlayTop } from '@/src/components/layout/navMetrics';
import { useBelowFloor } from '@/src/hooks/useBelowFloor';

/** The app's own page in each store: the store app's address first, its web page if that will not open. */
export const STORE_LISTING = Platform.OS === 'ios'
  ? { app: 'itms-apps://apps.apple.com/app/id6773105964', web: 'https://apps.apple.com/app/id6773105964' }
  : { app: 'market://details?id=com.reelhouse.society', web: 'https://play.google.com/store/apps/details?id=com.reelhouse.society' };

export async function openStoreListing(): Promise<void> {
  try {
    await Linking.openURL(STORE_LISTING.app);
  } catch {
    await Linking.openURL(STORE_LISTING.web).catch(() => { /* no store on this phone: the words still say what to do */ });
  }
}

export function PleaseUpdate() {
  // The whole screen, drawn before any route: an overlay's top, the home indicator's edge below.
  const top = useOverlayTop(false);
  const foot = useBottomEdge();
  return (
    <View style={[s.page, { paddingTop: top, paddingBottom: foot }]}>
      <RoomLight room="default" />
      <MasterLogo size={64} />
      <View style={s.words}>
        <StateWords
          title="A Newer Reel Is Showing"
          subtitle="This copy of the House is no longer projected. The newest one is waiting in the store: update, and take your seat again."
        />
      </View>
      <PressableScale style={s.act} onPress={() => { void openStoreListing(); }} haptic="medium" hitSlop={null}
        accessibilityRole="button" accessibilityLabel="Update the app. Opens the store.">
        <Text style={s.actText}>✦ UPDATE THE APP</Text>
      </PressableScale>
    </View>
  );
}

/**
 * The root, behind the floor: a build under it draws PleaseUpdate alone, laid out as the app's
 * first screen would be (its layout ends the splash); any other build draws the app.
 */
export function FloorGate({ children, onLayout }: { children: React.ReactNode; onLayout: () => void }) {
  const below = useBelowFloor();
  if (!below) return <>{children}</>;
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={s.root} onLayout={onLayout}>
        <PleaseUpdate />
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  page: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  words: { alignItems: 'center', marginTop: 20 },
  act: { marginTop: 12, minHeight: 48, minWidth: 220, paddingHorizontal: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.sepia, borderRadius: 4 },
  actText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2.5, color: colors.ink, includeFontPadding: false },
});
