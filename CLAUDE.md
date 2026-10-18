# claudius-modulus

A Claude Code plugin ("mod") that draws a band above the prompt: model and effort chips, 5-hour session usage with a
run-out forecast, effort and ultracode warnings, a background-work ring, and a rotating pep-talk row.

## Layout

- `.claude-plugin/marketplace.json`: marketplace listing; points at `./mods/claudius-modulus`.
- `mods/claudius-modulus/.claude-plugin/plugin.json`: plugin manifest. Keep `version` out (see Releases).
- `mods/claudius-modulus/hooks/`: runtime code.
  - `register.tsx`: entry module (listed in `hooks.json` `modules`); reads `claudius-modulus.*` state.
  - `view.tsx`: band rendering. `logic.ts`: bar, forecast, pacing and level math. `work.ts`: background-work ring.
  - `cycle.ts`: model and effort cycling, the `/cm` words. `servers.ts`: the lsof dev-server count. `quips.ts`: the 10 pep-talk lines. `icons.ts`, `sprites.ts`: pixel icons. `version.ts`: band version label.
- `mods/claudius-modulus/test/`: `logic.test.ts`, `band.test.ts` (import from `claude-code/testing`).
- `mods/claudius-modulus/types/index.d.ts`: shared types (also referenced from the plugin manifest `types` field).

## Commands

Use the Claude binary bundled with the desktop app. The `claude` on PATH may be older than 2.1.295, which the README
requires:

```bash
CC="$HOME/Library/Application Support/Claude/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude"
"$CC" plugin validate mods/claudius-modulus
"$CC" plugin test mods/claudius-modulus
```

`plugin test` runs 80 tests across the two files. There is no `plugin test` subcommand on 2.1.241.

## Conventions

- No em dashes in user-visible text (quips, labels, README copy).
- Quips must be short, distinct, and free of em dashes; `band.test.ts` checks all three.
- Do not set `version` in `plugin.json` or the marketplace entry. Without it, every merge to `main` is an update.
- Change `hooks/version.ts` only for a visible release. Then tag (`git tag -a vX.Y.Z`), push the tag, and `gh release create`.
- Validate and test before pushing. Installed users follow `main` via auto-update, so a broken commit ships to them.

## Shortcuts

- **cmct** = release. Start from `dev`: branch `release-X.Y.Z` off `origin/dev`, bump `VERSION` in `hooks/version.ts`
  (patch unless told otherwise) and every other place the old version appears (`grep -rnF 1.9.2 mods README.md docs/index.html`, plus the escaped `1\.9\.2` in tests), validate and test, PR into `dev` and merge. Then PR `dev` into `main` and merge, tag
  the merge commit (`git tag -a vX.Y.Z`), push the tag, `gh release create vX.Y.Z --generate-notes`. Delete the release
  branch, local and remote.

## Open items

- `plugin validate` warns only that there is no `version`, which is deliberate (see Conventions).
- `plugin validate` advises adding a marketplace install line to the README. The README's install steps already use
  `claude plugin marketplace add`, so this is advisory only.
