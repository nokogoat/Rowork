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
    studio.ts            studio, studio:setup (Linux)
    next-steps.ts        shared closing message
  core/
    config.ts            rowork.json: find, load, validate
    scaffold.ts          project creation, shared by init and start
    rokit-installer.ts   download, verify and install Rokit
    toolchain.ts         tool lookup on PATH, install advice
    exec.ts              run an external tool to completion
    generate.ts          write generated files, register Flamework paths
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
templates/init/          files copied into a new project
templates/make/          one template per make:* command
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
