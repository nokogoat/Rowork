# Releasing

How to publish Rowork to npm. Only the maintainer does this: it needs their npm
account and its two-factor authentication.

Rowork is published as [`rowork`](https://www.npmjs.com/package/rowork) on npm.

## Before a release

Worth re-checking if the package layout changes:

- `npm pack --dry-run` lists only `bin/`, `dashboard/`, `dist/`, `templates/`,
  `README.md`, `LICENSE` and `package.json` (about 185 files, 125 kB): no sources, tests, CI files, source maps or
  private files. Look at the list before every release.
- The tarball works on its own. From a scratch directory:

  ```bash
  npm pack --pack-destination /tmp/rowork-check
  npm install -g --prefix /tmp/rowork-check/prefix /tmp/rowork-check/rowork-*.tgz
  /tmp/rowork-check/prefix/bin/rowork init Check --no-install --no-rokit --no-git
  ```

  This is what catches "works from the repository, not from the package" (a
  template not shipped, a dependency listed under the wrong heading).

## Publishing

`main` is protected (a pull request and the `ci-success` check are required), so the version
bump goes through a pull request. Publishing itself happens automatically: a `.github/workflows/release.yml`
run publishes to npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC)
whenever a `v*.*.*` tag is pushed, with no token stored anywhere. One-time setup: on the package's
settings on npmjs.com, under Trusted Publisher, add GitHub Actions with organization `nokogoat`,
repository `Rowork`, workflow filename `release.yml`; then switch Publishing access to "Require
two-factor authentication and disallow bypass 2FA tokens".

```bash
# 1. The version bump, through a pull request
git checkout main && git pull
git checkout -b release/0.2.0
npm version 0.2.0 --no-git-tag-version     # edits package.json and package-lock.json only
git commit -am "chore: release 0.2.0"
git push -u origin release/0.2.0
gh pr create --fill                        # wait for ci-success, then merge it

# 2. Tag the merged commit: this is what triggers the publish
git checkout main && git pull
git tag v0.2.0 && git push origin v0.2.0
```

Watch the `Release` workflow run in the Actions tab; it fails loudly (and publishes nothing) if the
tag does not match `package.json`, or if any test fails.

**Manual fallback**, if the workflow cannot run:

```bash
git checkout main && git pull
npm ci
npm login                                  # your account; 2FA required
npm publish                                # prepublishOnly runs build + every test first
git tag v0.2.0 && git push origin v0.2.0
```

- `prepublishOnly` runs the full test suite (build, smoke, orphan, integration) either way, so a
  stale `dist/` or a broken template cannot be published. The integration test needs the network.
- The package is unscoped, so no `--access public` is needed.
- A published version can never be replaced or reused, only deprecated. Do not publish anything
  you have not run.

## After a release

1. Check it from a clean machine or directory: `npx rowork@latest --version`.
2. Note the release in your own project notes.

## The repository

The GitHub repository is public and `main` is protected by a ruleset (a pull request and
the `ci-success` check are required; deleting or force-pushing `main` is forbidden). Never
put a secret, a personal note or a test project in a commit: a
[gitleaks](https://github.com/gitleaks/gitleaks) hook is described in
[Contributing](contributing.md).
