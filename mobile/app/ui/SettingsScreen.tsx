/**
 * The settings, laid out as the PWA's settings page and kept under its keys: the language and its spoken count, the
 * ball check, the division picked by the first hit, the ball model's input size and the pose confidence, the two
 * phones' roles, and what the app runs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type PanResponderGestureState } from 'react-native';
import { wallballVision } from 'wallball-vision';
import manifest from '../../../models/manifest.json';
import {
  ballCheckOn,
  chooseLanguage,
  decimal,
  deviceLanguage,
  divisionByHit,
  language,
  languageChoice,
  LANGUAGES,
  poseConfidence,
  setBallCheckOn,
  setBallInput,
  setDivisionByHit,
  setPoseConfidence,
  SPEECH_RATE,
  t,
  type LanguageChoice,
  type LanguageTag,
} from '../core';
import { BALL_INPUTS, ballModel } from '../detect';
import type { DisplaySender } from '../pair';
import { keptSets, saveSetsOn, saveVideoOn, setSaveSets, setSaveVideo } from '../sets';
import { setSummary, setWhen } from './SetsScreen';
import { Bar, Button, CONDENSED, page, Spec, Switch, Tool } from './controls';
import { DisplayPicker } from './DisplayPicker';
import { COLOURS, REM } from './theme';

/** The confidence range and step, as the PWA's slider offers them. */
const CONFIDENCE_MIN = 0.5;
const CONFIDENCE_MAX = 0.95;
const CONFIDENCE_STEP = 0.05;
/** The count the test button says, as the PWA's "Say twelve". */
const TEST_COUNT = '12';

