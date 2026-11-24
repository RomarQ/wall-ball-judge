/**
 * The judging phone's choice of a display: a scan for the phones in Display mode nearby, and the one linked.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { scoreLink, type FoundDisplay } from 'wallball-vision';
import { t } from '../core';
import { readyBluetooth, type DisplaySender } from '../pair';
import { Button } from './controls';
import { COLOURS, REM, TAP } from './theme';

/** How long a scan for displays runs. */
const SCAN_S = 4;

const TROUBLE = { off: 'pair.bluetoothOff', denied: 'pair.notAllowed', unsupported: 'pair.cannotAdvertise' } as const;

type Scan = { phase: 'scanning' } | { phase: 'found'; displays: FoundDisplay[] } | { phase: 'trouble'; text: string };

export function DisplayPicker({ sender, onClose }: { sender: DisplaySender; onClose: () => void }): React.JSX.Element {
  const [scan, setScan] = useState<Scan>({ phase: 'scanning' });
  const linked = sender.state !== 'none';

  const look = useCallback(async () => {
    setScan({ phase: 'scanning' });
    const trouble = await readyBluetooth(false);
    if (trouble) {
      setScan({ phase: 'trouble', text: t(TROUBLE[trouble as keyof typeof TROUBLE] ?? 'pair.bluetoothOff') });
      return;
    }
    setScan({ phase: 'found', displays: await scoreLink.findDisplays(SCAN_S) });
  }, []);

  useEffect(() => {
    if (!linked) void look();
  }, [linked, look]);

  return (
    <View style={styles.shade}>
      <View style={styles.panel}>
        <Text style={styles.title}>{t('pair.title')}</Text>
        {linked ? (
          <>
            <Text style={styles.linked}>
              {(sender.state === 'linked' ? t('pair.linkedTo') : t('pair.linkingTo'))(sender.name ?? '')}
            </Text>
            <Button label={t('pair.unlink')} onPress={() => sender.unlink()} />
          </>
        ) : scan.phase === 'scanning' ? (
          <Text style={styles.note}>{t('pair.searching')}</Text>
        ) : scan.phase === 'trouble' ? (
          <Text style={styles.note}>{scan.text}</Text>
        ) : scan.displays.length === 0 ? (
          <Text style={styles.note}>{t('pair.none')}</Text>
        ) : (
          <ScrollView style={styles.list}>
            {scan.displays.map((display) => (
              <Pressable
                key={display.address}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                onPress={() => sender.link(display)}
                accessibilityRole="button"
              >
                <Text style={styles.itemName}>{display.name}</Text>
                <Text style={styles.itemSignal}>{display.rssi} dBm</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {!linked && scan.phase !== 'scanning' ? <Button label={t('pair.again')} onPress={() => void look()} /> : null}
        <Text style={styles.note}>{t('pair.silent')}</Text>
        <Button label={t('pair.close')} onPress={onClose} quiet />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLOURS.shade, justifyContent: 'center', padding: REM },
  panel: { backgroundColor: COLOURS.graphite, borderRadius: 12, padding: REM, gap: 12 },
  title: { color: COLOURS.chalk, fontSize: 20, fontWeight: '700' },
  note: { color: COLOURS.steel, fontSize: 14 },
  linked: { color: COLOURS.rep, fontSize: 16 },
  list: { maxHeight: 6 * TAP },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: TAP, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLOURS.graphiteUp, marginBottom: 6 },
  pressed: { opacity: 0.6 },
  itemName: { color: COLOURS.chalk, fontSize: 16 },
  itemSignal: { color: COLOURS.steel, fontSize: 13 },
});
