# Contributing

Rowork is MIT-licensed and meant to be open source. Contributions are welcome.

## Set up

```bash
git clone https://github.com/nokogoat/Rowork
cd Rowork
npm install
npm run build
npm link          # optional: puts `rowork` on your PATH
```

`npm run watch` rebuilds on save. Remove the link with `npm uninstall -g rowork`.

## Before you open a pull request

```bash
npm test
```

runs the build, the smoke test, the orphan test and the integration test. The
integration test needs the network and installs Rokit into a throwaway home
directory: it never touches your own `~/.rokit` or shell profile.

## Workflow

- One branch per piece of work, then a pull request. No direct pushes to `main`.
- CI must be green on Linux, macOS and Windows. The `ci-success` job is the
  single gate.
- Squash merge, so each feature is one clean commit.
- Commit messages in English, imperative: `feat: ...`, `fix: ...`, `docs: ...`.

## Conventions

- **English everywhere** in code, comments, CLI output, templates and docs.
- **Keep it thin.** Rowork drives upstream tools; it does not reimplement them.
  Prefer delegating to a tool over copying its behaviour.
- **Upstream errors are sacred.** Never bury a compiler or Flamework diagnostic
  in Rowork's own output.
- **Windows is a primary target.** Use `cross-spawn`, `pathToFileURL` for dynamic
  imports, and never append `.cmd` by hand. See [Architecture](architecture.md).
- **Never hardcode a tool version** in generated projects.
- **A change to `src/plugins/api.ts` is a breaking change.** Bump
  `ROWORK_PLUGIN_API_VERSION`.
- **Public-safe history.** No tokens, keys, cookies or personal paths in any
  commit: the history is public once the repository is.

## Adding a command

1. Create `src/commands/<name>.ts` exporting a `defineCommand({...})`.
2. Add it to the list in `src/commands/index.ts`.
3. Add a check to `scripts/smoke-test.mjs`.
4. Document it in [Commands](commands.md).
