/**
 * LiveClock — Animated clock that updates every second with a smooth
 * fade transition on the time display.
 */

import React, { useState, useEffect } from 'react';

export default function LiveClock() {
  const [time, setTime] = useState(new Date());
  const [ticking, setTicking] = useState(false);

  useEffect(() => {
    setTicking(true);
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="relative">
      <span className="font-mono text-xs text-gray-500 tabular-nums">
        {time.toLocaleTimeString()}
      </span>
      {/* Tick indicator dot */}
      <span
        className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full transition-all duration-300 ${
          ticking ? 'bg-success shadow-sm shadow-success/50' : 'bg-dark-600'
        }`}
        style={{
          animation: 'pulse 2s ease-in-out infinite',
        }}
      />
    </span>
  );
}
