import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandMMKVStorage as zustandStorage } from './mmkv-storage';
import { registerStoreReset } from './resetAllStores';

interface SettingsState {
    tactileAudioEnabled: boolean;
    setTactileAudioEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            tactileAudioEnabled: true, // Enabled by default for the premium feel
            setTactileAudioEnabled: (enabled) => set({ tactileAudioEnabled: enabled }),
        }),
        {
            name: 'reelhouse-settings',
            storage: createJSONStorage(() => zustandStorage),
        }
    )
);

// C-04 AUDIT FIX: Register cleanup handler for centralized logout
registerStoreReset(() => {
    useSettingsStore.setState({ tactileAudioEnabled: true });
});
