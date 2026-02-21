# Session Handoff — 2026-02-20

## Completed
- Renamed app from "TNA Desktop" to "Dynalytics Desktop" with tagline "Analytics of Dynamics"
- Updated 14 files across package config, UI branding, export filenames, storage keys, and docs
- Committed as `92142dc` on `main` (not pushed)

## Current State
- Build passes (`npm run build` — TypeScript + Vite, zero errors)
- All 183 tests pass (`npm test`)
- Commit is local only — not pushed to origin
- Pre-existing uncommitted changes remain in: `src/styles.css`, `src/views/clustering.ts`, `src/views/sequences.ts`, `src/analysis/simulate.ts` (untracked)

## Key Decisions
- **Fresh storage keys**: no migration from old `tna-desktop-*` localStorage keys — users get a clean slate
- **Deploy path**: `/dynalytics/` (was `/tnadesktop/`). CNAME file unchanged (`saqr.me`), but DNS/server routing may need updating for the new path
- **Library names preserved**: all `tnaj` imports, `TNA`/`GroupTNA` types, model type values (`'tna'`, `'ftna'`, etc.) left as-is — they refer to the analysis method, not the app

## Open Issues
- `src-tauri/target/` build cache still references old `tna-desktop` crate name — will refresh on next `cargo clean` or Tauri build
- GitHub Pages deploy will serve at `/dynalytics/` after push — verify DNS/routing works
- Pre-existing uncommitted changes in styles.css, clustering.ts, sequences.ts, simulate.ts need separate review/commit

## Next Steps
1. Push commit to origin when ready
2. Verify GitHub Pages deploys correctly at new `/dynalytics/` path
3. Review and commit the pre-existing uncommitted changes (styles, clustering, sequences, simulate)

## Context
- Primary repo: `/Users/mohammedsaqr/Documents/Git/tna-desktop`
- Build: `npm run build` (tsc + vite)
- Tests: `npm test` (vitest, 183 tests)
- Sibling repos: tnapy, tna-js (NOT renamed)
