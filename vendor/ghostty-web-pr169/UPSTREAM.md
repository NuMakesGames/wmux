# ghostty-web PR 169

`ghostty-web-0.4.1-pr169-faf6fbd.tgz` is a temporary, locally built npm package
of [coder/ghostty-web pull request 169](https://github.com/coder/ghostty-web/pull/169).
It is not an official Coder release.

- Source repository: <https://github.com/diegosouzapw/ghostty-web>
- Source commit: `faf6fbd055f5768923b3df659f3968c2abbab4a1`
- Ghostty submodule: `6590196661f769dd8f2b3e85d6c98262c4ec5b3b`
- Package version: `0.4.1-pr169.faf6fbd`
- Artifact SHA-256: `8a926a5996d8db6c7438841a01878e0a4a44937873295641c6a1869da32ed8d4`
- License: MIT; the upstream license is included in the package archive.

The artifact was built with Bun 1.3.14 and Zig 0.15.2. The Zig archive was
downloaded from ziglang.org and matched its published SHA-256 checksum,
`02aa270f183da276e5b5920b1dac44a63f1a49e55050ebde3aecc9eb82f93239`.
To reproduce it, recursively clone the source at the commit above, run
`bun install`, `bun run build`, set the package version to
`0.4.1-pr169.faf6fbd` without creating a Git tag, and run `npm pack`.

This pin can be removed once the changes are merged upstream and available as
a published package. At the time of pinning, the pull request has merge
conflicts, its 612 KiB WASM artifact exceeds the pull request's stated 512 KiB
CI budget, and its Bun test invocation also discovers Playwright specifications.
wmux's own unit, type, build, and browser tests pass against this artifact.
