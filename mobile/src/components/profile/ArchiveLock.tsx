import React, { useEffect, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { View, Text, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, fonts } from '@/src/theme/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';

/**
 * The biometric screen in front of a member's OWN Archive — the room of every
 * film they have seen — when they have turned the lock on in Settings.
 *
 * It was called VaultLock, and it asked the phone to "Unlock Vault". The Vault
 * is the private notes, and the profile's disc shelf carried the same name, so
 * Settings ended up promising this lock guarded the Physical Archive. It never
 * did: it has only ever stood in front of the Archive.
 */
export default function ArchiveLock({ onUnlocked }: { onUnlocked: () => void }) {
    const [locked, setLocked] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function authenticate() {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                onUnlocked();
                return setLocked(false);
            }

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) {
                onUnlocked();
                return setLocked(false);
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock your Archive',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
            });

            if (result.success) {
                setError('');
                onUnlocked();
                setLocked(false);
            } else {
                setError('Authentication Failed');
            }

        } catch (e) {
            // Fail CLOSED: an error in the auth flow must never grant access.
            // The Archive stays locked and the member can retry.
            setError('Authentication Unavailable');
        }
    }

    if (!locked) return null;

    return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
            <Text {...scaledTextProps} style={styles.title}>RESTRICTED ACCESS</Text>
            <Text {...scaledTextProps} style={styles.subtitle}>Authenticate to view your private archive.</Text>
            {error ? <Text {...scaledTextProps} style={styles.error}>{error}</Text> : null}
            <PressableScale style={styles.button} onPress={authenticate} accessibilityRole="button" accessibilityLabel="Authenticate to open your Archive">
                <Text {...scaledTextProps} style={styles.btnText}>AUTHENTICATE</Text>
            </PressableScale>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    title: {
        fontFamily: fonts.sub,
        fontSize: 15,
        color: colors.parchment,
        letterSpacing: 3,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: fonts.sub,
        fontSize: 12,
        color: colors.fog,
        marginBottom: 32,
    },
    error: {
        fontFamily: fonts.sub,
        fontSize: 12,
        color: colors.danger,
        marginBottom: 24,
    },
    button: {
        borderWidth: 1,
        borderColor: colors.sepia,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 4,
    },
    btnText: {
        fontFamily: fonts.sub,
        fontSize: 11,
        color: colors.sepia,
        letterSpacing: 2,
    }
});
