import { useEffect } from 'react';
import { flushOfflineQueue } from '../utils/offlineQueue';

export function useOfflineSync() {
    useEffect(() => {
        const handleOnline = () => {
            flushOfflineQueue();
        };

        window.addEventListener('online', handleOnline);

        // Attempt flush on mount in case they are online and there are pending items
        if (navigator.onLine) {
            flushOfflineQueue();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
        };
    }, []);
}
