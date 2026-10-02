import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, fonts } from '@/src/theme/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { nav } from '@/src/utils/typedRouter';

/**
 * The lock in front of a member's OWN Archive — the room of every film they
 * have seen — when they have turned it on in Settings.
 *
 * Not the Vault (that is the private notes) and not the Physical Archive (the
 * disc shelf): it stands in front of the Archive alone, and says so.
 *
 * It asks whatever the phone has: Face ID or Touch ID, else the passcode. A
 * phone with neither cannot open it, and it never opens unasked: it stays
 * shut, says why, and offers the way to turn it off. Every error fails CLOSED.
 * (The room behind it is not drawn while it stands — see ProfileArchiveTab —
 * so a screen reader cannot read past it either.)
 */
export default function ArchiveLock({ onUnlocked }: { onUnlocked: () => void }) {
    const [error, setError] = useState('');
    /** The phone has nothing to open the lock with. */
    const [noMeans, setNoMeans] = useState(false);

    useEffect(() => {
        authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function authenticate() {
        try {
            const level = await LocalAuthentication.getEnrolledLevelAsync();
            if (level === LocalAuthentication.SecurityLevel.NONE) {
                setNoMeans(true);
                setError('This phone has no Face ID, Touch ID or passcode to open it with.');
                return;
            }
            setNoMeans(false);

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock your Archive',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
            });

            if (result.success) {
                setError('');
                onUnlocked();
            } else {
                setError('Authentication Failed');
            }
        } catch {
            // Fail CLOSED: an error in the auth flow must never grant access.
            // The Archive stays locked and the member can retry.
            setError('Authentication Unavailable');
        }
    }

    return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.container}>
            <Text {...scaledTextProps} style={styles.title}>RESTRICTED ACCESS</Text>
            <Text {...scaledTextProps} style={styles.subtitle}>Authenticate to view your private archive.</Text>
            {error ? <Text {...scaledTextProps} style={styles.error}>{error}</Text> : null}
            <PressableScale style={styles.button} onPress={authenticate} hitSlop={{ top: 15, bottom: 9, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel="Authenticate to open your Archive">
                <Text {...scaledTextProps} style={styles.btnText}>AUTHENTICATE</Text>
            </PressableScale>
            {noMeans && (
                <PressableScale style={styles.settingsBtn} onPress={() => nav.push('/settings')} hitSlop={{ top: 9, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel="Turn the lock off in Settings">
                    <Text {...scaledTextProps} style={styles.settingsText}>TURN THE LOCK OFF IN SETTINGS</Text>
                </PressableScale>
            )}
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
        paddingHorizontal: 32,
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
        textAlign: 'center',
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
    },
    settingsBtn: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 12 },
    settingsText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, letterSpacing: 1.6 },
});
