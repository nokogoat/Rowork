# Getting started

From nothing to a running project in Roblox Studio.

## Prerequisites

- **Node.js 20 or newer** (`node --version`). roblox-ts needs Node anyway.
- **Git** (optional, only for the repository Rowork can initialise).
- **Roblox Studio**, to see and run your game.

You do **not** need to install Rojo or roblox-ts yourself. Rowork can install
[Rokit](https://github.com/rojo-rbx/rokit), which provides Rojo, and npm
provides roblox-ts.

## Install Rowork

Rowork is not published on npm yet. Until it is, install it from the
repository:

```bash
git clone https://github.com/nokogoat/Rowork
cd Rowork
npm install
npm run build
npm link        # puts `rowork` on your PATH
```

`npm link` points at your working copy, so after a code change `npm run build`
is enough. Remove it with `npm uninstall -g rowork`.

Once Rowork is published, this becomes:

```bash
npm install -g rowork
# or, without installing anything permanently:
npx rowork start
```

If your shell says `rowork: command not found` after `npm link`, check that the
directory printed by `npm prefix -g` followed by `/bin` is in your `PATH`. Fish
sometimes needs `rehash` or a new terminal.

## Create a project

### The guided way

```bash
rowork start
```

You are asked, in order:

1. the name of your game,
2. where to create it,
3. whether to keep an example service and controller,
4. whether to initialise a git repository,
5. whether to install the npm dependencies (roblox-ts, Flamework),
6. **which ready-made features you want from the start**: player data, leaderstats,
   typed networking. Tick what you want; you can add more later with `rowork add`. A
   feature that needs another brings it along (leaderstats needs player data). This step
   needs npm. (The **linter is always included**: nobody should have to remember to add
   it,)
7. whether to install the Roblox toolchain. If Rokit is not on your machine,
   Rowork offers to download and install it for you.

A summary is shown and nothing is written until you confirm. Ctrl+C at any
point cancels without creating anything.

### The scripted way

```bash
rowork init MyGame
```

Same result without questions, for scripts and CI. Rokit is only installed
automatically if you add `--install-rokit`. See [Commands](commands.md) for
every flag.

## Run it

```bash
cd MyGame
rowork dev
```

The first run compiles once (Rojo cannot start without the compiler's output
folder), then starts three things side by side:

```
compile   | Found 0 errors. Watching for file changes.
rojo      | Rojo server listening: localhost, port 34872
sourcemap | Created sourcemap at sourcemap.json
```

Leave it running. Press **Ctrl+C** to stop everything.

Want your terminal back? `rowork dev -d` runs it in the background; read its
output with `rowork dev:logs -f` and stop it with `rowork dev:stop`.

## Connect Roblox Studio

### On Linux

Roblox does not publish Studio for Linux. Rowork uses
[Vinegar](https://github.com/vinegarhq/vinegar), a Flatpak that runs the real
Studio through Wine. `rowork start` offers to set it up; or by hand:

```bash
rowork studio:setup   # installs Vinegar (Flatpak, current user only)
rowork studio         # launches Studio; the first run downloads it and asks you to sign in
```

Sign in, then close Studio and run `rowork studio:setup` once more: the Rojo
plugin can only be placed after Studio has been launched once, because that is
when Vinegar creates its Wine prefix. `rojo plugin install` does not work on
Linux (Rojo answers "platform not supported"), so Rowork downloads `Rojo.rbxm`
itself, matching the Rojo version pinned in `rokit.toml`.

You need Flatpak (`sudo pacman -S flatpak`, `sudo apt install flatpak`, ...).
To *play* a published game on Linux, see [Sober](https://sober.vinegarhq.org/);
it is separate from Studio and Rowork does not manage it.

### On Windows and macOS

Rojo works through a plugin inside Studio. Install it once:

```bash
rojo plugin install
```

(If `rojo` is not on your PATH yet, use the shim Rokit created:
`~/.rokit/bin/rojo plugin install`, or on Windows
`%USERPROFILE%\.rokit\bin\rojo plugin install`.)

Then, in Studio:

1. Open a new **Baseplate** place.
2. Open the **Rojo** plugin panel and click **Connect** (default address
   `localhost:34872`).

Your code is now synced. Edit a `.ts` file, the compiler rebuilds, Rojo pushes
the change into Studio. Press **Play** to run it: the Output window shows
`[MyGame] ExampleService started.` if you kept the examples.

## Keep it current

```bash
rowork update --dry-run   # what is behind
rowork update             # move to the latest Rojo, packages and Studio plugin
```

## Add things to your game

There are two kinds of command, and the difference is simple:

```bash
rowork add           # a ready-made FEATURE that works (saved player data, typed networking...)
rowork make          # a single FILE for your own logic, put in the right place and connected
```

`rowork add` gives you working code for the chores every game shares. `rowork make`
creates an almost empty service, controller or component where it belongs and
connects it for you, so you only write what makes your game yours. See
[make or add?](commands.md#make-or-add).

`make` also extends what an `add` installed, so nothing is forgotten. After
`rowork add:player-data`, `rowork make:stat kills` saves a `kills` value for every
player: it is added to the data schema, the leaderboard and a small service in one
go. After `rowork add:networking`, `rowork make:event buyItem` adds a typed message.

Tired of typing `rowork` each time? `rowork console` opens a prompt where you
just type `make`, `dev`, `studio`...

## What next

- [Project structure](project-structure.md): where your code goes.
- [Commands](commands.md): everything the CLI can do.
- [Troubleshooting](troubleshooting.md) if something did not go as described.
