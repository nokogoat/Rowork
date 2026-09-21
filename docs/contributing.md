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

## Keeping secrets out

This repository's history is going to be public, and a secret that was ever committed must be treated as leaked
even if a later commit deletes it. A [gitleaks](https://github.com/gitleaks/gitleaks) check runs before each commit:

```bash
git config core.hooksPath scripts/git-hooks   # once, in your clone
gitleaks git --redact .                        # scan the whole history by hand
```

Install gitleaks with your package manager (Arch: `pacman -S gitleaks`) or from its releases page. Without it the
hook only warns that the commit was not scanned. The rules are gitleaks' own; `.gitleaks.toml` lists the known
false alarms (the made-up key of the assets test). Never add a real secret there: rotate it instead.

## Staying current

Rowork writes down no tool version, except an offline fallback for Rojo in
`src/core/versions.ts`. A weekly job (`.github/workflows/upstream-watch.yml`) replays
the real flow against the newest upstream releases and opens an issue labelled
`upstream-watch` if it fails. You can run its quick part yourself:
`node scripts/upstream-watch.mjs --report-only`. When it reports the fallback as
behind, update `FALLBACK_ROJO_VERSION`.

## Adding a command

1. Create `src/commands/<name>.ts` exporting a `defineCommand({...})`.
2. Add it to the list in `src/commands/index.ts`.
3. Add a check to `scripts/smoke-test.mjs`.
4. Document it in [Commands](commands.md).
