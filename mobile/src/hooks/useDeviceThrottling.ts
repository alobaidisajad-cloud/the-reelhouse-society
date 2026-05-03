import { useState, useEffect } from 'react';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { storage } from '../stores/mmkv-storage';

const THROTTLE_KEY = 'reelhouse_animation_throttle';

/**
 * useDeviceThrottling — Performance Optimization.
 *
 * Detects low-end hardware (based on OS versions, memory, or explicit settings)
 * and automatically throttles heavy animations like grain, blur views, and
 * complex physics to preserve UI-thread frame rates (60fps target).
 */
export function useDeviceThrottling(): boolean {
    const [isThrottled, setIsThrottled] = useState(false);

    useEffect(() => {
        // Allow user override from settings
        const userSetting = storage.getBoolean(THROTTLE_KEY);
        if (userSetting !== undefined) {
            setIsThrottled(userSetting);
            return;
        }

        let throttle = false;
        
        // Capability-based detection instead of hardcoded strings
        // If device has less than 3GB of RAM, throttle heavy animations
        if (Device.totalMemory && Device.totalMemory < 3 * 1024 * 1024 * 1024) {
            throttle = true;
        }

        if (Platform.OS === 'android') {
            // Devices before API 28 (Android 9) often struggle with heavy reanimated shaders
            if (Device.platformApiLevel && Device.platformApiLevel < 28) {
                throttle = true;
            }
        }

        setIsThrottled(throttle);
    }, []);

    return isThrottled;
}
