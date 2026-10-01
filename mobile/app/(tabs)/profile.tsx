/**
 * profile.tsx — the Profile tab: your own member file, drawn by the same
 * screen as every member's (app/user/[username].tsx), or, signed out, the
 * door to sign in.
 */
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { useAuthStore } from '@/src/stores/auth';
import { nav } from '@/src/utils/typedRouter';
import { colors, fonts } from '@/src/theme/theme';
import { LogIn } from 'lucide-react-native';
import UserProfileScreen from '../user/[username]';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

export default function ProfileTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);

  if (!isAuthenticated || !user) {
    return (
      <FrozenTab>
        <View style={s.container}>
          <RoomLight room="member" />
          <Buster size={80} mood="peeking" message="The archive awaits your identity." />
          <Text style={s.prompt}>Identify yourself to access your dossier</Text>
          <PressableScale testID="profile-sign-in-prompt" style={s.ctaBtn} onPress={() => nav.push('/login')} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="medium"
            accessibilityRole="button" accessibilityLabel="Identify yourself. Sign in.">
            <LogIn size={11} color={colors.sepia} strokeWidth={1.5} />
            <Text style={s.ctaBtnText}>IDENTIFY YOURSELF</Text>
          </PressableScale>
        </View>
      </FrozenTab>
    );
  }

  return (
    <FrozenTab>
      <UserProfileScreen usernameOverride={user.username} isRootTab={true} />
    </FrozenTab>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  prompt: { fontFamily: fonts.sub, fontSize: 13, color: colors.bone, marginBottom: 16 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
    backgroundColor: 'rgba(184,137,26,0.1)',
  },
  ctaBtnText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
