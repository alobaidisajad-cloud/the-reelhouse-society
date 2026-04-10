import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
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
import { colors, fonts, effects } from '@/src/theme/theme';
import { TopNavBar } from '@/src/components/layout/TopNavBar';

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
}: {
  IconComponent: typeof Newspaper;
  focused: boolean;
  isCenter?: boolean;
}) {
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(0.35);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 15,
      stiffness: 220,
      mass: 0.5,
    });
    iconOpacity.value = withTiming(focused ? 1 : 0.35, { duration: 200 });
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

      {/* Active indicator — tiny gradient dot */}
      <View style={s.indicatorSlot}>
        {focused && (
          <View style={[
            s.indicatorDot,
            { backgroundColor: isCenter ? colors.flicker : colors.sepia },
            isCenter && {
              shadowColor: colors.flicker,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 6,
              elevation: 4,
            },
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
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,10,8,0.88)' }]} />
      <BlurView
        intensity={Platform.OS === 'ios' ? 45 : 90}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
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
  return (
    <Tabs
      screenOptions={{
        header: () => <TopNavBar />,
        headerTransparent: true,
        headerShown: true,
        tabBarButton: HapticTab,
        tabBarStyle: s.tabBar,
        tabBarBackground: () => <TabBarBackground />,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.sepia,
        tabBarInactiveTintColor: colors.fog,
      }}
    >
      <Tabs.Screen
        name="dispatch"
        options={{
          title: 'Dispatch',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={Newspaper} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="reels"
        options={{
          title: 'The Reel',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={Film} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: 'Lobby',
          tabBarIcon: ({ focused }) => {
            const iconColor = focused ? colors.flicker : colors.bone;
            const iconOpacity = focused ? 1 : 0.35;
            return (
              <View style={s.tabIconRoot}>
                <Animated.View style={[
                  s.tabIconInner,
                  { opacity: iconOpacity, transform: [{ scale: focused ? 1.15 : 1 }] },
                ]}>
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
                      {
                        shadowColor: colors.flicker,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 6,
                        elevation: 4,
                      },
                    ]} />
                  )}
                </View>
              </View>
            );
          },
        }}
      />

      <Tabs.Screen
        name="darkroom"
        options={{
          title: 'Darkroom',
          tabBarIcon: ({ focused }) => (
            <TabIcon IconComponent={Clapperboard} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
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
const BOTTOM_INSET = Platform.OS === 'ios' ? 28 : 10;

const s = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56 + BOTTOM_INSET,
    paddingBottom: BOTTOM_INSET,
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
});
