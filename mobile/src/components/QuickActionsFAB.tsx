import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, InteractionManager } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { colors, fonts } from '@/src/theme/theme';
import { BlurView } from 'expo-blur';
import { Plus, Film, ListPlus } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export default function QuickActionsFAB() {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    // Derive from actual tab bar height safely via Context instead of throw
    const tabBarHeightContext = React.useContext(BottomTabBarHeightContext);
    const tabBarHeight = tabBarHeightContext ?? 60;

    // Fix #7: Animated rotation for premium feel
    const rotation = useSharedValue(0);
    const iconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const handlePress = () => {
        TactileEngine.mutate();
        rotation.value = withSpring(open ? 0 : 45, { damping: 14, stiffness: 200 });
        setOpen(!open);
    };

    const handleAction = (route: import('expo-router').Href) => {
        TactileEngine.selection();
        setOpen(false);
        InteractionManager.runAfterInteractions(() => {
            (router.push as any)(route);
        });
    };

    return (
        <>
            {/* The FAB */}
            <PressableScale
                style={[s.fab, { bottom: Math.max(insets.bottom, 16) + tabBarHeight }, open && s.fabActive]}
                onPress={handlePress}
                pressedScale={0.9}
            >
                <Animated.View style={iconStyle}>
                    <Plus size={24} color={open ? colors.bloodReel : colors.ink} strokeWidth={3} />
                </Animated.View>
            </PressableScale>

            {/* The Bottom Sheet Modal */}
            <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
                <AnimatedBlurView 
                    entering={FadeIn.duration(200)} 
                    exiting={FadeOut.duration(200)}
                    tint="dark" 
                    intensity={70} 
                    style={StyleSheet.absoluteFill}
                >
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} accessible={false} importantForAccessibility="no-hide-descendants" />
                </AnimatedBlurView>

                <Animated.View 
                    entering={SlideInDown.springify().damping(20).stiffness(200)} 
                    exiting={SlideOutDown.duration(200)} 
                    style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}
                >
                    <View style={s.knob} />

                    <Text style={s.sheetTitle}>✦ THE CONCIERGE ✦</Text>
                    <Text style={s.sheetLore}>At your service, day or night.</Text>

                    <PressableScale style={s.actionRow} onPress={() => handleAction('/log-modal')} accessibilityRole="button" accessibilityLabel="Log a film">
                        <View style={[s.actionIconWrap, s.actionIconLog]}>
                            <Film size={20} color={colors.sepia} />
                        </View>
                        <View>
                            <Text style={s.actionTitle}>Log a Film</Text>
                            <Text style={s.actionDesc}>Search the archive and document your reel.</Text>
                        </View>
                    </PressableScale>

                    <PressableScale style={[s.actionRow, s.actionRowLast]} onPress={() => handleAction('/list-modal')} accessibilityRole="button" accessibilityLabel="Create a curated list">
                        <View style={[s.actionIconWrap, s.actionIconList]}>
                            <ListPlus size={20} color={colors.bone} />
                        </View>
                        <View>
                            <Text style={s.actionTitle}>Create Curated List</Text>
                            <Text style={s.actionDesc}>Compile your thematic favourites.</Text>
                        </View>
                    </PressableScale>

                </Animated.View>
            </Modal>
        </>
    );
}

const s = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 24, // Overridden by inline style with safe area insets
        right: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.sepia,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 100,
    },
    fabActive: {
        backgroundColor: colors.ink,
        borderWidth: 1,
        borderColor: colors.bloodReel,
    },
    
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.soot,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        padding: 24,
        borderTopWidth: 1,
        borderColor: colors.ash,
    },
    knob: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ash,
        alignSelf: 'center', marginBottom: 20,
    },
    sheetTitle: {
        fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, marginBottom: 4, textAlign: 'center',
    },
    sheetLore: {
        fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.6, marginBottom: 16, textAlign: 'center',
    },
    actionRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    },
    actionIconWrap: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 16,
    },
    actionIconLog: { backgroundColor: colors.sepiaFaint },
    actionIconList: { backgroundColor: 'rgba(232,223,200,0.1)' },
    actionRowLast: { borderBottomWidth: 0 },
    actionTitle: {
        fontFamily: fonts.display, fontSize: 16, color: colors.parchment, marginBottom: 4,
    },
    actionDesc: {
        fontFamily: fonts.body, fontSize: 11, color: colors.fog,
    }
});
