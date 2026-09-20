# Contributing to Rowork

Thank you for wanting to help. Rowork is an open source (MIT) CLI that sets up and
runs Roblox projects, and it is built to be small, readable and easy to leave.

The full guide is in [docs/contributing.md](docs/contributing.md). The short
version:

```bash
git clone https://github.com/nokogoat/Rowork
cd Rowork
npm install
npm run build
npm test            # build, smoke, orphan-process and integration tests
```

## Before you start

- **Open an issue first** for anything bigger than a small fix, so we agree on the
  direction before you spend time on it.
- **Features are chosen by one question**: *is this a chore almost every Roblox
  game redoes?* Genre-specific features do not belong in the core. A module for
  them can live outside it.
- **Every command that takes input has a guided version** (it asks its own
  questions when run with no arguments) and a scripted one for CI.
- **Rowork stays thin.** It drives Rojo, roblox-ts, Flamework and Rokit; it does
  not reimplement them.

## Pull requests

- One branch per change, then a pull request. Direct pushes to `main` are not used.
- CI must be green on Linux, macOS and Windows. Windows is a first-class target.
- Squash merge, with an English commit message in the imperative
  (`feat: ...`, `fix: ...`, `docs: ...`).
- Add or update the test that would have caught the problem, and the page in
  [`docs/`](docs/README.md) that describes what you changed.
- Anything touching a real tool (Rojo, roblox-ts, npm, Rokit) needs a check against
  the real thing: tests with stand-ins have missed real bugs before.

## Code and language

English everywhere: code, comments, CLI output, templates and docs. See
[docs/architecture.md](docs/architecture.md) for the decisions behind the code.

## Behaviour and security

Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability
privately, see [SECURITY.md](SECURITY.md); please do not open a public issue for it.
