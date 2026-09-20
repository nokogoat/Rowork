# Project structure

What `rowork init` and `rowork start` generate.

```
MyGame/
  src/
    server/
      runtime.server.ts        server entry point
      services/
        ExampleService.ts      Flamework service (optional example)
    client/
      runtime.client.ts        client entry point
      controllers/
        ExampleController.ts   Flamework controller (optional example)
    shared/                    code used by both sides
```

`rowork make:component` adds a `components/` directory next to `services/` or
`controllers/` the first time you use it (`src/server/components`,
`src/client/components`) and registers it in the matching entry file.

```
  default.project.json         Rojo project: what appears in Studio
  tsconfig.json                TypeScript / roblox-ts configuration
  package.json                 npm dependencies and scripts
  rokit.toml                   pinned toolchain (Rojo)
  rowork.json                  Rowork configuration
  README.md
  .gitignore
```

Created by tools while you work, and git-ignored: `node_modules/`, `out/`
(compiled Luau), `include/` (roblox-ts runtime), `sourcemap.json`,
`flamework.build`.

With `--no-examples` the example files are omitted and each directory keeps a
`.gitkeep` so it survives in git.

## Where your code goes

| You are writing... | Put it in |
| --- | --- |
| server-side logic (data, rules, anti-cheat) | `src/server/services/` (`rowork make:service`) |
| client-side logic (input, camera, UI) | `src/client/controllers/` (`rowork make:controller`) |
| behaviour attached to tagged instances | `src/<side>/components/` (`rowork make:component`) |
| a tool players hold: settings, behaviour | `src/shared/tools/`, `src/server/components/` (`rowork make:tool`) |
| types, constants, helpers used by both | `src/shared/` |

## How code reaches Studio

`default.project.json` maps compiled output to Roblox services:

| Source | Compiled to | Appears in Studio as |
| --- | --- | --- |
| `src/server` | `out/server` | `ServerScriptService.TS` |
| `src/shared` | `out/shared` | `ReplicatedStorage.TS` |
| `src/client` | `out/client` | `StarterPlayer.StarterPlayerScripts.TS` |
| `include`, `node_modules/@rbxts`, `node_modules/@flamework` | as is | `ReplicatedStorage.rbxts_include` |

## Entry points and Flamework

`runtime.server.ts` and `runtime.client.ts` tell Flamework which directories to
scan, then start it:

```ts
Flamework.addPaths("src/server/services");
Flamework.ignite();
```

`addPaths` values are resolved **at compile time** by the Flamework
transformer, through the Rojo project. A directory you add there must exist and
be exposed in `default.project.json`, otherwise compilation fails.

### A service

```ts
import { OnStart, Service } from "@flamework/core";

@Service()
export class ExampleService implements OnStart {
	onStart(): void {
		print("started");
	}
}
```

A service is a server-side singleton created and injected by Flamework. A
controller is the same idea on the client, with `@Controller()`. Flamework's own
documentation covers dependency injection, lifecycle events and components.

## Editing the standard files

`default.project.json`, `tsconfig.json` and `package.json` are yours. Rowork
never rewrites them after generation. If you add a top-level folder that Rojo
should expose, edit `default.project.json` as you would in any Rojo project.
