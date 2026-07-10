import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle, withSpring, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Newspaper, Film, Clapperboard, User,
} from 'lucide-react-native';
import { ReelEyeIcon } from '@/src/components/ReelEyeIcon';
import { HapticTab } from '@/src/components/HapticTab';
import { colors } from '@/src/theme/theme';
import { TopNavBar } from '@/src/components/layout/TopNavBar';
import InitiationModal from '@/src/components/InitiationModal';
import { useInitiation } from '@/src/hooks/useInitiation';
import { nav } from '@/src/utils/typedRouter';

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
}: {
  IconComponent: typeof Newspaper;
  focused: boolean;
}) {
  const scale = useSharedValue(focused ? 1.15 : 1);
  const iconOpacity = useSharedValue(focused ? 1 : 0.35);
  const dotScale = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
    iconOpacity.value = withTiming(focused ? 1 : 0.35, { duration: 200 });
    dotScale.value = withSpring(focused ? 1 : 0, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
  }, [focused, scale, iconOpacity, dotScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: iconOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotScale.value,
  }));

  const iconColor = focused
    ? colors.sepia
    : colors.bone;
  const iconSize = 22;
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

      {/* Active indicator — tiny gradient dot */}
      <View style={s.indicatorSlot}>
        <Animated.View style={[
          s.indicatorDot,
          { backgroundColor: colors.sepia },
          dotStyle
        ]} />
      </View>
    </View>
  );
}

function LobbyTabIcon({ focused }: { focused: boolean }) {
  const scale = useSharedValue(focused ? 1.15 : 1);
  const iconOpacity = useSharedValue(focused ? 1 : 0.35);
  const dotScale = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
    iconOpacity.value = withTiming(focused ? 1 : 0.35, { duration: 200 });
    dotScale.value = withSpring(focused ? 1 : 0, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
  }, [focused, scale, iconOpacity, dotScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: iconOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotScale.value,
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
        <Animated.View style={[
          s.indicatorDot,
          { backgroundColor: colors.flicker },
          s.centerGlow,
          dotStyle
        ]} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════
//  TAB BAR BACKGROUND — Frosted ink glass
// ════════════════════════════════════════════════════════════════
const TAB_BAR_BORDER_COLORS = ['rgba(196,150,26,0)', 'rgba(196,150,26,0.1)', 'rgba(196,150,26,0)'] as const;

function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BlurView
        intensity={65}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, s.tabBarTint]} />
      {/* Sepia gradient border at top */}
      <LinearGradient
        colors={TAB_BAR_BORDER_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.topBorder}
      />
    </View>
  );
}

const renderHeader = () => <TopNavBar />;
const renderTabBarBackground = () => <TabBarBackground />;
const renderDispatchIcon = ({ focused }: { focused: boolean }) => <TabIcon IconComponent={Newspaper} focused={focused} />;
const renderReelsIcon = ({ focused }: { focused: boolean }) => <TabIcon IconComponent={Film} focused={focused} />;
const renderLobbyIcon = ({ focused }: { focused: boolean }) => <LobbyTabIcon focused={focused} />;
const renderDarkroomIcon = ({ focused }: { focused: boolean }) => <TabIcon IconComponent={Clapperboard} focused={focused} />;
const renderProfileIcon = ({ focused }: { focused: boolean }) => <TabIcon IconComponent={User} focused={focused} />;

// ════════════════════════════════════════════════════════════════
//  TAB LAYOUT
//  Dispatch • The Reel • LOBBY • Darkroom • Profile
// ════════════════════════════════════════════════════════════════
export default function TabLayout() {
  const insets = useSafeAreaInsets();

  // THE INITIATION — the Society's once-ever induction for newborn accounts.
  // Triple-locked against ever repeating (see useInitiation). Beat IV's
  // "LOG YOUR FIRST FILM" opens the log modal directly — the ceremony ends in
  // the action, not a Done button.
  const initiation = useInitiation();
  const handleInitiationComplete = React.useCallback((action: 'log' | 'quiet') => {
    initiation.dismiss();
    if (action === 'log') {
      setTimeout(() => nav.push('/log-modal'), 250);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiation.dismiss]);

  return (
    <>
    <Tabs
      screenOptions={{
        header: renderHeader,
        headerTransparent: true,
        headerShown: true,
        tabBarHideOnKeyboard: true,
        tabBarButton: HapticTab,
        tabBarStyle: [s.tabBar, { height: 56 + Math.max(insets.bottom, 10), paddingBottom: Math.max(insets.bottom, 10) }],
        tabBarBackground: renderTabBarBackground,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.sepia,
        tabBarInactiveTintColor: colors.fog,
      }}
    >
      <Tabs.Screen
        name="dispatch"
        options={{
          title: 'Dispatch',
          tabBarAccessibilityLabel: 'Dispatch tab',
          tabBarButtonTestID: 'dispatch-tab',
          tabBarIcon: renderDispatchIcon,
        }}
      />

      <Tabs.Screen
        name="reels"
        options={{
          title: 'The Reel',
          tabBarAccessibilityLabel: 'The Reel tab',
          tabBarButtonTestID: 'reels-tab',
          tabBarIcon: renderReelsIcon,
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: 'Lobby',
          tabBarAccessibilityLabel: 'Lobby tab',
          tabBarButtonTestID: 'home-tab',
          tabBarIcon: renderLobbyIcon,
        }}
      />

      <Tabs.Screen
        name="darkroom"
        options={{
          title: 'Darkroom',
          tabBarAccessibilityLabel: 'Darkroom tab',
          tabBarButtonTestID: 'darkroom-tab',
          tabBarIcon: renderDarkroomIcon,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarButtonTestID: 'profile-tab',
          tabBarIcon: renderProfileIcon,
        }}
      />

      <Tabs.Screen name="lounge" options={{ href: null }} />
    </Tabs>

    <InitiationModal
      visible={initiation.visible}
      username={initiation.username}
      memberNo={initiation.memberNo}
      onComplete={handleInitiationComplete}
    />
    </>
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
