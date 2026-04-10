/**
 * Profile Tab — Thin wrapper around the canonical UserProfileScreen.
 *
 * ALL profile UI lives in app/user/[username].tsx.
 * This file just provides the current user's username so the same
 * component renders identically for own-profile and other-user views.
 * Change one place → every profile updates. Just like the web.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '@/src/stores/auth';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import UserProfileScreen from '../user/[username]';

export default function ProfileTab() {
  const { isAuthenticated, user } = useAuthStore();
  const router = useRouter();

  if (!isAuthenticated || !user) {
    return (
      <View style={s.container}>
        <Text style={{ fontFamily: fonts.display, fontSize: 56, color: colors.ash, marginBottom: 16 }}>◈</Text>
        <Text style={{ fontFamily: fonts.sub, fontSize: 16, color: colors.bone, marginBottom: 16 }}>Sign in to view your profile</Text>
        <TouchableOpacity style={s.ctaBtn} onPress={() => router.push('/login')}>
          <Text style={s.ctaBtnText}>✦ SIGN IN</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <UserProfileScreen usernameOverride={user.username} />;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' },
  ctaBtn: {
    paddingHorizontal: 24, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
    backgroundColor: 'rgba(139,105,20,0.1)',
  },
  ctaBtnText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.sepia },
});
