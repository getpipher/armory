# armory

A collection of [pi](https://pi.dev) extensions. Currently ships **armory-todo** — a *global, cross-session* TODO list for pi.

[![npm](https://img.shields.io/npm/v/armory?color=cb3837&logo=npm)](https://www.npmjs.com/package/armory)
[![pi-package](https://img.shields.io/badge/pi-package-blue)](https://pi.dev/packages)

---

## armory-todo

A TODO list that **survives across all your pi sessions** — not just within one.

### The problem

pi sessions are ephemeral conversation branches. A TODO you tell to session A is invisible to session B unless you manually write it to a notes file and remember to read it next time. Every existing pi todo extension (`@juicesharp/rpiv-todo`, `@xynogen/pix-todo`, `@gonrocca/zero-pi-todo`, …) is **conversation-branch-scoped** — they persist via pi's `appendEntry()` and survive compaction + `/reload` *within a single session*. None bridge across separate sessions, and none make a fresh session aware of pending work on its own.

`armory-todo` is the other shape: a single disk file that **every** session reads, plus an **auto-injected** "Open TODOs" block in the system prompt so a fresh session starts already aware.

| | survives compaction/reload *within* a session | survives across *separate* sessions | auto-surfaced in every new session |
|---|:---:|:---:|:---:|
| branch-scoped todo extensions | ✅ | ❌ | ❌ |
| **armory-todo** | ✅ | ✅ | ✅ |

### Install

```bash
pi install git:github.com/getpipher/armory
```

Then restart pi (or `/reload`). Or add to `~/.pi/agent/settings.json`:

```json
{ "packages": ["git:github.com/getpipher/armory"] }
```

### Usage

**Say it naturally** — the model calls the `todo` tool:

> "put this in our TODO: decouple global rules into AGENTS.md"
> "show me the TODO" → "mark td-… done"

**Slash command** for quick human triage:

```
/todo                    list open + in-progress TODOs
/todo all                include done/cancelled
/todo add <text>         quick add (priority: med)
/todo done <id>          mark done
/todo rm <id>            cancel (tombstone)
/todo clean              clear all done
/todo path               show the store file path
```

**The `todo` tool** (model-callable):

| action | params | effect |
|---|---|---|
| `list` | `statusFilter?`, `projectFilter?`, `tagFilter?` | matching TODOs (default: open + in_progress) |
| `add` | `text`, `project?`, `tags?`, `priority?`, `source?` | create a TODO |
| `update` | `id`, `text?`, `priority?`, `status?`, `project?`, `tags?` | edit a TODO |
| `complete` | `id` | mark done |
| `delete` | `id` | cancel (tombstone) |
| `clear` | `status?` (default `done`) | bulk-clear a status |

Each TODO carries `id, text, project, tags, priority (low|med|high|critical), status (open|in_progress|done|cancelled), source, createdAt, updatedAt, closedAt`.

### How it works

- **Disk store** — `~/.pi/agent/todo.json`, atomic `0600` writes, corrupt-file auto-recovery, `version: 1` schema. Not pi session entries, so it outlives any conversation.
- **`todo` tool** — model CRUD (above).
- **`/todo` command** — human triage (above).
- **Auto-inject** — on every `before_agent_start`, a compact `## Open TODOs (N)` block (titles + ids, capped at 15, sorted by priority) is appended to the system prompt, so the agent starts every turn already aware of pending work. Mutations refresh it on the next turn.

Full design + decisions: [`docs/todo-SPEC.md`](docs/todo-SPEC.md).

### Configuration

| env var | default | purpose |
|---|---|---|
| `TODO_STORE_PATH` | `~/.pi/agent/todo.json` | override the store location (useful for tests / multiple profiles) |

Run the store tests: `npm test` (24/24).

### Security

- Store file is `0600`. Atomic write (temp + rename); a corrupt file is backed up to `todo.json.bad-<ts>` and a fresh store starts — the extension never crashes your session.
- **Never put secrets in a TODO.** TODO text is injected into the system prompt and therefore reaches your model provider — same rule as `AGENTS.md` / context files.

## Other / experimental

`extensions/.disabled/vision-delegate.ts` — an earlier experiment in scoped vision delegation (a vision sub-agent describes attached images without swapping the primary model). Currently **disabled**: the community [`pi-vision-tool`](https://www.npmjs.com/package/pi-vision-tool) package is used instead. Kept in `.disabled/` for reference; not loaded by the package.

## License

MIT.