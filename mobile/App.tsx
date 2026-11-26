import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { scoreLink, wallballVision, type VideoItem } from 'wallball-vision';
import { DisplaySender, readyBluetooth } from './app/pair';
import { storedRequired, storeRequired, Tally } from './app/core';
import { ballModel, type TrainedFile } from './app/detect';
import { liveTallyStore, tallySounds } from './app/sound';
import { BoardScreen, BoardStarting, type AutoSet, type BoardSource } from './app/ui/BoardScreen';
import { DisplayScreen } from './app/ui/DisplayScreen';
import { HomeScreen } from './app/ui/HomeScreen';
import { SetsScreen } from './app/ui/SetsScreen';
import { SettingsScreen } from './app/ui/SettingsScreen';

/**
 * Launch options from the intent, for checks over adb. Without one the app opens on its home screen. `--es board <file>`
 * opens the board on that file in the app's `clips` folder, and with `--es pick <n>` places the search's candidate n
 * (none for -1, so the athlete's squat picks the station), takes the target `--es required upper|lower`, or leaves it
 * to the first hit with `auto`, and starts the set. `--es display 1` opens Display mode; `--es link
 * first` links the board to the strongest display a scan finds.
 */
interface LaunchProps {
  board?: string;
  pick?: string;
  required?: string;
  display?: string;
  link?: string;
}

export default function App({ board, pick, required, display, link }: LaunchProps): React.JSX.Element {
  const auto = pick === undefined ? undefined : { pick: Number(pick), required: required === 'auto' ? null : required === 'lower' ? ('lower' as const) : ('upper' as const) };
  return (
    <SafeAreaProvider>
      <Main board={board} auto={auto} display={display === '1'} linkFirst={link === 'first'} />
    </SafeAreaProvider>
  );
}

type Screen =
  | { name: 'home' }
  | { name: 'display' }
  | { name: 'sets' }
  | { name: 'board'; source: BoardSource; open: number; ballModel: TrainedFile };

const recordingOf = (video: VideoItem): BoardSource => ({ kind: 'recording', uri: video.uri, name: video.name, durationMs: video.durationMs });

/** How long the launch's `link first` scans for a display. */
const LINK_SCAN_S = 4;

function Main({ board, auto, display, linkFirst }: { board?: string; auto?: AutoSet; display: boolean; linkFirst: boolean }): React.JSX.Element {
  // The launch's own board: the launch's auto-start applies to it alone, not to a board opened later.
  const [launched] = useState<Screen | null>(() => {
    const video = board ? wallballVision.videoAt(board) : undefined;
    return video ? { name: 'board', source: recordingOf(video), open: 0, ballModel: ballModel() } : null;
  });
  const [screen, setScreen] = useState<Screen>(launched ?? (display ? { name: 'display' } : { name: 'home' }));
  // Settings open over the screen below, so a board keeps its picture, its target and its set.
  const [settings, setSettings] = useState(false);
  const [tally] = useState(() => new Tally(tallySounds, liveTallyStore));
  // The link to a display outlives a board, so the next set goes to the same display.
  const [sender] = useState(() => new DisplaySender({ tally, required: storedRequired, setRequired: storeRequired }));
  const [ballUnits, setBallUnits] = useState<Record<number, string>>({});
  // A board keeps the size it opened with; the next board takes the size the settings chose, which the check runs ahead for.
  const ballInput = screen.name === 'board' ? screen.ballModel.input : ballModel().input;
  const ballUnit = ballUnits[ballInput] ?? null;

  useEffect(() => {
    if (!linkFirst) return;
    void (async () => {
      const trouble = await readyBluetooth(false);
      if (trouble) return console.log(`LINK cannot: ${trouble}`);
      const [first] = await scoreLink.findDisplays(LINK_SCAN_S);
      if (first) sender.link(first);
      else console.log('LINK none found');
    })();
  }, [linkFirst, sender]);

  useEffect(() => {
    if (ballUnit) return;
    const known = (unit: string) => setBallUnits((units) => ({ ...units, [ballInput]: unit }));
    wallballVision.ballUnits(ballInput).then(
      (units) => known(units[0] ?? 'CPU'),
      () => known('CPU'),
    );
  }, [ballInput, ballUnit]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settings) setSettings(false);
      else if (screen.name !== 'home') setScreen({ name: 'home' });
      else return false;
      return true;
    });
    return () => subscription.remove();
  }, [screen.name, settings]);

  const home = () => {
    setSettings(false);
    setScreen({ name: 'home' });
  };
  // A board keeps its set's phase, so each opening, of the same source too, mounts a new one.
  const opens = useRef(0);
  const openBoard = (source: BoardSource) => {
    opens.current += 1;
    setScreen({ name: 'board', source, open: opens.current, ballModel: ballModel() });
  };
  const live = () => openBoard({ kind: 'camera' });
  // Android's picker opens over the screen below, which a cancel leaves as it was.
  const recording = () => {
    void wallballVision.pickVideo().then((video) => {
      if (video) openBoard(recordingOf(video));
    });
  };
  const openSettings = () => setSettings(true);
  // Android draws the app under its navigation bar and around the camera cutout, which would cover the board's buttons.
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar hidden />
      {/* Settings lie over this view, which keeps them inside the safe area as the screens are. */}
      <View style={styles.inside}>
        {screen.name === 'board' ? (
          ballUnit ? (
            <BoardScreen
              key={screen.open}
              source={screen.source}
              ballUnit={ballUnit}
              ballModel={screen.ballModel}
              liveTally={tally}
              sender={sender}
              onHome={home}
              onSettings={openSettings}
              onLive={live}
              onRecording={recording}
              auto={screen === launched ? auto : undefined}
            />
          ) : (
            <BoardStarting onHome={home} onSettings={openSettings} />
          )
        ) : screen.name === 'display' ? (
          <DisplayScreen onLeave={home} />
        ) : screen.name === 'sets' ? (
          <SetsScreen onHome={home} onReplay={(video) => openBoard(recordingOf(video))} />
        ) : (
          <HomeScreen playing={!settings} onLive={live} onRecording={recording} onSettings={openSettings} />
        )}
        {settings ? (
          <View style={StyleSheet.absoluteFill}>
            <SettingsScreen
              sender={sender}
              onHome={home}
              onBoard={screen.name === 'board' ? () => setSettings(false) : undefined}
              onDisplay={() => {
                setSettings(false);
                setScreen({ name: 'display' });
              }}
              onSets={() => {
                setSettings(false);
                setScreen({ name: 'sets' });
              }}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  inside: { flex: 1 },
  screen: { flex: 1, backgroundColor: 'black' },
});
