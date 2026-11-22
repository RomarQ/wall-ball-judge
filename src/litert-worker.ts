/**
 * A `.tflite` detector, run with LiteRT.js in a worker so that a look never holds up the page.
 *
 * litert-detector.ts prepares each frame and reads the answer, boxes in
 * input pixels. The model runs on the GPU through WebGPU when it compiles
 * there whole and answers as the processor does (agreement.ts), and on the
 * processor otherwise or when the page asks for the CPU.
 */
import { loadAndCompile, loadLiteRt, supportsFeature, Tensor, type CompiledModel } from '@litertjs/core';
import { answersAgree, pattern } from './agreement';
import type { DetectorReply, DetectorRequest, GpuPrecision } from './litert-detector';

type Accelerator = 'webgpu' | 'wasm';

const scope = self as unknown as DedicatedWorkerGlobalScope & {
  Module?: { locateFile(name: string): string };
  importScripts(...urls: string[]): void;
};

/**
 * Loads the LiteRT.js runtime from the folder `dir`.
 *
 * LiteRT.js runs its WASM glue with importScripts, which a module worker
 * refuses. So the glue that LiteRT.js would pick runs here first, as a module
 * that hands over its factory, the call becomes a no-op, and the glue finds
 * its .wasm in `dir` rather than beside this worker.
 */
async function loadRuntime(dir: string): Promise<void> {
  const file = (await supportsFeature('relaxedSimd'))
    ? 'litert_wasm_internal.js'
    : 'litert_wasm_compat_internal.js';
  const glue = await (await fetch(dir + file)).text();
  const url = URL.createObjectURL(
    new Blob([glue, '\nself.ModuleFactory = ModuleFactory;\n'], { type: 'text/javascript' }),
  );
  try {
    await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
  scope.Module = { locateFile: (name) => dir + name };
  scope.importScripts = () => {};
  await loadLiteRt(dir + file);
}

interface Loaded {
  model: CompiledModel;
  /** Where the model runs: LiteRT.js compiles a model WebGPU cannot run whole for the processor, or for both. */
  delegate: Accelerator;
  size: number;
  /** The output's shape, [1, 4 + classes, anchors]. */
  dims: number[];
}

async function compile(
  bytes: Uint8Array,
  accelerator: Accelerator,
  precision: GpuPrecision = 'fp16',
): Promise<Loaded> {
  const model = await loadAndCompile(bytes, { accelerator, gpuOptions: { precision } });
  const onGpu = model.options.accelerator === 'webgpu' && model.isFullyAccelerated;
  return {
    model,
    delegate: onGpu ? 'webgpu' : 'wasm',
    size: model.getInputDetails()[0].shape[2],
    dims: [...model.getOutputDetails()[0].shape],
  };
}

/**
 * The model's answer to one frame, boxes in input pixels.
 *
 * The export gives each box as a share of the input, where boxes.ts's
 * `decode` reads input pixels. Every tensor is freed, a
 * failed look's too, so a set does not leak GPU memory.
 */
async function look(loaded: Loaded, chw: Float32Array): Promise<Float32Array> {
  const made: Tensor[] = [];
  try {
    let input = new Tensor(chw, [1, 3, loaded.size, loaded.size]);
    made.push(input);
    if (loaded.delegate === 'webgpu') {
      input = await input.moveTo('webgpu');
      made.push(input);
    }
    const outputs = await loaded.model.run(input);
    made.push(...outputs);
    const host = outputs[0].accelerator === 'wasm' ? outputs[0] : await outputs[0].copyTo('wasm');
    made.push(host);
    const data = Float32Array.from(host.toTypedArray() as Float32Array);
    const boxes = 4 * loaded.dims[2];
    for (let i = 0; i < boxes; i += 1) data[i] *= loaded.size;
    return data;
  } finally {
    for (const tensor of made) if (!tensor.deleted) tensor.delete();
  }
}

/** The model on the GPU when it compiles there whole and agrees with the processor, else on the processor. */
async function openTrusted(bytes: Uint8Array, precision: GpuPrecision): Promise<Loaded> {
  const cpu = await compile(bytes.slice(), 'wasm');
  const gpu = await compile(bytes.slice(), 'webgpu', precision).catch(() => null);
  if (!gpu) return cpu;
  let keep = false;
  if (gpu.delegate === 'webgpu') {
    const frame = pattern(cpu.size);
    try {
      keep = answersAgree(await look(gpu, frame.slice()), await look(cpu, frame.slice()));
    } catch {
      keep = false;
    }
  }
  (keep ? cpu : gpu).model.delete();
  return keep ? gpu : cpu;
}

let bytes: Uint8Array | null = null;
let open: Loaded | null = null;
/** True once the model in use has answered a frame, so it is known to work. */
let proven = false;

/**
 * Runs the model, moving to the processor for good when the GPU never works.
 *
 * A GPU that answers most frames and throws on the odd one keeps its place,
 * and that frame is lost; a GPU that has never
 * answered is one this device cannot run.
 */
async function run(chw: Float32Array): Promise<Float32Array> {
  if (!open) throw new Error('the detector has no model open');
  try {
    const data = await look(open, chw);
    proven = true;
    return data;
  } catch (err) {
    if (proven || open.delegate === 'wasm' || !bytes) throw err;
    const cpu = await compile(bytes.slice(), 'wasm');
    open.model.delete();
    open = cpu;
    const data = await look(cpu, chw);
    proven = true;
    return data;
  }
}

async function answer(request: DetectorRequest): Promise<{ reply: DetectorReply; transfer: Transferable[] }> {
  if (request.type === 'open') {
    await loadRuntime(request.wasmPaths);
    bytes = new Uint8Array(await (await fetch(request.model)).arrayBuffer());
    open =
      request.unit === 'cpu'
        ? await compile(bytes.slice(), 'wasm')
        : await openTrusted(bytes, request.gpuPrecision);
    return { reply: { id: request.id, delegate: open.delegate, size: open.size }, transfer: [] };
  }
  const data = await run(request.chw);
  return {
    reply: { id: request.id, delegate: open?.delegate ?? '?', data, dims: open?.dims ?? [] },
    transfer: [data.buffer],
  };
}

scope.onmessage = (event: MessageEvent<DetectorRequest>) => {
  answer(event.data).then(
    ({ reply, transfer }) => scope.postMessage(reply, transfer),
    (err: unknown) =>
      scope.postMessage({
        id: event.data.id,
        delegate: open?.delegate ?? '?',
        error: err instanceof Error ? err.message : String(err),
      } satisfies DetectorReply),
  );
};
