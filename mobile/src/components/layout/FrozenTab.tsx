import React from 'react';

interface FrozenTabProps {
  children: React.ReactNode;
}

/**
 * FrozenTab — Pillar 2: Zero Frame Drop.
 * 
 * [HOTFIX: Build 27] Disabled `react-freeze` temporarily. 
 * Expo Router + React Navigation `useIsFocused()` has a known race condition on cold boot 
 * where `isFocused` is false on the initial render, causing Suspense to deadlock the tree 
 * into a permanent `null` (black screen). 
 */
export default function FrozenTab({ children }: FrozenTabProps) {
  // Pass through directly to prevent Suspense deadlock
  return <>{children}</>;
}
