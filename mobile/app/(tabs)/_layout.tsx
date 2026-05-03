import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { BackdropFilter, Blur, Canvas, Fill } from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle, withSpring, useSharedValue, withTiming,
  withRepeat, withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Newspaper, Film, Clapperboard, User,
} from 'lucide-react-native';
import { ReelEyeIcon } from '@/src/components/ReelEyeIcon';
import { HapticTab } from '@/src/components/HapticTab';
import { colors } from '@/src/theme/theme';
import { TopNavBar } from '@/src/components/layout/TopNavBar';
import { useNotificationStore } from '@/src/stores/social';

// ════════════════════════════════════════════════════════════════
//  TAB ICON — Icons only. No labels. Pure cinema.
//
//  - Clean Lucide icons sized for clarity
//  - Spring-animated scale + opacity
//  - Gradient dot indicator below active icon
//  - Center tab (Lobby) elevated with warm flicker glow
// ════════════════════════════════════════════════════════════════
function TabIcon({
  IconComponent,
  focused,
  isCenter = false,
  hasNotification = false,
}: {
  IconComponent: typeof Newspaper;
  focused: boolean;
  isCenter?: boolean;
  hasNotification?: boolean;
}) {
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(0.35);
  const badgeAlpha = useSharedValue(0.4);

  React.useEffect(() => {
    // P7-FIX #11: Capped breathing pulse (10 repeats) instead of static opacity
    badgeAlpha.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0.5, { duration: 1500 }),
      ),
      10,
      true,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badgeAlphaStyle = useAnimatedStyle(() => ({
    opacity: badgeAlpha.value,
  }));

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
    iconOpacity.value = withTiming(focused ? 1 : 0.35, { duration: 200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: iconOpacity.value,
  }));

  const iconColor = focused
    ? (isCenter ? colors.flicker : colors.sepia)
    : colors.bone;
  const iconSize = isCenter ? 26 : 22;
  const strokeW = focused ? 2 : 1.5;

  return (
    <View style={s.tabIconRoot}>
      <Animated.View style={[s.tabIconInner, animatedStyle]}>
        <IconComponent
          size={iconSize}
          color={iconColor}
          strokeWidth={strokeW}
        />
      </Animated.View>

      {/* Nitrate Noir Breathing Ember Notification Badge */}
      {hasNotification && !focused && (
        <Animated.View style={[s.badgeDot, badgeAlphaStyle]} pointerEvents="none">
          <View style={s.badgeDotInner} />
        </Animated.View>
      )}

      {/* Active indicator — tiny gradient dot */}
      <View style={s.indicatorSlot}>
        {focused && (
          <View style={[
            s.indicatorDot,
            { backgroundColor: isCenter ? colors.flicker : colors.sepia },
            isCenter && s.centerGlow,
          ]} />
        )}
      </View>
    </View>
  );
}

function LobbyTabIcon({ focused }: { focused: boolean }) {
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(0.35);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
    iconOpacity.value = withTiming(focused ? 1 : 0.35, { duration: 200 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: iconOpacity.value,
  }));

  const iconColor = focused ? colors.flicker : colors.bone;
  return (
    <View style={s.tabIconRoot}>
      <Animated.View style={[s.tabIconInner, animatedStyle]}>
        <ReelEyeIcon
          size={26}
          color={iconColor}
          strokeWidth={focused ? 2 : 1.5}
        />
      </Animated.View>
      <View style={s.indicatorSlot}>
        {focused && (
          <View style={[
            s.indicatorDot,
            { backgroundColor: colors.flicker },
            s.centerGlow,
          ]} />
        )}
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  TAB BAR BACKGROUND — Frosted ink glass
// ════════════════════════════════════════════════════════════════
function TabBarBackground() {
  if (Platform.OS === 'android') {
    return (
      <View style={StyleSheet.absoluteFill}>
        {/* Audit Fix #5: Premium Skia Blur for Android */}
        <Canvas style={StyleSheet.absoluteFill}>
          <BackdropFilter filter={<Blur blur={25} />}>
            <Fill color="rgba(8, 6, 4, 0.65)" />
          </BackdropFilter>
        </Canvas>
        <LinearGradient
          colors={['transparent', 'rgba(196,150,26,0.15)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.topBorder}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={65}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, s.tabBarTint]} />
      {/* Sepia gradient border at top */}
      <LinearGradient
        colors={['transparent', 'rgba(196,150,26,0.1)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.topBorder}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  TAB LAYOUT
//  Dispatch • The Reel • LOBBY • Darkroom • Profile
// ════════════════════════════════════════════════════════════════
export default function TabLayout() {
  const unreadCount = useNotificationStore((s) => s._unreadCount);
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        header: () => <TopNavBar />,
        headerTransparent: true,
        headerShown: true,
        tabBarButton: HapticTab,
        tabBarStyle: [s.tabBar, { height: 56 + Math.max(insets.bottom, 10), paddingBottom: Math.max(insets.bottom, 10) }],
        tabBarBackground: () => <TabBarBackground />,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.sepia,
        tabBarInactiveTintColor: colors.fog,
        animation: 'fade',
        lazy: true,
      }}
    >
      <Tabs.Screen
        name="dispatch"
        options={{
          title: 'Dispatch',
          tabBarAccessibilityLabel: 'Dispatch tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={Newspaper} focused={focused} hasNotification={unreadCount > 0} />
          ),
        }}
      />

      <Tabs.Screen
        name="reels"
        options={{
          title: 'The Reel',
          tabBarAccessibilityLabel: 'The Reel tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={Film} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: 'Lobby',
          tabBarAccessibilityLabel: 'Lobby tab',
          tabBarIcon: ({ focused }) => (
            <LobbyTabIcon focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="darkroom"
        options={{
          title: 'Darkroom',
          tabBarAccessibilityLabel: 'Darkroom tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={Clapperboard} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={User} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen name="lounge" options={{ href: null }} />
      <Tabs.Screen name="ledger" options={{ href: null }} />
    </Tabs>
  );
}

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },

  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
  },

  tabIconRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 48,
    paddingTop: 4,
  },

  tabIconInner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  indicatorSlot: {
    height: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  indicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.bloodReel,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },

  badgeDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bloodReel,
  },

  tabBarTint: {
    backgroundColor: 'rgba(8, 6, 4, 0.45)', // Smoked Obsidian tint overlaying the blur
  },

  centerGlow: {
    shadowColor: colors.flicker,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
});
