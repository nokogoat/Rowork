# Rowork, humans and AI

Rowork is built for two readers at once: a person who wants to understand their
own game without depending on an AI, and an AI that has to change that game
quickly and correctly. What helps one must not hurt the other.

## For a person learning

- **Generated code explains itself.** Each module's files say what they do and,
  above all, *why*: why player data is kept in memory until the player leaves, why
  the leaderboard is never read back, why the sender of a message comes from Roblox
  and not from the arguments. A module should read in a few minutes.
- **The code is yours.** Modules are copied into your project, not hidden in a
  library. Read them, change them, delete what you do not need. Nothing stops you
  from [leaving Rowork](commands.md#rowork-eject) altogether.
- **Every command asks its own questions** when run with no arguments, and tells
  you what it did and what to do next.

## For an AI working in the project

An AI does not have the Rowork documentation in its head, and it cannot answer
interactive questions. Rowork gives it what it needs in the project itself.

### `AGENTS.md`

`rowork init` writes an `AGENTS.md` at the project root (and a `CLAUDE.md` that
imports it, for Claude Code). It contains:

- how to work here: create things with Rowork instead of by hand, always pass every
  argument, how to check the build;
- the layout of the project;
- the **installed modules and how to use each one**: which service to inject, what
  to call, which file to edit to add a value;
- the modules still available, and every command.

Rowork **keeps it current**: each `rowork add` rewrites the generated block, so it
always matches what is really installed. Only the block between the
`<!-- rowork:begin -->` and `<!-- rowork:end -->` markers is Rowork's. Write your
own notes anywhere else in the file: they are never touched. `rowork agents:sync`
refreshes it on demand, and creates it in a project that predates it.

### `rowork info --json`

```bash
rowork info --json
```

prints on stdout, as JSON: the Rowork version, the project (name, paths, installed
modules, whether `dev` runs in the background), the catalogue of modules
(installed or not, what they require, their options) and every command with its
arguments and options. A command marked `"guided": true` opens questions when run
without arguments, so an AI must pass every argument instead of waiting on a
prompt.

Outside a project, `project` is `null` and the rest is still there. The plain
`rowork info` prints the same for a person.

### Why commands are safe to script

- Every command has a complete scripted form: no information exists only inside an
  interactive assistant.
- A command that cannot proceed says why and what to do (`hint`), and writes
  nothing: a refusal leaves the project untouched.
- Checks come before writes, and an existing file is never overwritten silently.

## Not there yet

The generated code is commented for readers, but that pass has not been done
everywhere. Modules do not yet wire themselves into each other automatically when
added in either order. See the [roadmap](roadmap.md).
