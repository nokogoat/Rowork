# Roadmap

What exists, and what is next. `rowork info` lists every command and module of the version you
have installed; this page is the direction.

## Done

**The tool**

- **Project setup.** `rowork start` (guided) and `rowork init` (scripted): structure, Rojo,
  Rokit (installed for you, checksum verified), npm, git, always the **latest** versions.
  A **linter** (ESLint, official roblox-ts rules) and a **formatter** (Prettier) come in every
  new project. `start` also installs the features you tick.
- **`rowork dev`.** Compiler, Rojo and sourcemap together, unified logs, a clean stop that leaves
  no orphan process (also when the terminal is closed), a port check, `dev -d` to run in the
  background with `dev:logs` and `dev:stop`.
- **Studio on Linux.** `studio` and `studio:setup` run Studio through Vinegar and place the
  Rojo plugin.
- **`rowork update`.** Moves an existing project to the latest Rojo, npm packages and Studio plugin,
  all or nothing.
- **`rowork eject`.** Leave Rowork at any time and keep a project that runs with plain tools.
- **`rowork console`.** An interactive prompt where you type commands without `rowork`.
- **Plugins.** Three sources (`rowork.json`, `rowork-plugin-*`, `.rowork/commands/`), versioned API.

**`add`: ready-made features** (see [Modules](modules.md))

- `player-data` (Lapis), `leaderstats`, `networking` (typed events, **rate limited by default**),
  `lint`, `format`, `ui` (React, with a Studio preview).
- **Modules wire themselves together**, in either order: player data reaches the client when both
  `player-data` and `networking` are installed (`rowork wire` retries).

**`make`: one file, in the right place, connected** (see [Commands](commands.md#make-or-add))

- `make:service`, `make:controller`, `make:component`, registered with Flamework.
- `make:stat` adds a saved value everywhere it must be; `make:event` adds a typed message.
  Both offer to **link** what you create to what already exists ("link it to...?").

**Made for humans and AIs.** A generated `AGENTS.md` kept current by `rowork add`,
`rowork info --json`, every command with a scripted form (see [Rowork and AI](ai.md)).

**Kept honest.** CI on Linux, macOS and Windows; a real end-to-end run (real npm, Rokit, compiler,
linter, formatter); a weekly run against the latest upstream versions that opens an issue if
something breaks.

**The dashboard.** `rowork dashboard`: a local web page (only your computer, secret token) showing the
project and the live output of `dev`. The base for the next two tools.

**Uploading files.** `rowork assets` (see [commands](commands.md#rowork-assets)): drop files in `assets/`,
Rowork uploads them through Open Cloud and generates `Assets` for your code. Tested against a fake
server only; to be confirmed with a real API key.

## Next

Both are planned as **tabs of the dashboard** (see [The dashboard](dashboard.md)).

- **See the interface outside Roblox.** A preview you can open in a browser, without Studio
  (useful on Linux, where Studio needs Wine). Approximate by nature: it will not match Roblox
  pixel for pixel, and the docs will say so.
- **An "upload files" tab** for `rowork assets` (below), once the command is confirmed with a real key.

## Later

- **The Wally bridge.** Use Wally (Luau) packages from TypeScript. Technically the hardest item:
  to be proved on a real package before it is promised.
- **Publish to npm** (`npm install -g rowork`), then open the repository. See [Releasing](releasing.md).
- **The UI Labs plugin on Windows and macOS** (Linux is done), and refreshing it in `rowork update`.
- **Request/response functions** for networking (events are done).
- **More modules**, only chores almost every game redoes: player settings, notifications.
  Genre-specific features do not belong in the core.
- **Error prioritisation** in `dev`: surface compiler and Flamework diagnostics above everything else.

## Scope of v1

- roblox-ts and npm only. Flamework requires roblox-ts, which requires npm.
- Pure Luau projects are out of scope for v1.
- Wally is a plugin, not part of the core.
