# Commands

## Global options

Available on every command.

| Option | Effect |
| --- | --- |
| `--cwd <dir>` | run as if started from this directory |
| `--verbose` | print debug logs |
| `--quiet` | print errors only |
| `--no-plugins` | start without loading any plugin |
| `-v, --version` | print the Rowork version |
| `-h, --help` | help for Rowork or for one command |

Diagnostics go to **stderr**. stdout is reserved for output meant to be piped.
Rowork finds your project by walking up from the working directory until it
meets a `rowork.json`, so commands work from any subfolder.

## `rowork start`

Guided project setup. Asks a few questions, shows a summary, then creates the
project. See [Getting started](getting-started.md#the-guided-way) for the
questions.

It needs an interactive terminal and refuses to run in a script or a pipe,
pointing you to `rowork init` instead.

| Option | Effect |
| --- | --- |
| `--path <dir>` | parent directory to create the project in (skips that question) |

## `rowork init <name>`

Creates a project without asking anything.

```bash
rowork init MyGame
rowork init MyGame --path ~/games --no-git
rowork init MyGame --install-rokit
```

`<name>` starts with a letter, then letters, digits, `.`, `-` or `_`. It is
used as the directory name; the game name in `rowork.json` is its PascalCase
form (`my-cool-game` becomes `MyCoolGame`) and the npm package name is its
kebab-case form.

| Option | Effect |
| --- | --- |
| `--path <dir>` | parent directory to create the project in |
| `--no-install` | skip installing npm dependencies |
| `--no-rokit` | skip installing the pinned Roblox toolchain |
| `--install-rokit` | download and install Rokit if it is missing |
| `--no-git` | skip `git init` |
| `--no-examples` | skip the example service and controller |
| `-f, --force` | write into a directory that is not empty |

Without `--force`, Rowork refuses a target directory that already contains
files, before writing anything.

**What it installs.** npm packages: `roblox-ts`, `@rbxts/types`,
`@rbxts/compiler-types`, `rbxts-transformer-flamework`, `@flamework/core`,
`@flamework/components`, and `typescript`. Versions are chosen by npm, never
hardcoded in Rowork. The one exception is TypeScript: roblox-ts pins an exact
version and patches it, so Rowork reads that version from roblox-ts and
installs exactly it. Otherwise Flamework warns on every compile.

**About Rokit.** Rokit is the toolchain manager that provides Rojo. With
`--install-rokit`, Rowork downloads the latest official release from
`github.com/rojo-rbx/rokit`, verifies the SHA-256 checksum GitHub publishes for
it (it refuses to run anything if that fails), then runs Rokit's own
`self-install`. That creates `~/.rokit` and edits your shell profile so Rokit
is on your PATH in new terminals. It then runs `rokit trust rojo-rbx/rojo` and
`rokit install`. Only Rojo, the tool Rowork writes into `rokit.toml`, is
trusted automatically.

## `rowork dev`

Runs the compiler, the Rojo server and the sourcemap watcher together. Must be
run inside a Rowork project. Details in [How `rowork dev` works](dev-command.md).

| Option | Effect |
| --- | --- |
| `--no-compile` | skip the roblox-ts compiler |
| `--no-rojo` | skip the Rojo server |
| `--no-sourcemap` | skip the sourcemap watcher |
| `--port <port>` | port for the Rojo server (default 34872) |

## `rowork make:service <name>`

Creates a Flamework service: a server-side singleton, created and injected by
Flamework.

```bash
rowork make:service Inventory       # src/server/services/InventoryService.ts
rowork make:service player-stats    # PlayerStatsService
```

`<name>` can be typed as `Inventory`, `inventory`, `player-stats` or
`InventoryService`: it is turned into PascalCase and the `Service` suffix is
added if missing. It must start with a letter.

| Option | Effect |
| --- | --- |
| `-f, --force` | overwrite the file if it already exists |

Written to `paths.services` from [`rowork.json`](configuration.md). Without
`--force`, an existing file is never overwritten.

## `rowork make:controller <name>`

Same as `make:service`, for the client side: `CameraController` in
`paths.controllers` (default `src/client/controllers`).

## `rowork make:component <name>`

Creates a Flamework component: behaviour attached automatically to every
instance carrying a CollectionService tag.

```bash
rowork make:component Door --side client --tag Openable
rowork make:component Spawner          # server side, tag "Spawner"
```

| Option | Effect |
| --- | --- |
| `--side <side>` | `server` (default) or `client` |
| `--tag <tag>` | the CollectionService tag (default: the name). Letters, digits, `_`, `-`, `.` |
| `-f, --force` | overwrite the file if it already exists |

Written to `<paths.source>/<side>/components/`, for example
`src/client/components/DoorComponent.ts`.

### Automatic registration

Flamework only discovers classes in directories listed by `Flamework.addPaths`.
A class in an unlisted directory compiles fine and then silently never runs, so
every `make:*` command makes sure the matching entry file
(`runtime.server.ts` or `runtime.client.ts`) lists the directory, and adds the
line next to the existing `addPaths` calls when it is missing. It is idempotent:
generating a second component does not add the line twice. If the entry file
does not look the way Rowork generated it, nothing is edited and Rowork prints
the line to add yourself.

## Not implemented yet

These are planned (see the [roadmap](roadmap.md)) and do **not** exist:
`make:tool` and the other domain generators (`make:npc`, `make:shop`,
`make:screen`, `make:profile`), and `eject`.
