/**
 * PaywallModal — Membership tier upgrade modal.
 */
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/src/theme/theme';

const TIERS = [
    { name: 'ARCHIVIST', price: '$4.99/mo', features: ['Full analytics & insights', 'CSV export', 'Priority support', 'Unlimited lists'] },
    { name: 'AUTEUR', price: '$9.99/mo', features: ['Everything in Archivist', 'Projector Room', 'Nightly Programmes', 'Profile backdrop', 'Badge of Honor'] },
];

interface PaywallModalProps {
    visible: boolean;
    onClose: () => void;
    recommendedTier?: 'archivist' | 'auteur';
}

export default function PaywallModal({ visible, onClose, recommendedTier }: PaywallModalProps) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.card}>
                    <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
                        <Text style={s.closeBtnText}>✕</Text>
                    </TouchableOpacity>

                    <Animated.View entering={FadeIn.duration(400)}>
                        <Text style={s.eyebrow}>THE REELHOUSE SOCIETY</Text>
                        <Text style={s.title}>Elevate Your Archive</Text>
                        <Text style={s.subtitle}>Unlock premium features reserved for the most devoted cinephiles.</Text>
                    </Animated.View>

                    {TIERS.map((tier, i) => (
                        <Animated.View key={tier.name} entering={FadeInUp.delay(i * 150).duration(400)}>
                            <TouchableOpacity
                                style={[s.tierCard, recommendedTier === tier.name.toLowerCase() && s.tierRecommended]}
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                                activeOpacity={0.7}
                            >
                                {recommendedTier === tier.name.toLowerCase() && (
                                    <Text style={s.recommendedBadge}>RECOMMENDED</Text>
                                )}
                                <Text style={s.tierName}>{tier.name}</Text>
                                <Text style={s.tierPrice}>{tier.price}</Text>
                                {tier.features.map(f => (
                                    <Text key={f} style={s.tierFeature}>✦ {f}</Text>
                                ))}
                                <View style={s.subscribeBtn}>
                                    <Text style={s.subscribeBtnText}>SUBSCRIBE</Text>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 },
    card: { backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.sepia, borderRadius: 8, padding: 28, position: 'relative' },
    closeBtn: { position: 'absolute', top: 12, right: 12, zIndex: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    closeBtnText: { fontSize: 18, color: colors.fog },
    eyebrow: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 4, color: colors.sepia, textAlign: 'center', marginBottom: 8, opacity: 0.7 },
    title: { fontFamily: fonts.display, fontSize: 26, color: colors.parchment, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    tierCard: { borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 20, marginBottom: 12 },
    tierRecommended: { borderColor: colors.sepia, borderWidth: 2 },
    recommendedBadge: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 2, color: colors.ink, backgroundColor: colors.sepia, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2, marginBottom: 8 },
    tierName: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 4 },
    tierPrice: { fontFamily: fonts.ui, fontSize: 12, color: colors.sepia, letterSpacing: 1, marginBottom: 12 },
    tierFeature: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, lineHeight: 20 },
    subscribeBtn: { backgroundColor: colors.sepia, alignItems: 'center', paddingVertical: 12, borderRadius: 4, marginTop: 16 },
    subscribeBtnText: { fontFamily: fonts.uiBold, fontSize: 11, letterSpacing: 2, color: colors.ink },
});
