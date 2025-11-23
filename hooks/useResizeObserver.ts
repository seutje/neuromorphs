import React, { useEffect, useRef } from 'react';

export const useResizeObserver = (
    containerRef: React.RefObject<HTMLElement>,
    callback: (width: number, height: number) => void
) => {
    const observerRef = useRef<ResizeObserver | null>(null);
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        observerRef.current = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                callbackRef.current(width, height);
            }
        });

        observerRef.current.observe(container);

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [containerRef]); // Removed callback from dependencies
};
