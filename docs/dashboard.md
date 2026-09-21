# The dashboard

A web page, served by Rowork on your own computer, that shows your project and the live output of
`rowork dev`. It is the start of a place where the rest of Rowork's tools (a preview of your
interface, uploading files to Roblox) will live, in the spirit of Symfony's web profiler.

```bash
rowork dashboard            # opens it in your browser
rowork dashboard --no-open  # only prints the address
rowork dashboard --port 4000
```

Rowork prints an address such as `http://127.0.0.1:45927/?token=...`. Open it (it opens by itself
unless you pass `--no-open`). Press Ctrl+C in the terminal to stop it.

## What is in it

| Tab | What it shows |
| --- | --- |
| **Overview** | the ready-made features (installed or not, with the command to add them), the ones wired together, and every command with its description. It refreshes by itself, so installing a feature in another terminal shows up in a few seconds |
| **Dev output** | the live output of `rowork dev -d`: compiler errors included. It shows what is already there, then each new line as it is written |

For the dev output, start `rowork dev -d` in a terminal: the dashboard reads the same log that
`rowork dev:logs` shows.

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

These rules matter more as tabs are added: the upload tab will use an API key, and running commands
from the page will need the same care.

## What is not there yet

A preview of your interface outside Roblox, and uploading files to Roblox, are planned as tabs. See the
[roadmap](roadmap.md). Today the dashboard only reads.
