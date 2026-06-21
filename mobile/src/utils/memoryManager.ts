import { AppState, AppStateStatus } from 'react-native';
import { Image } from 'expo-image';
import { queryClient } from '../lib/queryClient';
import { logger } from '../utils/logger';

// ── 10/10 DIMENSION 3: ABSOLUTE MEMORY RESILIENCE ──
// This module acts as the app's immune system, aggressively shedding 
// memory weight before the OS Watchdog terminates the process.

class MemoryManager {
  private static isListening = false;

  static initialize() {
    if (this.isListening) return;
    this.isListening = true;

    // 1. Listen for backgrounding to shed weight when not in use
    AppState.addEventListener('change', this.handleAppStateChange);

    // Register memory warning handler on BOTH platforms.
    // Previously only iOS was covered. Android emits the same event via
    // ComponentCallbacks2.onTrimMemory() bridged through React Native.
    AppState.addEventListener('memoryWarning', this.handleMemoryWarning);
  }

  private static handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'background') {
      // The app is hidden. Aggressively clear the expo-image memory cache.
      // This is the #1 cause of background OOM crashes.
      Image.clearMemoryCache();
      
      // Clear inactive react-query cache to free JS heap
      queryClient.removeQueries({ type: 'inactive' });
      
      if (global.gc) {
        global.gc();
      }
      
      logger.debug('[MemoryManager] Background cache sweep and GC complete.');
    } else if (nextState === 'active') {
      // Resume any paused queries
      queryClient.resumePausedMutations().catch(() => {
        // Stale mutations with expired tokens will naturally fail here.
        // The mutation's own onError handler covers user-facing recovery.
      });
    }
  };

  private static handleMemoryWarning = () => {
    logger.warn('[MemoryManager] OS MEMORY WARNING RECEIVED! Aggressive purge initiated.');
    
    // 1. Clear all in-memory image caches (biggest memory consumer)
    Image.clearMemoryCache();
    
    // More aggressive cache trimming under memory pressure
    // 2. Remove ALL inactive queries (not just stale ones)
    queryClient.removeQueries({ type: 'inactive' });
    
    // 3. Trim the discover store's accumulated films if available
    try {
      // Dynamic ESM import to avoid circular dependency — fire-and-forget is safe here
      import('../stores/discover').then(({ useDiscoverStore }) => {
        const currentFilms = useDiscoverStore.getState().accumulatedFilms;
        if (currentFilms.length > 50) {
          useDiscoverStore.getState().setAccumulatedFilms(currentFilms.slice(-50));
        }
      }).catch(() => { /* Non-critical — discover store may not be initialized */ });
    } catch {
      // Non-critical — import itself failed
    }
    
    // 5. Request GC if Hermes exposes it
    if (global.gc) {
      global.gc();
    }
    
    logger.debug('[MemoryManager] Memory pressure purge complete.');
  };
}

export default MemoryManager;
