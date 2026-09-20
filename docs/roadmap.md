# Roadmap

Rowork advances sprint by sprint.

## Done

- **Sprint 1: foundation.** CLI skeleton, command registry, three-source plugin
  loader, `rowork init`.
- **Sprint 2: `rowork dev`.** Multi-process orchestration, prefixed logs, clean
  shutdown, first-build handling, up-front tool check.
- **Guided setup.** `rowork start`, and automatic Rokit installation.
- **Linux support for Studio.** `studio` and `studio:setup` run Studio through Vinegar
  and place the Rojo plugin.
- **Sprint 3: Flamework generators.** `make:service`, `make:controller`,
  `make:component`, with automatic registration in the runtime entry files.

- **`rowork eject`.** Leave Rowork at any time and keep a project that runs with
  plain tools, verified by building an ejected project in CI.
- **Modules.** `rowork add` and the module system, with `player-data` (built on
  Lapis) `leaderstats` (a display of player data) and `networking` (typed messages
  between client and server).

- **Made for humans and AIs.** A generated `AGENTS.md` kept current by `rowork
  add`, and `rowork info --json` (see [Rowork and AI](ai.md)).

- **Always the latest.** New projects start at the latest of everything, and
  `rowork update` brings existing ones up to date, including the Studio plugin.
- **A weekly upstream check** replays the real flow against the latest versions
  and opens an issue if it breaks.

- **Modules that wire themselves together**, in either order: the first
  integration sends player data to the client.

## Next

- **More modules.** Only chores almost every game redoes: player settings, notifications. Each new module
  must pass that test; genre-specific features do not belong in the core.

- **Sprint 4: extending packs.** `make:stat` and `make:event` add a value or a message
  where it must be (`make:tool` was removed from the core: it was a pack, and specific to
  one kind of game). Next: `rowork add <name>` (done), linting, a UI module (React-Roblox)
  and the Wally bridge, see the backlog in `CLAUDE.md`.
- **Sprint 5: public plugin API and Wally.** Stabilise the contract and port
  Wally support as the first official plugin, outside the core.
- **Error prioritisation.** In `dev`, surface compiler and Flamework diagnostics
  above everything else.

## Scope of v1

- roblox-ts and npm only. Flamework requires roblox-ts, which requires npm.
- Pure Luau projects are out of scope for v1.
- Wally is a plugin, not part of the core.

## Publishing

Rowork is not on npm yet. The name `rowork` is free as of this writing. The
repository is private during the design phase and will be opened later, with a
`main` ruleset requiring a pull request and the `ci-success` check.
