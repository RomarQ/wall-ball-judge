import { getHostComponent, NitroModules } from 'react-native-nitro-modules'
import type { ClipViewMethods, ClipViewProps } from './specs/ClipView.nitro'
import type { ScoreLink } from './specs/ScoreLink.nitro'
import type { WallballVision } from './specs/WallballVision.nitro'

export type { BallOptions, ClipInfo, JudgeOptions, Look, LookWindow, PhoneCheck, PoseFrame, TargetLook, TargetRows, VideoItem, WallballVision } from './specs/WallballVision.nitro'

export type { FoundDisplay, ScoreLink } from './specs/ScoreLink.nitro'

export const wallballVision =
  NitroModules.createHybridObject<WallballVision>('WallballVision')

/** The scoreboard link over Bluetooth: a display's side and a judge's side. */
export const scoreLink = NitroModules.createHybridObject<ScoreLink>('ScoreLink')

/** The view an open clip of `vision` draws each judged frame into, filling it whole. */
export const ClipView = getHostComponent<ClipViewProps, ClipViewMethods>('ClipView', () =>
  require('../nitrogen/generated/shared/json/ClipViewConfig.json'),
)
