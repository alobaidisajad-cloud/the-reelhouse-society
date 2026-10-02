import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, fonts } from '@/src/theme/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { nav } from '@/src/utils/typedRouter';
import { useAuthStore } from '@/src/stores/auth';

/**
 * The lock in front of a member's OWN Archive — every film they have logged —
 * when they have turned it on in Settings.
 *
 * It holds the Archive wherever it is shown on their own file: the Archive
 * room, the Ledger, the calendar and LATELY. It once stood in front of the
 * Archive room alone, with the same films one tap away beside it. One opening
 * opens all of it, for that visit.
 *
 * Not the Vault (that is the private notes) and not the Physical Archive (the
 * disc shelf).
 *
 * It asks whatever the phone has: Face ID or Touch ID, else the passcode. A
 * phone with neither cannot open it, and it never opens unasked: it stays
 * shut, says why, and offers the way to turn it off. Every error fails CLOSED.
 * (What it holds is not drawn while it stands, so a screen reader cannot read
 * past it either.)
 */

/** The lock's state for one visit to a file: shut until opened, and only on your own. */
export function useArchiveLock(isSelf: boolean): { locked: boolean; opened: () => void } {
    const on = useAuthStore((s) => s.user?.preferences?.biometric_lock === true);
    const [open, setOpen] = useState(false);
    const opened = useCallback(() => setOpen(true), []);
    return { locked: isSelf && on && !open, opened };
}

type Asked = { ok: true } | { ok: false; error: string; noMeans: boolean };

/** Asks the phone. Never resolves `ok` without the phone's own yes. */
async function askThePhone(): Promise<Asked> {
    try {
        const level = await LocalAuthentication.getEnrolledLevelAsync();
        if (level === LocalAuthentication.SecurityLevel.NONE) {
            return { ok: false, noMeans: true, error: 'This phone has no Face ID, Touch ID or passcode to open it with.' };
        }
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock your Archive',
            fallbackLabel: 'Use Passcode',
            disableDeviceFallback: false,
        });
        return result.success ? { ok: true } : { ok: false, noMeans: false, error: 'Authentication Failed' };
    } catch {
        // Fail CLOSED: an error in the auth flow must never grant access.
        return { ok: false, noMeans: false, error: 'Authentication Unavailable' };
    }
}

/**
 * What stands in a room while the lock is shut. It asks at once (the member
 * came into the room to see it). `inline` sits in a scrolling page; otherwise
 * it fills the room.
 */
export default function ArchiveLock({ onUnlocked, inline = false }: { onUnlocked: () => void; inline?: boolean }) {
    const [error, setError] = useState('');
    /** The phone has nothing to open the lock with. */
    const [noMeans, setNoMeans] = useState(false);

    const authenticate = useCallback(async () => {
        const asked = await askThePhone();
        if (asked.ok) {
            setError('');
            onUnlocked();
        } else {
            setNoMeans(asked.noMeans);
            setError(asked.error);
        }
    }, [onUnlocked]);

    useEffect(() => {
        void authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={inline ? styles.inline : styles.container}>
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

/**
 * The lock where the Archive is a few lines of a longer page (LATELY). It
 * does not ask on sight — the member came for the rest of the page — but
 * opens on a tap, and then opens everything the lock holds.
 */
export function ArchiveLockedLine({ onUnlocked }: { onUnlocked: () => void }) {
    const [error, setError] = useState('');
    const open = useCallback(async () => {
        const asked = await askThePhone();
        if (asked.ok) onUnlocked();
        else setError(asked.error);
    }, [onUnlocked]);

    return (
        <View style={styles.line}>
            <Text {...scaledTextProps} style={styles.lineText}>{"Your recent films are behind your Archive's lock."}</Text>
            {error ? <Text {...scaledTextProps} style={styles.error}>{error}</Text> : null}
            <PressableScale style={styles.button} onPress={open} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} accessibilityRole="button" accessibilityLabel="Authenticate to open your Archive">
                <Text {...scaledTextProps} style={styles.btnText}>AUTHENTICATE</Text>
            </PressableScale>
        </View>
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
    inline: {
        alignItems: 'center',
        paddingVertical: 64,
        paddingHorizontal: 32,
    },
    line: {
        alignItems: 'center',
        paddingVertical: 24,
        paddingHorizontal: 16,
    },
    lineText: {
        fontFamily: fonts.sub,
        fontSize: 12,
        color: colors.fog,
        marginBottom: 16,
        textAlign: 'center',
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
