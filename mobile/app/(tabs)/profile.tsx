/**
 * Profile Tab — Thin wrapper around the canonical UserProfileScreen.
 *
 * ALL profile UI lives in app/user/[username].tsx.
 * This file just provides the current user's username so the same
 * component renders identically for own-profile and other-user views.
 * Change one place → every profile updates. Just like the web.
 *
 * ZERO inline styles. ZERO cheap emoji. All Lucide icons.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useAuthStore } from '@/src/stores/auth';
import { useRouter } from 'expo-router';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { colors, fonts, effects } from '@/src/theme/theme';
import { LogIn } from 'lucide-react-native';
import UserProfileScreen from '../user/[username]';
import Buster from '@/src/components/Buster';
import PressableScale from '@/src/components/PressableScale';
import FrozenTab from '@/src/components/layout/FrozenTab';

export default function ProfileTab() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const router = useRouter();

  if (!isAuthenticated || !user) {
    return (
      <FrozenTab>
        <View style={s.container}>
          <Buster size={80} mood="peeking" message="The archive awaits your identity." />
          <Text style={s.prompt}>Identify yourself to access your dossier</Text>
          <PressableScale testID="profile-sign-in-prompt" style={s.ctaBtn} onPress={() => (router.push as any)('/login' as any)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="medium">
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
  ctaBtnText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 2, color: colors.sepia },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
