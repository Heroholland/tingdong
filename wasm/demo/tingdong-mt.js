/* Chinese -> English text translation (Opus-MT, ~80 MB, CPU/wasm).
 * Kept on the CPU on purpose: the GPU is busy with the speech model, and
 * this model is small enough that wasm translates a sentence in well under
 * a second on a recent iPhone. */
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

env.allowLocalModels = false;
env.useBrowserCache = true;
/* The page is cross-origin isolated (the speech engine needs it), which would
 * make onnxruntime spin up a thread per core. One is plenty and saves memory
 * the speech model needs more. */
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let mt = null;

function progress(p) {
  if (p.status === "progress" || p.status === "done")
    postMessage({ type: "progress", file: p.file || "", loaded: p.loaded || 0, total: p.total || 0, done: p.status === "done" });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "load") {
    try {
      mt = await pipeline("translation", "Xenova/opus-mt-zh-en", { device: "wasm", dtype: "q8", progress_callback: progress });
      await mt("你好");
      postMessage({ type: "ready" });
    } catch (err) {
      postMessage({ type: "error", text: String((err && err.message) || err) });
    }
    return;
  }
  if (m.type === "translate") {
    const t0 = performance.now();
    let en = "";
    try {
      const parts = m.text.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
      const out = await mt(parts.length ? parts : [m.text], { max_new_tokens: 256 });
      en = out.map((o) => o.translation_text).join(" ").replace(/\s+/g, " ").trim();
    } catch (err) {
      en = "";
      postMessage({ type: "error", soft: true, text: String((err && err.message) || err) });
    }
    postMessage({ type: "result", id: m.id, kind: m.kind, en, ms: Math.round(performance.now() - t0) });
  }
};
