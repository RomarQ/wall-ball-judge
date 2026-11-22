/** Where to stand the phone, seen from above, as the PWA's home view draws it from its index.html. */
import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, Pattern, Rect, Text } from 'react-native-svg';
import { t } from '../core';
import { CONDENSED } from './controls';
import { COLOURS } from './theme';

const GOOD_TICK = 'M-3.2 0.2l2.2 2.2 4-4.4';
const BAD_CROSS = 'M-2.8-2.8l5.6 5.6m0-5.6l-5.6 5.6';

function Phone({ transform, good }: { transform: string; good: boolean }) {
  return (
    <G transform={transform}>
      <Rect x={-6} y={-10} width={12} height={20} rx={3} fill={good ? COLOURS.chalk : '#6b6b6b'} />
    </G>
  );
}

function Mark({ transform, good }: { transform: string; good: boolean }) {
  return (
    <G transform={transform}>
      <Circle r={7} fill={good ? COLOURS.rep : COLOURS.norep} />
      <Path d={good ? GOOD_TICK : BAD_CROSS} fill="none" stroke="#000" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

function Label({ x, y, children, bad = false, middle = false }: { x: number; y: number; children: string; bad?: boolean; middle?: boolean }) {
  return (
    <Text x={x} y={y} fill={bad ? COLOURS.norep : COLOURS.steel} fontSize={11} fontWeight="600" fontFamily={CONDENSED} textAnchor={middle ? 'middle' : 'start'}>
      {children}
    </Text>
  );
}

export function Plan({ width }: { width: number }) {
  return (
    <Svg width={width} height={(width * 214) / 320} viewBox="0 0 320 214" accessibilityLabel={t('home.planLabel')}>
      <Defs>
        <Pattern id="home-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line y2={6} stroke="#4a4a4a" strokeWidth={1.5} />
        </Pattern>
      </Defs>
      <Rect x={12} y={10} width={296} height={14} fill="url(#home-hatch)" />
      <Path d="M12 24H308" stroke="#8a8a8a" strokeWidth={2} />
      <Rect x={138} y={24} width={44} height={5} fill={COLOURS.chalk} />
      <Label x={190} y={36}>
        {t('home.planTarget')}
      </Label>

      <Path d="M52 104 L176 12 L214 124Z" fill={COLOURS.chalk} fillOpacity={0.06} stroke={COLOURS.chalk} strokeOpacity={0.3} strokeDasharray="3 3" />
      <Path d="M160 186 L104 18 L216 18Z" fill={COLOURS.chalk} fillOpacity={0.06} stroke={COLOURS.chalk} strokeOpacity={0.3} strokeDasharray="3 3" />

      <Ellipse cx={160} cy={80} rx={21} ry={11} fill="#3b4146" />
      <Circle cx={160} cy={80} r={8} fill="#5d666c" />
      <Circle cx={160} cy={62} r={7} fill="#1c1e20" stroke="#6b7378" />
      <Label x={160} y={108} middle>
        {t('home.planAthlete')}
      </Label>

      <Phone transform="translate(44 108) rotate(55)" good />
      <Phone transform="translate(160 196)" good />
      <Phone transform="translate(244 48) rotate(-60)" good={false} />
      <Mark transform="translate(30 92)" good />
      <Mark transform="translate(178 190)" good />
      <Mark transform="translate(262 40)" good={false} />

      <Label x={22} y={136}>
        {t('home.planSide')}
      </Label>
      <Label x={190} y={204}>
        {t('home.planBehind')}
      </Label>
      <Label x={226} y={76} bad>
        {t('home.planClose')}
      </Label>
    </Svg>
  );
}
