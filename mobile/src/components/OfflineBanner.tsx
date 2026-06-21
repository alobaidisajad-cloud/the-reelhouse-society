import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme/theme';
import PressableScale from './PressableScale';

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
            entering={FadeInUp.duration(300)} 
            exiting={FadeOutUp.duration(300)}
            // FIX #9: Increased offset for devices with larger tab bars + pointer-events safety
            style={[styles.container, { bottom: Math.max(insets.bottom, 20) + 82 }]}
            pointerEvents="box-none"
        >
            <PressableScale onPress={handleRetry} pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Retry connection">
                <Text style={styles.text}>
                    {checking ? 'CHECKING CONNECTION…' : `OPERATING IN ISOLATION${elapsed}`}
                </Text>
            </PressableScale>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: colors.bloodReel,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 4,
        zIndex: 99999,
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
        fontFamily: fonts.mono,
        fontSize: 10,
        letterSpacing: 2,
    }
});

