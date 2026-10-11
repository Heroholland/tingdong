# Handoff: publish Tingdong to a private GitHub repo

You're picking this up from a claude.ai session. Read this file and `TINGDONG.md`, then do the steps below. Ask Holland (GitHub: **Heroholland**) before anything irreversible.

## What this is
Tingdong (听懂) is an iPhone web app that turns live Chinese speech into English text, running entirely on the phone. Holland uses it with AirPods to follow friends who speak Chinese.
- Speech recognition: **Qwen3-ASR-0.6B**, run by the pure-C wasm + WebGPU engine from https://github.com/ainoya/qwen-asr (Apache-2.0). The engine's `wasm/demo/app.js` is left unmodified. Tingdong drives it through the hidden element ids that app.js expects.
- Translation: Opus-MT zh→en through transformers.js 3.8.1 in a worker (`tingdong-mt.js`), CPU, 1 thread.
- Files this zip adds on top of the upstream repo:
  - `wasm/demo/tingdong.html`
  - `wasm/demo/tingdong.js`
  - `wasm/demo/tingdong-mt.js`
  - `wasm/demo/tingdong-micpick.js`
  - `.github/workflows/tingdong.yml`
  - `TINGDONG.md`
  - this file
- The workflow builds the wasm with emsdk 3.1.61, packs the 0.6B model to Q8 (about 0.85 GB) once, uploads it to a **public** Hugging Face repo, and deploys a site where `index.html` = Tingdong and `qwen-demo.html` = the upstream demo.
- Tested so far: the glue was tested in headless Chromium against a mocked engine and translator. Sentence cutting, merging trailing particles, previews and the state machine all work. Nothing has run on the real model or an iPhone yet.

## Steps
1. **Make the repo.** Clone upstream with full history (a fork can't be private, and a shallow clone can't be pushed to a new repo):
   ```
   git clone https://github.com/ainoya/qwen-asr.git tingdong && cd tingdong
   ```
   Copy this zip's contents over the clone, keeping the paths. Delete `.github/workflows/pages.yml`, because it would deploy the 1.7B demo over Tingdong. Commit.
2. Run `gh repo create Heroholland/tingdong --private --source=. --push`. Set `upstream` to ainoya/qwen-asr and `origin` to the new repo.
3. **Hosting.**
   - Run `gh api user --jq .plan.name`. GitHub Pages on a private repo needs Pro. Holland is a CMU student, so the Student Developer Pack gives him Pro for free if he doesn't have it yet.
   - **If he has Pro:** run `gh api -X POST repos/Heroholland/tingdong/pages -f build_type=workflow`. If that call fails, have him set Settings → Pages → Source to "GitHub Actions".
   - **If he doesn't:** offer Cloudflare Pages instead. Change the deploy job to `cloudflare/wrangler-action` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Add a `_site/_headers` file setting `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. With those headers the coi service worker isn't needed, but leaving it in is harmless.
4. **Hugging Face.** Holland makes a token with *write* access at https://huggingface.co/settings/tokens. Then:
   ```
   gh secret set HF_TOKEN -R Heroholland/tingdong
   gh variable set HF_MODEL_REPO -R Heroholland/tingdong --body "<hf-user>/qwen3-asr-0.6b-q8-packed"
   ```
   The model repo must be public, since the phone fetches it without auth. It only contains Qwen's Apache-2.0 weights repacked.
5. Run `gh workflow run tingdong.yml -R Heroholland/tingdong` and watch it with `gh run watch`. The `model` job takes the longest (download, pack, then a native smoke test on `samples/jfk.wav` that greps for "country"). Fix anything that fails.
6. Give Holland the site URL, plus the iPhone steps from `TINGDONG.md`:
   - Use Safari on iOS 26 or later.
   - **Add to Home Screen before tapping Load.** A Home Screen web app has storage separate from Safari, so a model downloaded in a Safari tab won't carry over.
   - In settings, choose the iPhone microphone, and use the AirPods for listening.

## Watch out for
- If the deploy succeeds but the page says "Cross-origin isolation is initializing", that's the one-time service-worker reload. It's expected.
- Translator memory: if iOS kills the tab, check whether the 0.6B model plus Opus-MT is too much for his phone model before changing anything else.
