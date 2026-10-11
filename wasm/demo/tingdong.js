/* Tingdong glue: drives the Qwen3-ASR engine (app.js, unchanged) through its
 * own hidden controls, watches the Chinese it commits, cuts it into
 * sentences and translates each one to English in a worker. */

const $ = (id) => document.getElementById(id);
const CFG = window.QWEN_PLAYGROUND || {};
const KEY = "tingdong-qwen";

/* ---------------- settings ---------------- */
const S = { engine: "apple", lang: "Chinese", chunk: "2", micdev: "", translate: true, speak: false, preview: true, showzh: true };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
for (const k of Object.keys(S)) {
  const el = $(k); if (!el) continue;
  if (el.type === "checkbox") el.checked = !!S[k]; else el.value = S[k];
  el.addEventListener("change", () => {
    S[k] = el.type === "checkbox" ? el.checked : el.value;
    save(); applyView();
    if (k === "engine") { location.reload(); return; }
    if (k === "translate") {
      if (S.translate && phase !== "idle" && phase !== "loading") loadMT();
      if (!S.translate && mt) { mt.terminate(); mt = null; mtReady = mtBusy = mtLoading = false; finals.length = 0; previewJob = null; }
    }
    if ((k === "lang" || k === "chunk") && phase === "listening")
      setNote("Takes effect next time you tap Start.");
  });
}
function applyView() { document.body.classList.toggle("hidezh", !S.showzh); }
applyView();

/* ---------------- translator worker ---------------- */
let mt = null, mtReady = false, mtBusy = false, mtLoading = false;
const finals = [];          // {id, text}
let previewJob = null;      // latest {id, text}
const mtFiles = new Map();

function loadMT() {
  if (mt || mtLoading || !S.translate) return;
  mtLoading = true;
  mt = new Worker("tingdong-mt.js", { type: "module" });
  mt.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") {
      if (m.total) mtFiles.set(m.file, m.done ? m.total : m.loaded);
    } else if (m.type === "ready") {
      mtReady = true; mtLoading = false; pumpMT();
    } else if (m.type === "error") {
      if (m.soft) { mtBusy = false; pumpMT(); return; }
      mtLoading = false; mt = null;
      setNote("Translator failed to load: " + m.text);
    } else if (m.type === "result") {
      mtBusy = false;
      onTranslation(m);
      pumpMT();
    }
  };
  mt.onerror = (e) => { mtLoading = false; setNote("Translator error: " + (e.message || "worker failed")); };
  mt.postMessage({ type: "load" });
}
function pumpMT() {
  if (!mtReady || mtBusy) return;
  let job = finals.shift(), kind = "final";
  if (!job && previewJob) { job = previewJob; previewJob = null; kind = "preview"; }
  if (!job) return;
  mtBusy = true;
  mt.postMessage({ type: "translate", id: job.id, text: job.text, kind });
}

/* ---------------- transcript cards ---------------- */
const feed = $("feed");
let nextId = 1, live = null;
const cards = new Map();

