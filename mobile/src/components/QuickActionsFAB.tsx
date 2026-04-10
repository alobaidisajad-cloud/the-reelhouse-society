import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import { BlurView } from 'expo-blur';
import { Plus, Film, ListPlus, Sparkles } from 'lucide-react-native';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export default function QuickActionsFAB() {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setOpen(!open);
    };

    const handleAction = (route: any) => {
        Haptics.selectionAsync();
        setOpen(false);
        setTimeout(() => {
            router.push(route);
        }, 100);
    };

    return (
        <>
            {/* The FAB */}
            <TouchableOpacity
                style={[s.fab, open && s.fabActive]}
                onPress={handlePress}
                activeOpacity={0.8}
            >
                <Animated.View style={{ transform: [{ rotate: open ? '45deg' : '0deg' }] }}>
                    <Plus size={24} color={open ? colors.bloodReel : colors.ink} strokeWidth={3} />
                </Animated.View>
            </TouchableOpacity>

            {/* The Bottom Sheet Modal */}
            <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
                <AnimatedBlurView 
                    entering={FadeIn.duration(200)} 
                    exiting={FadeOut.duration(200)}
                    tint="dark" 
                    intensity={70} 
                    style={StyleSheet.absoluteFill}
                >
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} />
                </AnimatedBlurView>

                <Animated.View 
                    entering={SlideInDown.springify().damping(20).stiffness(200)} 
                    exiting={SlideOutDown.duration(200)} 
                    style={s.sheet}
                >
                    <View style={s.knob} />
                    
                    <Text style={s.sheetTitle}>QUICK ACTIONS</Text>

                    <TouchableOpacity style={s.actionRow} onPress={() => handleAction('/log-modal')} activeOpacity={0.7}>
                        <View style={[s.actionIconWrap, { backgroundColor: 'rgba(196,150,26,0.1)' }]}>
                            <Film size={20} color={colors.sepia} />
                        </View>
                        <View>
                            <Text style={s.actionTitle}>Log a Film</Text>
                            <Text style={s.actionDesc}>Search the archive and document your reel.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.actionRow} onPress={() => handleAction('/list-modal')} activeOpacity={0.7}>
                        <View style={[s.actionIconWrap, { backgroundColor: 'rgba(232,223,200,0.1)' }]}>
                            <ListPlus size={20} color={colors.bone} />
                        </View>
                        <View>
                            <Text style={s.actionTitle}>Create Curated List</Text>
                            <Text style={s.actionDesc}>Compile your thematic favourites.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={[s.actionRow, { borderBottomWidth: 0 }]} onPress={() => handleAction('/darkroom')} activeOpacity={0.7}>
                        <View style={[s.actionIconWrap, { backgroundColor: 'rgba(107,26,10,0.15)' }]}>
                            <Sparkles size={20} color={colors.bloodReel} />
                        </View>
                        <View>
                            <Text style={s.actionTitle}>Consult the Oracle</Text>
                            <Text style={s.actionDesc}>Find esoteric cinema based on feelings.</Text>
                        </View>
                    </TouchableOpacity>

                </Animated.View>
            </Modal>
        </>
    );
}

const s = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 24 : 16,
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
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderColor: colors.ash,
    },
    knob: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ash,
        alignSelf: 'center', marginBottom: 20,
    },
    sheetTitle: {
        fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.fog, marginBottom: 20
    },
    actionRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
    },
    actionIconWrap: {
        width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 16,
    },
    actionTitle: {
        fontFamily: fonts.display, fontSize: 16, color: colors.parchment, marginBottom: 4,
    },
    actionDesc: {
        fontFamily: fonts.body, fontSize: 11, color: colors.fog,
    }
});
