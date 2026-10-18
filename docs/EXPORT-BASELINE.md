# Original Arc Studio export baseline

Import date: 18 October 2026.

Exact source project link supplied by the owner:

https://studio.arc.io/app/1469922d-bfbd-40d1-af33-5f688469e811?thread=85b4f572-d861-4298-9c7a-74b1b2da9da4

The exported application is the repository root, not a nested folder. It has a
React 18 / Vite / TypeScript / Tailwind frontend under `src/`, a Bun-style API
server under `server/`, Solidity contracts and Foundry tests under `contracts/`,
and vendored `lib/forge-std` source. Exported configuration describes Arc
Testnet; no network configuration has been changed or deployment performed.

No existing Git repository, worktree marker, or nested Git repository was found
before import. A new local repository was initialized. Baseline commit message:
`Import original Arc Studio export`. Baseline tag: `arc-studio-baseline`.

Application source, configuration, tests, assets, runtime ABI, `bun.lock`, and
vendored library source are retained without edits. The vendored Foundry library
is retained because `remappings.txt` references it directly. Documentation from
the export and pre-existing local product/reference documentation are included.
The only preparation edits are `.gitignore` and provenance documentation. No
dependency installation, formatter, build, test, deployment, or push was run.

Excluded from the commit, retained locally:

- `.env` and other real environment/credential files. Values were not printed.
- `contracts/out/` compiler artifacts and build-info.
- `contracts/cache/` and root `cache/` (including fuzz/invariant failure caches).
- Generated `contracts/contract-metadata/*.json` deployment metadata.
- `console.jsonl` and `traces.jsonl` runtime logs.
- Any installed `node_modules/`, future build output, coverage, broadcast output,
  local CLI credentials, and editor/OS files covered by `.gitignore`.

The runtime ABI under `src/abi/` is intentionally included; application code
depends on it. The empty metadata directory marker is also retained.

A local pattern scan checked text for common provider tokens, JWTs, private-key
headers, and quoted credential literals without printing matching values. No
matches were reported. This is a limited scan, not a guarantee that every
possible credential format can be detected. The `.env` file remains excluded
regardless of its contents.

The baseline preserves existing source behavior and existing status notes; it
does not certify feature completeness or passing tests. No GitHub remote was
added and nothing was pushed.
