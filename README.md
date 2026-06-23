# armory

CIPHER's **pi extensions** — the programmable capability layer for [pi](https://pi.dev). Sister to `getpipher/arsenal` (skills) and `getpipher/arsenal-private` (personal skills).

## Contents

- `extensions/vision-delegate.ts` — image understanding via a scoped vision sub-agent. The primary chat model never changes; when images are attached (clipboard paste, `-p @file`, or interactive `@<image-path>`), a vision model is called in an isolated `complete()` (image + focused prompt only — never the session history) and the text description is injected back for the primary model to answer with. No model swap, no context overflow. Generates `[image-N]` positional markers for multi-image prompts.

## Install

```bash
pi install git:github.com/getpipher/armory
```

## Consume in pi

```json
// ~/.pi/agent/settings.json
{ "packages": ["git:github.com/getpipher/armory"] }
```

Or for local development:
```json
{ "packages": ["/Users/rector/local-dev/armory"] }
```

## Vision model config

`vision-delegate` calls `ollama/qwen3.5:cloud` by default (configured in `~/.pi/agent/models.json`). Change `VISION_PROVIDER` / `VISION_MODEL` at the top of the extension to use a different vision model (e.g. a frontier multimodal model via OpenRouter).

## License

MIT — shared as sadaqah jariyah.