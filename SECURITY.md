# Security policy

## Supported versions

Rowork is in early development (0.x). Only the latest release receives fixes.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private
vulnerability reporting on this repository: *Security → Report a vulnerability*.
Include what you found, how to reproduce it, and the impact you see.

You can expect an acknowledgement, then a fix and a coordinated disclosure.

## What is in scope

Rowork runs external programs (npm, Rojo, roblox-ts, Rokit, and on Linux Flatpak),
downloads release files, and writes into your project, so the interesting cases are:

- running unintended commands, for example through crafted arguments or a hostile
  `rowork.json` or plugin;
- downloading or running a file that was not verified;
- writing outside the project directory;
- leaking a secret (a token, a cookie) into output, logs or generated files.

## What Rowork already does

- Programs are started without a shell (`cross-spawn`), so an argument is never
  interpreted as a command.
- Rokit is only run after its archive matches the SHA-256 that GitHub publishes for
  it; a release without a checksum is refused.
- Rowork never asks for, stores or sends a Roblox cookie, an API key or an npm
  token.
