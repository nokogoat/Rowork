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
project, **and installs the ready-made features you tick** (see
[Modules](modules.md)). See [Getting started](getting-started.md#the-guided-way) for the
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
| `--no-lint` | skip the linter (ESLint with the roblox-ts rules), which is included by default |
| `--no-format` | skip the formatter (Prettier), which is included by default |
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
| `--no-dashboard` | do not start the local web dashboard that comes with `dev` |
| `--open` | open the dashboard in your browser |

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
> Stat (saved value)  kills, coins, level: added to the player data everywhere it must be
  Event                a typed message between client and server
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
If it is not installed yet, the guided version offers to add it for you, starting with
this value, and carries on. In a script, it stops and prints the single command that
does both (`rowork add:player-data --field kills:number=0`).

| Option | Effect |
| --- | --- |
| `--type <type>` | `number` (default), `string` or `boolean` |
| `--default <value>` | starting value for a new player |
| `--leaderboard` / `--no-leaderboard` | show it in the leaderboard (needs `leaderstats`). On by default for numbers |
| `--service` / `--no-service` | create a small service to use it. On by default for numbers |
| `--link <event>` | an existing event from the client that changes it; a handler is created on the server |

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

## Linking things: "link it to...?"

The guided `make:` commands ask whether to **link what you are creating to something that
already exists**, the way `make:entity` does in Symfony. Type its name, or leave the answer
empty for no link. What exists is read from your files (the saved values from
`PlayerData.ts`, the events from `networking.ts`) and printed in the question.

| You create | It asks | What Rowork generates |
| --- | --- | --- |
| an **event** (from the client) | which saved value the server changes | a handler on the server, wired to that value |
| a **stat** | which existing event from the client changes it | the same handler |
| a **service** | which saved values it uses | those values injected in its constructor, with a comment on how to use each |

In a script, the same links are `--link <value>` on `make:event`, `--link <event>` on
`make:stat` and `--uses <values>` on `make:service`. A link is checked before anything is
written: an unknown name, or an event that already has a handler, stops the command and
changes nothing.

**The server decides, never the client.** The handler Rowork generates changes the value
by an amount fixed on the server (`add(player, 1)`), and its comments say why: everything
a client sends can be forged, so a player could send any amount and give themselves
anything. Do not replace that with a number taken from the event. Check who may do it, how
often, and at what cost, in the `TODO` the file leaves you.

## `rowork make:event [name]`

Adds a typed message between client and server to the networking file, where it
belongs, so you never edit the interfaces by hand.

```bash
rowork make:event buyItem --to server --args "itemId: string, amount: number"
rowork make:event itemBought --to client --args "itemId: string"
rowork make:event                                        # guided
```

It needs the [`networking`](modules.md#networking-messages-between-client-and-server-with-types)
module. If it is not installed yet, the guided version offers to add it for you, starting
with this event, and carries on. In a script, it stops and prints the single command that
does both (`rowork add:networking --event "buyItem:server()"`).

| Option | Effect |
| --- | --- |
| `--to <side>` | who receives it: `server` (the client sends it, default) or `client` (the server sends it) |
| `--args <list>` | what it carries, as `name: type` separated by commas |
| `--link <value>` | a saved value the server changes when it receives this (only for `--to server`) |

In the guided version there is nothing to write in a special syntax. It asks the name, who sends it, and
then what it carries **one thing at a time**: you name it (`itemId`), then pick its kind from a list
(text, number, yes/no, or your own), and it asks whether there is anything else. In a script,
`--args "itemId: string, amount: number"` says the same in one line, and a value that is not a type
(`itemId: 1`) is refused.

The line is added to `ClientToServerEvents` or `ServerToClientEvents` in
`src/shared/networking.ts`, and Rowork prints how to listen to it and how to send it.
For an event the client sends, `make:event` also adds its line to the rate limit list in
`src/server/network.ts`, so a new event is never left unprotected (if you removed that list,
the event is still added and a warning says it is not limited). A name already used in either
direction is refused (both would collide in `Events`),
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

## `rowork assets`

Uploads the files of your `assets/` folder to Roblox and writes `src/shared/assets.ts`, so your code
names an image or a sound instead of pasting a number.

```ts
import { Assets } from "../../shared/assets"; // the path depends on where your file is

image.Image = Assets.icons.sword; // assets/icons/sword.png
```

Drop images (`png`, `jpg`, `bmp`, `tga`), sounds (`mp3`, `ogg`, `wav`, `flac`) or models (`fbx`, `gltf`, `glb`,
`rbxm`) in `assets/`, then run `rowork assets`. Names come from the file path (`hit-1.ogg` becomes `hit1`).

- **A file is uploaded once.** `assets.lock.json` (commit it) remembers the content hash and the asset id of
  each file, so running the command again sends nothing that did not change. A changed image becomes a new
  asset: Roblox cannot update an image in place.
- **Images are uploaded as `Image` assets, not `Decal`.** The API also accepts `Decal`, but the id of a Decal
  does not reliably load in an `ImageLabel` in a running game. A project uploaded by an older Rowork (images
  recorded as Decals in `assets.lock.json`) sends each image again, once, as an `Image`.
- **Roblox moderates every upload**, and answers later. A file still being checked, or refused, is left out of
  `Assets` and reported; run the command again to pick it up.
- **It needs an Open Cloud API key.** Roblox requires one to upload, and it cannot be built into Rowork
  (everyone would then upload to the same account). `rowork assets:setup` walks you through it, once, and
  `rowork assets` starts it by itself when the key is missing. Rowork never prints the key, never writes it
  anywhere but `.env`, and **refuses to use a `.env` that git would commit**.
- **It needs to know who owns the assets** (your account or a group). It asks once and remembers the answer in
  `rowork.json`.
- Audio is limited by Roblox to 10 uploads a month until your identity is verified, 100 after.

```bash
rowork assets                                  # guided: sets up the key if needed, confirms before uploading
rowork assets --dry-run                        # what would be uploaded, nothing sent
rowork assets --creator user:123456 --yes      # script / CI form (group:123456 for a group)
```

| Option | Effect |
| --- | --- |
| `--creator <who>` | `user:<id>` or `group:<id>` (a bare number means a user); remembered |
| `--dry-run` | show the plan and change nothing |
| `--yes` | do not ask for confirmation (required outside a terminal) |

**What is proved against Roblox itself.** An image uploaded with `rowork assets` shows in an `ImageLabel` in a
running game (checked in Studio), and `assets:setup` accepts a real key. Still to be confirmed with a real key:
sounds, models, uploads to a group, and the real limits.

## `rowork assets:setup`

Sets up what `rowork assets` needs: a Roblox API key and the owner of the uploads. Guided, done once.

1. It lists what to click in the Creator Hub (create a key, API system `assets`, `asset:read` and `asset:write`
   and nothing else, so no `legacy-assets`, your IP address, an expiry date) and offers to open the page.
2. You paste the key into a hidden field.
3. Rowork asks Roblox whether it accepts the key (a read that creates nothing) and only then stores it in
   `.env`. It first makes sure `.gitignore` lists `.env`, and keeps the other lines of the file.
4. It asks who owns the uploads (your account or a group) and remembers it in `rowork.json`.

```bash
rowork assets:setup
rowork assets:setup --check --creator user:123456   # script / CI: check the key from the environment
```

The key is never taken from an argument (it would end up in your shell history). Outside a terminal, set
`ROWORK_ROBLOX_API_KEY` in the environment and use `--check`.

## `rowork dashboard`

Opens a local web page for the project: what is installed, every command, and the live output of
`rowork dev`. `rowork dev` starts it by itself; this command is for when `dev` is not running, and it
reuses the dashboard of a running `dev` instead of starting a second one. Only your computer can reach it, and it needs the secret token in the printed
address. See [The dashboard](dashboard.md) for what it shows and how it is protected.

```bash
rowork dashboard
rowork dashboard --no-open --port 4000
```

| Option | Effect |
| --- | --- |
| `--port <port>` | port to listen on (default: any free one) |
| `--no-open` | print the address without opening a browser |

It runs until you press Ctrl+C.

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

## Not there yet

These do **not** exist (see the [roadmap](roadmap.md)): using Wally packages from TypeScript,
`rowork add wally`, and a preview of the interface outside Roblox.