function nearBottom() { return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160; }
function card(cls) {
  $("empty")?.remove();
  const el = document.createElement("div");
  el.className = "utt " + cls;
  el.innerHTML = '<div class="zh"></div><div class="en"></div><div class="meta"></div>';
  return { el, zh: el.children[0], en: el.children[1], meta: el.children[2] };
}
let lastFinal = null;
function addFinal(text) {
  const stick = nearBottom();
  if (live) { live.en.textContent = ""; live.previewText = ""; }
  /* A lone trailing particle (呢, 吧, 啊…) that landed after a pause belongs
   * to the sentence before it: merge and re-translate instead of a new card. */
  if (lastFinal && text.replace(/[\s\p{P}]/gu, "").length <= 2 && performance.now() - lastFinal.at < 6000) {
    lastFinal.text += text;
    lastFinal.zh.textContent = lastFinal.text;
    lastFinal.at = performance.now();
    finals.push({ id: lastFinal.id, text: lastFinal.text });
    pumpMT();
    return;
  }
  const c = card("");
  c.text = text; c.at = performance.now(); lastFinal = c;
  c.id = nextId++;
  c.zh.textContent = text;
  c.meta.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  feed.insertBefore(c.el, live ? live.el : null);
  cards.set(c.id, c);
  finals.push({ id: c.id, text });
  pumpMT();
  if (stick) feed.scrollTop = feed.scrollHeight;
}
function setLive(committedTail, partial) {
  const all = (committedTail + partial).trim();
  if (!all) { if (live) { live.el.remove(); live = null; } return; }
  const stick = nearBottom();
  if (!live) { live = card("live"); live.id = 0; live.lastPreview = 0; live.previewText = ""; feed.appendChild(live.el); }
  live.zh.textContent = "";
  live.zh.append(committedTail);
  if (partial) { const s = document.createElement("span"); s.className = "tail"; s.textContent = partial; live.zh.append(s); }
  if (S.preview && all !== live.previewText && performance.now() - live.lastPreview > 1200 && !finals.length && hasWords(all)) {
    live.lastPreview = performance.now();
    live.previewText = all;
    previewJob = { id: 0, text: all };
    pumpMT();
  }
  if (stick) feed.scrollTop = feed.scrollHeight;
}
function onTranslation(m) {
  if (m.kind === "preview") {
    if (live && m.en) live.en.textContent = m.en;
    return;
  }
  const c = cards.get(m.id);
  if (!c) return;
  c.en.textContent = m.en || "(no translation)";
  c.meta.textContent = c.meta.textContent.replace(/ · .*$/, "") + ` · ${(m.ms / 1000).toFixed(1)}s to translate`;
  if (S.speak && m.en) say(m.en);
}
function say(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 1.08;
  speechSynthesis.speak(u);
}

/* ---------------- segmentation of the engine's committed text ---------------- */
const ENDERS = /[。！？!?；;…]/g;
const SOFT = /[，,、：:]/g;
const hasWords = (t) => /[㐀-鿿豈-﫿A-Za-z0-9]/.test(t);
let doneUpTo = 0, lastCommitted = "", lastChange = 0;

function readOut() {
  let c = "", p = "";
  for (const n of $("out").childNodes) {
    if (n.nodeType === 1 && n.classList.contains("partial")) p += n.textContent;
    else c += n.textContent;
  }
  return { c, p };
}
function lastMatch(re, s) { let i = -1, m; re.lastIndex = 0; while ((m = re.exec(s))) i = m.index; return i; }

function segment(force) {
  if (S.engine === "apple") return;
  const { c, p } = readOut();
  if (c.length < doneUpTo) doneUpTo = c.length;   // new session, or the final rewrite came out shorter
  const now = performance.now();
  if (c !== lastCommitted) { lastCommitted = c; lastChange = now; }
  let pending = c.slice(doneUpTo);

  for (let guard = 0; guard < 20; guard++) {
    let cut = -1;
    const e = lastMatch(ENDERS, pending);
    if (e >= 0) cut = e + 1;
    else if (pending.length >= 48) { const s = lastMatch(SOFT, pending); cut = s >= 8 ? s + 1 : pending.length; }
    else if (pending.trim() && (force || (now - lastChange > 1600 && !p.trim()))) cut = pending.length;
    if (cut <= 0) break;
    const text = pending.slice(0, cut).replace(/^[\s，,。、；;：:！!？?]+/, "").trim();
    doneUpTo += cut;
    pending = pending.slice(cut);
    if (text && hasWords(text)) addFinal(text);
  }
  setLive(pending, p);
}
new MutationObserver(() => segment(false)).observe($("out"), { childList: true, characterData: true, subtree: true });
setInterval(() => segment(phase === "ready" && $("status").textContent === "done"), 400);

/* ---------------- engine state, derived from its controls ---------------- */
let phase = "idle", wakeLock = null, noteTimer = 0;
const go = $("go");

