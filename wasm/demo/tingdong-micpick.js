/* Loaded before app.js. The engine asks for "a microphone" with no device id,
 * and on iOS that means the AirPods mic as soon as AirPods are connected:
 * it mostly hears the wearer, and it drops the AirPods into low-quality
 * call mode. Inject the device the user picked in settings instead. */
(function () {
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = function (c) {
    let id = "";
    try { id = JSON.parse(localStorage.getItem("tingdong-qwen") || "{}").micdev || ""; } catch (_) {}
    if (id && c && c.audio) {
      const a = typeof c.audio === "object" ? c.audio : {};
      c = Object.assign({}, c, { audio: Object.assign({}, a, { deviceId: { ideal: id } }) });
    }
    return orig(c);
  };
})();

/* iOS "Failed to start the audio device": a context that starts in the
 * default playback session can't switch to recording, and a forced 16 kHz
 * rate can't run on Bluetooth (AirPods) routes. Declare a play-and-record
 * session up front, and let the context use the hardware rate (the mic
 * worklet resamples to 16 kHz itself). If a context still fails to start,
 * close it so the next tap of Start builds a fresh one. */
(function () {
  try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (_) {}
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (!Orig || !isIOS) return;
  class SafeCtx extends Orig {
    constructor(opts) {
      const o = Object.assign({}, opts); delete o.sampleRate;
      super(o);
      const resume = this.resume.bind(this);
      this.resume = () => resume().catch((err) => {
        try { this.close(); } catch (_) {}
        throw err;
      });
    }
  }
  window.AudioContext = SafeCtx;
  if (window.webkitAudioContext) window.webkitAudioContext = SafeCtx;
})();
