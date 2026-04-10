/**
 * OnboardingModal — Multi-step onboarding flow for new users.
 * Introduces ReelHouse Society concepts.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const STEPS = [
    {
        glyph: '◈',
        title: 'Welcome to the Society',
        body: 'The ReelHouse Society is a private archive for devoted cinephiles. Here, every film you watch becomes part of your permanent record.',
    },
    {
        glyph: '✦',
        title: 'Log Your Archive',
        body: 'Rate films on our bespoke 5-reel scale. Write reviews that matter. Track rewatches, abandonments, and private notes.',
    },
    {
        glyph: '▤',
        title: 'Build Your Vault',
        body: 'Curate watchlists, build themed lists, and unlock your Cinema DNA — a fingerprint of your cinematic taste.',
    },
    {
        glyph: '◎',
        title: 'Join the Community',
        body: 'Follow fellow archivists. React to logs. Discuss films in The Lounge. Earn passport stamps as you explore.',
    },
];

interface OnboardingModalProps {
    visible: boolean;
    onComplete: () => void;
}

export default function OnboardingModal({ visible, onComplete }: OnboardingModalProps) {
    const [step, setStep] = useState(0);

    const handleNext = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (step < STEPS.length - 1) {
            setStep(step + 1);
        } else {
            onComplete();
            setStep(0);
        }
    };

    const current = STEPS[step];

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={s.overlay}>
                <View style={s.card}>
                    {/* Progress dots */}
                    <View style={s.dots}>
                        {STEPS.map((_, i) => (
                            <View key={i} style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]} />
                        ))}
                    </View>

                    <Animated.View key={step} entering={SlideInRight.duration(300)} style={s.stepContent}>
                        <Text style={s.glyph}>{current.glyph}</Text>
                        <Text style={s.title}>{current.title}</Text>
                        <Text style={s.body}>{current.body}</Text>
                    </Animated.View>

                    <View style={s.footer}>
                        {step > 0 && (
                            <TouchableOpacity onPress={() => { setStep(step - 1); Haptics.selectionAsync(); }} activeOpacity={0.7}>
                                <Text style={s.backText}>← BACK</Text>
                            </TouchableOpacity>
                        )}
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.7}>
                            <Text style={s.nextText}>
                                {step === STEPS.length - 1 ? 'ENTER THE SOCIETY' : 'NEXT →'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={s.societyTag}>THE REELHOUSE SOCIETY</Text>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: {
        width: '100%', maxWidth: 380, backgroundColor: colors.ink,
        borderWidth: 1, borderColor: colors.sepia, borderRadius: 8, padding: 32,
    },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ash },
    dotActive: { backgroundColor: colors.sepia, width: 24 },
    dotDone: { backgroundColor: 'rgba(139,105,20,0.4)' },
    stepContent: { alignItems: 'center', minHeight: 200, justifyContent: 'center' },
    glyph: { fontFamily: fonts.display, fontSize: 48, color: colors.sepia, marginBottom: 16, opacity: 0.8 },
    title: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, textAlign: 'center', marginBottom: 12 },
    body: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
    footer: { flexDirection: 'row', alignItems: 'center', marginTop: 32 },
    backText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog },
    nextBtn: { backgroundColor: colors.sepia, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 4 },
    nextText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 1, color: colors.ink },
    societyTag: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 4, color: colors.fog, opacity: 0.3, textAlign: 'center', marginTop: 24 },
});
