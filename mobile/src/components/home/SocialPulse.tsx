/**
 * SocialPulseSection — Horizontal scrolling feed of recent society reviews.
 * Uses FlashList with cover-flow physics (3D rotation + scale on scroll).
 * The Lobby reads the wire (lobbyReads.ts) and hands it here: this only draws.
 */
import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, {
  FadeInDown, SharedValue,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
  Easing, interpolate, Extrapolation, cancelAnimation, useAnimatedScrollHandler
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts } from '@/src/theme/theme';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import Buster from '@/src/components/Buster';
import { useAuthStore } from '@/src/stores/auth';
import type { PulseActivity } from './types';
import { isAuteurPlusTier } from '@/src/utils/tier';

// ── PULSE CARD ITEM (consolidated from standalone PulseCardItem.tsx) ──
import { PulseCardItem } from './PulseCardItem';
 
const MemoizedBox16 = memo(() => <View style={{ width: 16 }} />);
export { PulseCardItem };

// ── ANIMATED PULSE WRAPPER (Cover-Flow Physics) ──
const AnimatedPulseWrapper = memo(function AnimatedPulseWrapper({ item, index, scrollX, itemSize, cardWidth, onMute }: { item: PulseActivity; index: number; scrollX: SharedValue<number>; itemSize: number; cardWidth: number; onMute?: (id: string) => void }) {
  const style = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * itemSize,
      index * itemSize,
      (index + 1) * itemSize,
    ];
    const scale = interpolate(scrollX.value, inputRange, [0.94, 1, 0.94], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.5, 1, 0.5], Extrapolation.CLAMP);
    const rotateY = interpolate(scrollX.value, inputRange, [12, 0, -12], Extrapolation.CLAMP);

    return { 
       transform: [
         { perspective: 1200 },
         { scale }, 
         { rotateY: `${rotateY}deg` }
       ], 
       opacity 
    };
  });

  return (
    <Animated.View style={style}>
      <PulseCardItem act={item} cardWidth={cardWidth} onMute={onMute} />
    </Animated.View>
  );
});

