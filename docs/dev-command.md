# How `rowork dev` works

One command replaces three terminals.

## What runs

| Task | Command | Purpose |
| --- | --- | --- |
| `compile` | `rbxtsc -w` | compiles TypeScript to Luau on every save |
| `rojo` | `rojo serve default.project.json` | serves your project to Studio |
| `sourcemap` | `rojo sourcemap default.project.json --output sourcemap.json --watch` | keeps `sourcemap.json` current |

The sourcemap task exists because the Flamework transformer resolves instance
paths through the Rojo project, and tooling reads `sourcemap.json`. Keeping it
regenerated removes a class of path errors that would otherwise only show up at
runtime.

Each line of output is prefixed and coloured by task. Tools write to a pipe, so
Rowork sets `FORCE_COLOR` to keep compiler diagnostics readable. The project's
`node_modules/.bin` is put first on PATH, the way npm scripts see it.

## Before anything starts

1. **Project check.** `rowork.json` found, the Rojo project file exists,
   `node_modules` is present.
2. **Tool check.** `rbxtsc` and `rojo` are looked up on PATH (project binaries
   first, then your PATH, then `~/.rokit/bin`) without being run. If one is
   missing, `rowork dev` stops immediately and tells you the fix (`npm install`
   or `rokit install`) instead of failing with a bare `spawn rojo ENOENT`.
3. **First build.** If `out/` or `include/` does not exist yet, `rbxtsc` runs
   once and to completion. Rojo refuses to start when a `$path` in the project
   file points to something missing, and on a fresh project that is exactly the
   situation. If this build fails, `rowork dev` stops and shows the compiler
   errors.

Only then are the three tasks started.

## Port check

If the Rojo port (34872 by default, or `--port`) is already taken, `rowork dev`
says so and starts nothing, instead of letting Rojo crash and take the compiler
down with it. The cause is usually a previous `rowork dev` that is still running.

## How it stops

Two rules:

- **If any task dies, everything stops** and the command exits non-zero. A Rojo
  server that keeps serving stale code after the compiler crashed looks healthy
  and is not. Rowork prints which task stopped and replays its last 12 lines,
  since the real cause has usually scrolled past by then.
- **Nothing outlives the command.** On Ctrl+C, when the terminal is closed
  (SIGHUP), on a crash of the CLI itself and
  on a task failure, the whole process tree of each task is killed, not just the
  direct child. Tools launched through npm shims spawn a grandchild that does the
  real work, and killing only the shim leaves it running, holding your Rojo
  port. On Windows this is the classic orphaned `rbxtsc` after Ctrl+C.

A dedicated test (`npm run test:orphan`) proves no process survives.

## Options

```bash
rowork dev --no-sourcemap    # skip a task
rowork dev --no-compile      # e.g. if your editor already compiles
rowork dev --port 34873      # another Rojo port, e.g. two projects at once
```

Only what you disable is skipped, and the tool check only covers what will run.

## Running the tools by hand

Nothing here is hidden. The equivalent of `rowork dev` is three terminals:

```bash
npx rbxtsc -w
rojo serve default.project.json
rojo sourcemap default.project.json --output sourcemap.json --watch
```
