# Releasing

How to publish Rowork to npm. Only the maintainer does this: it needs their npm
account and its two-factor authentication.

Rowork is not published yet. The name `rowork` was free when this was written
(`npm view rowork` answers 404), so publishing early is also what reserves it.

## Before the first publish

Already checked, and worth re-checking if the package layout changes:

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

`main` is protected (a pull request and the `ci-success` check are required, and
nobody can push to it directly), so `npm version` cannot commit and push the version
bump itself. The bump goes through a pull request, then you publish from the merged
`main`:

```bash
# 1. The version bump, through a pull request
git checkout main && git pull
git checkout -b release/0.1.0
npm version 0.1.0 --no-git-tag-version     # edits package.json and package-lock.json only
git commit -am "chore: release 0.1.0"
git push -u origin release/0.1.0
gh pr create --fill                        # wait for ci-success, then merge it

# 2. Publish from the merged main
git checkout main && git pull
npm ci
npm login                                  # your account; 2FA required
npm publish                                # prepublishOnly runs build + every test first

# 3. Tag what was published
git tag v0.1.0 && git push origin v0.1.0
```

- `prepublishOnly` runs the full test suite (build, smoke, orphan, integration),
  so a stale `dist/` or a broken template cannot be published. The integration
  test needs the network and takes a minute or two.
- The package is unscoped, so no `--access public` is needed. (A scoped name such
  as `@rowork/cli` would need it, or npm asks for a paid plan.)
- A published version can never be replaced or reused, only deprecated. Do not
  publish anything you have not run.

## After publishing

1. Check it from a clean machine or directory: `npx rowork@latest --version`.
2. Update the install instructions that currently say Rowork is not published:
   `README.md` (Quick start) and `docs/getting-started.md` (Install Rowork). The
   repository install stays documented under [Contributing](contributing.md).
3. Note the release in your own project notes.

## Later

npm is restricting tokens that bypass two-factor authentication. When releases
become routine, publish from GitHub Actions with npm's trusted publishing (OIDC),
which needs no long-lived token and adds provenance, instead of publishing from a
laptop. After the first manual publish, add a trusted publisher for this repository in the
package's settings on npmjs.com, then publish from a workflow instead.

## The repository

The GitHub repository is public and `main` is protected by a ruleset (a pull request and
the `ci-success` check are required; deleting or force-pushing `main` is forbidden). Never
put a secret, a personal note or a test project in a commit: a
[gitleaks](https://github.com/gitleaks/gitleaks) hook is described in
[Contributing](contributing.md).
