# Troubleshooting

## `rowork: command not found`

Rowork is not on your PATH. If you installed it from the repository, run
`npm link` in it. Then check that `$(npm prefix -g)/bin` is in your PATH. In
fish, run `rehash` or open a new terminal.

## `Missing tool: rojo`

Rojo is provided by Rokit. In the project:

```bash
rokit install
```

- **`rokit: command not found`**: install Rokit, or let Rowork do it:
  `rowork init` with `--install-rokit`, or answer yes in `rowork start`. Manual
  install: <https://github.com/rojo-rbx/rokit>.
- **Rokit is installed but Rojo is still missing**: add `~/.rokit/bin` to your
  PATH and reopen the terminal. (Rowork already searches that directory itself
  for `rowork dev`, but your own shell does not.)
- **`The following tool has not been marked as trusted`**: run
  `rokit trust rojo-rbx/rojo`, then `rokit install`.

## `Missing tool: rbxtsc`

npm dependencies are not installed. Run `npm install` in the project.

## `Dependencies are not installed`

Same fix: `npm install`.

## `The initial build failed`

`rowork dev` compiles once before starting Rojo. The compiler's errors are
printed above that message: fix them and run `rowork dev` again.

## `rowork dev` must run inside a Rowork project

No `rowork.json` was found in the current directory or any parent. `cd` into
your project, or pass `--cwd <dir>`.

## A task stopped and everything shut down

That is intended: see [How `rowork dev` works](dev-command.md#how-it-stops). Read
the "last output" block Rowork prints. The usual causes are a port already in
use (`rowork dev --port 34873`, or stop the other Rojo) and a compiler crash.

## `Flamework: TypeScript version differs`

TypeScript was installed independently of roblox-ts, which pins one exact
version. Reinstall the pinned one:

```bash
npm install --save-dev typescript@$(node -p "require('roblox-ts/package.json').dependencies.typescript.replace('=','')")
```

`rowork init` does this for you.

## `Directory ... already exists and is not empty`

`rowork init` refuses to write over existing files. Pick another name, or pass
`--force` if you know what you are doing.

## `rowork start` needs a terminal

It is interactive. In a script, a pipe or CI, use `rowork init <name>`.

## The Rojo plugin cannot connect in Studio

- Is `rowork dev` still running, with the `rojo` task alive?
- Same port in the plugin and in the terminal (default 34872)?
- Install the plugin once with `rojo plugin install`, then restart Studio.

## Windows

- Rowork is built and tested on Windows in CI (build, smoke test and the orphan-process test).
- After Ctrl+C, no `rbxtsc` or `rojo` should remain in Task Manager. If one
  does, please open an issue: that is the bug this tool is built to prevent.

## Still stuck

Run the failing command with `--verbose` and open an issue at
<https://github.com/nokogoat/Rowork/issues> with the output. Do not paste
tokens, cookies or `.env` files.
