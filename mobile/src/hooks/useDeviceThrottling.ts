import { useState } from 'react';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Whether this phone is one to spare heavy animation on: under 3GB of memory,
 * or an Android older than 9 (API 28).
 *
 * Known on the FIRST render. Everything it reads is synchronous, and it used to
 * be decided in an effect, after the first render had already answered "no" —
 * so the preloader, deciding then, started its once-only countdown on exactly
 * the phones it meant to spare, then lost the countdown's digits mid-way.
 */
export function throttledDevice(): boolean {
    if (Device.totalMemory && Device.totalMemory < 3 * 1024 * 1024 * 1024) return true;
    return Platform.OS === 'android' && !!Device.platformApiLevel && Device.platformApiLevel < 28;
}

export function useDeviceThrottling(): boolean {
    const [isThrottled] = useState(throttledDevice);
    return isThrottled;
}
