# The dashboard

A web page, served by Rowork on your own computer, that shows your project and the live output of
`rowork dev`. It is the start of a place where the rest of Rowork's tools (a preview of your
interface, uploading files to Roblox) will live, in the spirit of Symfony's web profiler.

## It comes with `rowork dev`

`rowork dev` starts the dashboard by itself and prints its address, next to the compiler and Rojo:

```
Dashboard: http://127.0.0.1:45927/?token=...
```

Open that address in your browser (or run `rowork dev --open` to have Rowork open it). It stops with
`dev`. With `rowork dev -d` (in the background) the address is printed when it starts, and
`rowork dashboard` prints it again at any time. To run `dev` without it: `rowork dev --no-dashboard`.

```bash
rowork dev                 # compiler, Rojo, sourcemap and the dashboard
rowork dev --open          # ... and opens it in your browser
rowork dev --no-dashboard  # without it
```

## On its own

```bash
rowork dashboard            # opens it in your browser
rowork dashboard --no-open  # only prints the address
rowork dashboard --port 4000
```

If `rowork dev` is already running, `rowork dashboard` does not start a second server: it prints and
opens the one that runs. Otherwise it starts its own, which stops with Ctrl+C.

## What is in it

| Tab | What it shows |
| --- | --- |
| **Overview** | the ready-made features (installed or not, with the command to add them), the ones wired together, and every command with its description. It refreshes by itself, so installing a feature in another terminal shows up in a few seconds |
| **Dev output** | the live output of `rowork dev`, in a terminal or in the background: compiler errors included. It shows what is already there, then each new line as it is written |

The output of `rowork dev` is also written to `.rowork/run/dev.log`, so the dashboard and
`rowork dev:logs` show what the terminal shows, whether `dev` runs in front of you or detached.

## Why you can trust it

The dashboard is a server, and a server on your computer is something a web page you visit could try
to reach. So it is built as if one will:

- **Only your computer can reach it.** It listens on `127.0.0.1`, never on a network interface.
- **A secret token is required.** It is random, printed once in your terminal, and exchanged for a
  cookie the first time you open the address. The token is then removed from the address bar, so it
  does not stay in your history or get sent to another site. **Do not share the address.**
- **The `Host` header must be exactly its own address.** Without that, a web page could make its own
  domain point at your computer ("DNS rebinding") and talk to the dashboard as if it were the same
  site. Such requests are refused.
- **It only answers GET, for a fixed list of files and API routes.** Nothing can name a path of its
  own, and nothing can change your project yet.
- **The page never turns outside text into HTML.** A line in a log comes from a tool, and could contain
  anything: it is shown as plain text only, and a test checks the page's code for anything that would
  build HTML from outside text.
- Strict headers (`Content-Security-Policy`, `nosniff`, no `Referer`, no caching).
- The address is remembered in `.rowork/run/dashboard.json` so `rowork dashboard` can find it. That
  file holds the secret token, so it is readable by its owner only and lives in `.rowork/run/`,
  which the generated `.gitignore` excludes. In a project created before this, make sure
  `.rowork/run/` is in your `.gitignore`.

These rules matter more as tabs are added: the upload tab will use an API key, and running commands
from the page will need the same care.

## What is not there yet

A preview of your interface outside Roblox, and uploading files to Roblox, are planned as tabs. See the
[roadmap](roadmap.md). Today the dashboard only reads.
