# Dynalytics Desktop

**Analytics of Dynamics** — analyze sequential data as transition networks with interactive visualizations.

Built with [Tauri v2](https://v2.tauri.app/), [Vite](https://vite.dev/), TypeScript, and [D3.js](https://d3js.org/). Uses [tnaj](https://github.com/mohsaqr/tna-js) for TNA computations.

## Features

### Data Import
- Import **CSV** and **Excel** (.xlsx, .xls) files
- **Wide format** (rows = sequences, columns = time steps) and **long format** (ID, time, state columns)
- Auto-detection of data format (wide vs long)
- Smart column guessing for long format — auto-detects ID, time, and state columns by header name patterns
- Robust timestamp parsing: ISO 8601, US/EU date formats, Unix timestamps, and more
- Optional time column (use row order instead)
- Data preview with table display before analysis

### Network Models
- **TNA** — Relative transition probabilities
- **fTNA** — Frequency-based transitions
- **cTNA** — Co-occurrence transitions
- **aTNA** — Attention-weighted transitions
- Adjustable **prune threshold** to filter weak edges

### Network Visualization
- Interactive D3-based network graph with tooltips
- **4 layout algorithms:** Circular, Spring (force-directed), Kamada-Kawai, Spectral
- **Donut rings** on nodes showing initial state probabilities (with optional pie borders)
- Configurable self-loops that render outward from graph center
- Full control over every visual parameter via sidebar controls:

| Category | Controls |
|----------|----------|
| **Layout** | Algorithm, padding, drawing height |
| **Nodes** | Radius, border width/color, label size/color, show/hide labels, pie border width/color |
| **Edges** | Width min/max, opacity min/max, color, curvature, display threshold, self-loops toggle |
| **Arrows** | Size, color |
| **Edge Labels** | Size, color, show/hide |
| **Node Colors** | Per-state color pickers with reset button |

### Analysis Tabs
- **Network** — Interactive network graph
- **Centralities** — Dual bar charts with selectable centrality measures (OutStrength, InStrength, Betweenness, Closeness, etc.)
- **Frequencies** — State frequency bar chart + mosaic plot showing state associations with standardized residuals
- **Sequences** — State distribution over time (stacked bar) + compact sequence index plot
- **Communities** — Community detection with toggle, method selection (Louvain, etc.), network with community coloring, and membership table

### Other
- **State persistence** — page refresh preserves your entire analysis (data, settings, active tab)
- Export results as **HTML report**, **PDF**, or **PNG**
- Cross-platform: **macOS**, **Windows**, **Linux**

## Prerequisites

### Node.js

Node.js **>= 18** is required. Install from [nodejs.org](https://nodejs.org/) or via a version manager like [nvm](https://github.com/nvm-sh/nvm):

```bash
# Using nvm
nvm install 18
nvm use 18
```

### Rust

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal and verify:

```bash
rustc --version
cargo --version
```

### Tauri v2 System Dependencies

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libxdo-devel libappindicator-gtk3-devel librsvg2-devel
```

**Windows:**
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (install "Desktop development with C++")
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 10/11)

See the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/) for full details.

## Installation & Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/mohsaqr/tnadesktop.git
cd tnadesktop

# 2. Install npm dependencies
npm install

# 3. Run in development mode (opens the app with hot-reload)
npm run tauri dev
```

### Web-only Development (no Rust/Tauri needed)

To work on the frontend without installing Rust:

```bash
npm install
npm run dev
```

This starts a Vite dev server at `http://localhost:5173`. File import uses the browser file picker instead of native dialogs.

## Production Build

```bash
npm run tauri build
```

This produces platform-specific installers:

| Platform | Output | Location |
|----------|--------|----------|
| **macOS** | `.app` bundle, `.dmg` | `src-tauri/target/release/bundle/macos/` |
| **Windows** | `.msi` installer | `src-tauri/target/release/bundle/msi/` |
| **Linux** | `.deb`, `.AppImage` | `src-tauri/target/release/bundle/deb/`, `appimage/` |

## Project Structure

```
index.html                # App entry point
src/
  main.ts                 # App state, routing, model building, state persistence
  data.ts                 # CSV/Excel parsing, format detection, timestamp parsing
  styles.css              # Global styles (sidebar, collapsibles, controls)
  views/
    welcome.ts            # Landing page with file upload
    preview.ts            # Data preview with format/column selection
    dashboard.ts          # Main dashboard: sidebar controls + tabbed panels
    network.ts            # Network graph (4 layouts, self-loops, donut rings)
    centralities.ts       # Centrality bar charts
    frequencies.ts        # State frequency bar charts
    sequences.ts          # Sequence index plot + state distribution
    mosaic.ts             # Mosaic plot with standardized residuals
    colors.ts             # Color palette (nodes + communities)
    export.ts             # HTML/PDF/PNG export dialog
src-tauri/
  src/main.rs             # Tauri backend
  Cargo.toml              # Rust dependencies
  tauri.conf.json         # Tauri configuration
  capabilities/           # Permission capabilities
vite.config.ts            # Vite configuration
tsconfig.json             # TypeScript configuration
package.json              # Node dependencies
```

## Usage

1. **Open a file** — Click "Open File" or drag-and-drop a CSV/Excel file
2. **Preview data** — Check the data table, select format (wide/long), adjust column mappings if needed
3. **Analyze** — Click "Analyze" to build the transition network
4. **Explore tabs** — Switch between Network, Centralities, Frequencies, Sequences, and Communities
5. **Customize** — Expand "Network Appearance" in the sidebar to adjust every visual parameter
6. **Export** — Click "Export" to save as HTML report, PDF, or PNG

## Dependencies

| Package | Purpose |
|---------|---------|
| [tnaj](https://github.com/mohsaqr/tna-js) | TNA computations (models, centralities, communities, pruning) |
| [D3.js](https://d3js.org/) | Network visualization and charts |
| [PapaParse](https://www.papaparse.com/) | CSV parsing |
| [SheetJS](https://sheetjs.com/) | Excel file reading |
| [jsPDF](https://github.com/parallax/jsPDF) | PDF export |
| [html2canvas](https://html2canvas.hertzen.com/) | PNG export |
| [Tauri v2](https://v2.tauri.app/) | Native desktop shell |

## Live Demo

The app is deployed at **[saqr.me/dynalytics](https://saqr.me/dynalytics/)** via GitHub Pages, automatically updated on every push to `main`.

## License

MIT
