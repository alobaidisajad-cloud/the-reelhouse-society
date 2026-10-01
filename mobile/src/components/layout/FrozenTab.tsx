import React from 'react';

interface FrozenTabProps {
  children: React.ReactNode;
}

/**
 * FrozenTab — every tab's wrapper, and today a pass-through: a hidden tab is NOT frozen.
 * Freezing on `useIsFocused()` left a cold boot black (it reads false on the first render).
 */
export default function FrozenTab({ children }: FrozenTabProps) {
  return <>{children}</>;
}
