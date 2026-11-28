// Copies the ONNX Runtime's wasm files into public/voice/ort/, so the voice engine loads them from this site
// rather than from jsDelivr (the default). Runs before dev and build; the copies are git-ignored.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "voice", "ort");
const FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

const missing = FILES.filter((f) => !existsSync(join(from, f)));
if (missing.length) {
  console.error(`copy-ort: missing in ${from}: ${missing.join(", ")}`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
for (const f of FILES) copyFileSync(join(from, f), join(to, f));
console.log(`copy-ort: copied ${FILES.length} files to public/voice/ort/`);