export function SettingsScreen({
  sender,
  onHome,
  onBoard,
  onDisplay,
  onSets,
}: {
  /** The judging phone's link to a display. */
  sender: DisplaySender;
  onHome: () => void;
  onBoard?: () => void;
  /** Opens Display mode. */
  onDisplay: () => void;
  /** Opens the list of kept sets. */
  onSets: () => void;
}) {
  const [, setTick] = useState(0);
  const redraw = () => setTick((n) => n + 1);
  const [picking, setPicking] = useState(false);
  useEffect(() => sender.subscribe(() => setTick((n) => n + 1)), [sender]);
  const [lastSet] = useState(() => {
    const history = keptSets();
    if (history === 'unreadable') return t('sets.unreadable');
    const [last] = history.sets;
    return last ? `${setWhen(last)} · ${setSummary(last)}` : t('sets.none');
  });
  const linkText =
    sender.state === 'none' ? t('pair.silent') : sender.state === 'linked' ? t('pair.linkedTo')(sender.name ?? '') : t('board.linking');

  return (
    <View style={styles.screen}>
      <Bar onHome={onHome}>{onBoard ? <Tool label={t('nav.judge')} onPress={onBoard} /> : null}</Bar>
      <ScrollView style={page.scroll} contentContainerStyle={page.body}>
        <Text style={page.h1}>{t('nav.settings')}</Text>

        <View style={page.section}>
          <Text style={page.h2}>{t('settings.language')}</Text>
          <View style={styles.pills}>
            {(['device', ...(Object.keys(LANGUAGES) as LanguageTag[])] as LanguageChoice[]).map((choice) => (
              <Pressable
                key={choice}
                style={[styles.pill, languageChoice() === choice && styles.pillOn]}
                onPress={() => {
                  chooseLanguage(choice);
                  redraw();
                }}
              >
                <Text style={[styles.pillText, languageChoice() === choice && styles.pillTextOn]}>
                  {choice === 'device' ? t('settings.deviceLanguage')(LANGUAGES[deviceLanguage()]) : LANGUAGES[choice]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={page.hint}>{t('settings.languageHint')}</Text>
          <View style={styles.say}>
            <Button label={t('settings.say')} onPress={() => wallballVision.say(TEST_COUNT, language(), SPEECH_RATE)} />
          </View>
          <Text style={page.hint}>{t('settings.voiceNote')}</Text>
        </View>

        <View style={page.section}>
          <Text style={page.h2}>{t('settings.judging')}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.strong}>{t('settings.ballCheck')}</Text>
              <Text style={styles.small}>{t('settings.ballCheckOff')}</Text>
            </View>
            <Switch
              label={t('settings.ballCheck')}
              on={ballCheckOn()}
              onChange={(on) => {
                setBallCheckOn(on);
                redraw();
              }}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.strong}>{t('settings.divisionByHit')}</Text>
              <Text style={styles.small}>{t('settings.divisionByHitOn')}</Text>
            </View>
            <Switch
              label={t('settings.divisionByHit')}
              on={divisionByHit()}
              onChange={(on) => {
                setDivisionByHit(on);
                redraw();
              }}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={page.text}>{t('settings.ballInput')}</Text>
            <View style={styles.pills}>
              {BALL_INPUTS.map((input) => (
                <Pressable
                  key={input}
                  style={[styles.pill, ballModel().input === input && styles.pillOn]}
                  onPress={() => {
                    setBallInput(input);
                    redraw();
                  }}
                >
                  <Text style={[styles.pillText, ballModel().input === input && styles.pillTextOn]}>{t('settings.pixels')(input)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={page.hint}>{t('settings.ballInputHint')}</Text>
          <View style={styles.range}>
            <View style={styles.rangeHead}>
              <Text style={page.text}>{t('settings.confidence')}</Text>
              <Text style={styles.output}>{decimal(poseConfidence(), 2)}</Text>
            </View>
            <Slider
              value={poseConfidence()}
              min={CONFIDENCE_MIN}
              max={CONFIDENCE_MAX}
              step={CONFIDENCE_STEP}
              onChange={(value) => {
                setPoseConfidence(value);
                redraw();
              }}
            />
          </View>
          <Text style={page.hint}>{t('settings.confidenceHint')}</Text>
        </View>

        <View style={page.section}>
          <Text style={page.h2}>{t('sets.title')}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.strong}>{t('settings.saveSets')}</Text>
              <Text style={styles.small}>{t('settings.saveSetsHint')}</Text>
            </View>
            <Switch
              label={t('settings.saveSets')}
              on={saveSetsOn()}
              onChange={(on) => {
                setSaveSets(on);
                redraw();
              }}
            />
          </View>
          {saveSetsOn() ? (
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.strong}>{t('settings.saveVideo')}</Text>
                <Text style={styles.small}>{t('settings.saveVideoHint')}</Text>
              </View>
              <Switch
                label={t('settings.saveVideo')}
                on={saveVideoOn()}
                onChange={(on) => {
                  setSaveVideo(on);
                  redraw();
                }}
              />
            </View>
          ) : null}
          <Text style={page.hint}>{lastSet}</Text>
          <View style={styles.say}>
            <Button label={t('sets.all')} onPress={onSets} />
          </View>
        </View>

        <View style={page.section}>
          <Text style={page.h2}>{t('pair.section')}</Text>
          <Text style={page.hint}>{t('pair.sectionHint')}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.strong}>{t('pair.judgeRole')}</Text>
              <Text style={[styles.small, sender.state === 'linked' && styles.linked]}>{linkText}</Text>
            </View>
            <Button
              label={sender.state === 'none' ? t('pair.find') : t('pair.unlink')}
              onPress={() => (sender.state === 'none' ? setPicking(true) : sender.unlink())}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.strong}>{t('pair.displayRole')}</Text>
              <Text style={styles.small}>{t('pair.displayRoleHint')}</Text>
            </View>
            <Button label={t('pair.open')} onPress={onDisplay} />
          </View>
        </View>

        <View style={page.section}>
          <Text style={page.h2}>{t('settings.about')}</Text>
          <Spec label={t('settings.version')} value={wallballVision.appVersion()} first />
          <Spec label={t('settings.models')} value={manifest.revision} />
        </View>
      </ScrollView>
      {picking ? <DisplayPicker sender={sender} onClose={() => setPicking(false)} /> : null}
    </View>
  );
}

/** A range in steps, as the PWA's range input: a drag or a tap along the track sets it. */
function Slider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, onChange });
  latest.current = { width, onChange };
  const at = (x: number) => {
    const share = Math.min(1, Math.max(0, x / (latest.current.width || 1)));
    const stepped = min + Math.round((share * (max - min)) / step) * step;
    latest.current.onChange(Math.round(stepped * 100) / 100);
  };
  // A tap or a sideways drag sets the value; a drag up or down scrolls the page and leaves the value as it was.
  const sideways = (gesture: PanResponderGestureState) => Math.abs(gesture.dx) > Math.abs(gesture.dy);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (event, gesture) => {
        if (sideways(gesture)) at(event.nativeEvent.locationX);
      },
      onPanResponderRelease: (event, gesture) => {
        if (Math.hypot(gesture.dx, gesture.dy) < TAP_SLOP || sideways(gesture)) at(event.nativeEvent.locationX);
      },
      onPanResponderTerminationRequest: (_event, gesture) => !sideways(gesture),
    }),
  ).current;
  const share = (value - min) / (max - min);
  return (
    <View style={styles.slider} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.filled, { width: `${share * 100}%` }]} />
      </View>
      <View style={[styles.thumb, { left: share * width - THUMB / 2 }]} pointerEvents="none" />
    </View>
  );
}

const THUMB = 24;
/** How far a touch may move and still be a tap, in screen points. */
const TAP_SLOP = 10;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOURS.black },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: COLOURS.rule, borderRadius: 999 },
  pillOn: { backgroundColor: COLOURS.chalk, borderColor: COLOURS.chalk },
  pillText: { color: COLOURS.steel, fontSize: 16, fontWeight: '600' },
  pillTextOn: { color: COLOURS.onChalk },
  say: { flexDirection: 'row', marginTop: 0.75 * REM },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: REM, minHeight: 3 * REM },
  switchText: { flex: 1, gap: 2 },
  strong: { color: COLOURS.chalk, fontSize: REM, fontWeight: '700' },
  small: { color: COLOURS.steel, fontSize: 0.9 * REM, lineHeight: 1.22 * REM },
  linked: { color: COLOURS.rep },
  range: { marginTop: REM, gap: 4 },
  rangeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  output: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 17, fontWeight: '700' },
  slider: { height: 44, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: COLOURS.rule, overflow: 'hidden' },
  filled: { height: 4, backgroundColor: COLOURS.chalk },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: COLOURS.chalk },
});
