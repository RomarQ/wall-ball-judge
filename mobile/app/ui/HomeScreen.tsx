/**
 * The home screen, laid out as the PWA's home view: the title and the drawn demo with the rule, the controls that start
 * a set, whether this device runs the app, where to stand the phone, and the note that the video stays on the device. On
 * a phone on its side, the demo stands beside the words and the controls, and the device and the placing side by side.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useCameraDevices } from 'react-native-vision-camera';
import { wallballVision, type PhoneCheck } from 'wallball-vision';
import {
  ballReadiness,
  LINKS,
  phoneReadiness,
  poseReadiness,
  t,
  type Measured,
  type Parts,
  type Readiness,
} from '../core';
import { ballModel } from '../detect';
import { phoneCheck } from '../phone';
import { Button, CONDENSED, page, Spec } from './controls';
import { Demo } from './Demo';
import { Film, Gear, GitHub, HuggingFace, Mail } from './icons';
import { Plan } from './Plan';
import { COLOURS, REM } from './theme';

const ANSWER = { good: 'home.yes', slow: 'home.maybe', bad: 'home.no' } as const;
const WHY = { slow: 'home.readySlow', bad: 'home.readyBad' } as const;

/** Opens a footer link. A phone with no app for the address opens nothing. */
function open(url: string): void {
  Linking.openURL(url).catch(() => {});
}

/** The demo's corner radius, the PWA's 1.1rem. */
const SCENE_CORNER = 1.1 * REM;
/** A phone on its side, as the PWA's home.css takes it: wider than tall, and under this many points tall. */
const SIDE_MAX_HEIGHT = 600;
/** The gap between the device and the placing, side by side. */
const SIDE_GAP = 2.5 * REM;

