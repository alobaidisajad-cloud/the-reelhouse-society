import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '../theme/theme';
import PressableScale from './PressableScale';
import { Arrive } from './Arrive';
import { Presence, PresenceView } from './motion/Presence';
import { ARRIVAL_RISE } from '@/src/hooks/useArrival';
import { useOverlayBottom } from '@/src/components/layout/navMetrics';

export default function OfflineBanner() {
    const netInfo = useNetInfo();
    const overlayBottom = useOverlayBottom();
    const [checking, setChecking] = useState(false);
    // Track elapsed offline time
    const offlineSince = useRef<number | null>(null);
    const [elapsed, setElapsed] = useState('');
    const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

    useEffect(() => {
        if (netInfo.isConnected === false) {
            if (!offlineSince.current) offlineSince.current = Date.now();
            const timer = setInterval(() => {
                const mins = Math.floor((Date.now() - (offlineSince.current || Date.now())) / 60000);
                // The house's own measure (timeAgo): "4 MIN.", never "4m".
                setElapsed(mins > 0 ? ` · ${mins} MIN.` : '');
            }, 30000);
            return () => clearInterval(timer);
        } else {
            offlineSince.current = null;
            setElapsed('');
        }
    }, [netInfo.isConnected]);

    const handleRetry = async () => {
        setChecking(true);
        await NetInfo.fetch(); // Force re-check
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => setChecking(false), 1000);
    };

    return (
        <Presence>
        {netInfo.isConnected === false ? (
        <PresenceView
            key="offline"
            name="offline-banner.leave"
            exit={{ kind: 'FadeOutUp', duration: 300 }}
            // Clear of the tab bar on every device; touches pass around the plate.
            style={[styles.frame, { bottom: overlayBottom }]}
            pointerEvents="box-none"
        >
            {/* Arrive, not an `entering`: one stalled at opacity 0 and the E2E
                found the device offline with no banner to say so. */}
            <Arrive name="offline-banner" duration={300} rise={-ARRIVAL_RISE} style={styles.plate}>
                {/* The label says the state as well as the act: it replaces the
                    words on the plate, and "Retry connection" never said why. */}
                <PressableScale
                    onPress={handleRetry}
                    pressedScale={0.96}
                    accessibilityRole="button"
                    accessibilityLabel={checking ? 'Checking the connection' : 'Offline. Check the connection again'}
                >
                    <Text style={styles.text}>
                        {checking ? 'CHECKING CONNECTION…' : `OPERATING IN ISOLATION${elapsed}`}
                    </Text>
                </PressableScale>
            </Arrive>
        </PresenceView>
        ) : null}
        </Presence>
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

