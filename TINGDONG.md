# Tingdong (听懂) on Qwen3-ASR-0.6B

These files sit on top of a fork of [ainoya/qwen-asr](https://github.com/ainoya/qwen-asr), a pure-C Qwen3-ASR engine compiled to WebAssembly. It runs the audio encoder and the decoder on the GPU through WebGPU, and it already includes a 0.6B "mobile-safe" path for iPhone Safari. The engine and its `app.js` are left untouched. Tingdong drives the engine through its own controls, splits the Chinese it commits into sentences, and translates each sentence with Opus-MT (zh→en, about 80 MB, running on the CPU in a worker).

```
wasm/demo/tingdong.html        the app (becomes index.html on the site)
wasm/demo/tingdong.js          glue: engine state, sentence cutting, translation queue, UI
wasm/demo/tingdong-mt.js       translator worker (transformers.js 3.8.1, Xenova/opus-mt-zh-en)
wasm/demo/tingdong-micpick.js  lets you pick the iPhone mic instead of the AirPods mic
.github/workflows/tingdong.yml builds wasm, packs the 0.6B model to Hugging Face once, deploys Pages
```

## One-time setup (about 10 minutes of clicking, then CI does the rest)

1. **Fork** https://github.com/ainoya/qwen-asr and copy these files into the fork at the same paths.
2. **Delete `.github/workflows/pages.yml`** in the fork. It deploys the upstream 1.7B demo to the same Pages site and would overwrite Tingdong.
3. **Hugging Face:** create a token with *Write* access at https://huggingface.co/settings/tokens.
4. **Fork settings:**
   - *Actions* tab: click to enable workflows (forks start with them disabled).
   - *Settings → Pages → Source:* **GitHub Actions**.
   - *Settings → Secrets and variables → Actions:*
     - Secret `HF_TOKEN` = the token from step 3
     - Variable `HF_MODEL_REPO` = `<your-hf-username>/qwen3-asr-0.6b-q8-packed`
5. Commit and push, or go to *Actions → tingdong → Run workflow*.

   The first run downloads Qwen3-ASR-0.6B (1.9 GB of bf16), packs it to a single Q8 file (about 0.85 GB), smoke-tests it natively on the JFK sample, and uploads it to your HF repo. Later runs see the file already there and skip all of that.
6. On the iPhone, open `https://<github-user>.github.io/qwen-asr/` in Safari. The page reloads once by itself, because a service worker enables the cross-origin isolation the engine needs. Then use **Share → Add to Home Screen**.

With the `gh` CLI the repo side is:
```bash
gh repo fork ainoya/qwen-asr --clone && cd qwen-asr
# copy the files in, then:
git rm .github/workflows/pages.yml
git add -A && git commit -m "Tingdong" && git push
gh secret set HF_TOKEN
gh variable set HF_MODEL_REPO --body "<hf-user>/qwen3-asr-0.6b-q8-packed"
gh workflow run tingdong.yml
```
Setting Pages to "GitHub Actions" and enabling Actions on the fork still have to be done in the web UI.

## Using it

- **Load:** downloads the speech model and the translator. After the first time, both live on the phone, and the app loads by itself on open.
- **Start / Stop:** the engine streams. Chinese appears as people speak (the dimmed tail is still provisional), and each finished sentence becomes a card with its English.
- ⚙︎ settings:
  - Mandarin, Cantonese, or auto-detect. Auto copes better with English words mixed in.
  - Update interval, 1 to 2 s.
  - Microphone choice. Use the iPhone mic and keep the AirPods for listening.
  - Read-aloud and live preview toggles.
  - **Log**, which shows the engine's own log when something fails.
- The upstream engine demo is still on the site at `/qwen-demo.html`, which is handy for checking that the engine itself works on your phone.

## Known limits

- Needs WebGPU, so iOS 26 or later. On iPhone, the engine refuses to run the 0.6B model on the CPU because memory is too tight there.
- The screen has to stay on. iOS pauses the mic when Safari goes to the background. The app requests a wake lock.
- Opus-MT is a small translator, so expect literal translations of slang and idioms.
