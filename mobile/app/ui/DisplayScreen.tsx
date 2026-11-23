/**
 * Display mode: this phone stands in front of the athlete and shows the board a judging phone sends over Bluetooth,
 * the count large, the no-reps, the division, the clock and each verdict's banner, and it calls each rep. A tap on a
 * division or on Reset asks the judging phone, which owns the count, to do it.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { clockText, decimal, flashText, LIT_MS, paceOf, STATION_REPS, t, type LitPart, type Target } from '../core';
import { DisplayMirror, readyBluetooth } from '../pair';
import { CONDENSED } from './controls';
import { Plate, SquatFault, TargetFault } from './icons';
import { COLOURS, REM, TAP } from './theme';

/** How often the screen redraws while the clock runs or a part is lit. */
const TICK_MS = 250;
/** How long Reset waits for the second tap, and shows that there is nothing to clear; the board's. */
const RESET_ARMED_MS = 4000;
const NOTHING_TO_RESET_MS = 1500;

const TROUBLE = {
  off: 'pair.bluetoothOff',
  denied: 'pair.notAllowed',
  unsupported: 'pair.cannotAdvertise',
} as const;

export function DisplayScreen({ onLeave }: { onLeave: () => void }): React.JSX.Element {
  const [mirror] = useState(() => new DisplayMirror());
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const { width, height } = useWindowDimensions();
  const [reset, setReset] = useState<'idle' | 'armed' | 'nothing'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  useEffect(() => {
    let left = false;
    // The permissions come first: without them the display would answer only 'denied'.
    void readyBluetooth(true).then(() => {
      if (!left) mirror.show();
    });
    const stop = mirror.subscribe(redraw);
    return () => {
      left = true;
      stop();
      mirror.hide();
    };
  }, [mirror]);
  const { trouble } = mirror;

  const { tally } = mirror;
  const now = Date.now();
  const lit = (part: LitPart) => tally.litAt(part, now);
  const flash = mirror.flash && mirror.flash.until > now ? mirror.flash : null;
  const busy = tally.clock.running || flash !== null || [...tally.lit.values()].some((light) => now - light.at < LIT_MS);
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setTimeout(redraw, TICK_MS);
    return () => clearTimeout(timer);
  });

  const elapsed = tally.clock.elapsedMs(now);
  const pace = paceOf(elapsed, tally.count);
  const status =
    trouble === null
      ? ''
      : trouble !== ''
        ? t(TROUBLE[trouble as keyof typeof TROUBLE] ?? 'pair.cannotAdvertise')
        : mirror.judges > 0
          ? t('pair.judgeLinked')
          : t('pair.waiting');
  const countSize = Math.min(0.42 * width, 0.3 * height);
  const banner = flash ? flashText(flash) : null;
  // Only a judge that sends the whole board listens for a command.
  const controls = mirror.full && mirror.judges > 0;

  // Two taps on the button itself, as on the board: no dialog covers the count, and walking away undoes it.
  const askReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (reset === 'armed') {
      setReset('idle');
      mirror.ask({ kind: 'reset' });
      return;
    }
    const next = tally.count === 0 && tally.targetFaults === 0 && tally.moveFaults === 0 ? 'nothing' : 'armed';
    setReset(next);
    resetTimer.current = setTimeout(() => setReset('idle'), next === 'armed' ? RESET_ARMED_MS : NOTHING_TO_RESET_MS);
  };

  const fault = (part: 'targetFault' | 'moveFault', n: number, what: string, icon: React.ReactNode) => (
    <View style={[styles.fault, lit(part) && styles.faultLit]}>
      {icon}
      <View>
        <Text style={styles.faultN}>{n}</Text>
        <Text style={styles.label}>{what}</Text>
      </View>
    </View>
  );

  const plate = (which: Target, label: string) => {
    const light = lit(which);
    const on = which === mirror.required;
    return (
      <Pressable
        style={({ pressed }) => [styles.division, controls && styles.divisionTap, on && controls && styles.divisionOn, pressed && styles.pressed]}
        onPress={() => mirror.ask({ kind: 'required', target: which })}
        disabled={!controls || on}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Plate size={TAP} colour={on ? COLOURS.chalk : COLOURS.rule} fill={light ? (light.good ? COLOURS.rep : COLOURS.norep) : 'transparent'} />
        <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pressable style={styles.leave} onPress={onLeave} accessibilityRole="button" accessibilityLabel={t('pair.leave')}>
          <Text style={styles.leaveText}>×</Text>
        </Pressable>
        <Text style={[styles.status, mirror.judges > 0 && styles.statusOn]} numberOfLines={2}>
          {status}
        </Text>
      </View>

      <View style={styles.middle}>
        <View style={styles.bannerSlot}>
          {banner ? (
            <View style={[styles.banner, { backgroundColor: flash?.valid ? COLOURS.rep : COLOURS.norep }]}>
              <Text style={styles.bannerTitle} numberOfLines={1} adjustsFontSizeToFit>
                {banner.title}
              </Text>
              <Text style={styles.bannerDetail} numberOfLines={1} adjustsFontSizeToFit>
                {banner.detail}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.count, { fontSize: countSize, lineHeight: countSize * 1.05 }, lit('count') && styles.countLit]} numberOfLines={1}>
          {tally.count}
        </Text>
        <Text style={styles.label}>{t('board.reps')}</Text>
      </View>

      <View style={styles.row}>
        {mirror.full ? (
          <>
            {fault('targetFault', tally.targetFaults, t('board.target'), <TargetFault size={36} />)}
            {fault('moveFault', tally.moveFaults, t('board.squat'), <SquatFault size={36} />)}
          </>
        ) : (
          fault('moveFault', tally.moveFaults, t('board.noReps'), <SquatFault size={36} />)
        )}
      </View>

      {mirror.full ? (
        <View style={styles.row}>
          {plate('upper', t('board.men'))}
          {plate('lower', t('board.women'))}
        </View>
      ) : null}

      <View style={styles.clock}>
        <Text style={styles.label}>{t('board.time')}</Text>
        <Text style={styles.clockValue}>{clockText(elapsed)}</Text>
        {pace ? (
          <Text style={styles.pace}>
            {t('board.pace')(decimal(pace.msPerRep / 1000, 1), STATION_REPS, pace.targetAtMs === null ? null : clockText(pace.targetAtMs))}
          </Text>
        ) : null}
      </View>

      {controls ? (
        <Pressable style={[styles.reset, reset === 'armed' && styles.resetArmed]} onPress={askReset} accessibilityRole="button">
          <Text style={[styles.resetText, reset === 'armed' && styles.resetArmedText]} numberOfLines={1}>
            {reset === 'armed' ? t('board.tapToClear') : reset === 'nothing' ? t('board.nothingToReset') : t('board.reset')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOURS.black, paddingHorizontal: REM, paddingBottom: REM },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: TAP },
  leave: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  leaveText: { color: COLOURS.steel, fontSize: 30, lineHeight: 34 },
  status: { flex: 1, color: COLOURS.steel, fontSize: 15, textAlign: 'right' },
  statusOn: { color: COLOURS.rep },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The banner keeps its place when it is gone, so the count stays put when one shows.
  bannerSlot: { height: 6 * REM, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginBottom: 0.5 * REM },
  banner: { maxWidth: '100%', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 6 },
  bannerTitle: { color: COLOURS.black, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  bannerDetail: { color: COLOURS.black, fontSize: 19, fontWeight: '600', textAlign: 'center' },
  count: { color: COLOURS.chalk, fontFamily: CONDENSED, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countLit: { color: COLOURS.rep },
  label: { color: COLOURS.steel, fontSize: 15, textTransform: 'uppercase', letterSpacing: 1.5 },
  labelOn: { color: COLOURS.chalk },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginTop: REM },
  fault: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  faultLit: { backgroundColor: 'rgba(255,82,72,0.25)' },
  faultN: { color: COLOURS.chalk, fontSize: 44, fontWeight: '700', fontFamily: CONDENSED, fontVariant: ['tabular-nums'] },
  division: { alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  divisionTap: { borderColor: COLOURS.rule },
  divisionOn: { borderColor: COLOURS.chalk },
  pressed: { opacity: 0.6 },
  reset: { alignSelf: 'center', minHeight: TAP, minWidth: 10 * REM, marginTop: REM, paddingHorizontal: REM, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLOURS.rule },
  resetArmed: { backgroundColor: COLOURS.norep, borderColor: COLOURS.norep },
  resetText: { color: COLOURS.chalk, fontSize: 17, fontWeight: '600' },
  resetArmedText: { color: COLOURS.black },
  clock: { alignItems: 'center', marginTop: 1.5 * REM },
  clockValue: { color: COLOURS.chalk, fontSize: 64, fontFamily: CONDENSED, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pace: { color: COLOURS.steel, fontSize: 15, marginTop: 4 },
});