export function HomeScreen({
  playing,
  onLive,
  onRecording,
  onSettings,
}: {
  /** Whether the home screen is in view, so its drawing plays. */
  playing: boolean;
  onLive: () => void;
  onRecording: () => void;
  onSettings: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const screen = useWindowDimensions();
  const side = screen.width > screen.height && screen.height < SIDE_MAX_HEIGHT;
  const cameras = useCameraDevices();
  const [check, setCheck] = useState<PhoneCheck | null>(null);
  // Read at each drawing: the settings, which lie over this screen, may choose another ball model.
  const ballInput = ballModel().input;

  useEffect(() => {
    let shown = true;
    setCheck(null);
    phoneCheck(ballInput).then(
      (answer) => shown && setCheck(answer),
      () => shown && setCheck({ ballUnit: 'CPU' }),
    );
    return () => {
      shown = false;
    };
  }, [ballInput]);

  // A time the check did not give is a part that did not run; before the check answers, nothing is known.
  const measured = (ms: number | undefined): Measured => (check ? (ms ?? 'failed') : null);
  const parts: Parts = {
    camera: cameras.length > 0 ? 'good' : 'bad',
    pose: poseReadiness(measured(check?.poseMs)),
    ball: ballReadiness(measured(check?.ballMs)),
    finder: check ? (check.finderMs === undefined ? 'bad' : 'good') : 'none',
  };
  // The check runs on its own here, so a part not known yet is one still being read.
  const ready = phoneReadiness(parts);

  const words = (
    <>
      <Text style={[page.h1, styles.title, side && styles.sideTitle]}>Wall Ball Judge</Text>
      <Text style={styles.lede}>{t('home.lede')}</Text>
    </>
  );
  const rules = (
    <View style={styles.rule}>
      <Rule n={1} text={t('home.ruleDepth')} />
      <Rule n={2} text={t('home.ruleTarget')} />
    </View>
  );
  const controls = (
    <View style={styles.controls}>
      <Control label={t('home.recording')} onPress={onRecording}>
        <Film size={24} />
      </Control>
      <Pressable style={styles.shutter} onPress={onLive} accessibilityRole="button" accessibilityLabel={t('home.live')}>
        {({ pressed }) => (
          <>
            <View style={styles.ring}>
              <View style={[styles.shutterKey, pressed && styles.shutterPressed]} />
            </View>
            <Text style={[styles.controlName, styles.shutterName]}>{t('home.live')}</Text>
          </>
        )}
      </Pressable>
      <Control label={t('nav.settings')} onPress={onSettings}>
        <Gear size={24} />
      </Control>
    </View>
  );

  return (
    <ScrollView style={page.scroll} contentContainerStyle={page.body} onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {side ? (
          <View style={styles.sideStage}>
            {viewHeight > 0 ? (
              <View style={[styles.scene, styles.sideScene]}>
                {/* As tall as the screen, as the PWA's 100dvh less its margins. */}
                <Demo width={((viewHeight - 2 * REM) * 3) / 4} playing={playing} />
              </View>
            ) : null}
            <View style={styles.sideWords}>
              {words}
              {rules}
              {controls}
            </View>
          </View>
        ) : (
          <>
            {words}
            {width > 0 ? (
              <View style={styles.scene}>
                <Demo width={width} playing={playing} />
              </View>
            ) : null}
            {rules}
            {controls}
          </>
        )}
      </View>

      <View style={side ? styles.sideSections : undefined}>
        <View style={[styles.section, side && styles.sideSection]}>
          <Text style={page.h2}>{t('home.phone')}</Text>
          <Spec
            label={t('home.runs')}
            value={<State state={ready} text={ready === 'none' ? t('home.checking') : t(ANSWER[ready])} />}
            note={ready === 'slow' || ready === 'bad' ? t(WHY[ready]) : undefined}
            first
          />
        </View>

        <View style={[styles.section, side && styles.sideSection]}>
          <Text style={page.h2}>{t('home.place')}</Text>
          {width > 0 ? <Plan width={side ? (width - SIDE_GAP) / 2 : width} /> : null}
          <View style={styles.notes}>
            {[t('home.noteSide'), t('home.notePicture'), t('home.noteClose')].map((note) => (
              <View key={note} style={styles.note}>
                <Text style={page.text}>•</Text>
                <Text style={[page.text, styles.noteText]}>{note}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.private}>{t('home.private')}</Text>
        <View style={styles.links}>
          <Button label={t('home.contact')} onPress={() => open(LINKS.contact)} quiet icon={<Mail />} />
          <Button label={t('home.github')} onPress={() => open(LINKS.github)} quiet icon={<GitHub />} />
          <Button label={t('home.huggingFace')} onPress={() => open(LINKS.huggingFace)} quiet icon={<HuggingFace />} />
        </View>
        <Text style={styles.footText}>{t('home.version')(wallballVision.appVersion())}</Text>
      </View>
    </ScrollView>
  );
}

function Rule({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.ruleItem}>
      <View style={styles.ruleNumber}>
        <Text style={styles.ruleNumberText}>{n}</Text>
      </View>
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

/** A start control beside the shutter, as a camera's gallery and settings sit. */
function Control({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable style={styles.control} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <>
          <View style={[styles.key, pressed && styles.keyPressed]}>{children}</View>
          <Text style={styles.controlName}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** The PWA's state dot: chalk for yes, amber for a warning, a ring while it is not known. */
function Dot({ state }: { state: Readiness }) {
  return <View style={[styles.dot, state === 'good' && styles.dotGood, (state === 'slow' || state === 'bad') && styles.dotWarn]} />;
}

/** A fact about the device with its dot. */
function State({ state, text }: { state: Readiness; text: string }) {
  return (
    <View style={styles.state}>
      <Dot state={state} />
      <Text style={page.text}>{text}</Text>
    </View>
  );
}

const SHUTTER = 5.25 * REM;

const styles = StyleSheet.create({
  title: { marginBottom: 0.4 * REM },
  lede: { color: COLOURS.lede, fontSize: 1.05 * REM, lineHeight: 1.5 * REM, marginBottom: REM },
  scene: { borderRadius: SCENE_CORNER, overflow: 'hidden' },
  sideStage: { flexDirection: 'row', gap: 2 * REM },
  sideScene: { marginVertical: REM },
  sideWords: { flex: 1, justifyContent: 'center' },
  sideTitle: { marginTop: 0 },
  sideSections: { flexDirection: 'row', gap: SIDE_GAP, alignItems: 'flex-start' },
  sideSection: { flex: 1 },
  rule: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 1.25 * REM, rowGap: 0.5 * REM, marginTop: 0.75 * REM },
  ruleItem: { flexDirection: 'row', alignItems: 'center', gap: 0.45 * REM },
  ruleNumber: { width: 1.4 * REM, height: 1.4 * REM, borderRadius: 999, borderWidth: 1.5, borderColor: COLOURS.chalk, alignItems: 'center', justifyContent: 'center' },
  ruleNumberText: { color: COLOURS.chalk, fontSize: 0.8 * REM, fontWeight: '700' },
  ruleText: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: REM, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 1.25 * REM },
  control: { flex: 1, alignItems: 'center', gap: 0.4 * REM },
  key: {
    width: 3.4 * REM,
    height: 3.4 * REM,
    marginTop: 0.9 * REM,
    borderRadius: 0.9 * REM,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOURS.graphite,
    borderWidth: 1,
    borderColor: COLOURS.rule,
  },
  keyPressed: { transform: [{ scale: 0.95 }] },
  controlName: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 0.9 * REM, fontWeight: '600' },
  shutter: { alignItems: 'center', gap: 0.4 * REM },
  // The PWA's shutter: a chalk disc in a black gap and a chalk ring.
  ring: { padding: 4, borderRadius: 999, borderWidth: 3, borderColor: COLOURS.chalk, margin: -7 },
  shutterKey: { width: SHUTTER, height: SHUTTER, borderRadius: 999, backgroundColor: COLOURS.chalk },
  shutterPressed: { transform: [{ scale: 0.92 }] },
  shutterName: { marginTop: 0.8 * REM, fontWeight: '700' },
  section: { marginTop: 2 * REM, paddingTop: 1.5 * REM, borderTopWidth: 1, borderTopColor: COLOURS.rule },
  state: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 0.45 * REM },
  dot: { width: 0.55 * REM, height: 0.55 * REM, borderRadius: 999, borderWidth: 1.5, borderColor: COLOURS.steel },
  dotGood: { backgroundColor: COLOURS.chalk, borderColor: COLOURS.chalk },
  dotWarn: { backgroundColor: COLOURS.tape, borderColor: COLOURS.tape },
  notes: { gap: 0.35 * REM, marginTop: 0.75 * REM },
  note: { flexDirection: 'row', gap: 0.5 * REM },
  noteText: { flex: 1 },
  footer: { marginTop: 2 * REM, paddingTop: REM, borderTopWidth: 1, borderTopColor: COLOURS.rule, gap: 0.4 * REM },
  private: { color: COLOURS.chalk, fontSize: REM, fontWeight: '600' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 0.5 * REM },
  footText: { color: COLOURS.steel, fontSize: 0.85 * REM },
});
