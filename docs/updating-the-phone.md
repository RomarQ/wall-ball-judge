# Putting a local build on the phone

The runbook for the case where the phone must run what is on this machine right now: a candidate detector, a change to the judging, a fix you are about to test at the gym. [docs/phone.md](phone.md) covers what the phone does with a build once it has one, and [docs/pages.md](pages.md) covers the published copy. This document covers the wire between the two.

## Which origin the phone is on

An installed app belongs to the origin it was installed from. `http://localhost:8000` over USB and `https://wallballs.app` are two different apps to the phone, each with its own service worker, its own caches and its own home-screen icon. Updating one does nothing to the others.

So decide first which copy is being tested. For a candidate that is not committed, use USB. For anything a person other than you will open, publish it ([pages.md](pages.md)).

## Over USB, in four commands

The phone needs USB debugging on and the cable in. `localhost` counts as a secure origin whatever is behind it, which is why this works where an IP address on the LAN does not.

```sh
npm run build
npx vite preview --port 8000 --strictPort
```

```sh
adb reverse tcp:8000 tcp:8000
```

Then open `http://localhost:8000/` on the phone. `adb reverse` sends the phone's port 8000 to this machine's, so the phone is reaching the preview server. The port is only a convention, but it has to match on both sides, and changing it makes a new origin with its own worker and caches.

Use `npm run dev` and `adb reverse tcp:5173 tcp:5173` instead when the change is in the app's own code and you want the reload. A dev build serves the models the same way; it does not build the service worker, so nothing is cached and nothing needs clearing between reloads. For the same reason, the **Ready for offline use** row on its home view reads "Not on the dev server". **Check this device** there still tests the ball check, but it stores nothing.

`adb reverse` is forgotten when the cable comes out or the phone reboots. Run it again; nothing else needs restarting.

## Making the phone take the new build

A new build waits in its service worker until the page can reload without losing anything: on the home view while no device check runs, or on the settings. The page then takes the build and reloads itself once. The judge board never reloads in place, so a set in progress keeps its build, and the page takes the new one when you leave the board. The catch is that the phone has to fetch the new build, and an installed app only looks when it opens.

- **In a browser tab:** pull down to reload on the home view. A few seconds later the page reloads once by itself, on the new build.
- **Installed from the home screen:** close it from the recent-apps list, then open it again. Backgrounding is not enough. On the home view it then reloads once by itself.
- **When it still runs the old one:** the version beside the logo is reported by the worker in control of that page, not by the server, so it is the honest answer. If it will not move, the phone is holding a worker that failed to update. Clear it at `chrome://serviceworker-internals` or, faster, uninstall the app from the home screen and reinstall it.

## Bump the version, every time

The version beside the logo is the one the worker in control reports, which is the only honest answer to "what is this phone running". That answer is worth nothing if two different builds both call themselves the same thing.

So raise `version` in [package.json](../package.json) in the same commit as the change. It is injected at build time and the service worker hands it back on request. The Android app's build takes it as the app's version name, which its home screen and settings show, so a change to either app raises it. Any increase does the job. A patch for a fix, a minor for a change to the judging or the board.

```sh
npm version patch --no-git-tag-version
```

## When the models change

The models are not part of the app shell. They are cached on first use in a cache named after `revision` in [models/manifest.json](../models/manifest.json), and the worker drops every other `models-*` cache when it activates.

**A model file that changes without the revision changing will not reach the phone.** The phone has the old bytes under the old name, and nothing tells it to look again. So when a model file changes under the same name, bump `revision` in the same commit. `v5` to `v6` is enough; the value is a cache name, not a version number anyone reads.

After that, the **Ready for offline use** row on the home view reads "Not yet". Tap **Check this device** there before you go to the gym. A new revision replaces the whole model cache, so the download gets the four model files again, about 36 MB. The runtime files come from their own cache.

## Checking what the phone is actually running

The version beside the logo comes from the worker rather than the page, so it survives a stale cache. **About**, in the settings, names the revision of the detectors the page runs, such as `v11`, or the candidate folder that `?models=` names. To read the phone from this machine:

```sh
adb forward tcp:9222 localabstract:chrome_devtools_remote
curl -s http://localhost:9222/json | grep -E '"url"|"title"'
```

The browser must be in the foreground for that socket to answer. Brave in the background does not.

To confirm which detector the phone holds, rather than which one the repository holds:

```sh
curl -s http://localhost:8000/models/detector-320.tflite | shasum -a 256
python3 -c "import json; print(json.load(open('models/manifest.json'))['files']['detector-320.tflite']['sha256'])"
```

Those two agree when the build is serving the detector its manifest claims. Do not ask the server for the manifest itself: it is bundled into the app at build time rather than copied, so `/models/manifest.json` is not there, and `vite preview` answers a missing path with `index.html` and a 200. The check looks like it passed and has told you nothing.

Either way this says what the phone would fetch next, not what it holds. What it holds is whatever revision it last activated, and **About**, in the settings, names it.

## The offline case

The gym has no network that you can rely on. Opening the app is not sufficient, because the worker caches the WASM runtimes and the models on first use only.

While the phone has a network, tap **Check this device** on the home view. The download loads the pose models, the ball detector and the target detector through the app's own loaders, so the worker caches the files that this phone asks for. When the **Ready for offline use** row reads "Yes", the app runs with the laptop shut. The row reads the same on each later visit, until a new model revision or a new runtime version replaces a cache. [docs/phone.md](phone.md) describes how the home view decides.

For a build that must never reach out at all, `VITE_MODELS=local npm run build` puts the pose models inside the bundle as well; [docs/models.md](models.md) has the detail.
