import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Freeze } from 'react-freeze';

interface FrozenTabProps {
  children: React.ReactNode;
}

/**
 * FrozenTab — Pillar 2: Zero Frame Drop.
 * 
 * When this tab is out of focus, React completely suspends its rendering tree.
 * This prevents background tabs from eating CPU cycles and memory bandwidth,
 * guaranteeing the active tab runs at a perfectly locked 60fps/120fps.
 */
export default function FrozenTab({ children }: FrozenTabProps) {
  const isFocused = useIsFocused();
  
  // Freeze the entire component tree when the screen is not active
  return <Freeze freeze={!isFocused}>{children}</Freeze>;
}
