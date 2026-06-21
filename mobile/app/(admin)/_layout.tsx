import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';

export default function AdminLayout() {
  const { user } = useAuthStore();

  // Zero-Flicker Route Guard at the Layout Level
  // Using dynamic RBAC based on the user's role instead of hardcoded UUID
  if (!user || (user as any).role !== 'admin') {
    return <Redirect href="/(tabs)/profile" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="tribunal" />
    </Stack>
  );
}
