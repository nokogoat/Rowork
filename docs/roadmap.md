# Roadmap

Rowork advances sprint by sprint.

## Done

- **Sprint 1: foundation.** CLI skeleton, command registry, three-source plugin
  loader, `rowork init`.
- **Sprint 2: `rowork dev`.** Multi-process orchestration, prefixed logs, clean
  shutdown, first-build handling, up-front tool check.
- **Guided setup.** `rowork start`, and automatic Rokit installation.
- **Sprint 3: Flamework generators.** `make:service`, `make:controller`,
  `make:component`, with automatic registration in the runtime entry files.

## Next

- **Sprint 4: domain scaffolding.** `make:tool`, `make:npc`, `make:shop`,
  `make:screen`, `make:profile`. This is the point of Rowork: Flamework provides
  `service`, `controller` and `component`; Rowork adds the layer above, where a
  *tool* is a `Tool` instance plus a component, a config entry and a server
  handler, generated together and kept consistent.
- **Sprint 5: public plugin API and Wally.** Stabilise the contract and port
  Wally support as the first official plugin, outside the core.
- **`rowork eject`.** Leave Rowork at any time, keeping a working project.
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
