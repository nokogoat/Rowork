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

## In the background

`rowork dev -d` (or `rowork -d dev`) gives you the terminal back. Every check
and the first build still run in the foreground first, so their errors appear
right in front of you. Then `rowork dev` is relaunched detached from the terminal,
in a session of its own on Linux and macOS, so closing the terminal does not stop
it. If it dies within its first seconds, Rowork shows the last lines of its output
instead of reporting success.

| Command | Effect |
| --- | --- |
| `rowork dev -d` | start in the background |
| `rowork dev:logs [-f] [-n 100]` | read its output, compiler errors included |
| `rowork dev:stop` | stop it and everything it started |

The pid and the log live in `.rowork/run/` (`dev.pid`, `dev.log`), which the
generated `.gitignore` already excludes. In a project created before this
existed, add `.rowork/run/` to your `.gitignore`. Only one background `rowork dev`
per project: starting a second one, or a foreground one, is refused with the
running pid. A stale pid file (after a crash or a reboot) is detected and removed;
`dev:stop` also checks that the pid still belongs to Rowork before signalling it.

The log is restarted each time you start. Compiler errors are in it, so read it
with `rowork dev:logs` when something looks wrong: a background run hides nothing,
but it does not show it to you unless you ask.

## The dashboard

`rowork dev` also starts [the dashboard](dashboard.md), a local web page with the state of the project
and the live output of everything above. Its address is printed with the tasks. It runs in the same
process, so it stops with `dev`, and it never stops the game from being built: if it cannot start, a
warning says so and the tasks carry on. `--no-dashboard` skips it, `--open` opens it in your browser.

The output is also written to `.rowork/run/dev.log`, in a terminal or detached, which is what the
dashboard and `rowork dev:logs` read.

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
