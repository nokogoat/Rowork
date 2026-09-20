# Commands

## `make` or `add`?

| | `rowork make:...` | `rowork add:...` |
| --- | --- | --- |
| **What it is** | one file, created cleanly | a ready-made feature: a working pack of files |
| **Where the logic comes from** | you write it | already written and working |
| **What Rowork does for you** | puts the file in the right place, names it correctly, and includes it wherever it must be (for example registering it with Flamework so it actually runs) | installs the packages, writes the files, connects them to each other and to the modules already there |
| **How many times** | as many as you like | once per project |
| **Example** | `rowork make:service Inventory` | `rowork add:player-data` |

Both open a list when run alone (`rowork make`, `rowork add`), and both have a scripted form.
Use `make` for the pieces of your own game, `add` for the chores every game shares.

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

**Which Rojo.** The newest release, looked up on GitHub when the project is created.
GitHub allows 60 anonymous requests an hour per address, so on a shared network the
lookup can fail: Rowork then warns and uses a built-in fallback. To choose the version
yourself and skip the lookup (a team that wants every project on the same Rojo), set
`ROWORK_ROJO_VERSION`, for example `ROWORK_ROJO_VERSION=7.7.0 rowork init MyGame`. It
applies to `rowork update` too.

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
| `-d, --detach` | run in the background and give the terminal back |

```bash
rowork dev -d        # or: rowork -d dev
rowork dev:logs -f   # follow what it prints (compiler errors included)
rowork dev:stop      # stop everything
```

## `rowork dev:stop`

Stops the `rowork dev` running in the background: the compiler, Rojo and the
sourcemap watcher, and every process they started. It says so if nothing is
running. If the process does not stop within ten seconds it is killed and Rowork
warns you, in case a Rojo is left holding the port.

## `rowork dev:logs`

Prints the last lines of the background `rowork dev` output.

| Option | Effect |
| --- | --- |
| `-n, --lines <count>` | how many recent lines (default 40) |
| `-f, --follow` | keep printing new output until Ctrl+C |

## Guided commands

Every command that needs input has a **guided version**: run it with no
arguments in a terminal and it asks its own questions, with sensible defaults.
Arguments and flags exist for scripts and CI. Without a terminal, a guided
command refuses and prints its scripted form.

| Guided | What it asks |
| --- | --- |
| `rowork start` (or `rowork init` alone) | project name, place, examples, git, npm, toolchain |
| `rowork make` | what to create, from a list, then that command's own questions |
| `rowork make:stat` | the value, its kind, its starting value, leaderboard, service |
| `rowork make:event` | the message, who sends it, what it carries |
| `rowork make:component` | name, server or client, tag |
| `rowork make:service`, `make:controller` | name |
| `rowork add` | which module, then that module's own questions |
| `rowork console` | not a question: it is a prompt where you run any of the above |

## `rowork make`

Shows everything you can create and asks what you want:

```
What do you want to create?
> Saved value  kills, coins, level: added to the player data everywhere it must be
  Message      a typed message between client and server
  Service      server-side logic: data, rules, spawning
  Controller   client-side logic: input, camera, effects
  Component    behaviour attached to tagged objects: doors, pickups
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

## `rowork make:stat [name]`

Adds a value to save for every player (kills, coins, a best score...) **in every place
it must be**, so you cannot forget one. This is the classic bug: you build a system,
test for twenty minutes, and find out the value was never saved because it was missing
from the data schema.

```bash
rowork make:stat kills                                   # a number, starting at 0
rowork make:stat kills --type number --default 0
rowork make:stat nickname --type string --default Guest
rowork make:stat                                         # guided: asks each step
```

It needs the [`player-data`](modules.md#player-data-save-each-players-progress) module.

| Option | Effect |
| --- | --- |
| `--type <type>` | `number` (default), `string` or `boolean` |
| `--default <value>` | starting value for a new player |
| `--leaderboard` / `--no-leaderboard` | show it in the leaderboard (needs `leaderstats`). On by default for numbers |
| `--service` / `--no-service` | create a small service to use it. On by default for numbers |

**What it changes**

- `src/shared/data/PlayerData.ts`: the value is added to the `PlayerData` interface
  **and** to `DEFAULT_PLAYER_DATA`. Players who already have a save get the starting
  value the next time they join.
- `src/server/services/LeaderstatsService.ts`: added to the `SHOWN` list, if the
  leaderstats module is installed and it is a number.
- `src/server/services/KillsService.ts` (a new file, named after the value): for a
  number, `get(player)`, `set(player, value)` and `add(player, amount = 1)`.

```ts
constructor(private readonly kills: KillsService) {}
this.kills.add(player);          // on a kill
```

**Safe by construction.** These are files you own, so every edit is worked out in
memory first, and nothing is written unless all of them succeed. If you have
restructured `PlayerData.ts` so Rowork no longer recognises it, it says so and touches
nothing (no service is created either); add the line by hand. A value that already
exists is refused.

## `rowork make:event [name]`

Adds a typed message between client and server to the networking file, where it
belongs, so you never edit the interfaces by hand.

```bash
rowork make:event buyItem --to server --args "itemId: string, amount: number"
rowork make:event itemBought --to client --args "itemId: string"
rowork make:event                                        # guided
```

It needs the [`networking`](modules.md#networking-messages-between-client-and-server-with-types)
module.

| Option | Effect |
| --- | --- |
| `--to <side>` | who receives it: `server` (the client sends it, default) or `client` (the server sends it) |
| `--args <list>` | what it carries, as `name: type` separated by commas |

The line is added to `ClientToServerEvents` or `ServerToClientEvents` in
`src/shared/networking.ts`, and Rowork prints how to listen to it and how to send it.
A name already used in either direction is refused (both would collide in `Events`),
and the argument list is validated because it is written into code.

## `rowork console`

An interactive Rowork prompt, so you type commands without retyping `rowork`:

```
Zomblood > make
Zomblood > make:stat
Zomblood > dev
Zomblood > help
Zomblood > exit
```

- **Everything works as usual**: type `make:stat`, `dev --port 34873`, or even
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

## `rowork add [module]` and `rowork add:<module>`

Adds a ready-made feature to your game. `rowork add` shows the list; `rowork
add:player-data` goes straight to one. See [Modules](modules.md) for what a module
is and what each one does.

```bash
rowork add                         # guided: pick from a list
rowork add player-data             # guided version of one module, by name
rowork add:player-data             # the same module, with its own options
rowork add:player-data --field coins:number=0 --no-install
rowork add:leaderstats --stat coins   # needs player-data first
```

Every module has a guided version and scripted options (shown by
`rowork add:<module> --help`). A module already installed is refused: its files
are yours, and adding it again would overwrite your changes.

## `rowork eject`

Leaves Rowork and keeps a project that runs with plain tools. This is the
no-lock-in guarantee: you can stop using Rowork at any time.

```bash
rowork eject --dry-run    # see exactly what would change
rowork eject              # asks for confirmation (default: No)
rowork eject --yes        # for scripts
```

| Option | Effect |
| --- | --- |
| `--dry-run` | list the changes and change nothing |
| `--yes` | do not ask for confirmation |
| `--no-install` | do not install `concurrently` |

**What changes**

- `package.json`: the `dev` script, which called `rowork dev`, becomes a plain
  equivalent: `concurrently` running `rbxtsc -w`, `rojo serve` and `rojo sourcemap
  --watch`, with a `predev` that builds once first (Rojo cannot start without the
  compiler's output). `concurrently` is added to `devDependencies`. If your `dev`
  script is not Rowork's own, it is left exactly as you wrote it.
- `README.md`: `rowork dev` becomes `npm run dev`.
- `rowork.json` and `.rowork/` are removed. A background `rowork dev` is stopped
  first.

**What does not change:** your source code, `default.project.json`,
`tsconfig.json`, `rokit.toml`. Generated code never imports Rowork, so services,
components and modules keep working untouched. From then on `rowork` commands stop
working in that project, and `npm run dev` replaces `rowork dev`.

One thing to check: Rowork also looked in `~/.rokit/bin` on its own. A plain npm
script only sees your PATH, so `rojo` must be on it. `eject` warns you when it
is not.

## `rowork update`

Moves an existing project to the latest tools. New projects already start at the
latest: `rowork init` resolves the newest Rojo from GitHub and lets npm resolve
the newest of every package, so there is no version written in Rowork itself
(except an offline fallback for Rojo, used only when GitHub cannot be reached).
`update` brings an older project up to that level.

```bash
rowork update --dry-run   # what is behind: "current -> latest", nothing changed
rowork update             # asks for confirmation
rowork update --yes       # for scripts
```

| Option | Effect |
| --- | --- |
| `--dry-run` | list the updates and change nothing |
| `--yes` | do not ask for confirmation |
| `--no-npm` | leave the npm packages alone (Rojo and the plugin only) |
| `--no-build` | do not compile afterwards |

**What it updates**

- **Rojo:** the version in `rokit.toml`, then `rokit install` to fetch it.
- **The Rojo plugin in Studio**, which must match the Rojo server. On Linux
  Rowork places the matching `Rojo.rbxm` in Studio's Wine prefix (see
  [`studio:setup`](#rowork-studio-and-rowork-studiosetup-linux)); elsewhere it runs
  `rojo plugin install`. Restart Studio afterwards. If the toolbar shows two Rojo
  buttons, an older copy is still installed (for example from the Creator Store):
  remove it in *Plugins > Manage Plugins*.
- **npm packages:** every dependency, to its latest release. TypeScript is the
  exception: roblox-ts pins one exact version and patches it, so it is set from
  roblox-ts again after the update.

It then compiles the project to check the result. If a newer package broke it,
Rowork says so and tells you how to go back: `git diff package.json` shows what
moved, and `git checkout package.json package-lock.json && npm install` reverts it.
Commit before updating so that is always possible.

## `rowork wire`

Generates the glue between installed modules that work together (see
[Modules working together](modules.md#modules-working-together)). `rowork add` already
does it, so you normally never run this. Use it after fixing a file that blocked the
glue, or in a project whose modules were installed before an integration existed.

```bash
rowork wire --dry-run   # what would be wired, nothing changed
rowork wire
```

## `rowork info`

Shows the project, what is installed and what can be added. With `--json` it prints
the same, plus every command with its arguments and options, as JSON on stdout: the
entry point for scripts and AIs. See [Rowork and AI](ai.md).

```bash
rowork info
rowork info --json
```

## `rowork agents:sync`

Creates or refreshes `AGENTS.md` (and a `CLAUDE.md` that imports it) from the
project's current state. `rowork init` and `rowork add` already do it; use this in a
project created before it existed. Your own notes outside the generated block are
kept, and an existing `CLAUDE.md` is never modified.

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
