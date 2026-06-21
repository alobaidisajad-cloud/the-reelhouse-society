import React from 'react';
import { SharedValue } from 'react-native-reanimated';

export const PulseContext = React.createContext<{
  pulse: SharedValue<number>;
  isScrolling: SharedValue<boolean>;
} | null>(null);

export function usePulse() {
  return React.useContext(PulseContext);
}