// ── GHOST EMPTY STATE ──
const GhostEmptyState = memo(() => {
  const float = useSharedValue(0);
  const [mood, setMood] = useState<'sleeping' | 'peeking'>('sleeping');
  const pokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    float.value = withRepeat(
       withSequence(
         withTiming(-6, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
         withTiming(6, { duration: 2500, easing: Easing.inOut(Easing.sin) })
       ), 30, true
    );
    return () => {
      cancelAnimation(float);
      if (pokeTimer.current) clearTimeout(pokeTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));

  const handlePoke = () => {
     TactileEngine.destroy();
     setMood('peeking');
     if (pokeTimer.current) clearTimeout(pokeTimer.current);
     pokeTimer.current = setTimeout(() => setMood('sleeping'), 1500);
  };

  return (
      <PressableScale onPress={handlePoke} style={{ alignItems: 'center', marginBottom: 16 } as any}
        accessibilityRole="button" accessibilityLabel="Poke Buster">
          <Animated.View style={style}>
             <Buster mood={mood} size={54} />
          </Animated.View>
      </PressableScale>
  );
});
GhostEmptyState.displayName = 'GhostEmptyState';

// ── MAIN SOCIAL PULSE SECTION ──
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const pulseKeyExtractor = (item: PulseActivity) => item.id;

function SocialPulseSectionInner({ activities, featuredId }: {
  /** The wire. Undefined while it has not arrived (or could not): nothing is drawn then. */
  activities: PulseActivity[] | undefined;
  /** The Lead Story's log, which is not also the wire. */
  featuredId?: string;
}) {
  const { width } = useWindowDimensions();
  const PULSE_ITEM_SIZE = width * 0.82 + 16;

  const user = useAuthStore(s => s.user);

  const isAuteur = isAuteurPlusTier(user);
  const pulseAccent = isAuteur ? colors.crimson : colors.sepia;
  const pulseGradient = isAuteur ? [colors.crimson, colors.bloodReel] as const : [colors.sepia, colors.flicker] as const;

  const scrollX = useSharedValue(0);
  const onScrollPulse = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  // Report-and-mute hides the card IMMEDIATELY (the query's 5-min staleTime
  // must never leave a reported log staring back at the member).
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => new Set());
  const handleMute = useCallback((id: string) => {
    setMutedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const renderItem = useCallback(({ item, index }: { item: PulseActivity, index: number }) => (
    <AnimatedPulseWrapper item={item} index={index} scrollX={scrollX} itemSize={PULSE_ITEM_SIZE} cardWidth={width * 0.82} onMute={handleMute} />
  ), [scrollX, PULSE_ITEM_SIZE, width, handleMute]);

  // The Lead Story is not also the wire.
  //
  // FeaturedCritique picks an editorial choice and The Pulse picks the newest,
  // and with the archive at its current size those are routinely the same log —
  // one film filling both sections on a single screen. Confirmed against the
  // database, not inferred from the screen.
  //
  // Filtered HERE, at render, rather than when the wire is read: the two reads
  // run in parallel, and whichever lands second re-draws this with both known.
  // (The Lobby hands both in, so there is no shared cache entry to watch.)
  if (!activities) return null;
  const visibleActivities = (mutedIds.size === 0
    ? activities
    : activities.filter(a => !mutedIds.has(a.id))
  ).filter(a => a.id !== featuredId).slice(0, 6);

  // Only a wire that ARRIVED empty is said to be empty; one still on its way,
  // or one that could not be read, draws nothing here (the Lobby says why).
  if (visibleActivities.length === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(600)} style={s.pulseSection}>
        <SectionDivider label="THE TELEGRAPH" />
        <View style={s.pulseHeaderRow}>
          <LinearGradient colors={pulseGradient} style={[s.sectionAccentBar, isAuteur && { shadowColor: pulseAccent }]} />
          <View>
            <Text style={s.sectionTitle} accessibilityRole="header">The Pulse</Text>
            <Text style={s.sectionLoreSub}>Live logs from the Society</Text>
          </View>
        </View>
        <View style={[s.pulseEmpty, isAuteur && { borderColor: colors.crimsonFaint, backgroundColor: 'rgba(125,31,31,0.02)' }]}>
          <GhostEmptyState />
          <Text style={s.pulseEmptyTitle}>The screening room is dark.</Text>
          <Text style={s.pulseEmptySub}>When a member logs their first film, it will appear here.</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(400)} style={s.pulseSection}>
      <SectionDivider label="THE TELEGRAPH" />
      <View style={s.pulseHeaderRow}>
        <LinearGradient colors={pulseGradient} style={[s.sectionAccentBar, isAuteur && { shadowColor: pulseAccent }]} />
        <View>
          <Text style={s.sectionTitle} accessibilityRole="header">The Pulse</Text>
          <Text style={s.sectionLoreSub}>Live logs from the Society</Text>
        </View>
      </View>

      <View style={s.flashListPulseWrap}>
        <AnimatedFlashList
            horizontal
            data={visibleActivities}
            keyExtractor={pulseKeyExtractor as any}
            renderItem={renderItem as any}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.pulseScrollContent}
            decelerationRate="normal"
            snapToInterval={PULSE_ITEM_SIZE}
            snapToAlignment="start"
            disableIntervalMomentum={false}
            onScroll={onScrollPulse}
            scrollEventThrottle={16}
            estimatedItemSize={PULSE_ITEM_SIZE}
            drawDistance={350}
            ItemSeparatorComponent={MemoizedBox16}
        />
      </View>
    </Animated.View>
  );
}
export const SocialPulseSection = memo(SocialPulseSectionInner);

// ── Styles ──
const s = StyleSheet.create({
  // Rhythm: 16 + the next divider's 20 = the page-wide 36px section gap.
  pulseSection: { marginBottom: 16 },
  pulseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, marginBottom: 16 },
  sectionAccentBar: { width: 3, height: 32, borderRadius: 2 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 2 },
  // 0.5 measured 2.44:1 on ink — below even the 3:1 floor for LARGE text, and
  // this is 10pt italic. 0.8 gave 4.59:1 and cleared AA. The line explains what
  // the section is, so it is content rather than decoration; the footer's
  // closing whisper stays quieter on purpose. Same value in FeaturedCritique
  // and FilmStripRow, where this style is duplicated verbatim.
  // Solid fogQuiet now: a word no longer borrows its contrast from the ground behind it.
  sectionLoreSub: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fogQuiet, letterSpacing: 0.3 },
  pulseEmpty: {
    marginHorizontal: 20, backgroundColor: 'rgba(30,25,20,0.85)', borderLeftWidth: 3,
    borderLeftColor: 'rgba(184,137,26,0.3)', borderRadius: 6, padding: 32, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)',
  },
  pulseEmptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 8 },
  pulseEmptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.fogQuiet, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },
  flashListPulseWrap: { height: 390, width: '100%' },
  pulseScrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
});


MemoizedBox16.displayName = 'MemoizedBox16';
