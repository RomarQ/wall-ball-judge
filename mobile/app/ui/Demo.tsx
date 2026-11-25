/**
 * The home screen's drawing: two stations seen from behind, as the PWA's home view draws them from its index.html,
 * moved by the PWA's own demo-scene.ts. It plays while the app is on screen, and holds a still frame with reduced
 * motion.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polyline, RadialGradient, Rect, Stop, Text, TSpan, Use } from 'react-native-svg';
import { sceneAt, STILL_MS, t, type Division, type Point, type StationScene } from '../core';
import { CONDENSED } from './controls';
import { COLOURS } from './theme';

/** The longest the drawing waits between two frames: half a 60 Hz screen's rate is smooth for the drawn squat. */
const FRAME_MS = 33;

const points = (ps: Point[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** The milliseconds of the drawing's loop: it plays while `playing`, and goes on from where it paused. */
function useElapsed(playing: boolean): number {
  const [elapsed, setElapsed] = useState(STILL_MS);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [still, setStill] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => {
      subscription.remove();
      motion.remove();
    };
  }, []);

  const run = playing && active && !still;
  useEffect(() => {
    if (!run) return undefined;
    let frame = 0;
    let last = 0;
    const origin = Date.now() - elapsed;
    const tick = (now: number) => {
      if (now - last >= FRAME_MS) {
        last = now;
        setElapsed(Date.now() - origin);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The loop takes up from where it paused, which it reads once as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return still ? STILL_MS : elapsed;
}

export function Demo({ width, playing }: { width: number; playing: boolean }) {
  const elapsed = useElapsed(playing);
  return (
    <Svg width={width} height={(width * 4) / 3} viewBox="0 0 300 400" accessibilityLabel={t('home.demoTitle')}>
      <Defs>
        <LinearGradient id="home-wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#394045" />
          <Stop offset="1" stopColor="#272c30" />
        </LinearGradient>
        <RadialGradient id="home-light" cx="0.5" cy="0.2" r="0.7">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.08} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <G id="home-plate">
          <Path d="M22 8 H78 L86 88 Q86 94 80 94 H20 Q14 94 14 88 Z" />
          <Rect x={33} y={30} width={34} height={46} rx={7} />
        </G>
      </Defs>

      <Rect width={300} height={372} fill="url(#home-wall)" />
      <Rect width={300} height={372} fill="url(#home-light)" />
      <Path d="M150 0V372" stroke="#2f353a" strokeWidth={2} />
      <Rect y={372} width={300} height={28} fill="#1a1d20" />
      <Path d="M0 372H300" stroke="#3d4449" strokeWidth={1.5} />

      <Lane division="men" transform="translate(-45 73.6) scale(0.8)" scene={sceneAt('men', elapsed)} />
      <Lane division="women" transform="translate(105 73.6) scale(0.8)" scene={sceneAt('women', elapsed)} />
    </Svg>
  );
}

/** A target's box and tag, as the board's overlay draws it, dim for the target this athlete need not reach. */
function TargetBox({ y, label, own, flash = 0 }: { y: number; label: string; own: boolean; flash?: number }) {
  return (
    <G opacity={own ? 1 : 0.45}>
      <Rect x={129} y={y} width={42} height={48} fill={COLOURS.rep} fillOpacity={0.35 * flash} stroke={COLOURS.chalk} strokeWidth={own ? 2.5 : 1.6} />
      <Rect x={168.5} y={y + 45.5} width={5} height={5} fill={COLOURS.chalk} />
      <Text x={150} y={y - 4} textAnchor="middle" fill={COLOURS.chalk} fontSize={9} fontWeight="600" fontFamily={CONDENSED}>
        {label}
      </Text>
    </G>
  );
}

function Lane({ division, transform, scene }: { division: Division; transform: string; scene: StationScene }) {
  const men = division === 'men';
  const upperTarget = <TargetBox y={-24} label={t('overlay.upperTarget')} own={men} flash={men ? scene.targetFlash : 0} />;
  const lowerTarget = <TargetBox y={40} label={t('overlay.lowerTarget')} own={!men} flash={men ? 0 : scene.targetFlash} />;
  const [legLeft, legRight] = scene.legs;
  const [[hl, kl], [hr, kr]] = [legLeft, legRight];
  return (
    <G transform={transform}>
      <Use href="#home-plate" transform="translate(126 -24.5) scale(0.48)" fill="#1f2326" stroke="#5a6369" strokeWidth={5} strokeLinejoin="round" />
      <Use href="#home-plate" transform="translate(126 39.5) scale(0.48)" fill="#1f2326" stroke="#5a6369" strokeWidth={5} strokeLinejoin="round" />
      <G transform={`translate(${scene.ball.x.toFixed(1)} ${scene.ball.y.toFixed(1)})`}>
        <Circle r={14} fill="#1c1e20" stroke="#4a4f53" strokeWidth={1.5} />
        <Path d="M-14 0 Q0 7 14 0" fill="none" stroke="#4a4f53" strokeWidth={1.2} />
      </G>

      <G fill="#131517" stroke="#131517" strokeLinecap="round" strokeLinejoin="round">
        <Polyline points={points(legLeft)} fill="none" strokeWidth={19} />
        <Polyline points={points(legRight)} fill="none" strokeWidth={19} />
        <Polyline points={points(scene.arms[0])} fill="none" strokeWidth={11} />
        <Polyline points={points(scene.arms[1])} fill="none" strokeWidth={11} />
        <Path d={scene.torso} />
        {men ? null : <Ellipse cx={150} cy={scene.ponytailY} rx={5} ry={10} />}
        <Circle cx={150} cy={scene.headY} r={13} />
      </G>

      {/* The athlete's own target in front, the other one dim behind, as the board's overlay draws them. */}
      {men ? lowerTarget : upperTarget}
      {men ? upperTarget : lowerTarget}
      {men ? (
        <Rect x={129} y={40} width={42} height={48} fill={COLOURS.norep} fillOpacity={0.35} stroke={COLOURS.norep} strokeWidth={2.5} opacity={scene.missFlash} />
      ) : null}

      <G transform={`translate(0 ${scene.parallelY.toFixed(1)})`}>
        <Line x1={56} x2={244} stroke={COLOURS.tape} strokeWidth={1.6} strokeDasharray="6 4.5" />
        <Rect x={56} y={-12} width={44} height={10} fill={COLOURS.tape} />
        <Text x={59.5} y={-4} fill={COLOURS.black} fontSize={7.5} fontWeight="600" fontFamily={CONDENSED}>
          {t('overlay.parallel')}
        </Text>
      </G>
      <Polyline points={points([hl, hr])} fill="none" stroke={COLOURS.chalk} strokeWidth={2.4} strokeLinejoin="round" />
      <Polyline points={points(legLeft)} fill="none" stroke={COLOURS.chalk} strokeWidth={2.4} strokeLinejoin="round" />
      <Polyline points={points(legRight)} fill="none" stroke={COLOURS.chalk} strokeWidth={2.4} strokeLinejoin="round" />
      {[hl, hr, kl, kr].map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3.2} fill={COLOURS.tape} />
      ))}

      {scene.ballSeen ? (
        <G transform={`translate(${scene.ball.x.toFixed(1)} ${scene.ball.y.toFixed(1)})`}>
          <Rect x={-17} y={-17} width={34} height={34} fill="none" stroke={COLOURS.chalk} strokeWidth={1.6} />
          <Text x={21} y={3} fill={COLOURS.chalk} fontSize={7.5} fontWeight="600" fontFamily={CONDENSED}>
            <TSpan>{t('overlay.ball')}</TSpan> 0.91
          </Text>
        </G>
      ) : null}

      {scene.banner ? (
        <G>
          <Rect x={91} y={94} width={118} height={30} fill={scene.banner.fault ? COLOURS.norep : COLOURS.rep} />
          <Text x={97} y={107} fill={COLOURS.black} fontSize={12} fontWeight="800" fontFamily={CONDENSED}>
            {scene.banner.title}
          </Text>
          <Text x={97} y={118} fill={COLOURS.black} fontSize={8} fontFamily={CONDENSED}>
            {scene.banner.detail}
          </Text>
        </G>
      ) : null}
    </G>
  );
}
