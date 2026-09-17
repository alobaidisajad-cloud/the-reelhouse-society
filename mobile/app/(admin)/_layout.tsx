import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';
import { toastScreenLayout } from '@/src/components/ToastHost';

export default function AdminLayout() {
  const { user } = useAuthStore();

  // Zero-Flicker Route Guard at the Layout Level
  // Using dynamic RBAC based on the user's role instead of hardcoded UUID
  if (!user || (user as any).role !== 'admin') {
    return <Redirect href="/(tabs)/profile" />;
  }

  return (
    <Stack screenLayout={toastScreenLayout} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="tribunal" />
    </Stack>
  );
}
