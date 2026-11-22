/** The PWA's shared pieces: the header bar, its buttons, and the type of its pages. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { wallballVision } from 'wallball-vision';
import { t } from '../core';
import { Mark } from './icons';
import { COLOURS, REM, TAP } from './theme';

/** Android's own condensed face, for the PWA's narrowed headings and figures. */
export const CONDENSED = 'sans-serif-condensed';

/** The header of every screen but home: the way home, then the screen's own tools. */
export function Bar({ onHome, children }: { onHome: () => void; children?: React.ReactNode }) {
  return (
    <View style={styles.bar}>
      <Pressable style={styles.brand} onPress={onHome} accessibilityRole="button" accessibilityLabel={t('brand.home')}>
        <Mark size={22} />
        <Text style={styles.brandText} numberOfLines={1}>
          Wall Ball Judge
        </Text>
      </Pressable>
      <Text style={styles.version}>v{wallballVision.appVersion()}</Text>
      <View style={styles.tools}>{children}</View>
    </View>
  );
}

/** A text button in the header. */
export function Tool({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.tool, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

/** The PWA's button: chalk when it starts something, an outline beside it, graphite when quiet. */
export function Button({
  label,
  onPress,
  primary = false,
  quiet = false,
  tall = false,
  large = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  quiet?: boolean;
  tall?: boolean;
  large?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        quiet && styles.quiet,
        tall && styles.tall,
        large && styles.large,
        pressed && styles.pressed,
      ]}
    >
      {icon}
      <Text style={[styles.buttonText, primary && styles.primaryText, large && styles.largeText]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The PWA's square button that holds only a glyph. */
export function IconButton({ label, onPress, small = false, children }: { label: string; onPress: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, small && styles.iconButtonSmall, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/** The PWA's switch: on or off, chalk when on. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      style={[styles.switch, on && styles.switchOn]}
    >
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

/** A label at the left, its value at the right, and a note across the row under them, as the PWA's lists of facts. */
export function Spec({ label, value, note, first = false }: { label: string; value: React.ReactNode; note?: string; first?: boolean }) {
  return (
    <View style={[styles.spec, first && styles.specFirst]}>
      <Text style={styles.specLabel}>{label}</Text>
      {typeof value === 'string' ? <Text style={styles.specValue}>{value}</Text> : value}
      {note ? <Text style={styles.specNote}>{note}</Text> : null}
    </View>
  );
}

/** The type of the PWA's pages: the title, a section's heading and a hint. */
export const page = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLOURS.black },
  body: { paddingHorizontal: 1.1 * REM, paddingBottom: 2 * REM },
  h1: { marginTop: 1.25 * REM, marginBottom: 0.5 * REM, color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 2.75 * REM, fontWeight: '800', lineHeight: 2.75 * REM },
  h2: { marginBottom: 0.75 * REM, color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 1.5 * REM, fontWeight: '700', lineHeight: 1.65 * REM },
  hint: { marginTop: 0.6 * REM, color: COLOURS.steel, fontSize: 0.9 * REM, lineHeight: 1.3 * REM },
  text: { color: COLOURS.chalk, fontSize: REM, lineHeight: 1.45 * REM },
  section: { marginTop: 1.75 * REM, paddingTop: 1.25 * REM, borderTopWidth: 1, borderTopColor: COLOURS.rule },
});

const styles = StyleSheet.create({
  spec: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 4,
    paddingVertical: 0.65 * REM,
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.rule,
  },
  specFirst: { borderTopWidth: 1, borderTopColor: COLOURS.rule },
  specLabel: { color: COLOURS.steel, fontSize: REM },
  specValue: { color: COLOURS.chalk, fontSize: REM, textAlign: 'right' },
  specNote: { flexBasis: '100%', marginTop: -0.2 * REM, color: COLOURS.steel, fontSize: 0.9 * REM },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP, paddingRight: 8, flexShrink: 1 },
  brandText: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 18.5, fontWeight: '800' },
  version: { flexShrink: 0, color: COLOURS.steel, fontSize: 0.8 * REM, fontVariant: ['tabular-nums'] },
  tools: { marginLeft: 'auto', flexDirection: 'row', gap: 6, flexShrink: 0 },
  tool: {
    minHeight: 44,
    paddingHorizontal: 13,
    justifyContent: 'center',
    backgroundColor: COLOURS.graphite,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderRadius: 10,
  },
  toolText: { color: COLOURS.chalk, fontSize: 15, fontWeight: '600' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: TAP,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderColor: COLOURS.chalk,
    borderRadius: 10,
  },
  primary: { backgroundColor: COLOURS.chalk },
  quiet: { borderColor: COLOURS.rule, backgroundColor: COLOURS.graphite },
  tall: { flex: 1, minHeight: 56, paddingHorizontal: 12 },
  large: { alignSelf: 'stretch', minHeight: 60 },
  pressed: { transform: [{ scale: 0.97 }] },
  buttonText: { color: COLOURS.chalk, fontSize: 17, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  primaryText: { color: COLOURS.onChalk },
  largeText: { fontSize: 19 },
  iconButton: {
    width: TAP,
    height: TAP,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOURS.graphite,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderRadius: 10,
  },
  iconButtonSmall: { width: 44, height: 44 },
  switch: { width: 3.1 * REM, height: 1.85 * REM, borderRadius: 999, backgroundColor: COLOURS.rule, padding: 0.2 * REM },
  switchOn: { backgroundColor: COLOURS.chalk },
  knob: { width: 1.45 * REM, height: 1.45 * REM, borderRadius: 999, backgroundColor: COLOURS.steel },
  knobOn: { backgroundColor: COLOURS.black, transform: [{ translateX: 1.25 * REM }] },
});
