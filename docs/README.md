# Rowork documentation

Rowork is a CLI that sets up and runs a modern Roblox project: roblox-ts,
Flamework, Rojo and a pinned toolchain, behind one command.

| Page | Read it when you want to... |
| --- | --- |
| [Getting started](getting-started.md) | install Rowork, create a project and see it in Studio |
| [Rowork and AI](ai.md) | learn with Rowork, or let an AI work in your project |
| [Modules](modules.md) | add a ready-made feature (player data...) to your game |
| [Commands](commands.md) | look up every command and flag |
| [Project structure](project-structure.md) | understand what was generated and where your code goes |
| [Configuration](configuration.md) | edit `rowork.json` |
| [How `rowork dev` works](dev-command.md) | know what runs, in which order, and how it stops |
| [Plugins](plugins.md) | add your own commands or share them |
| [Troubleshooting](troubleshooting.md) | fix an error message |
| [Architecture](architecture.md) | understand the codebase before changing it |
| [Contributing](contributing.md) | send a pull request |
| [Releasing](releasing.md) | publish a version to npm (maintainer) |
| [Roadmap](roadmap.md) | see what exists and what is planned |

## Status

Rowork is in early development (v0.0.x). Today: `start`, `init`, `dev`, `make:service`,
`make:controller`, `make:component`, `make:stat`, `make:event`, `studio` and
`studio:setup`.
Everything else in the roadmap, notably `eject` and the other domain generators, is **not implemented yet**, and these pages say so wherever it
matters. The plugin API is at v1 and may still change before a stable release.

## Leaving

Nothing here locks you in. `rowork eject` turns your project into a plain
roblox-ts / Flamework / Rojo project that no longer needs Rowork. See
[Commands](commands.md#rowork-eject).

## Principles

- **No lock-in.** `default.project.json`, `tsconfig.json` and `package.json`
  stay plain, visible files. You can run Rojo and roblox-ts directly at any time.
- **Thin wrapper.** Rowork drives existing tools and never reimplements them.
- **Upstream errors come first.** A TypeScript or Flamework diagnostic must not
  drown in Rojo's output.
