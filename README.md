# Rowork

**The meta-framework CLI for Roblox game development.**

Rowork is to Roblox what `artisan` is to Laravel: a single CLI that orchestrates
the toolchain, generates code, and keeps your architecture coherent.

> Status: early development. The plugin API is at v1 and may still move.

## The problem

Starting a modern Roblox project today means wiring Rojo, roblox-ts, Flamework, a
pinned toolchain and a package manager together by hand: either several hours of
setup, or a GitHub template that goes stale in three months. And once the project
is running, nothing keeps file #200 consistent with the architecture of file #1.

## What Rowork does

- **Generates**: `rowork init` today, `make:service`, `make:controller` and
  `make:tool` next. Scaffolding does not stop on day one.
- **Orchestrates**: one command to run the roblox-ts compiler, Rojo and the
  watchers together, with unified logs and readable errors.
- **Extends**: a plugin system so the community can add its own commands and
  wire in its own tools.

## What Rowork does not do

Rowork does not replace Rojo, roblox-ts, Flamework or Wally: it drives them.
`default.project.json`, `tsconfig.json` and `package.json` stay plain, visible,
editable files. You can drop down to the bare tools at any time. **No lock-in.**

## Install

```bash
npm install -g rowork
```

## Getting started

```bash
rowork init MyGame   # scaffolds, installs npm deps and the pinned toolchain
cd MyGame
rowork dev           # compiler, Rojo server and sourcemap watcher, together
```

Then connect the Rojo plugin in Studio.

## rowork dev

One command replaces three terminals. It runs the roblox-ts compiler in watch
mode, the Rojo server, and a sourcemap watcher, and streams their output into a
single prefixed log.

```
compile   | watching for changes
rojo      | Rojo server listening on port 34872
sourcemap | sourcemap.json updated
```

The sourcemap watcher is there because the Flamework transformer resolves
instance paths through the Rojo project. Keeping it regenerated removes a whole
class of path errors that otherwise only show up at runtime.

Two rules govern shutdown. If any task dies, the others are torn down and the
command exits non-zero: a Rojo server still serving stale code after the
compiler crashed looks healthy and is not. And nothing outlives the command,
including the grandchildren spawned behind tool shims, so the next run never
meets a port that is still held.

```bash
rowork dev --no-sourcemap      # skip a task
rowork dev --port 34873        # pick the Rojo port
```

## Writing a plugin

A plugin is an npm package named `rowork-plugin-<name>` that default-exports a
`RoworkPlugin`. It is auto-detected from the project dependencies.

```ts
import { definePlugin, ROWORK_PLUGIN_API_VERSION } from "rowork/plugin";

export default definePlugin({
  name: "rowork-plugin-example",
  apiVersion: ROWORK_PLUGIN_API_VERSION,
  commands: [
    {
      name: "example:hello",
      description: "Says hello.",
      run(context) {
        context.logger.success(`Hello from ${context.config?.name ?? "nowhere"}.`);
      },
    },
  ],
});
```

For a one-off command without publishing a package, drop a `.mjs` file into
`.rowork/commands/` at the project root, exporting the same shape.

Core commands cannot be overridden by a plugin: Rowork reports the attempt and
ignores it.

## Development

```bash
git clone https://github.com/nokogoat/Rowork
cd Rowork
npm install
npm run build
npm link
```

`npm link` is the step that puts `rowork` on your PATH. Without it the CLI only
runs as `node bin/rowork.js`. The link points at your working copy, so a
`npm run build` is enough for a change to take effect, and `npm run watch`
rebuilds as you type. Remove it later with `npm uninstall -g rowork`.

```bash
npm test                  # build, then every check below
npm run test:smoke        # scaffolds a project, without installing anything
npm run test:orphan       # proves `rowork dev` leaves no process behind
npm run test:integration  # real install and compile, needs the network
```

Every change goes through a branch and a pull request. CI runs the build and
the first two checks on Linux, macOS and Windows, and the integration test
once on Linux.

## License

MIT
