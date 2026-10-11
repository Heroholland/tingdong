/* Loaded before app.js. The engine's GPU-resident loader (the one iPhone uses)
 * fetches the packed model straight from the network on every load, so each
 * crash or reopen pulled ~0.85 GB again. Serve that URL from OPFS instead:
 * download it there once, in checkpointed pieces that survive a crash and
 * resume with a Range request, then hand the engine a file-backed stream.
 * Same OPFS file the engine's own cache uses (qwen-asr/model-<size>.bin). */
(function () {
  const CFG = window.QWEN_PLAYGROUND || {};
  const total = Number(CFG.modelSize);
  if (!CFG.modelBase || !total || !navigator.storage?.getDirectory) return;
  const url = `${CFG.modelBase}/qwen-asr-q8.bin`;
  const CHECKPOINT = 32 * 1024 * 1024;   // commit to disk this often
  const $ = (id) => document.getElementById(id);
  const show = (got) => {
    const bar = $("barfill"), st = $("status");
    if (bar) bar.style.width = (got / total * 100).toFixed(1) + "%";
    if (st) st.textContent = `downloading model ${(got / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB`;
  };

  async function handle() {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("qwen-asr", { create: true });
    return dir.getFileHandle(`model-${total}.bin`, { create: true });
  }

  const origFetch = window.fetch.bind(window);
  let pending = null;
  async function ensure() {
    const h = await handle();
    let size = (await h.getFile()).size;
    if (size > total) {                       // junk: start over
      const w = await h.createWritable(); await w.truncate(0); await w.close(); size = 0;
    }
    for (let attempt = 0; size < total && attempt < 50; attempt++) {
      const res = await origFetch(url, size ? { headers: { Range: `bytes=${size}-` } } : {});
      if (!res.ok) throw new Error(`model download: HTTP ${res.status}`);
      if (size && res.status !== 206) size = 0;  // server ignored the range: rewrite from 0
      let w = await h.createWritable({ keepExistingData: true });
      await w.truncate(size); await w.seek(size);
      const reader = res.body.getReader();
      let sinceCommit = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await w.write(value);
          size += value.length; sinceCommit += value.length;
          if (sinceCommit >= CHECKPOINT) {   // close = commit; reopen to continue
            await w.close(); sinceCommit = 0; show(size);
            w = await h.createWritable({ keepExistingData: true }); await w.seek(size);
          }
        }
        await w.close();
      } catch (e) {
        try { await w.close(); } catch (_) {}   // keep what arrived
        size = (await h.getFile()).size;
        if (!navigator.onLine) throw e;
      }
      show(size);
    }
    if (size !== total) throw new Error(`model download incomplete (${size} of ${total})`);
    return h.getFile();
  }

  window.fetch = async function (input, init) {
    const u = typeof input === "string" ? input : input?.url;
    const method = (init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    if (u !== url || method !== "GET" || init?.headers?.Range) return origFetch(input, init);
    try {
      pending = pending || ensure();
      const file = await pending;
      return new Response(file.stream(), {
        status: 200, headers: { "Content-Length": String(file.size), "Content-Type": "application/octet-stream" },
      });
    } catch (e) {
      console.warn("tingdong-cache:", e);
      return origFetch(input, init);
    } finally {
      pending = null;
    }
  };
})();
