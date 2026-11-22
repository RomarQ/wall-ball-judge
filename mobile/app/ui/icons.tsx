/**
 * The PWA's icons, from the symbols in its index.html, drawn as its buttons draw them: a 24-unit box, a round stroke
 * of 2 in the text's colour, and `solid` parts filled.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { COLOURS } from './theme';

interface IconProps {
  size?: number;
  colour?: string;
}

function Stroked({ size = 20, colour = COLOURS.chalk, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

/** The app's mark: a plate with a counted rep's dot. */
export function Mark({ size = 22, colour = COLOURS.chalk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5.3 2.5h13.4l1.8 18.6a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4z" fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={12} cy={12.5} r={4.6} fill={COLOURS.rep} />
    </Svg>
  );
}

export function Gear(props: IconProps) {
  return (
    <Stroked {...props}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Stroked>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Stroked {...props}>
      <Path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
      <Circle cx={12} cy={13} r={3.8} />
    </Stroked>
  );
}

export function Film(props: IconProps) {
  const colour = props.colour ?? COLOURS.chalk;
  return (
    <Stroked {...props}>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="M10 9.5v5l4.5-2.5z" fill={colour} stroke="none" />
    </Stroked>
  );
}

export function Aim(props: IconProps) {
  return (
    <Stroked {...props}>
      <Circle cx={12} cy={12} r={7} />
      <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </Stroked>
  );
}

export function Flip(props: IconProps) {
  return (
    <Stroked {...props}>
      <Path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5" />
    </Stroked>
  );
}

/** The board's start button's triangle. */
export function Play({ size = 20, colour = COLOURS.chalk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.5v13l10.5-6.5z" fill={colour} />
    </Svg>
  );
}

/** The board's stop button's square. */
export function StopSquare({ size = 20, colour = COLOURS.chalk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={6} width={12} height={12} rx={2} fill={colour} />
    </Svg>
  );
}

/** A target no-rep: the PWA's rings, in the no-rep colour. */
export function TargetFault({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke={COLOURS.norep} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={14} cy={14} r={11.5} />
      <Circle cx={14} cy={14} r={6} />
      <Circle cx={14} cy={14} r={2} fill={COLOURS.norep} stroke="none" />
    </Svg>
  );
}

/** A squat no-rep: a figure seen from the side, squatting to parallel with its arms forward, in the no-rep colour. */
export function SquatFault({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke={COLOURS.norep} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={14.5} cy={5} r={2.6} fill={COLOURS.norep} stroke="none" />
      <Path d="M7 17.5L12 9.5L21 12.5M7 17.5H16.5L16 25H20" />
    </Svg>
  );
}

/** A target plate, as the board's division buttons draw it: chalk for the athlete's own target, filled for a hit. */
export function Plate({ size = 40, colour, fill = 'transparent' }: { size?: number; colour: string; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill={fill} stroke={colour} strokeWidth={7} strokeLinejoin="round">
      <Path d="M22 8 H78 L86 88 Q86 94 80 94 H20 Q14 94 14 88 Z" />
      <Rect x={33} y={30} width={34} height={46} rx={7} fill="transparent" />
    </Svg>
  );
}
