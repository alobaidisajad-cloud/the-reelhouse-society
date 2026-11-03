/**
 * The Reel's states, each drawn as a frame of the reel itself: still frames while it is read
 * (nothing loops), a frame that says why it is empty or could not be read, a line that says the
 * next reel did not load, and The End when the whole reel has run.
 */
import React, { memo } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/src/components/text';
import { TryAgainLine } from '@/src/components/TryAgain';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { FRAME, FRAME_RADIUS } from '@/src/components/feed/frame/metrics';
import { canGrid, CanSkeleton } from './StackCan';

/** A frame of the reel's own stock, holding a state. */
export function StateFrame({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[st.frame, st.state, style]}>{children}</View>;
}

/** A log's frame while the reel is read: its byline, poster and title, two lines of words. */
export const FrameSkeleton = memo(function FrameSkeleton() {
  return (
    <View style={[st.frame, st.skeleton]} {...UNSPOKEN}>
      <View style={st.row}>
        <View style={[st.bar, { width: 26, height: 26, borderRadius: 13 }]} />
        <View style={[st.bar, { width: 130, height: 10 }]} />
      </View>
      <View style={[st.row, { gap: 14, marginTop: 22, alignItems: 'flex-start' }]}>
        <View style={[st.bar, { width: FRAME.poster.width, height: FRAME.poster.height }]} />
        <View style={{ flex: 1 }}>
          <View style={[st.bar, { width: '70%', height: 16 }]} />
          <View style={[st.bar, { width: '30%', height: 10, marginTop: 12 }]} />
          <View style={[st.bar, { width: '50%', height: 12, marginTop: 12 }]} />
        </View>
      </View>
      <View style={[st.bar, { height: 10, marginTop: 20 }]} />
      <View style={[st.bar, { height: 10, marginTop: 10, width: '80%' }]} />
    </View>
  );
});

/** The reel while it is read: three still frames. */
export const ReelReading = memo(function ReelReading() {
  return (
    <View accessible accessibilityLabel="Reading the reel">
      <FrameSkeleton />
      <FrameSkeleton />
      <FrameSkeleton />
    </View>
  );
});

/** The cans while they are read: two rows of still cans. */
export const CansReading = memo(function CansReading() {
  const grid = canGrid(useColumnWidth());
  return (
    <View style={[st.cans, { gap: 8 }]} accessible accessibilityLabel="Reading the stacks">
      {Array.from({ length: grid.cols * 2 }, (_, i) => (
        <View key={i} style={{ width: grid.can }}><CanSkeleton /></View>
      ))}
    </View>
  );
});

/** A page past the first that could not be read: the reel shown stays, and this says so. */
export const NextReelFailed = memo(function NextReelFailed({ words, what, onRetry }: {
  words: string;
  /** What TRY AGAIN does, as a screen reader says it. */
  what: string;
  onRetry: () => void;
}) {
  return (
    <View style={st.nextFail}>
      <Text style={st.nextFailText} {...scaledTextProps}>{words}</Text>
      <TryAgainLine onPress={onRetry} what={what} style={st.tryLine} />
    </View>
  );
});

/** The last frame of a reel that has run to its end. */
export const TheEnd = memo(function TheEnd() {
  return (
    <View style={[st.frame, st.end]} accessible accessibilityLabel="The End. That is the whole reel. Pull down to run it again.">
      <Text style={st.endTitle} {...displayTextProps}>The End</Text>
      <Text style={st.endLine} {...scaledTextProps}>THAT IS THE WHOLE REEL</Text>
      <Text style={st.endLine} {...scaledTextProps}>PULL DOWN TO RUN IT AGAIN</Text>
    </View>
  );
});

const st = StyleSheet.create({
  frame: { marginHorizontal: FRAME.margin, marginBottom: FRAME.gap, backgroundColor: colors.soot, borderRadius: FRAME_RADIUS },
  state: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, paddingBottom: 36 },
  skeleton: { padding: FRAME.pad },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  bar: { backgroundColor: colors.surfaceRaised, borderRadius: 2 },
  cans: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: FRAME.margin },

  nextFail: {
    marginHorizontal: FRAME.margin, marginBottom: FRAME.gap, minHeight: 56, backgroundColor: colors.soot, borderRadius: FRAME_RADIUS,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 10,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  nextFailText: { flexShrink: 1, fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.bone },
  tryLine: { minHeight: 44, justifyContent: 'center' },

  end: { alignItems: 'center', paddingTop: 30, paddingHorizontal: 16, paddingBottom: 32 },
  endTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.silverScreen, textAlign: 'center' },
  endLine: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog, marginTop: 8, textAlign: 'center' },
});
