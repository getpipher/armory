# armory

CIPHER's **pi extensions** — the programmable capability layer for [pi](https://pi.dev). Sister to `getpipher/arsenal` (skills) and `getpipher/arsenal-private` (personal skills).

## Contents

- `extensions/todo.ts` — **armory-todo**: a global, cross-session TODO list. Unlike the existing pi todo extensions (which are conversation-branch-scoped and survive only compaction/reload within one session), this one is backed by a single disk file (`~/.pi/agent/todo.json`) so a TODO added in session A is visible in any session B. It also auto-injects an `## Open TODOs` block into the system prompt on every `before_agent_start`, so a fresh session starts proactively aware of pending work. Surface: `todo` tool (model CRUD) + `/todo` slash command (human triage). See [`docs/todo-SPEC.md`](docs/todo-SPEC.md).
- `extensions/vision-delegate.ts` — image understanding via a scoped vision sub-agent. The primary chat model never changes; when images are attached (clipboard paste, `-p @file`, or interactive `@<image-path>`), a vision model is called in an isolated `complete()` (image + focused prompt only — never the session history) and the text description is injected back for the primary model to answer with. No model swap, no context overflow. Generates `[image-N]` positional markers for multi-image prompts.

## armory-todo

```bash
pi install git:github.com/getpipher/armory      # then restart pi
/todo                                          # list open TODOs
/todo add decouple global rules into AGENTS.md  # quick add
```

The model can add/list/complete TODOs via the `todo` tool when you say "put this in our TODO" / "show me the TODO". Store: `~/.pi/agent/todo.json` (override `TODO_STORE_PATH`). Never put secrets in a TODO — the text is injected into the system prompt and reaches the model provider.

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