function setNote(t) {
  clearTimeout(noteTimer);
  const st = $("status");
  st.dataset.note = t; st.textContent = t;
  noteTimer = setTimeout(() => { delete st.dataset.note; }, 4000);
}
function derive() {
  if (S.engine === "apple") return apple.listening ? "listening" : "ready";
  const loaded = !$("mic").disabled;
  const listening = !$("micstop").classList.contains("hide");
  const status = $("status").textContent;
  if (!loaded) return $("load").disabled ? "loading" : "idle";
  if (listening) return "listening";
  if (/^finishing/.test(status)) return "finishing";
  return "ready";
}
function render() {
  const prev = phase;
  phase = derive();
  const labels = { idle: "Load", loading: "Loading…", ready: "Start", listening: "Stop", finishing: "…" };
  go.textContent = labels[phase];
  go.disabled = phase === "loading" || phase === "finishing";
  go.classList.toggle("on", phase === "listening");
  if (phase !== prev) onPhase(prev, phase);
  /* fold the translator's download into the bar once the speech model is in */
  if (phase !== "loading" && mtLoading && mtFiles.size) {
    const got = [...mtFiles.values()].reduce((a, b) => a + b, 0);
    $("status").textContent = `Downloading translator… ${(got / 1e6).toFixed(0)} MB`;
  }
}
function onPhase(prev, now) {
  const chip = $("chip");
  if (now === "ready" && prev === "loading") {
    chip.textContent = window.__gpu ? "GPU · Qwen3-ASR 0.6B" : "CPU · Qwen3-ASR";
    chip.className = window.__gpu ? "ok" : "warn";
    if (!mtReady) loadMT();
  }
  if (now === "idle" && prev === "loading") { chip.textContent = "load failed"; chip.className = "warn"; $("log").classList.add("open"); $("sheet").classList.add("open"); }
  if (now === "listening") { keepAwake(); listMics(); }
  if (prev === "listening") { try { wakeLock && wakeLock.release(); } catch (_) {} wakeLock = null; }
}
setInterval(render, 250);

go.onclick = () => {
  if (S.engine === "apple") {
    if (phase === "ready") appleStart(); else appleStop();
    setTimeout(render, 0);
    return;
  }
  if (phase === "idle") {
    loadMT();                 // download both models in parallel
    $("load").click();
  } else if (phase === "ready") {
    /* app.js creates/resumes the AudioContext synchronously in this click,
     * which is what iOS needs; unlock speech in the same gesture. */
    if (S.speak && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    doneUpTo = 0;
    $("mic").click();
  } else if (phase === "listening") {
    $("micstop").click();
  }
  setTimeout(render, 0);
};

/* ---------------- odds and ends ---------------- */
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (_) {} }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && phase === "listening") keepAwake();
});
async function listMics() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    const sel = $("micdev");
    sel.innerHTML = '<option value="">Default</option>' +
      devs.map((d, i) => `<option value="${d.deviceId}">${(d.label || "Microphone " + (i + 1)).replace(/</g, "&lt;")}</option>`).join("");
    if (S.micdev && devs.some((d) => d.deviceId === S.micdev)) sel.value = S.micdev;
  } catch (_) {}
}
listMics();

$("gear").onclick = () => $("sheet").classList.toggle("open");
$("dbg").onclick = () => $("log").classList.toggle("open");
$("clear").onclick = () => { feed.querySelectorAll(".utt").forEach((n) => n.remove()); cards.clear(); live = null; lastFinal = null; };
$("copy").onclick = async () => {
  const text = [...feed.querySelectorAll(".utt:not(.live) .en")].map((n) => n.textContent).join("\n");
  try { await navigator.clipboard.writeText(text); setNote("Copied."); } catch (_) { setNote("Copy failed."); }
};

/* app.js forces these on load; put the user's choices back. */
$("model-select").value = "0.6b";
$("lang").value = S.lang;
$("chunk").value = S.chunk;

/* If the speech model is already on the phone, load it straight away. */
(async () => {
  if (!self.crossOriginIsolated || !CFG.modelSize || !navigator.storage?.getDirectory) return;
  try {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("qwen-asr");
    const f = await (await dir.getFileHandle(`model-${CFG.modelSize}.bin`)).getFile();
    if (f.size === Number(CFG.modelSize) && phase === "idle" && crashedIn !== "loading" && S.engine === "qwen") go.click();
  } catch (_) { /* not cached yet */ }
})();

