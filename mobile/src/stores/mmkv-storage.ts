import { StateStorage, PersistStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { InteractionManager } from 'react-native';

export const storage = new MMKV();
const _pendingWrites = new Map<string, any>();

// Legacy synchronous storage for non-monolithic stores
export const zustandMMKVStorage: StateStorage = {
  setItem: (name, value) => storage.set(name, value),
  getItem: (name) => storage.getString(name) ?? null,
  removeItem: (name) => storage.delete(name),
};

// Asynchronous Deferred Serialization
// Pushes BOTH the heavy JSON.stringify of the monolithic state tree AND the 
// MMKV disk write onto the InteractionManager queue. This guarantees that 
// rapid store mutations (e.g. liking a film, scrolling) never block the 
// UI thread's 60fps frame budget.
export const createAsyncMMKVStorage = <T>(): PersistStorage<T> => ({
  getItem: (name) => {
    const str = storage.getString(name);
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  },
  setItem: (name, newValue) => {
    _pendingWrites.set(name, newValue);
    
    let executed = false;
    const flush = () => {
      if (executed) return;
      executed = true;
      clearTimeout(fallback);
      
      if (_pendingWrites.get(name) !== newValue) return;
      
      try {
        const str = JSON.stringify(newValue);
        storage.set(name, str);
      } catch (err) {
        if (__DEV__) console.warn('[AsyncMMKVStorage] Serialization failed', err);
      }
    };
    
    const task = InteractionManager.runAfterInteractions(flush);
    const fallback = setTimeout(() => {
      task.cancel();
      flush();
    }, 1500); // 1.5s fallback to prevent data loss during continuous animations
  },
  removeItem: (name) => {
    _pendingWrites.delete(name);
    storage.delete(name);
  },
});
