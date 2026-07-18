/**
 * QuickActionsFAB — The Concierge.
 * ─────────────────────────────────────────────────────────────
 * The ＋ summons a compact card ANCHORED above the button itself
 * (speed-dial grammar), dressed in the house's archival chrome:
 * registration brackets, hairline sepia glow, EST. 1924 rule.
 *
 * Animation law: NO Reanimated entering/exiting inside the native
 * Modal — those flash content at its final position for a frame on
 * both platforms. Open/close is driven by an explicit shared value
 * started in the Modal's onShow, so the first visible frame is
 * always the animation's first frame.
 *
 * Backdrop law: iOS gets true native blur; Android gets a plain
 * scrim (expo-blur on Android is a weak tint at best and the
 * experimental blur method is a documented flicker risk).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Platform, InteractionManager, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { colors, fonts } from '@/src/theme/theme';
import { BlurView } from 'expo-blur';
import { Plus, Film, ListPlus } from 'lucide-react-native';
import PressableScale from '@/src/components/PressableScale';

const OPEN_MS = 200;
const CLOSE_MS = 160;

export default function QuickActionsFAB() {
    const [visible, setVisible] = useState(false);
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    // Derive from actual tab bar height safely via Context instead of throw
    const tabBarHeightContext = React.useContext(BottomTabBarHeightContext);
    const tabBarHeight = tabBarHeightContext ?? 60;
    const fabBottom = Math.max(insets.bottom, 16) + tabBarHeight;

    const rotation = useSharedValue(0);
    const progress = useSharedValue(0);

    const iconStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
    }));

    const cardStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [
            { translateY: (1 - progress.value) * 14 },
            { scale: 0.96 + progress.value * 0.04 },
        ],
    }));

    const openSheet = useCallback(() => {
        TactileEngine.mutate();
        rotation.value = withSpring(45, { damping: 14, stiffness: 200 });
        setOpen(true);
        setVisible(true);
        // progress animates in the Modal's onShow so frame 1 is animation frame 1
    }, [rotation]);

    const closeSheet = useCallback(() => {
        setOpen(false);
        rotation.value = withSpring(0, { damping: 14, stiffness: 200 });
        progress.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.quad) }, (finished) => {
            if (finished) runOnJS(setVisible)(false);
        });
    }, [rotation, progress]);

    const handlePress = useCallback(() => {
        if (open) closeSheet();
        else openSheet();
    }, [open, openSheet, closeSheet]);

    const handleAction = useCallback((route: import('expo-router').Href) => {
        TactileEngine.selection();
        closeSheet();
        InteractionManager.runAfterInteractions(() => {
            (router.push as any)(route);
        });
    }, [closeSheet, router]);

    const onModalShow = useCallback(() => {
        progress.value = withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.quad) });
    }, [progress]);

    const cardWidth = Math.min(280, windowWidth - 32);

    return (
        <>
            {/* The FAB */}
            <PressableScale
                style={[s.fab, { bottom: fabBottom }, open && s.fabActive]}
                onPress={handlePress}
                pressedScale={0.9}
                accessibilityLabel={open ? 'Close quick actions' : 'Open quick actions'}
            >
                <Animated.View style={iconStyle}>
                    <Plus size={24} color={open ? colors.bloodReel : colors.ink} strokeWidth={3} />
                </Animated.View>
            </PressableScale>

            {/* The Concierge card, anchored above the FAB */}
            <Modal statusBarTranslucent visible={visible} transparent animationType="none" onShow={onModalShow} onRequestClose={closeSheet}>
                {/* Backdrop — iOS: native blur; Android: plain scrim (no blur surface = no flicker) */}
                <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
                    {Platform.OS === 'ios' ? (
                        <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
                    ) : null}
                    <View style={[StyleSheet.absoluteFill, s.scrim]} />
                    <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSheet} accessible={false} importantForAccessibility="no-hide-descendants" />
                </Animated.View>

                <Animated.View
                    style={[s.card, { width: cardWidth, right: 16, bottom: fabBottom + 56 + 14 }, cardStyle]}
                    accessibilityViewIsModal
                >
                    {/* Hairline sepia glow along the top — same law as the login form card */}
                    <View style={s.cardGlow} />
                    {/* Archival registration brackets in the corners */}
                    <View style={[s.bracket, s.bracketTL]} />
                    <View style={[s.bracket, s.bracketTR]} />
                    <View style={[s.bracket, s.bracketBL]} />
                    <View style={[s.bracket, s.bracketBR]} />

                    <Text style={s.sheetTitle}>✦ THE CONCIERGE ✦</Text>
                    <Text style={s.sheetLore}>At your service, day or night.</Text>

                    <View style={s.estRow}>
                        <View style={s.estLine} />
                        <Text style={s.estText}>EST. 1924</Text>
                        <View style={s.estLine} />
                    </View>

                    <PressableScale style={s.actionRow} onPress={() => handleAction('/log-modal')} accessibilityRole="button" accessibilityLabel="Log a film">
                        <View style={[s.actionIconWrap, s.actionIconLog]}>
                            <Film size={18} color={colors.sepia} strokeWidth={1.5} />
                        </View>
                        <View style={s.actionTextCol}>
                            <Text style={s.actionTitle}>Log a Film</Text>
                            <Text style={s.actionDesc}>Search the archive and document your reel.</Text>
                        </View>
                    </PressableScale>

                    <View style={s.rowDivider} />

                    <PressableScale style={s.actionRow} onPress={() => handleAction('/list-modal')} accessibilityRole="button" accessibilityLabel="Create a curated list">
                        <View style={[s.actionIconWrap, s.actionIconList]}>
                            <ListPlus size={18} color={colors.bone} strokeWidth={1.5} />
                        </View>
                        <View style={s.actionTextCol}>
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

    scrim: { backgroundColor: 'rgba(4,3,2,0.66)' },

    card: {
        position: 'absolute',
        backgroundColor: colors.soot,
        borderWidth: 1,
        borderColor: colors.sepiaBorder,
        borderRadius: 6,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 6,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
        elevation: 10,
    },
    cardGlow: {
        position: 'absolute', top: 0, left: 22, right: 22, height: 1,
        backgroundColor: colors.sepia, opacity: 0.3,
    },
    bracket: {
        position: 'absolute', width: 10, height: 10,
        borderColor: 'rgba(184,137,26,0.45)',
    },
    bracketTL: { top: 6, left: 6, borderLeftWidth: 1, borderTopWidth: 1 },
    bracketTR: { top: 6, right: 6, borderRightWidth: 1, borderTopWidth: 1 },
    bracketBL: { bottom: 6, left: 6, borderLeftWidth: 1, borderBottomWidth: 1 },
    bracketBR: { bottom: 6, right: 6, borderRightWidth: 1, borderBottomWidth: 1 },

    sheetTitle: {
        fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, textAlign: 'center',
    },
    sheetLore: {
        fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.6, marginTop: 4, textAlign: 'center',
    },
    estRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 2 },
    estLine: { flex: 1, height: 1, backgroundColor: colors.sepia, opacity: 0.2 },
    estText: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 2, color: colors.sepia, opacity: 0.7 },

    actionRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12,
    },
    rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(184,137,26,0.18)' },
    actionIconWrap: {
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    actionIconLog: { backgroundColor: colors.sepiaFaint, borderColor: 'rgba(184,137,26,0.35)' },
    actionIconList: { backgroundColor: 'rgba(232,223,200,0.06)', borderColor: 'rgba(215,205,190,0.2)' },
    actionTextCol: { flex: 1, minWidth: 0 },
    actionTitle: {
        fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 3,
    },
    actionDesc: {
        fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.fog,
    },
});
