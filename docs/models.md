# Models

The app runs three models on the phone: MediaPipe's pose landmarker, a ball detector and a target-plate detector. The last two are the same trained weights exported at three input sizes: 320 or 416, as the settings choose, for the ball check that runs through every throw, on a window of the frame centred on the target at the scale training drew the frames at, and 640 for the finder that runs once on a tap. Each names its boxes ball or target. All the exports are LiteRT files (`.tflite`) that LiteRT.js runs. The last two are trained on wall-ball footage and versioned on the Hugging Face Hub. This page is the contract between the Hub and the app.

## Where each model comes from

| Model                                                    | Source                                          | Size           |
| -------------------------------------------------------- | ----------------------------------------------- | -------------- |
| `pose_landmarker_full.task`, `pose_landmarker_lite.task` | Google's storage, the published MediaPipe files | 9.4 MB, 5.8 MB |
| `detector-320.tflite`                                    | the Hub's `v11` tag                             | 9.8 MB         |
| `detector-416.tflite`                                    | the Hub's `v11` tag                             | 9.8 MB         |
| `detector-640.tflite`                                    | the Hub's `v11` tag                             | 9.8 MB         |

The WASM runtimes for MediaPipe and LiteRT.js ship in the npm packages and are copied beside the app at build time, under `vendor/`. They are not models and have no version of their own beyond `package-lock.json`.

A revision names its ball check's file in the manifest's `ball` and its search's file in `finder`. Its `balls` lists the ball check's files a person may choose from, each at its own input size, `ball` among them. [`src/ball-model.ts`](../src/ball-model.ts) gives both apps the file at the size the settings chose, and `ball` for a size the revision does not offer.

## The manifest

[`models/manifest.json`](../models/manifest.json) names where the trained files live, the Hub repository and the revision, and for each file its size, sha256, architecture, input size and date. `source` takes one of two values:

- `repo`: the files are committed under `public/models/` and served by the app itself.
- `hub`: the app fetches `https://huggingface.co/<repo>/resolve/<revision>/<file>`. The revision is a tag on the Hub repository, so the URL is immutable.

The service worker names its model cache after the shipped revision: a new revision gets a new cache, and the old one is dropped on the next activation. That is how a phone stops serving a stale model file without any file-level versioning in the app. Bump the revision whenever a file changes, whichever source is in use.

The manifest is the only place the app learns a model's identity, so a model change is a one-line diff in git with a checksum beside it.

## Choosing an earlier revision

The settings offer the shipped revision and every revision under `offered` in the manifest, each with its two detectors' sizes, checksums, classes and training date. An offered revision loads from its tag on the Hub, `https://huggingface.co/<repo>/resolve/<revision>/<file>`, in every build, `VITE_MODELS=local` included, so its first start needs a network. The service worker keeps its files in the model cache with the shipped ones, and the home view downloads the revision chosen at the time, so a phone that showed the home view with a network after the choice judges with it offline.

The choice is stored on the phone and read at the board's next start, which drops the detectors of another revision first. A stored revision that the manifest no longer offers falls back to the shipped one. The settings name the revision in use, and the phone check's result holds for that revision only.

To offer a revision, add its two files' entries under `offered.<revision>.files`, copied from the manifest that shipped it, with its `ball` and `finder` beside them, and check that the Hub's tag still serves files with those checksums. Both files must be LiteRT exports: the app runs no other kind. To withdraw one, remove its entry.

## Choosing the ball check's input size

The settings offer each input size in the revision's `balls`: 320, the default, and 416 for v11. The ball check reads a window of that many input pixels at the training scale, so the size sets how much of the frame around the target the window takes in. At 320 the window is half the frame's long side, and at 416 about two thirds. The model then reads 1.7 times the pixels on each look, and takes more time for it.

The choice is stored on the device under `ballInput` and read at the board's next start, which drops a ball detector of the other size first. The phone check's result holds for one ball model, so a change of size asks for the check again, and the home view downloads the ball model of the size chosen at the time. The Android app ships both sizes, each with its own TPU file, probe frame and unit check (see [mobile/README.md](../mobile/README.md)).

## Trying a candidate on a phone

Before a candidate ships, a page can load it in place of the shipped pair: put its exports, named as the shipped revision names its files (`detector-320.tflite` and `detector-640.tflite`, with `detector-416.tflite` for a device set to 416), in a folder under `public/models/candidates/`, which git ignores, and add `?models=candidates/<folder>` to the page's address, such as the judge board. The files sit at a new path, so the service worker fetches them rather than serve the shipped detectors from its model cache. Nothing else changes, and a page without the option loads the shipped models.

## Shipping a revision

The Hub holds each revision under a tag: its two LiteRT files, their ONNX exports and the PyTorch weights. To ship one, push its files to the Hub, tag that commit, and set `revision` and the files' entries in the manifest in one commit. A tag may gain a file, but a file never changes under a tag: a phone keeps the bytes it cached under the revision's name.

## The LiteRT files

In a set on a Pixel 6a, LiteRT.js takes about a third less time per look than ONNX Runtime, with the same verdicts. The files are exported from the run's PyTorch weights. A candidate from training comes as ONNX exports, so it needs this export before a page can load it:

```sh
python -c "from ultralytics import YOLO; YOLO('last.pt').export(format='tflite', imgsz=320)"
python -c "from ultralytics import YOLO; YOLO('last.pt').export(format='tflite', imgsz=416)"
python -c "from ultralytics import YOLO; YOLO('last.pt').export(format='tflite', imgsz=640)"
```

This ran with Ultralytics 8.4.142, which exports through `litert_torch` 0.10.0, in a Python 3.12 environment with TensorFlow 2.21. A first export there failed with "duplicate registrations for aten.miopen_batch_norm.default" and the second worked. Each file keeps the ONNX file's channel order, such as `[1, 3, 320, 320]` in and `[1, 6, 2100]` out, but gives each box as a share of the input, so `src/litert-worker.ts` scales the boxes to pixels. Each LiteRT file of v11 finds the boxes of its ONNX export on eval frames. Check a new export the same way before it ships.

LiteRT.js runs a model on the GPU in half precision unless asked otherwise. The ball check does, and its verdicts were checked that way. The search asks for full precision: in half precision its scores moved by up to 0.023 on the reference clips, and the order of the plates changed on 4 of 24 frames. In full precision it answers as the processor does, within a few millionths.

## Running without the Hub

`npm run models:fetch` downloads the pose models into `public/models/` and verifies the trained ones against the manifest's checksums, fetching them from the Hub when the source is `hub`. A build with `VITE_MODELS=local` then serves them all from the app's own origin, which is the mode for a self-hosted copy and a gym with no signal at all. The pose files are ignored by git.

## Licences

The app is MIT. The two detectors are not, and the difference is deliberate. They are fine-tuned from Ultralytics' pretrained YOLO26n checkpoint. Ultralytics release YOLO26 and its weights under AGPL-3.0, with a paid enterprise licence as the alternative, so the model card says AGPL-3.0 and the repository's own MIT licence covers the application only.

The [model card on the Hub](https://huggingface.co/RodrigoQuelhas/hyrox-wallballs-detection) states the licence and how the detectors were trained.

## Why the Hub rather than the repository

A model file is ten megabytes and changes a few times a month. Committed to git, each version stays in the history forever; through LFS, GitHub's quota is a gigabyte a month and GitHub Pages serves LFS pointers rather than files. The Hub versions the files with git semantics, serves them with CORS from a CDN, and keeps the metrics and the run beside them as a model card can. A clone runs on the files from the Hub, and `npm run models:fetch` keeps a checked copy for a build that serves them itself.
