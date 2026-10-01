import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Animated, { FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme/theme';
import PressableScale from './PressableScale';
import { Arrive } from './Arrive';
import { ARRIVAL_RISE } from '@/src/hooks/useArrival';

export default function OfflineBanner() {
    const netInfo = useNetInfo();
    const insets = useSafeAreaInsets();
    const [checking, setChecking] = useState(false);
    // Track elapsed offline time
    const offlineSince = useRef<number | null>(null);
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        if (netInfo.isConnected === false) {
            if (!offlineSince.current) offlineSince.current = Date.now();
            const timer = setInterval(() => {
                const mins = Math.floor((Date.now() - (offlineSince.current || Date.now())) / 60000);
                setElapsed(mins > 0 ? ` · ${mins}m ago` : '');
            }, 30000);
            return () => clearInterval(timer);
        } else {
            offlineSince.current = null;
            setElapsed('');
        }
    }, [netInfo.isConnected]);

    if (netInfo.isConnected !== false) return null;

    const handleRetry = async () => {
        setChecking(true);
        await NetInfo.fetch(); // Force re-check
        setTimeout(() => setChecking(false), 1000);
    };

    return (
        <Animated.View
            exiting={FadeOutUp.duration(300)}
            // Clear of the tab bar on every device; touches pass around the plate.
            style={[styles.frame, { bottom: Math.max(insets.bottom, 20) + 82 }]}
            pointerEvents="box-none"
        >
            {/* Arrive, not an `entering`: one stalled at opacity 0 and the E2E
                found the device offline with no banner to say so. */}
            <Arrive name="offline-banner" duration={300} rise={-ARRIVAL_RISE} style={styles.plate}>
                <PressableScale onPress={handleRetry} pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Retry connection">
                    <Text style={styles.text}>
                        {checking ? 'CHECKING CONNECTION…' : `OPERATING IN ISOLATION${elapsed}`}
                    </Text>
                </PressableScale>
            </Arrive>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    // The frame holds the banner's place above everything: Android stacks by
    // elevation before order, so it carries the plate's elevation as well.
    frame: {
        position: 'absolute',
        alignSelf: 'center',
        zIndex: 99999,
        elevation: 8,
    },
    plate: {
        backgroundColor: colors.bloodReel,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 4,
        minWidth: 200,
        maxWidth: 300,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    text: {
        color: colors.parchment,
        fontFamily: fonts.sub,
        fontSize: 10,
        letterSpacing: 2,
    }
});

