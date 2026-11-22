import type { HybridView, HybridViewMethods, HybridViewProps } from 'react-native-nitro-modules'
import type { WallballVision } from './WallballVision.nitro'

export interface ClipViewProps extends HybridViewProps {
  /** The module whose open clip draws each frame it judges into this view. */
  vision?: WallballVision
}

export interface ClipViewMethods extends HybridViewMethods {}

/** Shows the frames of a clip as they are judged, each scaled to fill the view, so the view takes the frame's shape. */
export type ClipView = HybridView<ClipViewProps, ClipViewMethods, { android: 'kotlin' }>
