# Dynalytics Desktop — Change Log

### 2026-02-20 — Rename TNA Desktop to Dynalytics Desktop
- package.json: name → `dynalytics-desktop`, description updated
- src-tauri/tauri.conf.json: productName, identifier, window title updated
- src-tauri/Cargo.toml: crate name, lib name, bin name, description updated
- src-tauri/capabilities/default.json: description updated
- src-tauri/gen/schemas/capabilities.json: description updated
- index.html: `<title>` updated
- vite.config.ts: base path `/tnadesktop/` → `/dynalytics/`
- src/views/dashboard.ts: brand text → `Dynalytics`
- src/views/load-data.ts: welcome title/subtitle updated
- src/views/export.ts: all `tna-` filename prefixes → `dynalytics-`, report titles updated
- src/main.ts: storage keys `tna-desktop-*` → `dynalytics-desktop-*`, file header comment updated
- README.md: title, description, live demo URL updated
- ROADMAP.md: title updated
- LEARNINGS.md: title and deployment references updated
- Tests: 183 passed (vitest), 0 failed — branding-only change, no functional impact
