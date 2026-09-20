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

## `rowork init [name]`

Creates a project without asking anything. With no name in a terminal, it starts
the guided version, `rowork start`.

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

## Guided commands

Every command that needs input has a **guided version**: run it with no
arguments in a terminal and it asks its own questions, with sensible defaults.
Arguments and flags exist for scripts and CI. Without a terminal, a guided
command refuses and prints its scripted form.

| Guided | What it asks |
| --- | --- |
| `rowork start` (or `rowork init` alone) | project name, place, examples, git, npm, toolchain |
| `rowork make` | what to create, from a list, then that command's own questions |
| `rowork make:tool` | name, seconds between uses, droppable, given at spawn |
| `rowork make:component` | name, server or client, tag |
| `rowork make:service`, `make:controller` | name |
| `rowork console` | not a question: it is a prompt where you run any of the above |

## `rowork make`

Shows everything you can create and asks what you want:

```
What do you want to create?
> Tool        something a player holds and uses: pickaxe, sword, torch
  Service     server-side logic: data, rules, spawning
  Controller  client-side logic: input, camera, effects
  Component   behaviour attached to tagged objects: doors, pickups
```

It then runs the guided version of your choice. Must run inside a project.

## `rowork make:service [name]`

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

## `rowork make:controller [name]`

Same as `make:service`, for the client side: `CameraController` in
`paths.controllers` (default `src/client/controllers`).

## `rowork make:component [name]`

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

## `rowork make:tool [name]`

Creates a whole tool (a Roblox `Tool` a player holds) as one consistent unit,
and delivers it to players for you. **Run it with no name for the guided
version**: it asks the name, the seconds between two uses, whether players can
drop it, and whether every player gets it when they spawn.

```bash
rowork make:tool                                  # guided
rowork make:tool Pickaxe                          # defaults, no questions
rowork make:tool Torch --cooldown 2 --droppable --no-give-on-spawn
```

| Option | Effect |
| --- | --- |
| `--cooldown <seconds>` | seconds between two uses (default 0.5) |
| `--droppable` | the player can drop it |
| `--no-give-on-spawn` | do not give it to players automatically |
| `-f, --force` | overwrite the tool's own files if they exist |

| File | Role |
| --- | --- |
| `src/shared/tools/PickaxeTool.ts` | the tool's settings: name, tag, cooldown, droppable, given at spawn |
| `src/server/components/PickaxeToolComponent.ts` | what it does: `activate(player)`, cooldown already handled |
| `src/shared/tools/ToolDefinition.ts` | the settings type, **created once** |
| `src/shared/tools/index.ts` | the list of all tools, **rewritten every time**, do not edit |
| `src/server/services/ToolService.ts` | builds the `Tool` and hands it out, **created once** |

**You write nothing to hand the tool out.** Every tool set to be given at spawn
reaches each player when they spawn. Your gameplay goes in
`PickaxeToolComponent.activate(player)`; to change a setting, edit
`PickaxeTool.ts`.

For a tool given at another moment (a shop, a reward), turn off "give at spawn"
and call `give` from any service:

```ts
constructor(private readonly tools: ToolService) {}
// later, when the player buys it:
this.tools.give(player, PickaxeTool);
```

The `Tool` instance is built in code with a placeholder `Handle` that you replace
with your own model. The name is normalised: `pickaxe`, `Pickaxe` and
`PickaxeTool` are the same tool. The components directory is registered in
`runtime.server.ts`. `ToolDefinition.ts` and `ToolService.ts` are shared by every
tool and may hold your edits, so they are never overwritten, even with `--force`.

## `rowork console`

An interactive Rowork prompt, so you type commands without retyping `rowork`:

```
Zomblood > make
Zomblood > make:tool
Zomblood > dev
Zomblood > help
Zomblood > exit
```

- **Everything works as usual**: type `make:tool`, `dev --port 34873`, or even
  `rowork make:service Ledger` (the leading `rowork` is optional).
- **`help`** lists every command with its description; add `--help` to one
  command for its options.
- **Tab** completes command names. **Up and down** recall previous lines.
- **`clear`** clears the screen. **`exit`**, `quit` or **Ctrl+D** leave.
- **`dev` inside the console**: Ctrl+C stops `dev` and returns to the prompt
  instead of closing the console.
- A typo gets a one-line answer with suggestions, not the whole usage text.

It needs a terminal, and cannot be nested. Each line runs as a real `rowork`
process, so guided prompts, `--help` and the shutdown behaviour of `dev` are
identical to running the commands directly.

## `rowork studio` and `rowork studio:setup` (Linux)

Roblox Studio has no Linux build. These commands run it through
[Vinegar](https://github.com/vinegarhq/vinegar), a Flatpak that runs the real
Studio under Wine. On Windows and macOS they exit with a message: install Studio
normally there.

`rowork studio:setup` installs Vinegar for the current user only (no root, nothing
outside your home), adds the Flathub remote for that user if missing, then
installs the Rojo plugin into Studio. `rojo plugin install` is unsupported on
Linux, so Rowork downloads the release's `Rojo.rbxm` matching the version
pinned in `rokit.toml` (latest outside a project). The plugin can only be placed
once Studio has been launched once, since that creates the Wine prefix: the
command says so and you re-run it after the first launch.

| Option | Effect |
| --- | --- |
| `--no-plugin` | install Vinegar only |

**Checksums.** GitHub publishes SHA-256 digests for recent release assets only.
Older Rojo releases such as 7.4.4 have none: Rowork still downloads `Rojo.rbxm`
from the official repository over HTTPS, and warns that it could not be
verified. Rokit, an executable, is stricter: it is refused without a checksum.

`rowork studio` launches Studio and returns immediately.

## Not implemented yet

These are planned (see the [roadmap](roadmap.md)) and do **not** exist:
the other domain generators (`make:npc`, `make:shop`, `make:screen`,
`make:profile`), and `eject`.
