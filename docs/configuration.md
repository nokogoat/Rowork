# Configuration: `rowork.json`

A JSON file at the root of your project. Its presence is what makes a directory
a Rowork project: Rowork finds it by walking up from where you run a command.
It is JSON, not a `.ts` file, so it can be read before any dependency is
installed.

```json
{
  "name": "MyGame",
  "roworkApiVersion": 1,
  "language": "roblox-ts",
  "paths": {
    "source": "src",
    "out": "out",
    "rojoProject": "default.project.json",
    "services": "src/server/services",
    "controllers": "src/client/controllers",
    "shared": "src/shared"
  },
  "plugins": []
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `name` | game name, shown in logs |
| `roworkApiVersion` | contract version the project expects. If it differs from the installed Rowork, the config is refused with a message telling you to update Rowork or adjust the value |
| `language` | only `"roblox-ts"` is supported in v1 |
| `paths.source` | TypeScript sources |
| `paths.out` | compiler output. `rowork dev` checks this directory to decide whether a first build is needed |
| `paths.rojoProject` | Rojo project file, given to `rojo serve` and `rojo sourcemap` |
| `paths.services` | where `make:service` writes |
| `paths.controllers` | where `make:controller` writes. Components go to `<paths.source>/<side>/components` |
| `paths.shared` | shared code directory |
| `plugins` | plugin module names to load explicitly. See [Plugins](plugins.md) |

Paths are relative to the project root, or absolute.

## A broken config does not break the CLI

If `rowork.json` is malformed, Rowork prints a warning and keeps working for
commands that do not need a project (`--help`, `init`, `start`). Commands that
need one, such as `dev`, then report that they must run inside a Rowork project.

## Related files

- `rokit.toml`: tool versions for the whole team. `rokit install` gives every
  contributor the same Rojo.
- `package.json`: also exposes `npm run dev` (calls `rowork dev`), `npm run
  build` (`rbxtsc`) and `npm run watch` (`rbxtsc -w`).
