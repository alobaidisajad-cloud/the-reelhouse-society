/**
 * InColumn — a modal's contents in the page's reading column.
 *
 * Every page sits in the reading column (the root navigator's content style, navMetrics). A React
 * Native <Modal> is a window of its own, so on a window wider than the column (an iPad, an
 * unfolded phone) its sheet, card or scrim would span the whole window, and whatever it placed by
 * the page's edges would stand at the window's. Inside InColumn it lays out exactly as on a phone,
 * centred where the page is; beyond it is the house's ink, which a scrim leaves as it was.
 * everyModalHoldsTheColumn holds every <Modal> to it.
 */
import React, { type ReactNode } from 'react';
import { View } from 'react-native';
import { readingColumn } from '@/src/components/layout/navMetrics';

export function InColumn({ children }: { children: ReactNode }) {
  return <View style={readingColumn} pointerEvents="box-none">{children}</View>;
}
