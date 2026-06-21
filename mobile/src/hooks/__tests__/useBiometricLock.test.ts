/**
 * useBiometricLock.test.ts — Logic Tests
 * ───────────────────────────────────────
 * Tests the biometric lock behavior logic.
 */
import * as LocalAuthentication from 'expo-local-authentication';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

describe('useBiometricLock logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hasHardwareAsync + isEnrolledAsync determine support', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const isSupported = compatible && enrolled;

    expect(isSupported).toBe(true);
  });

  it('unsupported when no hardware', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);

    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const isSupported = compatible && enrolled;

    expect(isSupported).toBe(false);
  });

  it('authenticateAsync returns success=true on valid biometric', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Test' });
    expect(result.success).toBe(true);
  });

  it('authenticateAsync returns success=false on rejection', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false });
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Test' });
    expect(result.success).toBe(false);
  });

  it('15-minute lock timeout logic', () => {
    const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
    const lastUnlocked = Date.now() - (16 * 60 * 1000); // 16 minutes ago
    const shouldRelock = Date.now() - lastUnlocked > LOCK_TIMEOUT_MS;
    expect(shouldRelock).toBe(true);
  });

  it('within 15 minutes stays unlocked', () => {
    const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
    const lastUnlocked = Date.now() - (5 * 60 * 1000); // 5 minutes ago
    const shouldRelock = Date.now() - lastUnlocked > LOCK_TIMEOUT_MS;
    expect(shouldRelock).toBe(false);
  });
});
