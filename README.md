# TNA Desktop

Native desktop application for **Transition Network Analysis** (TNA) — analyze sequential data as transition networks with interactive visualizations.

Built with [Tauri v2](https://v2.tauri.app/), [Vite](https://vite.dev/), TypeScript, and [D3.js](https://d3js.org/). Uses [tnaj](https://github.com/mohsaqr/tna-js) for TNA computations.

## Features

- Import CSV / Excel sequence data
- Build transition networks (TNA, fTNA, cTNA, aTNA)
- Interactive network visualization with drag, zoom, and tooltips
- Centrality analysis with bar chart comparisons
- State frequency distributions and histograms
- Sequence mosaic plots
- Export results as PDF or PNG
- Cross-platform: macOS, Windows, Linux

## Prerequisites

### Node.js

Node.js **>= 18** is required. Install from [nodejs.org](https://nodejs.org/) or via a version manager like [nvm](https://github.com/nvm-sh/nvm).

### Rust

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Tauri v2 System Dependencies

**macOS:**
- Xcode Command Line Tools: `xcode-select --install`

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows:**
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (install "Desktop development with C++")
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 10/11)

See the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/) for full details.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/mohsaqr/tnadesktop.git
cd tnadesktop

# Install npm dependencies
npm install

# Run in development mode (hot-reload)
npm run tauri dev
```

## Production Build

```bash
npm run tauri build
```

This produces platform-specific binaries:
- **macOS:** `.app` bundle and `.dmg` in `src-tauri/target/release/bundle/`
- **Windows:** `.msi` installer in `src-tauri/target/release/bundle/`
- **Linux:** `.deb` and `.AppImage` in `src-tauri/target/release/bundle/`

## Project Structure

```
index.html              # App entry point
src/
  main.ts               # App bootstrap and routing
  data.ts               # Data loading and management
  styles.css            # Global styles
  views/
    welcome.ts          # Landing page
    preview.ts          # Data preview after import
    dashboard.ts        # Main analysis dashboard
    network.ts          # Network visualization (D3)
    centralities.ts     # Centrality bar charts
    frequencies.ts      # State frequency charts
    sequences.ts        # Sequence visualization
    mosaic.ts           # Mosaic plot
    colors.ts           # Color palette management
    export.ts           # PDF/PNG export
src-tauri/
  src/main.rs           # Tauri backend
  Cargo.toml            # Rust dependencies
  tauri.conf.json       # Tauri configuration
  capabilities/         # Permission capabilities
vite.config.ts          # Vite configuration
tsconfig.json           # TypeScript configuration
```

## License

MIT
