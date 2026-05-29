/**
 * CountdownTimer — SVG circular countdown ring showing time until next
 * metrics poll. Animates smoothly with a gradient stroke.
 *
 * Props:
 *   seconds: total cycle duration
 *   remaining: seconds remaining
 *   size: diameter of the ring (default 36)
 */

import React from 'react';

export default function CountdownTimer({ seconds, remaining, size = 36 }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / seconds;
  const offset = circumference * (1 - progress);
  const strokeColor = progress > 0.3 ? '#a3be8c' : progress > 0.15 ? '#ebcb8b' : '#bf616a';

  return (
    <div className="relative inline-flex items-center justify-center" title={`Next poll in ${remaining}s`}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e1e2e"
          strokeWidth="3"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-gray-400">
        {remaining}
      </span>
    </div>
  );
}
