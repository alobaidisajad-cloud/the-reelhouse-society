import React, { useCallback, memo } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Search, Bell, MessageSquareText, KeyRound } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, useAnimatedProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { MasterLogo } from '@/src/components/MasterLogo';
import { useAuthStore } from '@/src/stores/auth';
import { colors } from '@/src/theme/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { globalScrollY } from '@/src/lib/scrollBridge';
import TactileEngine from '@/src/utils/TactileEngine';
import { NotificationBadge } from '@/src/components/ui/NotificationBadge';
import { isArchivistPlusTier } from '@/src/utils/tier';
import { ConciergeButton } from '@/src/components/layout/ConciergeButton';
import {
  NAV_H_PADDING,
  NAV_ROW_MIN_H,
  NAV_BTN_SIZE,
  NAV_BOTTOM_PADDING,
  navTopPadding,
} from '@/src/components/layout/navMetrics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// ── Premium Nav Icon Button ──────────────────────────────────────
// Micro-interaction: press-in scale-down + release bounce-back
const NavIconButton = memo(function NavIconButton({
  icon: Icon,
  onPress,
  badge = false,
  accent = false,
  size = 20,
  accessibilityLabel,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  onPress: () => void;
  badge?: boolean;
  accent?: boolean;
  size?: number;
  accessibilityLabel: string;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        scale.value = withSpring(0.82, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      }}
      onPress={() => {
        TactileEngine.navigate();
        onPress();
      }}
      style={[styles.iconButton, accent && styles.iconButtonAccent, animatedStyle]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Icon
        size={size}
        color={accent ? colors.sepia : colors.parchment}
        strokeWidth={accent ? 2.5 : 1.8}
      />
      {badge && <NotificationBadge style={{ top: 7, right: 7 }} pulseCount={4} />}
    </AnimatedPressable>
  );
});

// ════════════════════════════════════════════════════════════════
//  TOP NAV BAR — The Society's Crown
//  LEFT:   Concierge ＋ (brass)  |  Lounge / brass key
//  CENTER: MasterLogo
//  RIGHT:  Search  |  Notifications Bell
// ════════════════════════════════════════════════════════════════
// CONST-1: channels match base sepia (#B8891A = rgb(184,137,26))
const TOP_NAV_BORDER_COLORS = ['rgba(184, 137, 26, 0)', 'rgba(184, 137, 26, 0.18)', 'rgba(184, 137, 26, 0)'] as const;

export const TopNavBar = memo(function TopNavBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // iOS: native blur intensity animates with scroll (UIViewPropertyAnimator
  // under the hood — the platform-sanctioned technique).
  const animatedProps = useAnimatedProps(() => {
    const scrollProgress = Math.min(1, Math.max(0, globalScrollY.value / 100));
    return { intensity: Math.round(scrollProgress * 45) };
  });

  // ANDROID BLUR LAW: no dimezisBlurView here. It re-captures the window every
  // frame and animating its intensity during scroll strobed the whole top
  // region (ANDROID_LAUNCH.md already flags it as a perf risk). Android gets a
  // pure alpha scrim instead — UI-thread opacity math that cannot flicker —
  // tinted stronger since there's no blur underneath to carry legibility.
  const animatedBlurStyle = useAnimatedStyle(() => {
    const scrollProgress = Math.min(1, Math.max(0, globalScrollY.value / 100));
    const maxAlpha = Platform.OS === 'ios' ? 0.7 : 0.92;
    return {
      backgroundColor: `rgba(11,10,8,${scrollProgress * maxAlpha})`
    };
  });

  // Role-gate: only Archivist & Auteur see the Lounge icon
  const hasLoungeAccess = useAuthStore(s => isArchivistPlusTier(s.user));

  // ── Zero-Cost Memoized Routing ──
  // No onLogPress here any more — logging is one of the Concierge's two doors,
  // and the button owns its own routing.
  const onLoungePress = useCallback(() => router.navigate('/lounge' as Href), [router]);
  const onSearchPress = useCallback(() => router.navigate('/search-modal' as Href), [router]);
  const onNotifPress = useCallback(() => router.navigate('/notifications-modal' as Href), [router]);

  const navInner = (
    <>
        <View style={styles.navContent}>
          {/* ── LEFT CLUSTER: Concierge + Lounge ── */}
          <View style={styles.sideCluster}>
            {/* The brass disc. Solid where every other button is outlined, so
                the one thing that MAKES something reads apart from the four
                that navigate — including the brass key beside it. */}
            <ConciergeButton />
            {hasLoungeAccess ? (
              <NavIconButton
                icon={MessageSquareText}
                onPress={onLoungePress}
                size={19}
                accessibilityLabel="Lounge"
              />
            ) : (
              // The velvet rope, not a hidden door — cinephiles see the brass
              // key; tapping it opens /lounge where the LoungeGate makes the
              // invitation (CLEARANCE REQUIRED → ASCEND THE RANKS). Same
              // pattern as ActionDeck's lounge share.
              <NavIconButton
                icon={KeyRound}
                onPress={onLoungePress}
                size={19}
                accent
                accessibilityLabel="The Lounge — clearance required. Opens membership details."
              />
            )}
          </View>

          {/* ── CENTER: Logo ── */}
          <View 
            style={styles.logoContainer} 
            pointerEvents="none"
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          >
            <MasterLogo size={36} />
          </View>

          {/* ── RIGHT CLUSTER: Search + Notifications ── */}
          <View style={[styles.sideCluster, styles.rightCluster]}>
            <NavIconButton
              icon={Search}
              onPress={onSearchPress}
              size={19}
              accessibilityLabel="Search"
            />
            <NavIconButton
              icon={Bell}
              onPress={onNotifPress}
              size={19}
              badge={true}
              accessibilityLabel="Notices"
            />
          </View>
        </View>

        {/* ── Premium bottom border with gradient fade ── */}
        <LinearGradient
          colors={TOP_NAV_BORDER_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bottomBorder}
        />
    </>
  );

  const shellStyle = [styles.blur, { paddingTop: navTopPadding(insets.top) }, animatedBlurStyle];

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <AnimatedBlurView animatedProps={animatedProps} tint="dark" style={shellStyle}>
          {navInner}
        </AnimatedBlurView>
      ) : (
        <Animated.View style={shellStyle}>
          {navInner}
        </Animated.View>
      )}
    </View>
  );
});

// ════════════════════════════════════════════════════════════════
//  STYLES — Nitrate Noir Premium Nav
// ════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  // Built from navMetrics, not from literals. The Concierge card anchors itself
  // by computing where this button lands, so a number typed twice is a menu
  // hanging off its own button.
  blur: {
    paddingBottom: NAV_BOTTOM_PADDING,
    paddingHorizontal: NAV_H_PADDING,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: NAV_ROW_MIN_H,
  },

  // ── Logo (absolute-centered so side clusters don't push it) ──
  logoContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sideCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 2, // Above the absolute-centered logo
  },
  rightCluster: {
    justifyContent: 'flex-end',
  },

  // ── Icon buttons ──
  iconButton: {
    width: NAV_BTN_SIZE,
    height: NAV_BTN_SIZE,
    borderRadius: NAV_BTN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 10, 8, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconButtonAccent: {
    backgroundColor: 'rgba(184, 137, 26, 0.12)',
    borderColor: colors.sepiaBorder,
  },

  // ── Premium gradient bottom line ──
  bottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: '10%',
    right: '10%',
    height: StyleSheet.hairlineWidth,
  },
});
