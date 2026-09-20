# Rowork

**The meta-framework CLI for Roblox game development.**

Rowork is to Roblox what `artisan` is to Laravel: a single CLI that sets up the
toolchain, runs it, generates code and keeps your architecture coherent.

> Status: early development (v0.0.x). `start`, `init`, `dev` and the Flamework
> `make:*` generators exist today; the domain generators are next. The plugin API is at v1 and may still move.

## The problem

Starting a modern Roblox project means wiring Rojo, roblox-ts, Flamework, a
pinned toolchain and a package manager together by hand: either several hours of
setup, or a GitHub template that goes stale in three months. And once the project
is running, nothing keeps file #200 consistent with the architecture of file #1.

## What Rowork does

- **Generates.** `rowork start` walks you through creating a project;
  `rowork init` does it without questions. `make:service`, `make:controller`
  and `make:component` create Flamework classes and register them; `make:tool`
  and the domain generators are next.
- **Orchestrates.** `rowork dev` runs the roblox-ts compiler, the Rojo server
  and a sourcemap watcher together, with unified logs and a clean shutdown.
- **Installs the toolchain.** Rokit and Rojo can be installed for you, with the
  download verified by checksum.
- **Extends.** A plugin system so the community can add its own commands.

## What Rowork does not do

Rowork does not replace Rojo, roblox-ts, Flamework or Wally: it drives them.
`default.project.json`, `tsconfig.json` and `package.json` stay plain, visible,
editable files, and you can drop down to the bare tools at any time.
**No lock-in.**

## Quick start

Rowork is not on npm yet, so install it from the repository:

```bash
git clone https://github.com/nokogoat/Rowork
cd Rowork && npm install && npm run build && npm link
```

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
