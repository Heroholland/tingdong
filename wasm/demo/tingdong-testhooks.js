/* Debug only, inert without a query flag. Loaded before app.js.
 *   ?ios      take the engine's iPhone code path on a desktop browser
 *   ?fakemic  feed samples/jfk.wav (looped) instead of the microphone */
(function () {
  const q = new URLSearchParams(location.search);
  if (q.has("ios")) {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
    try { Object.defineProperty(navigator, "userAgent", { get: () => ua }); } catch (_) {}
  }
  if (q.has("fakemic")) {
    const SAMPLE = "https://raw.githubusercontent.com/ainoya/qwen-asr/HEAD/samples/jfk.wav";
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch(SAMPLE)).arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const dst = ctx.createMediaStreamDestination();
      src.connect(dst); src.start();
      return dst.stream;
    };
  }
})();
