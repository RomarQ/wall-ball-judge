---
name: frontend-parity
description: Use when a change touches anything a person sees or does in the app, such as a screen, a text, an icon, a colour, a size, a setting or a flow. Keeps the PWA and the Android app identical, and the iOS app once it is built.
---

# Frontend parity

The app has two frontends: the PWA at the repository root, and the Android app in `mobile/`. A person must see the same screens, texts, drawings and behaviour in both. A change to one frontend is done only when the other has it too, or when the table of intended differences below names it.

## Where each part lives

| Part                                                   | PWA                                                                                           | Android                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Judging, scoreboard, clock, readiness, settings values | `src/*.ts` without DOM, shared                                                                | the same files, through `mobile/app/core.ts`              |
| Texts, English and Portuguese                          | `src/i18n.ts`, shared; `index.html` holds the English first paint of each `data-i18n` element | `src/i18n.ts` through `t()`                               |
| Colours and sizes                                      | `:root` in `src/styles/base.css`                                                              | `COLOURS`, `TAP` and `REM` in `mobile/app/ui/theme.ts`    |
| Icons                                                  | the `<symbol>`s and inline SVGs in `index.html`                                               | `mobile/app/ui/icons.tsx`                                 |
| Header with the logo and the version                   | `.bar` in `index.html`, `src/styles/base.css`                                                 | `Bar` in `mobile/app/ui/controls.tsx`                     |
| Home                                                   | `#home` in `index.html`, `src/home.ts`, `src/styles/home.css`                                 | `HomeScreen.tsx`, `Demo.tsx`, `Plan.tsx`                  |
| Home drawing's movement                                | `src/demo-scene.ts`, shared                                                                   | the same file                                             |
| Judge board                                            | `#judge` in `index.html`, `src/judge.ts`, `src/styles/board.css`                              | `BoardScreen.tsx`                                         |
| Board overlay                                          | `src/overlay.ts`                                                                              | `Overlay.tsx`, both laid out by `src/overlay-layout.ts`   |
| Settings                                               | `#settings` in `index.html`, `src/settings-view.ts`, `src/styles/settings.css`                | `SettingsScreen.tsx`                                      |
| Version                                                | `version` in the root `package.json`                                                          | the same field, read by `mobile/android/app/build.gradle` |

The iOS app will share `mobile/app` with Android. A change there reaches both, but a change to the native module `mobile/modules/wallball-vision` needs its Swift side as well as its Kotlin side.

## Intended differences

These differ on purpose, because each platform offers the feature another way. A new difference needs the user's yes, and a row here.

| Only the PWA                                                                                                              | Only the Android app                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The board's Save video button (`icon-save`): Android keeps each set's video in Sets                                       | The Sets screen, with each kept set and its video                          |
| The list of the browser's voices in Settings: Android speaks with the device's own engine                                 | The two-phone link to a display (`DisplayPicker.tsx`, `DisplayScreen.tsx`) |
| The choice of detection model revision in Settings                                                                        |                                                                            |
| Home's Ready for offline use and Installed rows, and Check this device: the Android app ships its models and is installed |                                                                            |
| The hint for a phone that opens the PWA as a desktop site                                                                 |                                                                            |

## Making a change

1. Find the part in the table, and read the other frontend's counterpart before you edit.
2. Put logic, rules and texts in the shared `src/` files without DOM, so that both frontends run one copy. Never write the same rule twice.
3. Change both frontends' views in the same change. Keep each value identical: a path's numbers, a colour, a size in `rem` against the same size in points (1 rem is 16 points).
4. Raise `version` in the root `package.json` once for the change.
5. Do not run `prettier --write` on a file in `mobile/`. That code does not follow its Prettier config, so the command rewrites the whole file. Match the code around your edit instead.

## Proof

Run each of these, and report what you could not run.

1. `node .agents/skills/frontend-parity/scripts/compare.mjs` from the repository root. It lists every hand-drawn SVG shape that only one frontend draws, and every colour token that differs, and it must exit 0. It skips a shape that the Android app computes from variables, so check those on screen.
2. `npm run check`, then `cd mobile && npx tsc --noEmit`, and `ESLINT_USE_FLAT_CONFIG=false npx eslint <files>` in `mobile/` for each file you changed there.
3. Look at both frontends at the same size, screen by screen, for each screen the change touches:
   - PWA: start the `dev` server from `.claude/launch.json`, open it in the browser pane, and set the viewport to 411 by 914.
   - Android: build the release APK in `mobile/android` with `JAVA_HOME` set to Android Studio's JBR, then `./gradlew :app:createBundleReleaseJsAndAssets --rerun :app:assembleRelease`. Install it on the emulator `Medium_Phone_API_36.1` (411 by 914 points) with `adb -s emulator-5554 install -r`, and read the screen with `adb exec-out screencap -p` and `uiautomator dump`. Divide a node's `bounds` by 2.625 to get points.
   - Use the emulator, not a person's phone, unless the user asks.
4. Compare the two screenshots side by side, and name each difference you find. A difference in line breaks alone comes from the fonts, as the browser pane draws the computer's font and Android draws Roboto.

On the emulator, the board's Set up crashes the app when its ball check runs on the emulator's virtual GPU: LiteRT's GPU accelerator fails in `CompiledModel.create`. Check the live board on a phone, or compare its drawings with the script.
