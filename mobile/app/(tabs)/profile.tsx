/**
 * profile.tsx — the Profile tab: your own member file, drawn by the same
 * screen as every member's (app/user/[username].tsx), or, signed out, the
 * door to sign in.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { useAuthStore } from '@/src/stores/auth';
import { nav } from '@/src/utils/typedRouter';
import { colors, fonts } from '@/src/theme/theme';
import { LogIn } from 'lucide-react-native';
import UserProfileScreen from '../user/[username]';
import Buster, { BusterEyes } from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { EmptyOffline } from '@/src/components/EmptyStates';
import { CentredRoom } from '@/src/components/layout/CentredRoom';
import { useFocusEffect } from 'expo-router';
import { withTiming } from 'react-native-reanimated';
import { globalScrollY } from '@/src/lib/scrollBridge';

export default function ProfileTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const ownFile = isAuthenticated && !!user?.username;

  // One bar over every tab. The member's file gives it its own scroll as it
  // arrives; the pages here before it do not scroll, so the bar is clear.
  useFocusEffect(
    useCallback(() => {
      if (!ownFile) globalScrollY.value = withTiming(0, { duration: 250 });
    }, [ownFile]),
  );

  if (!isAuthenticated || !user) {
    return (
      <FrozenTab>
        <View style={s.container}>
          <RoomLight room="member" />
          <CentredRoom kind="tab" style={s.centre}>
            <Buster size={80} mood="unimpressed" message="The archive awaits your identity." />
            <Text style={s.prompt}>Identify yourself to access your dossier</Text>
            <PressableScale testID="profile-sign-in-prompt" style={s.ctaBtn} onPress={() => nav.push('/login')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="medium"
              accessibilityRole="button" accessibilityLabel="Identify yourself. Sign in.">
              <LogIn size={11} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.ctaBtnText}>IDENTIFY YOURSELF</Text>
            </PressableScale>
          </CentredRoom>
        </View>
      </FrozenTab>
    );
  }

  // Signed in, the house knows who you are before it has read your handle: a
  // file opened with no handle asked for nobody, and told you "Member Not Found"
  // about yourself. It is read first, and a read that failed says so.
  if (!user.username) {
    return (
      <FrozenTab>
        <HandleArriving />
      </FrozenTab>
    );
  }

  return (
    <FrozenTab>
      <UserProfileScreen usernameOverride={user.username} isRootTab={true} />
    </FrozenTab>
  );
}

/** Your own file, while its handle is read: the read, and if it fails, TRY AGAIN. */
function HandleArriving() {
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const ask = useCallback(() => {
    setFailed(false);
    void useAuthStore.getState().restoreSession().finally(() => {
      if (mounted.current && !useAuthStore.getState().user?.username) setFailed(true);
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    ask();
    return () => { mounted.current = false; };
  }, [ask]);

  return (
    <View style={s.container}>
      <RoomLight room="member" />
      <CentredRoom kind="tab" style={s.centre}>
        {failed
          ? <EmptyOffline onRetry={ask} />
          : <><BusterEyes style={s.retrievingEyes} /><Text style={s.retrieving}>RETRIEVING DOSSIER</Text></>}
      </CentredRoom>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  centre: { alignItems: 'center' },
  // Room above as well as below: under Buster's line it read as part of the bubble.
  prompt: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, marginTop: 20, marginBottom: 16 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
    backgroundColor: 'rgba(184,137,26,0.1)',
  },
  ctaBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.sepia },
  retrievingEyes: { marginBottom: 14 },
  retrieving: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
