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

export function Mail(props: IconProps) {
  return (
    <Stroked {...props}>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="M3.5 7.5 12 13l8.5-5.5" />
    </Stroked>
  );
}

export function GitHub({ size = 20, colour = COLOURS.chalk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill={colour} />
    </Svg>
  );
}

export function HuggingFace({ size = 20, colour = COLOURS.chalk }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12.025 1.13c-5.77 0-10.449 4.647-10.449 10.378 0 1.112.178 2.181.503 3.185.064-.222.203-.444.416-.577a.96.96 0 0 1 .524-.15c.293 0 .584.124.84.284.278.173.48.408.71.694.226.282.458.611.684.951v-.014c.017-.324.106-.622.264-.874s.403-.487.762-.543c.3-.047.596.06.787.203s.31.313.4.467c.15.257.212.468.233.542.01.026.653 1.552 1.657 2.54.616.605 1.01 1.223 1.082 1.912.055.537-.096 1.059-.38 1.572.637.121 1.294.187 1.967.187.657 0 1.298-.063 1.921-.178-.287-.517-.44-1.041-.384-1.581.07-.69.465-1.307 1.081-1.913 1.004-.987 1.647-2.513 1.657-2.539.021-.074.083-.285.233-.542.09-.154.208-.323.4-.467a1.08 1.08 0 0 1 .787-.203c.359.056.604.29.762.543s.247.55.265.874v.015c.225-.34.457-.67.683-.952.23-.286.432-.52.71-.694.257-.16.547-.284.84-.285a.97.97 0 0 1 .524.151c.228.143.373.388.43.625l.006.04a10.3 10.3 0 0 0 .534-3.273c0-5.731-4.678-10.378-10.449-10.378M8.327 6.583a1.5 1.5 0 0 1 .713.174 1.487 1.487 0 0 1 .617 2.013c-.183.343-.762-.214-1.102-.094-.38.134-.532.914-.917.71a1.487 1.487 0 0 1 .69-2.803m7.486 0a1.487 1.487 0 0 1 .689 2.803c-.385.204-.536-.576-.916-.71-.34-.12-.92.437-1.103.094a1.487 1.487 0 0 1 .617-2.013 1.5 1.5 0 0 1 .713-.174m-10.68 1.55a.96.96 0 1 1 0 1.921.96.96 0 0 1 0-1.92m13.838 0a.96.96 0 1 1 0 1.92.96.96 0 0 1 0-1.92M8.489 11.458c.588.01 1.965 1.157 3.572 1.164 1.607-.007 2.984-1.155 3.572-1.164.196-.003.305.12.305.454 0 .886-.424 2.328-1.563 3.202-.22-.756-1.396-1.366-1.63-1.32q-.011.001-.02.006l-.044.026-.01.008-.03.024q-.018.017-.035.036l-.032.04a1 1 0 0 0-.058.09l-.014.025q-.049.088-.11.19a1 1 0 0 1-.083.116 1.2 1.2 0 0 1-.173.18q-.035.029-.075.058a1.3 1.3 0 0 1-.251-.243 1 1 0 0 1-.076-.107c-.124-.193-.177-.363-.337-.444-.034-.016-.104-.008-.2.022q-.094.03-.216.087-.06.028-.125.063l-.13.074q-.067.04-.136.086a3 3 0 0 0-.135.096 3 3 0 0 0-.26.219 2 2 0 0 0-.12.121 2 2 0 0 0-.106.128l-.002.002a2 2 0 0 0-.09.132l-.001.001a1.2 1.2 0 0 0-.105.212q-.013.036-.024.073c-1.139-.875-1.563-2.317-1.563-3.203 0-.334.109-.457.305-.454m.836 10.354c.824-1.19.766-2.082-.365-3.194-1.13-1.112-1.789-2.738-1.789-2.738s-.246-.945-.806-.858-.97 1.499.202 2.362c1.173.864-.233 1.45-.685.64-.45-.812-1.683-2.896-2.322-3.295s-1.089-.175-.938.647 2.822 2.813 2.562 3.244-1.176-.506-1.176-.506-2.866-2.567-3.49-1.898.473 1.23 2.037 2.16c1.564.932 1.686 1.178 1.464 1.53s-3.675-2.511-4-1.297c-.323 1.214 3.524 1.567 3.287 2.405-.238.839-2.71-1.587-3.216-.642-.506.946 3.49 2.056 3.522 2.064 1.29.33 4.568 1.028 5.713-.624m5.349 0c-.824-1.19-.766-2.082.365-3.194 1.13-1.112 1.789-2.738 1.789-2.738s.246-.945.806-.858.97 1.499-.202 2.362c-1.173.864.233 1.45.685.64.451-.812 1.683-2.896 2.322-3.295s1.089-.175.938.647-2.822 2.813-2.562 3.244 1.176-.506 1.176-.506 2.866-2.567 3.49-1.898-.473 1.23-2.037 2.16c-1.564.932-1.686 1.178-1.464 1.53s3.675-2.511 4-1.297c.323 1.214-3.524 1.567-3.287 2.405.238.839 2.71-1.587 3.216-.642.506.946-3.49 2.056-3.522 2.064-1.29.33-4.568 1.028-5.713-.624" fill={colour} />
    </Svg>
  );
}
