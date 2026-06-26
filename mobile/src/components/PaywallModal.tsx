/**
 * PaywallModal — Membership tier upgrade modal.
 */
import { InteractionManager, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import PressableScale from '@/src/components/PressableScale';
import { TIERS } from '@/src/constants/membership';
import { useMembershipPricing } from '@/src/hooks/useMembershipPricing';
import { colors, fonts } from '@/src/theme/theme';
import { useRouter } from 'expo-router';

// dynamically map the single source of truth into compact modal variants
const upgradeTiers = TIERS.filter(t => t.id !== 'cinephile').map(t => {
    const compactFeatures = [];
    if (t.featuredFeature) compactFeatures.push(t.featuredFeature.title.replace(/\n/g, ' '));
    compactFeatures.push(...t.features.map(f => f.split('\n')[0]));

    return {
        id: t.id,
        name: t.name.replace(/\n/g, ' ').toUpperCase(),
        // Static fallback price (used when live store pricing isn't available).
        price: `$${t.price}${t.pricePeriod}`.toLowerCase(),
        pricePeriod: t.pricePeriod,
        features: compactFeatures,
    };
});

interface PaywallModalProps {
    visible: boolean;
    onClose: () => void;
    recommendedTier?: 'archivist' | 'auteur';
}

export default function PaywallModal({ visible, onClose, recommendedTier }: PaywallModalProps) {
    const router = useRouter();
    const pricing = useMembershipPricing(); // CONST-3: live store prices (falls back to static)

    const handleUpgrade = () => {
        onClose();
        // Use InteractionManager instead of arbitrary timeout
        InteractionManager.runAfterInteractions(() => {
            (router.push as any)('/membership' as any);
        });
    };
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay} accessibilityViewIsModal={true}>
                <View style={s.card}>
                    <PressableScale style={s.closeBtn} onPress={onClose} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light" pressedScale={0.96}>
                        <Text style={s.closeBtnText}>✕</Text>
                    </PressableScale>

                    <Animated.View entering={FadeIn.duration(400)}>
                        <Text style={s.eyebrow}>THE REELHOUSE SOCIETY</Text>
                        <Text style={s.title}>Elevate Your Archive</Text>
                        <Text style={s.subtitle}>Unlock premium features reserved for the most devoted cinephiles.</Text>
                    </Animated.View>

                    {upgradeTiers.map((tier, i) => {
                        // CONST-3: prefer the live localized store price; fall back to static.
                        const rc = pricing[tier.id];
                        const displayPrice = rc?.monthly ? `${rc.monthly}${tier.pricePeriod}`.toLowerCase() : tier.price;
                        return (
                        <Animated.View key={tier.name} entering={FadeInUp.delay(i * 150).duration(400)}>
                            <PressableScale
                                style={[s.tierCard, recommendedTier === tier.id && s.tierRecommended]}
                                onPress={handleUpgrade}
                                haptic="medium"
                                pressedScale={0.98}
                                accessibilityRole="button"
                                accessibilityLabel={`Subscribe to ${tier.name} for ${displayPrice}`}
                            >
                                {recommendedTier === tier.id && (
                                    <Text style={s.recommendedBadge}>RECOMMENDED</Text>
                                )}
                                <Text style={s.tierName}>{tier.name}</Text>
                                <Text style={s.tierPrice}>{displayPrice}</Text>
                                {tier.features.map(f => (
                                    <Text key={f} style={s.tierFeature}>✦ {f}</Text>
                                ))}
                                <View style={s.subscribeBtn}>
                                    <Text style={s.subscribeBtnText}>SUBSCRIBE</Text>
                                </View>
                            </PressableScale>
                        </Animated.View>
                        );
                    })}
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
