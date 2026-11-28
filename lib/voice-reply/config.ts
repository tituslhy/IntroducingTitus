// The voice engine's fixed settings. Kokoro runs in the visitor's browser on WebGPU (see tts.worker.ts).

/** Titus's Hugging Face copy of Kokoro-82M with the fp16 fixes (scripts/kokoro/patch-fp16.py, promote-fp32.py). */
export const KOKORO_MODEL = "tituslhy/Kokoro-82M-v1.0-ONNX-webgpu";
export const KOKORO_DTYPE = "fp16" as const;
export const KOKORO_VOICE = "am_puck";

/** Where the ONNX Runtime's wasm files are served from (copied there by scripts/copy-ort.mjs), not from jsDelivr. */
export const ORT_PATH = "/voice/ort/";

/** The model file's address, which is also its key in the browser's Cache Storage ("transformers-cache"). */
export const MODEL_FILE_URL =
  "https://huggingface.co/tituslhy/Kokoro-82M-v1.0-ONNX-webgpu/resolve/main/onnx/model_fp16.onnx";

/** The first-time download, in megabytes (model plus voice file), for the "download the voice?" prompt. */
export const DOWNLOAD_MB = 172;
