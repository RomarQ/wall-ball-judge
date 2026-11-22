/**
 * The kept live sets, the newest first: when each ran, what it counted and its time, its video to replay on the board
 * or to open in the phone's player, and Delete, which asks for a second tap as the board's Reset does.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { wallballVision, type VideoItem } from 'wallball-vision';
import { clockText, language, t, type SetRecord } from '../core';
import { deleteSet, keptSets } from '../sets';
import { Bar, Button, CONDENSED, page } from './controls';
import { SquatFault, TargetFault } from './icons';
import { COLOURS, REM } from './theme';

/** How long Delete waits for the second tap. */
const DELETE_ARMED_MS = 4000;

/** When a set started, as the app's language writes a day and a time. */
export function setWhen(set: SetRecord): string {
  return new Date(set.startedAt).toLocaleString(language(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The set's counts and time on one line. */
export function setSummary(set: SetRecord): string {
  return t('sets.summary')(set.reps, set.targetFaults + set.moveFaults, clockText(set.timeMs));
}

export function SetsScreen({ onHome, onReplay }: { onHome: () => void; onReplay: (video: VideoItem) => void }): React.JSX.Element {
  const [history, setHistory] = useState(() => keptSets());
  // The phone may have lost a set's video since, so only a video it still has gets Replay.
  const videos = useMemo(() => {
    const found = new Map<string, VideoItem>();
    if (history === 'unreadable') return found;
    for (const set of history.sets) {
      const video = set.video ? wallballVision.videoAt(set.video) : undefined;
      if (video) found.set(set.id, video);
    }
    return found;
  }, [history]);
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const askDelete = (set: SetRecord) => {
    if (timer.current) clearTimeout(timer.current);
    if (armed === set.id) {
      setArmed(null);
      deleteSet(set);
      setHistory(keptSets());
      return;
    }
    setArmed(set.id);
    timer.current = setTimeout(() => setArmed(null), DELETE_ARMED_MS);
  };

  return (
    <View style={styles.screen}>
      <Bar onHome={onHome} />
      <ScrollView style={page.scroll} contentContainerStyle={page.body}>
        <Text style={page.h1}>{t('sets.title')}</Text>
        {history === 'unreadable' ? (
          <Text style={page.hint}>{t('sets.unreadable')}</Text>
        ) : history.sets.length === 0 ? (
          <Text style={page.hint}>{t('sets.none')}</Text>
        ) : (
          history.sets.map((set) => {
            const { video } = set;
            const replayable = videos.get(set.id);
            return (
              <View key={set.id} style={styles.set}>
                <Text style={styles.when}>{setWhen(set)}</Text>
                <View style={styles.numbers}>
                  <View style={styles.number}>
                    <Text style={styles.reps}>{set.reps}</Text>
                    <Text style={styles.label}>{t('board.reps')}</Text>
                  </View>
                  <View style={styles.noReps}>
                    <View style={styles.number}>
                      <Text style={styles.value}>{set.targetFaults + set.moveFaults}</Text>
                      <Text style={styles.label}>{t('board.noReps')}</Text>
                    </View>
                    <View style={styles.kinds}>
                      <View style={styles.kind} accessibilityLabel={`${t('board.target')} ${set.targetFaults}`}>
                        <TargetFault size={16} />
                        <Text style={styles.kindN}>{set.targetFaults}</Text>
                      </View>
                      <View style={styles.kind} accessibilityLabel={`${t('board.squat')} ${set.moveFaults}`}>
                        <SquatFault size={16} />
                        <Text style={styles.kindN}>{set.moveFaults}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.number}>
                    <Text style={styles.value}>{clockText(set.timeMs)}</Text>
                    <Text style={styles.label}>{t('board.time')}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  {replayable ? <Button label={t('sets.replay')} onPress={() => onReplay(replayable)} primary /> : null}
                  {video ? <Button label={t('sets.open')} onPress={() => wallballVision.openVideo(video)} /> : null}
                  {/* Delete fills the rest of the row, so its second tap lands where the first did whatever its label. */}
                  <View style={styles.delete}>
                    <Button
                      label={armed === set.id ? (video ? t('sets.confirmVideo') : t('sets.confirm')) : t('sets.delete')}
                      onPress={() => askDelete(set)}
                      quiet={armed !== set.id}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOURS.black },
  set: { marginTop: REM, paddingTop: REM, borderTopWidth: 1, borderTopColor: COLOURS.rule, gap: 10 },
  when: { color: COLOURS.chalk, fontSize: REM, fontWeight: '600' },
  numbers: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { alignItems: 'center', gap: 2 },
  noReps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderRadius: 10,
  },
  kinds: { gap: 4 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindN: { color: COLOURS.chalk, fontSize: REM, fontWeight: '600', fontVariant: ['tabular-nums'] },
  reps: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 2.5 * REM, fontWeight: '700', fontVariant: ['tabular-nums'] },
  value: { color: COLOURS.chalk, fontFamily: CONDENSED, fontSize: 1.5 * REM, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { color: COLOURS.steel, fontSize: 0.75 * REM, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  delete: { flex: 1 },
});
