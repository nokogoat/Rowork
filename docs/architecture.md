# Architecture

For people changing Rowork itself. Node, TypeScript, ESM.

## Source layout

```
bin/rowork.js            binary entry point, loads dist/main.js
src/
  main.ts                startup: flags, project detection, plugins, Commander
  cli/
    program.ts           builds the Commander program from the registry
    registry.ts          command registry with conflict arbitration
    errors.ts            RoworkError: expected, user-facing failures
  commands/
    index.ts             core commands, listed explicitly
    start.ts             interactive wizard (@clack/prompts)
    init.ts              non-interactive creation
    dev.ts               orchestration entry
    make.ts              make:service, make:controller, make:component
    make-tool.ts         make:tool (settings, component, delivery)
    make-menu.ts         make: the list of everything that can be created
    console.ts           console: interactive prompt (each line is a child process)
    dev-background.ts    dev:stop and dev:logs
    add.ts               add and add:<module>: one command per module
    studio.ts            studio, studio:setup (Linux)
    next-steps.ts        shared closing message
  core/
    config.ts            rowork.json: find, load, validate
    scaffold.ts          project creation, shared by init and start
    rokit-installer.ts   download, verify and install Rokit
    toolchain.ts         tool lookup on PATH, install advice
    exec.ts              run an external tool to completion
    generate.ts          write generated files, register Flamework paths
    modules.ts           install a module: checks first, writes last
    background.ts        dev in the background: detached spawn, pid file, stop
    versions.ts          latest versions (Rojo, npm), rokit.toml pin, offline fallback
    github-release.ts    fetch a release, download an asset, verify its checksum
    studio.ts            Studio on Linux: Vinegar, Rojo plugin placement
    naming.ts            project name validation and case conversion
  process/
    supervisor.ts        runs long-lived tasks side by side
    tree-kill.ts         kills a whole process tree
    log-mux.ts           line splitting for prefixed output
  plugins/
    api.ts               the public plugin contract (`rowork/plugin`)
    loader.ts            the three plugin sources
  templates/engine.ts    renders template directories
  ui/logger.ts           leveled logger, stderr only
  ui/prompt.ts           guided-flow helpers: terminal check, cancel handling
templates/init/          files copied into a new project
src/modules/            module definitions (types.ts, one file per module)
templates/make/          one template per make:* command (make:tool uses four)
templates/modules/       the files each module copies into a project
scripts/                 smoke, orphan and integration tests
```

## Decisions worth knowing

**The core consumes its own public contract.** Core commands are
`CommandDefinition`s registered through the same path as plugin commands. A
regression in the plugin API breaks the CLI and is noticed at once.

**Commands are listed, not globbed.** The compiler checks them, startup stays
fast, and no phantom command ends up in the published package.

**The core wins name conflicts.** A plugin cannot hijack `init`.

**A failing plugin never stops the CLI.** Every load is isolated and degrades to
a warning.

**Spawning: `cross-spawn`, never `shell: true`, never a hand-added `.cmd`.**
Since the fix for CVE-2024-27980, Node refuses to spawn a `.cmd` file without a
shell and fails with `EINVAL`. `shell: true` would make every argument an
injection vector, and a hostile `rowork.json` could run arbitrary code.
`cross-spawn` invokes `cmd.exe` and escapes arguments correctly.

**Dynamic `import()` always goes through `pathToFileURL`.** Raw Windows paths
are not valid module specifiers.

**Templates.** A trailing `.tmpl` is dropped and a leading `_` becomes `.`
(npm strips `.gitignore` from published tarballs, so the template is named
`_gitignore.tmpl`). An unknown `{{ variable }}` is an error, not an empty string.

**Versions are never hardcoded** for generated projects. npm resolves them, and
TypeScript is derived from what roblox-ts pins.

**Tool lookup does not run the tool.** `toolchain.ts` scans PATH (with PATHEXT
on Windows) so a check costs nothing and cannot have side effects.

**Every input command has a guided version** (see CLAUDE.md, rule 5). A command
that takes a name treats it as optional: given, it runs scripted; missing, it
asks in a terminal or refuses with the scripted form otherwise. `rowork make` runs
the chosen command with empty arguments, so it always lands in the guided path.
Cancelling (Ctrl+C) exits cleanly before anything is written.

**The console runs each line as a child `rowork` process.** In-process dispatch
would share state between commands, and clack prompts, `process.exit` on errors
and the SIGINT handling of `dev` would all have to be re-plumbed. A child gets
them for free and behaves exactly like the real CLI. The console ignores SIGINT
while a command runs, so Ctrl+C stops `dev` and returns to the prompt. It reads
the command list from an internal active-registry holder, not from the plugin
API, so the public contract did not grow. A fresh readline interface is created
per line because a guided command's own prompts would otherwise fight it for stdin.

**Modules are code copied into the project.** A module is a `ModuleDefinition`
(name, dependencies, options, and a `plan` that turns answers into files). The
installer runs every check before the first write (already installed, missing
prerequisite, a file it would overwrite), so a refusal leaves the project as it
was. Each module gets its own `add:<name>` command, exactly like `make:*`, so
flags stay per module and a community module can register the same way. A module
wraps an established library when one exists (player-data wraps Lapis) instead of
reimplementing hard parts such as session locking.

**`dev -d` relaunches itself.** After the foreground checks and the first build,
the CLI spawns `rowork dev` again with `detached: true` and its output going to a
log file, marked by an environment variable so the child knows it is the
background one and removes its pid file on exit. A pid file alone is not trusted:
liveness is checked, and where `ps` exists the process must still look like
Rowork, so a recycled pid after a reboot can never make `dev:stop` signal an
unrelated process. Stopping sends SIGTERM to the supervisor, which stops each
task's process tree itself (the same path as Ctrl+C); on Windows `taskkill /T`
takes the tree. `rowork -d dev` is rewritten to `rowork dev -d` before parsing,
since Commander would read a `-d` before the command as a global option.

**The tool registry is rebuilt, not patched.** `src/shared/tools/index.ts` is
regenerated from the `*Tool.ts` files present, so it cannot drift and needs no
fragile text insertion. `ToolService` reads it to hand out tools at spawn, which
is why users never write delivery code.

**Generators register what they generate.** Flamework silently ignores classes
in directories not passed to `addPaths`. `ensureFlameworkPath` inserts the line
next to the existing ones, idempotently, and edits nothing when the file does
not look as generated. The integration test compiles generated code with the
real compiler and checks Flamework's `flamework.build` lists every class.

**Rokit installation is verified and opt-in.** The archive's SHA-256, published
by GitHub, must match before anything is executed; a release without a digest is
refused. `rokit trust` is run only for tools Rowork wrote to `rokit.toml`.

**The supervisor's two rules** (any death stops all, nothing outlives it) are
described in [How `rowork dev` works](dev-command.md#how-it-stops).

## Errors

Expected failures are `RoworkError` (message, optional hint, exit code) and
print as a short message plus a resolution hint. Anything else is an internal
bug and prints a stack trace.

## Tests

| Command | What it proves |
| --- | --- |
| `npm run test:smoke` | scaffolding writes the right files, refuses bad input, `start` refuses without a TTY, `dev` names missing tools |
| `npm run test:orphan` | `rowork dev` leaves no process behind, using stand-in tools |
| `npm run test:integration` | a real install (Rokit into a throwaway home, npm) and a real compile succeed |

A recurring lesson in this project: bugs at the boundary with real tools passed
every test that used stand-ins. Anything touching Rojo, roblox-ts, npm or Rokit
needs a check against the real thing.
