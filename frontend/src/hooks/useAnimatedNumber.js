/**
 * useAnimatedNumber — Smoothly animates a numeric value from its previous
 * value to the current value using requestAnimationFrame.
 *
 * Uses ease-out cubic for a natural deceleration feel.
 */

import { useState, useRef, useEffect } from 'react';

export function useAnimatedNumber(value, duration = 600) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);
  const frameRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    const prev = prevValueRef.current;
    if (prev === value) return;

    const startTime = performance.now();
    const delta = value - prev;

    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = prev + delta * eased;

      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        prevValueRef.current = value;
      }
    }

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value, duration]);

  // Update ref on change
  useEffect(() => {
    prevValueRef.current = value;
  }, [value]);

  return displayValue;
}
