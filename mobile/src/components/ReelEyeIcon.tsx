/**
 * REEL EYE ICON — Simplified ReelHouse Society Grandmaster Logo
 *
 * The all-seeing eye of cinema, with a film reel as its iris.
 * Designed as a clean geometric icon for the bottom tab bar.
 *
 * Anatomy:
 *  - Outer eye shape (almond/vesica piscis)
 *  - Film reel iris (circle with sprocket holes)
 *  - Center pupil dot
 */
import React from 'react';
import Svg, { Path, Circle, G } from 'react-native-svg';

interface ReelEyeIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function ReelEyeIcon({
  size = 24,
  color = '#C4961A',
  strokeWidth = 1.8,
}: ReelEyeIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <G>
        {/* Eye shape — two arcs forming the almond */}
        <Path
          d="M2 12C2 12 5.5 5 12 5C18.5 5 22 12 22 12C22 12 18.5 19 12 19C5.5 19 2 12 2 12Z"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Reel outer ring — the iris */}
        <Circle
          cx={12}
          cy={12}
          r={4.5}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Center pupil */}
        <Circle
          cx={12}
          cy={12}
          r={1.2}
          fill={color}
        />

        {/* Film reel sprocket holes — 4 tiny circles around the iris */}
        <Circle cx={12} cy={8.2} r={0.7} fill={color} opacity={0.7} />
        <Circle cx={15.8} cy={12} r={0.7} fill={color} opacity={0.7} />
        <Circle cx={12} cy={15.8} r={0.7} fill={color} opacity={0.7} />
        <Circle cx={8.2} cy={12} r={0.7} fill={color} opacity={0.7} />
      </G>
    </Svg>
  );
}
