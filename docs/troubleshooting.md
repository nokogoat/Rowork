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

## `Port 34872 is already in use`

Another `rowork dev`, or a Rojo, is still running, typically in a terminal you
closed without pressing Ctrl+C. Rowork checks this before starting anything.

- Find what holds the port: `ss -ltnp | grep 34872` (Linux),
  `lsof -i :34872` (macOS), `netstat -ano | findstr :34872` (Windows).
- Stop it, or use another port: `rowork dev --port 34873`. Studio's Rojo plugin
  must then connect to that port.

Since 0.0.1 closing the terminal stops the tasks too (Rowork handles SIGHUP), so
this mostly comes from a `rowork dev` started by an older build, or from a process
killed with SIGKILL, which no program can intercept.

## `Could not look up the latest Rojo`

Rowork asks GitHub for the newest Rojo, and GitHub allows 60 anonymous requests an hour
per address (a school or an office shares one). Rowork carries on with a built-in
version and `rowork update` moves you later. To skip the lookup, or to pin a version for
a whole team, set `ROWORK_ROJO_VERSION=7.7.0`.

## `rowork dev` is already running in the background

You started it with `rowork dev -d` earlier. `rowork dev:logs` shows what it prints,
`rowork dev:stop` stops it. If `dev:stop` says nothing is running but the port is
busy, see the port section above.

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

## Linux: Roblox Studio

Studio has no Linux build; see [Getting started](getting-started.md#on-linux).

- **`Vinegar ... is not installed`**: run `rowork studio:setup`.
- **`Flatpak is not installed`**: install it with your package manager first.
- **`Studio has not been launched yet`**: run `rowork studio`, sign in, close
  Studio, then `rowork studio:setup` again. The Wine prefix that holds
  the plugins folder is created by that first launch.
- **The Rojo plugin does not show up**: restart Studio after `studio:setup`.
  Its version must match the Rojo in `rokit.toml`.
- **`rojo plugin install` says "platform not supported"**: expected on Linux, use
  `rowork studio:setup` instead.
- **`exec .../kombucha/bin/wine: no such file or directory`**: the first download of
  Vinegar's Wine runtime was interrupted (Ctrl+C, closed window, lost network) and
  left an incomplete folder that Vinegar then considers up to date. Delete the
  runtime and let it download again; Studio itself is not affected:

  ```bash
  cd ~/.var/app/org.vinegarhq.Vinegar/data/vinegar
  rm kombucha && rm -r kombucha-proton-*
  rowork studio
  ```

  Let that first launch finish without closing it.
- **"Can't parse JSON" in Studio's Output when connecting Rojo**: the plugin is older than the Rojo
  server. Rojo 7.7 replaced JSON by MessagePack for its whole API, and a plugin from before that
  cannot read it. It is almost always the **Creator Store copy**, which lags behind Rojo's releases
  (the error names it `cloud_13916111004`). Disable it in *Plugins > Manage Plugins*, and keep the one
  Rowork installed (`rowork studio:setup`). Rowork warns you about this in `rowork dev`,
  `rowork studio:setup` and `rowork update` when it finds both.
- **Two Rojo buttons in Studio's toolbar**: the plugin is installed twice, for
  example once from the Creator Store and once by `rowork studio:setup`. Keep one.
  Its version should match the Rojo in `rokit.toml`.
- **Studio looks blank or crashes**: the graphics renderer matters. Vinegar
  defaults to Vulkan; open its Settings (app menu, or
  `flatpak run org.vinegarhq.Vinegar manage`) and try another one. See also
  <https://github.com/vinegarhq/vinegar>.

## Windows

- Rowork is built and tested on Windows in CI (build, smoke test and the orphan-process test).
- After Ctrl+C, no `rbxtsc` or `rojo` should remain in Task Manager. If one
  does, please open an issue: that is the bug this tool is built to prevent.

## Still stuck

Run the failing command with `--verbose` and open an issue at
<https://github.com/nokogoat/Rowork/issues> with the output. Do not paste
tokens, cookies or `.env` files.
