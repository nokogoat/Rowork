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

## Next

- **Modules that wire themselves together**, in either order of installation.
- **A weekly upstream check** that replays the integration tests against the latest
  Rojo, roblox-ts, Flamework, Lapis and Rokit.
- **More modules.** Only chores almost every game redoes: player settings, notifications. Each new module
  must pass that test; genre-specific features do not belong in the core.

- **Sprint 4: domain scaffolding.** `make:tool` is done (a config, a server
  component and a shared service, generated together). Still to do: `make:npc`, `make:shop`,
  `make:screen`, `make:profile`. This is the point of Rowork: Flamework provides
  `service`, `controller` and `component`; Rowork adds the layer above, where a
  *tool* is a `Tool` instance plus a component, a config entry and a server
  handler, generated together and kept consistent.
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
