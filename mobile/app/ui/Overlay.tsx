/** What the board draws over the picture: the repository's src/overlay-layout.ts, painted in views placed by the frame's fit. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { layoutOverlay, t, warningText, type Colour, type NoticeTone, type OverlayLayout } from '../core';
import type { PipelineBoard } from '../board';
import type { Fit } from './fit';
import { COLOURS } from './theme';

/** A line label's height, in view points, from its style below. */
const LABEL_PT = 18;

const ROLE: Record<Colour, string> = {
  chalk: COLOURS.chalk,
  rep: COLOURS.rep,
  norep: COLOURS.norep,
  tape: COLOURS.tape,
  graphite: COLOURS.graphite,
  ink: COLOURS.black,
};

export interface Notice {
  text: string;
  tone: NoticeTone;
}

interface Props {
  fit: Fit;
  board: PipelineBoard;
  notice: Notice | null;
  /** Whether the picture is the frame the pose reads: a recording judged behind a still frame shows no pose. */
  showPose: boolean;
}

/** Frame pixels to view points. The layout has mirrored the marks already, so this only scales and moves them. */
interface Place {
  x: (x: number) => number;
  y: (y: number) => number;
  size: (n: number) => number;
}

export function Overlay({ fit, board, notice, showPose }: Props): React.JSX.Element | null {
  if (!fit.scale) return null;
  const place: Place = { x: (x) => fit.left + x * fit.scale, y: (y) => fit.top + y * fit.scale, size: (n) => n * fit.scale };
  const layout = layoutOverlay({
    width: fit.width,
    height: fit.height,
    mirror: fit.mirrored,
    landmarks: showPose ? board.landmarks : null,
    depth: showPose ? board.depth : null,
    target: board.ballCheck
      ? {
          lines: board.judge.target.lines,
          required: board.required,
          x: board.targetX,
          plates: board.plates,
          ball: board.ball,
          candidates: board.candidates,
          single: board.singleTarget,
        }
      : null,
    flash: board.flash,
    notice,
    warning: showPose && board.armed && board.warning ? warningText(board.warning) : null,
    labelHeight: LABEL_PT / fit.scale,
  });
  const frameWidth = place.size(fit.width);
  const frameHeight = place.size(fit.height);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Legs layout={layout} place={place} frameHeight={frameHeight} />
      {layout.parallel !== null ? (
        <>
          <View style={[styles.parallel, { top: place.y(layout.parallel), left: fit.left, width: frameWidth }]} />
          <Text style={[styles.label, { top: place.y(layout.parallel) - 20, left: fit.left + 6, color: COLOURS.tape }]}>{t('overlay.parallel')}</Text>
        </>
      ) : null}
      <DepthBar layout={layout} place={place} />
      {layout.plates.map(({ box, name, active }, i) => (
        <Labelled key={`p${i}`} place={place} box={box} label={name} colour={COLOURS.tape} dim={!active} />
      ))}
      {layout.lines.map(({ y, label, active, above, spot }, i) => (
        <View key={`l${i}`} style={[StyleSheet.absoluteFill, { opacity: active ? 1 : 0.55 }]}>
          <View style={[styles.line, { top: place.y(y), left: fit.left, width: frameWidth }]} />
          <Text style={[styles.label, { top: place.y(y) - (above ? LABEL_PT : 0), left: fit.left + 6 }]}>{label}</Text>
          {spot !== null ? <View style={[styles.diamond, { left: place.x(spot) - 7, top: place.y(y) - 7 }]} /> : null}
        </View>
      ))}
      {layout.candidates.map(({ box, label }, i) => (
        <Labelled key={`c${i}`} place={place} box={box} label={label} colour={COLOURS.tape} />
      ))}
      {layout.ball ? <Labelled place={place} box={layout.ball.box} label={layout.ball.label} colour={COLOURS.chalk} /> : null}
      {layout.banner ? (
        <View style={[styles.banner, { top: place.y(layout.banner.y), backgroundColor: ROLE[layout.banner.fill] }]}>
          <Text style={styles.bannerTitle}>{layout.banner.title}</Text>
          <Text style={styles.bannerDetail}>{layout.banner.detail}</Text>
        </View>
      ) : null}
      {layout.notice ? (
        <View style={[styles.noticeRow, { top: place.y(layout.notice.y) }]}>
          <Text style={[styles.notice, { backgroundColor: ROLE[layout.notice.fill], color: ROLE[layout.notice.ink] }]}>{layout.notice.text}</Text>
        </View>
      ) : null}
      {layout.warning ? (
        <View style={[styles.noticeRow, { top: place.y(layout.warning.y) }]}>
          <Text style={[styles.warning, { backgroundColor: ROLE[layout.warning.fill], color: ROLE[layout.warning.ink] }]}>{layout.warning.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Segment({ from, to, width, colour }: { from: { x: number; y: number }; to: { x: number; y: number }; width: number; colour: string }) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return (
    <View
      style={{
        position: 'absolute',
        left: (from.x + to.x) / 2 - length / 2,
        top: (from.y + to.y) / 2 - width / 2,
        width: length,
        height: width,
        backgroundColor: colour,
        borderRadius: width / 2,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

function Legs({ layout, place, frameHeight }: { layout: OverlayLayout; place: Place; frameHeight: number }) {
  const at = (p: { x: number; y: number }) => ({ x: place.x(p.x), y: place.y(p.y) });
  const line = Math.max(2, frameHeight * 0.004);
  const dot = Math.max(3.5, frameHeight * 0.007);
  return (
    <>
      {layout.bones.map(([a, b], i) => (
        <React.Fragment key={`b${i}`}>
          <Segment from={at(a)} to={at(b)} width={line * 2.2} colour={COLOURS.shade} />
          <Segment from={at(a)} to={at(b)} width={line} colour={COLOURS.chalk} />
        </React.Fragment>
      ))}
      {layout.joints.map((joint, i) => {
        const p = at(joint);
        return (
          <View
            key={`j${i}`}
            style={{ position: 'absolute', left: p.x - dot, top: p.y - dot, width: dot * 2, height: dot * 2, borderRadius: dot, backgroundColor: COLOURS.tape }}
          />
        );
      })}
    </>
  );
}

function DepthBar({ layout, place }: { layout: OverlayLayout; place: Place }) {
  const bar = layout.depthBar;
  if (!bar) return null;
  const height = place.size(bar.h);
  return (
    <View style={{ position: 'absolute', left: place.x(bar.x), top: place.y(bar.y), width: place.size(bar.w), height, backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar.level * height, backgroundColor: ROLE[bar.fill] }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: bar.parallel * height, height: 2, backgroundColor: COLOURS.chalk }} />
    </View>
  );
}

function Labelled({ place, box, label, colour, dim = false }: { place: Place; box: { x: number; y: number; w: number; h: number }; label: string; colour: string; dim?: boolean }) {
  const left = place.x(box.x);
  const top = place.y(box.y);
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: dim ? 0.45 : 1 }]}>
      <View style={{ position: 'absolute', left, top, width: place.size(box.w), height: place.size(box.h), borderWidth: 2, borderColor: colour }} />
      <Text style={[styles.label, { left, top: top - 20, color: colour }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { position: 'absolute', color: COLOURS.chalk, fontSize: 13, lineHeight: LABEL_PT, fontWeight: '700', textShadowColor: 'black', textShadowRadius: 3 },
  line: { position: 'absolute', height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: COLOURS.chalk },
  parallel: { position: 'absolute', height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: COLOURS.tape },
  diamond: { position: 'absolute', width: 14, height: 14, backgroundColor: COLOURS.chalk, transform: [{ rotate: '45deg' }] },
  banner: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 4 },
  bannerTitle: { color: COLOURS.black, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  bannerDetail: { color: COLOURS.black, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  noticeRow: { position: 'absolute', left: 10, right: 10, alignItems: 'center' },
  notice: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, fontSize: 15, fontWeight: '700', textAlign: 'center', overflow: 'hidden' },
  warning: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, fontSize: 18, fontWeight: '800', textAlign: 'center', overflow: 'hidden' },
});
