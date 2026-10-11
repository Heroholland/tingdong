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