/* ---------------- keep downloads, and remember crashes ---------------- */
/* Ask iOS not to evict the ~0.9 GB of models when storage gets tight. */
navigator.storage?.persist?.().catch(() => {});

/* iOS kills a tab that uses too much memory and reloads it with no error, so
 * write a breadcrumb while running and look for it on the next start. */
const CRASH = "tingdong-crash";
let crashedIn = "";   // a crash while loading must not auto-load into another one
function breadcrumb() {
  if (phase !== "loading" && phase !== "listening") { try { localStorage.removeItem(CRASH); } catch (_) {} return; }
  const lines = [...$("log").children].slice(-25).map((d) => d.textContent);
  const mem = (performance.memory ? ` js=${(performance.memory.usedJSHeapSize / 1e6).toFixed(0)}MB` : "") +
    (window.__gpuBytes ? ` gpu=${(window.__gpuBytes / 1e6).toFixed(0)}MB` : "");
  try {
    localStorage.setItem(CRASH, JSON.stringify({
      phase, translate: S.translate, mt: mtReady ? "ready" : mtLoading ? "loading" : "off",
      at: new Date().toLocaleTimeString(), mem, lines,
    }));
  } catch (_) {}
}
setInterval(breadcrumb, 500);
/* The engine logs its reason right before it reloads itself; save on every line. */
new MutationObserver(breadcrumb).observe($("log"), { childList: true });
try {
  const last = JSON.parse(localStorage.getItem(CRASH) || "null");
  crashedIn = last?.phase || "";
  localStorage.removeItem(CRASH);
  if (last) {
    const log = $("log");
    const head = document.createElement("div");
    head.className = "warn";
    head.textContent = `Last session ended unexpectedly at ${last.at} while ${last.phase} ` +
      `(translator ${last.mt}${last.mem}). Its last log lines:`;
    log.append(head, ...last.lines.map((t) => Object.assign(document.createElement("div"), { textContent: "  " + t })));
    log.classList.add("open");
    $("sheet").classList.add("open");
    setTimeout(() => setNote(last.translate
      ? "It crashed last time. Try turning off Translate in ⚙︎ to save memory."
      : "It crashed last time even without the translator. See Log."), 300);
  }
} catch (_) {}

/* ---------------- Apple speech engine (Safari's built-in recognizer) ---------------- */
/* Light on memory: the recognition runs in iOS, not in the page. It streams
 * audio to Apple, so it needs a connection. Each final result becomes a card. */
const apple = { rec: null, listening: false, want: false };
const appleLang = () => S.lang === "Cantonese" ? "zh-HK" : "zh-CN";
function appleStart() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setNote("This browser has no built-in speech recognition. Switch engine in ⚙︎."); return; }
  if (S.speak && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
  loadMT();
  const rec = new SR();
  rec.lang = appleLang(); rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], t = r[0].transcript.trim();
      if (r.isFinal) { if (t && hasWords(t)) addFinal(t); }
      else interim += t;
    }
    setLive("", interim);
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") apple.want = false;
    setNote("Speech recognition: " + e.error);
  };
  /* iOS ends the session after a pause; keep it going until Stop. */
  rec.onend = () => {
    setLive("", "");
    if (apple.want) { try { rec.start(); return; } catch (_) {} }
    apple.listening = false; apple.rec = null; render();
  };
  apple.rec = rec; apple.want = true; apple.listening = true;
  try { rec.start(); } catch (e) { apple.want = apple.listening = false; setNote("Could not start: " + e.message); }
}
function appleStop() {
  apple.want = false;
  try { apple.rec?.stop(); } catch (_) {}
  apple.listening = false;
}
if (S.engine === "apple") {
  $("chip").textContent = "Apple speech"; $("chip").className = "ok";
  $("empty").innerHTML = "Tap <b>Start</b> and set the phone near the conversation.<br><br>" +
    "Speech recognition: Apple (needs internet). Translation runs on the iPhone.";
  if (S.translate) loadMT();
}
