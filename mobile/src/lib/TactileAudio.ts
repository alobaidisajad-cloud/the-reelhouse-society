import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useSettingsStore } from '../stores/settings';

class TactileAudioEngine {
    private shutterSound?: Audio.Sound;
    private vaultSound?: Audio.Sound;

    async initialize() {
        // In a real production app, we would require actual ultra-compressed mp3s here
        // e.g., require('../../assets/sounds/shutter.mp3')
        // For now we will setup the Audio mode for optimal playback
        try {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });
        } catch (e) {
            if (__DEV__) console.error('Failed to initialize TactileAudioEngine', e);
        }
    }

    async playShutter() {
        const { tactileAudioEnabled } = useSettingsStore.getState();
        // #1 AUDIT FIX: Check preference BEFORE firing haptic
        if (!tactileAudioEnabled) return;
        
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        // if (this.shutterSound) await this.shutterSound.replayAsync();
    }

    async playVaultLock() {
        const { tactileAudioEnabled } = useSettingsStore.getState();
        // #1 AUDIT FIX: Check preference BEFORE firing haptic
        if (!tactileAudioEnabled) return;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // if (this.vaultSound) await this.vaultSound.replayAsync();
    }

    async playSubtleClick() {
        const { tactileAudioEnabled } = useSettingsStore.getState();
        if (!tactileAudioEnabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
}

export const TactileAudio = new TactileAudioEngine();
