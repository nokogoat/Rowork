# Releasing

How to publish Rowork to npm. Only the maintainer does this: it needs their npm
account and its two-factor authentication.

Rowork is not published yet. The name `rowork` was free when this was written
(`npm view rowork` answers 404), so publishing early is also what reserves it.

## Before the first publish

Already checked, and worth re-checking if the package layout changes:

- `npm pack --dry-run` lists only `bin/`, `dist/`, `templates/`, `README.md`,
  `LICENSE` and `package.json`: no sources, tests, CI files, source maps or
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

From a clean, up-to-date `main`:

```bash
git checkout main && git pull
npm ci
npm login                # your account; 2FA required
npm version 0.1.0        # or patch/minor; creates the commit and the tag
npm publish              # prepublishOnly runs build + every test first
git push --follow-tags
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
laptop.

## Opening the repository

Publishing to npm does not make the GitHub repository public; that is a separate
step. The history becomes public with it (check it for secrets and personal data first), and the `main` ruleset (require a pull request and
the `ci-success` check) must be created at that moment.
