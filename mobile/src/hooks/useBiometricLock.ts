import { logger } from '@/src/utils/logger';
import { useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const VAULT_KEY = 'nitrate_vault_encryption_key';
const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of grace period

export function useBiometricLock() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [lastUnlocked, setLastUnlocked] = useState<number>(0);

  useEffect(() => {
    async function checkHardware() {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsSupported(compatible && enrolled);
      } catch (err) {
        if (__DEV__) logger.warn('[BiometricLock] checkHardware failed:', err);
        setIsSupported(false);
      }
    }
    checkHardware();
  }, []);

  // Replace 10s polling interval with AppState listener.
  // setInterval burns CPU in background; AppState fires only on foreground resume.
  useEffect(() => {
    if (!isUnlocked) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppState } = require('react-native');
    const subscription = AppState.addEventListener('change', (nextState: string) => {
      if (nextState === 'active' && Date.now() - lastUnlocked > LOCK_TIMEOUT_MS) {
        setIsUnlocked(false);
      }
    });
    return () => subscription.remove();
  }, [isUnlocked, lastUnlocked]);

  const authenticate = async (): Promise<boolean> => {
    try {
      if (!isSupported) {
        // Fallback for simulators or devices without biometrics
        setIsUnlocked(true);
        setLastUnlocked(Date.now());
        return true;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Vault Enclave',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        // Generate or retrieve encryption key (Hardware Cryptography Pillar)
        let key = await SecureStore.getItemAsync(VAULT_KEY);
        if (!key) {
          key = Crypto.randomUUID().replace(/-/g, '');
          await SecureStore.setItemAsync(VAULT_KEY, key);
        }
        
        setIsUnlocked(true);
        setLastUnlocked(Date.now());
        return true;
      }
      return false;
    } catch (err) {
      if (__DEV__) logger.warn('[BiometricLock] Error:', err);
      return false;
    }
  };

  const lock = () => setIsUnlocked(false);

  return { isUnlocked, isSupported, authenticate, lock };
}
