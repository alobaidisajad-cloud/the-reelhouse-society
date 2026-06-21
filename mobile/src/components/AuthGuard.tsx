import { Href , Redirect } from 'expo-router';
/**
 * AuthGuard — Route-level authentication wrapper.
 * 
 * 10/10 N-01: Prevents unauthenticated users from seeing protected content
 * for even a single frame. Renders a skeleton while auth state resolves,
 * then either shows children or redirects to login.
 * 
 * Usage in _layout.tsx:
 *   <Stack.Screen name="settings">
 *     {() => <AuthGuard><SettingsScreen /></AuthGuard>}
 *   </Stack.Screen>
 * 
 * Or wrap directly in screen files:
 *   export default function SettingsScreen() {
 *     return <AuthGuard>...</AuthGuard>;
 *   }
 */
import { View, StyleSheet } from 'react-native';

import { useAuthStore } from '@/src/stores/auth';
import { colors } from '@/src/theme/theme';
import SkeletonPulse from '@/src/components/SkeletonPulse';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Optional: custom redirect path instead of login modal */
  redirectTo?: string;
}

export default function AuthGuard({ children, redirectTo = '/(modals)/login' }: AuthGuardProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loading = useAuthStore((s) => s.loading);

  // Auth state still resolving (MMKV vault read in progress)
  if (loading) {
    return (
      <View style={styles.skeleton}>
        <SkeletonPulse width={200} height={20} />
        <SkeletonPulse width={160} height={14} style={{ marginTop: 12 }} />
        <SkeletonPulse width={240} height={14} style={{ marginTop: 8 }} />
      </View>
    );
  }

  // Not authenticated — redirect with zero frame flash
  if (!isAuthenticated) {
    return <Redirect href={redirectTo as Href} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  skeleton: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
});
