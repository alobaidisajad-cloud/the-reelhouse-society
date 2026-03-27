import { useState, useEffect } from 'react';

// Flawless, ResizeObserver-backed viewport hook that throttles DOM recalculations
// to the exact animation frame to prevent thrashing, ensuring layout shifts perfectly.
export function useViewport() {
    const [isTouch, setIsTouch] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(any-pointer: coarse)').matches;
    });

    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(max-width: 768px)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkViewport = () => {
            const touchMatch = window.matchMedia('(any-pointer: coarse)').matches;
            const mobileMatch = window.matchMedia('(max-width: 768px)').matches;
            
            // Only update state if values actually change to prevent unnecessary React re-renders
            setIsTouch(prev => prev !== touchMatch ? touchMatch : prev);
            setIsMobile(prev => prev !== mobileMatch ? mobileMatch : prev);
        };

        let frameId: number;
        const resizeObserver = new ResizeObserver(() => {
            if (frameId) window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                checkViewport();
            });
        });

        // Observe the body for fundamental layout changes
        resizeObserver.observe(document.body);

        // Also fallback to matchMedia listeners for zero-delay hardware flips
        const touchQuery = window.matchMedia('(any-pointer: coarse)');
        const mobileQuery = window.matchMedia('(max-width: 768px)');
        
        const handleChange = () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(checkViewport);
        };

        touchQuery.addEventListener('change', handleChange);
        mobileQuery.addEventListener('change', handleChange);

        return () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            touchQuery.removeEventListener('change', handleChange);
            mobileQuery.removeEventListener('change', handleChange);
        };
    }, []);

    return { isTouch, isMobile };
}
