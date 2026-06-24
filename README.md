# armory

CIPHER's **pi extensions workshop** — the home for bespoke/internal pi extensions. Sister to `getpipher/arsenal` (skills) and `getpipher/arsenal-private` (personal skills).

> **Graduated:** `armory-todo` (the global, cross-session TODO extension) now lives in its own dedicated, npm-publishable repo → **[getpipher/armory-todo](https://github.com/getpipher/armory-todo)**. It outgrew the workshop because the `armory` npm name was taken (blocking gallery discovery). This repo no longer ships it.

## Contents

- `extensions/.disabled/vision-delegate.ts` — an earlier experiment in scoped vision delegation (a vision sub-agent describes attached images without swapping the primary model). **Disabled:** the community [`pi-vision-tool`](https://www.npmjs.com/package/pi-vision-tool) package is used instead. Kept for reference; not loaded (files under `.disabled/` are not auto-discovered).
- `extensions/.disabled/image-marker-editor.ts` — companion experiment, also disabled.

Future bespoke extensions (a browser-use bridge, an MCP bridge, etc.) will land here.

## Install (for local development)

```json
// ~/.pi/agent/settings.json
{ "packages": ["/Users/rector/local-dev/armory"] }
```

Or from git:

```bash
pi install git:github.com/getpipher/armory
```

## License

MIT.