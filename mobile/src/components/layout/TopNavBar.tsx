import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Search, Plus, Bell, MessageSquareText } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MasterLogo } from '@/src/components/MasterLogo';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, effects } from '@/src/theme/theme';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ── Premium Nav Icon Button ──────────────────────────────────────
// Micro-interaction: press-in scale-down + release bounce-back
function NavIconButton({
  icon: Icon,
  onPress,
  badge = false,
  accent = false,
  size = 20,
}: {
  icon: any;
  onPress: () => void;
  badge?: boolean;
  accent?: boolean;
  size?: number;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.82, { damping: 15, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
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
      {badge && (
        <View style={styles.badgeDot}>
          <View style={styles.badgeDotInner} />
        </View>
      )}
    </AnimatedPressable>
  );
}

// ════════════════════════════════════════════════════════════════
//  TOP NAV BAR — The Society's Crown
//  LEFT:   + Log  |  Lounge (Archivist/Auteur only)
//  CENTER: MasterLogo
//  RIGHT:  Search  |  Notifications Bell
// ════════════════════════════════════════════════════════════════
export function TopNavBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  // Role-gate: only Archivist & Auteur see the Lounge icon
  const userRole = (user?.role as string) || 'cinephile';
  const hasLoungeAccess = userRole === 'archivist' || userRole === 'auteur';

  return (
    <View style={styles.container}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 45 : 100}
        tint="dark"
        style={[styles.blur, { paddingTop: Math.max(insets.top, 20) }]}
      >
        <View style={styles.navContent}>
          {/* ── LEFT CLUSTER: Log + Lounge ── */}
          <View style={styles.sideCluster}>
            <NavIconButton
              icon={Plus}
              onPress={() => router.push('/log-modal')}
              accent
            />
            {hasLoungeAccess && (
              <NavIconButton
                icon={MessageSquareText}
                onPress={() => router.push('/lounge')}
                size={19}
              />
            )}
          </View>

          {/* ── CENTER: Logo ── */}
          <View style={styles.logoContainer} pointerEvents="none">
            <MasterLogo size={36} />
          </View>

          {/* ── RIGHT CLUSTER: Search + Notifications ── */}
          <View style={styles.sideCluster}>
            <NavIconButton
              icon={Search}
              onPress={() => router.push('/search-modal')}
              size={19}
            />
            <NavIconButton
              icon={Bell}
              onPress={() => router.push('/notifications-modal')}
              size={19}
            />
          </View>
        </View>

        {/* ── Premium bottom border with gradient fade ── */}
        <LinearGradient
          colors={['transparent', 'rgba(196, 150, 26, 0.18)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bottomBorder}
        />
      </BlurView>
    </View>
  );
}

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

  // ── Side clusters get fixed width for perfect symmetry ──
  sideCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 76,
    zIndex: 2, // Above the absolute-centered logo
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
    backgroundColor: 'rgba(196, 150, 26, 0.12)',
    borderColor: 'rgba(196, 150, 26, 0.25)',
  },

  // ── Notification badge dot ──
  badgeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
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
