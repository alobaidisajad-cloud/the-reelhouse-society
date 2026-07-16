import React, { useCallback, memo } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Search, Plus, Bell, MessageSquareText, KeyRound } from 'lucide-react-native';
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
//  LEFT:   + Log  |  Lounge (Archivist/Auteur only)
//  CENTER: MasterLogo
//  RIGHT:  Search  |  Notifications Bell
// ════════════════════════════════════════════════════════════════
// CONST-1: channels match base sepia (#B8891A = rgb(184,137,26))
const TOP_NAV_BORDER_COLORS = ['rgba(184, 137, 26, 0)', 'rgba(184, 137, 26, 0.18)', 'rgba(184, 137, 26, 0)'] as const;

export const TopNavBar = memo(function TopNavBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const animatedProps = useAnimatedProps(() => {
    const scrollProgress = Math.min(1, Math.max(0, globalScrollY.value / 100));
    const blurIntensity = Platform.OS === 'ios'
      ? Math.round(scrollProgress * 45)
      : Math.round(scrollProgress * 100);
    return { intensity: blurIntensity };
  });

  const animatedBlurStyle = useAnimatedStyle(() => {
    const scrollProgress = Math.min(1, Math.max(0, globalScrollY.value / 100));
    return {
      backgroundColor: `rgba(11,10,8,${scrollProgress * 0.7})`
    };
  });

  // Role-gate: only Archivist & Auteur see the Lounge icon
  const hasLoungeAccess = useAuthStore(s => isArchivistPlusTier(s.user));

  // ── Zero-Cost Memoized Routing ──
  const onLogPress = useCallback(() => router.navigate('/log-modal' as Href), [router]);
  const onLoungePress = useCallback(() => router.navigate('/lounge' as Href), [router]);
  const onSearchPress = useCallback(() => router.navigate('/search-modal' as Href), [router]);
  const onNotifPress = useCallback(() => router.navigate('/notifications-modal' as Href), [router]);

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        experimentalBlurMethod="dimezisBlurView"
        animatedProps={animatedProps}
        tint="dark"
        style={[
          styles.blur,
          { paddingTop: Math.max(insets.top, 20) },
          animatedBlurStyle
        ]}
      >
        <View style={styles.navContent}>
          {/* ── LEFT CLUSTER: Log + Lounge ── */}
          <View style={styles.sideCluster}>
            <NavIconButton
              icon={Plus}
              onPress={onLogPress}
              accent
              accessibilityLabel="Add Log"
            />
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
      </AnimatedBlurView>
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
  blur: {
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
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
    width: 38,
    height: 38,
    borderRadius: 19,
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
