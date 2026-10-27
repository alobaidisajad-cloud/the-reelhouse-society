import { create } from 'zustand';
import { carriedForward, SAVED_VERSION } from './savedVersion';
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
            // What the last release saved, named and carried (savedVersion.ts).
            version: SAVED_VERSION,
            migrate: carriedForward,
            storage: createJSONStorage(() => zustandStorage),
            // Hydration is deferred until after initEncryptedStorage() (LIB-5);
            // _layout calls rehydrateSettingsStore() once the key is resolved.
            skipHydration: true,
        }
    )
);

export const rehydrateSettingsStore = () => useSettingsStore.persist.rehydrate();

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    useSettingsStore.setState({ tactileAudioEnabled: true });
});
