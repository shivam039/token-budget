# Package versions and release policy

## Versioning policy

The core package and satellite packages have independent version tracks.
A satellite package is versioned when its own published behavior or metadata
changes; a core release does not imply that every satellite is republished.
Adapter peer dependency ranges, rather than matching version numbers, state
which core releases an adapter supports. Check those ranges in the package
manifest and the tested baselines in [`COMPATIBILITY.md`](../COMPATIBILITY.md).

The version in each package's `package.json` is the source of truth for the
current checkout. The npm registry is the source of truth for published
versions. A Git version is not published merely because it is present on
`main` or in a release PR.

## Verify before a release

```sh
# Source versions
node -e "for (const d of require('fs').readdirSync('packages')) { try { const p = require('./packages/' + d + '/package.json'); console.log(p.name, p.version, p.private ? '(private)' : '') } catch {} }"

# Published core version
npm view @shivam.dixit/token-budget dist-tags.latest

# Release checks
npm install
npm run build
npm run typecheck
npm test
npm run guardrails
```

Run `npm pack --dry-run` from every package intended for publication and
review its file list before publishing. For a new public package name, check
that npm Trusted Publishing is configured for the repository's publish
workflow. Keep release notes aligned with the consumer-facing section at the
top of [`CHANGELOG.md`](../CHANGELOG.md).
