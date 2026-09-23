# Rowork

**The meta-framework CLI for Roblox game development.**

Rowork is to Roblox what `artisan` is to Laravel: a single CLI that sets up the
toolchain, runs it, generates code and keeps your architecture coherent.

> ## ⚠️ This is only the very beginning
>
> Rowork is at **version 0.1.0**. The goal is big: a real **meta-framework for Roblox**, from the first
> line of a project to a live game. **What exists today is a small first step towards it**, and most of the
> vision is not built yet.
>
> - **Expect missing features, bugs and breaking changes** without warning.
> - **It has been tried on very few games so far**, and it is version 0.1.0.
> - **Do not build a serious game on it yet.** Come and look, try it, and tell us what is wrong.
>
> The [roadmap](docs/roadmap.md) says what exists and what is missing, without promises.

## The problem

Starting a modern Roblox project means wiring Rojo, roblox-ts, Flamework, a
pinned toolchain and a package manager together by hand: either several hours of
setup, or a GitHub template that goes stale in three months. And once the project
is running, nothing keeps file #200 consistent with the architecture of file #1.

## What Rowork does

- **Generates.** `rowork start` walks you through creating a project;
  `rowork init` does it without questions. `make:service`, `make:controller`
  and `make:component` create Flamework classes and register them; `make:stat` and
  `make:event` extend your saved data and networking without a forgotten line, and `make:screen` and `make:ui`
  build your interface without plumbing.
- **Orchestrates.** `rowork dev` runs the roblox-ts compiler, the Rojo server
  and a sourcemap watcher together, with unified logs and a clean shutdown.
- **Installs the toolchain.** Rokit and Rojo can be installed for you, with the
  download verified by checksum.
- **Extends.** A plugin system so the community can add its own commands.

## What is not there yet

Rowork is at the start, and a lot is still missing. Today there is **nothing** for:

- **an existing project**: `rowork init` starts a new one, nothing adopts a game that already exists;
- **changing your saved data** once players already have some (migrations);
- **tests for your game**, several environments (development, production), feature flags, monitoring;
- **seeing your interface in a browser** (only the UI Labs plugin inside Studio);
- **a plugin ecosystem**: the plugin API is tiny and will change, and no plugin exists yet;
- **Wally packages from TypeScript**, or anything outside roblox-ts, Flamework and Rojo.

## What Rowork does not do

Rowork does not replace Rojo, roblox-ts, Flamework or Wally: it drives them.
`default.project.json`, `tsconfig.json` and `package.json` stay plain, visible,
editable files, and you can drop down to the bare tools at any time.
**No lock-in.**

## Quick start

```bash
npm install -g rowork
```

Building it from the repository instead (for development or contributing) is documented under
[Contributing](docs/contributing.md).

Then:

```bash
rowork start         # guided setup: a few questions, then a ready project
cd MyGame
rowork dev           # compiler + Rojo + sourcemap, together
```

Connect the Rojo plugin in Studio and you are live. The full walkthrough,
including Studio, is in [Getting started](docs/getting-started.md).

## Documentation

| | |
| --- | --- |
| [Getting started](docs/getting-started.md) | install, create a project, see it in Studio |
| [Commands](docs/commands.md) | every command and flag |
| [Project structure](docs/project-structure.md) | what is generated, where your code goes |
| [Configuration](docs/configuration.md) | `rowork.json` |
| [How `rowork dev` works](docs/dev-command.md) | orchestration, first build, shutdown |
| [Plugins](docs/plugins.md) | write and share commands |
| [Troubleshooting](docs/troubleshooting.md) | fix an error message |
| [Architecture](docs/architecture.md) | the codebase and its decisions |
| [Contributing](docs/contributing.md) | development setup and workflow |
| [Roadmap](docs/roadmap.md) | what exists, what is next |

## License

MIT
