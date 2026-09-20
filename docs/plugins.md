# Plugins

A plugin adds commands to Rowork. The plugin API is at **v1** and may still
change before a stable release; every breaking change bumps
`ROWORK_PLUGIN_API_VERSION`.

## Where plugins come from

Loaded in this order, only inside a Rowork project:

1. **`plugins` in `rowork.json`**: explicit module names.
2. **npm packages named `rowork-plugin-*`** (or `@scope/rowork-plugin-*`) found
   in your `dependencies` or `devDependencies`. No configuration needed.
3. **Files in `.rowork/commands/`** (`.js` or `.mjs`), for one-off commands
   that do not deserve a package.

Plugins are resolved from your project, not from Rowork's own install, so a
globally installed Rowork still finds them. Use `--no-plugins` to start without
any.

## Writing a plugin package

```ts
import { definePlugin, ROWORK_PLUGIN_API_VERSION } from "rowork/plugin";

export default definePlugin({
  name: "rowork-plugin-example",
  apiVersion: ROWORK_PLUGIN_API_VERSION,
  commands: [
    {
      name: "example:hello",
      description: "Says hello.",
      arguments: [{ name: "who", description: "who to greet", required: false }],
      options: [{ flags: "--loud", description: "shout" }],
      run(context) {
        const who = context.args["who"] ?? context.config?.name ?? "nowhere";
        context.logger.success(`Hello ${who}.`);
      },
    },
  ],
});
```

Publish it as `rowork-plugin-<name>` and users install it with
`npm install rowork-plugin-<name>`; it is detected automatically.

### Dynamic registration

For commands decided at load time, use `setup`:

```ts
definePlugin({
  name: "rowork-plugin-dynamic",
  apiVersion: ROWORK_PLUGIN_API_VERSION,
  setup(context) {
    context.registerCommand({ name: "dyn:info", description: "...", run() {} });
  },
});
```

## Local commands

`.rowork/commands/hello.mjs`:

```js
export default {
  name: "hello",
  description: "Says hello.",
  run(context) {
    context.logger.success("Hello.");
  },
};
```

Prefer `.mjs`: a roblox-ts `package.json` is not `"type": "module"`, so a `.js`
file makes Node print a warning. A file may export one command or an array.

## The command context

| Field | Content |
| --- | --- |
| `args` | positional arguments by name |
| `options` | parsed options by name |
| `cwd` | effective working directory, honouring `--cwd` |
| `projectRoot` | directory holding `rowork.json`, if any |
| `config` | the parsed `rowork.json`, if any |
| `logger` | `debug`, `info`, `success`, `warn`, `error`, `step`, `blank` |
| `roworkVersion` | installed Rowork version |

Commander conventions apply to `flags`: `--no-x` defines an option whose value
is `false` when passed and `true` otherwise.

## Rules and guarantees

- **The core wins.** A plugin cannot override `init`, `start` or `dev`; Rowork
  prints a warning and ignores the attempt. Between plugins, the first to
  register a name keeps it.
- **A broken plugin never breaks Rowork.** A plugin that throws on load, has no
  valid export, or targets a different `apiVersion` is skipped with a warning.
- **Semver on the API.** Once Rowork is public, any change to the plugin
  contract is a breaking change.

The full contract is in [`src/plugins/api.ts`](../src/plugins/api.ts).
