# TNA Desktop

Transition Network Analysis (TNA) as a standalone desktop application.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [R](https://www.r-project.org/) (v4.3 or later) - for development/testing

## Quick Start

### 1. Install Node.js Dependencies

```bash
npm install
```

### 2. Download R-Portable

Download the appropriate R-Portable distribution for your platform:

**Windows:**
- Download from: https://sourceforge.net/projects/rportable/
- Extract to `R-Portable-Win/`

**macOS:**
- Download R from CRAN: https://cran.r-project.org/bin/macosx/
- Copy to `R-Portable-Mac/`

**Linux:**
- Download from: https://cran.r-project.org/bin/linux/
- Extract to `R-Portable-Linux/`

### 3. Install R Packages

Run R from the portable installation and install required packages:

```r
install.packages(c(
  "shiny",
  "shinydashboard",
  "DT",
  "tna",
  "bslib",
  "rio",
  "shinyjs",
  "shinyjqui",
  "jsonlite"
))
```

### 4. Run in Development Mode

```bash
npm start
```

### 5. Build for Distribution

```bash
# Windows
npm run package-win

# macOS
npm run package-mac

# Linux
npm run package-linux

# All platforms
npm run package-all
```

## Project Structure

```
tna-desktop/
├── app.R                 # Shiny app entry point
├── global.R              # Global configuration
├── tnashiny_core.R       # Core TNA Shiny logic
├── main.js               # Electron main process
├── loading.html          # Loading screen
├── package.json          # Node.js config
├── config/               # Platform-specific configs
│   ├── default.yaml
│   ├── win32.yaml
│   ├── darwin.yaml
│   └── linux.yaml
├── R/                    # R modules
│   ├── mod_export.R
│   └── mod_save_load_local.R
├── www/                  # Static assets
│   ├── custom.css
│   └── logo.png
└── dist/                 # Build output (generated)
```

## Features

- Full TNA analysis capabilities
- Local file save/load (no cloud required)
- Keyboard shortcuts (Ctrl+S to save, Ctrl+O to open)
- Cross-platform (Windows, macOS, Linux)
- No R installation required for end users

## Development

### Testing the Shiny App Standalone

You can test the Shiny app without Electron:

```r
setwd("path/to/tna-desktop")
source("app.R")
```

### Building Installers

For production installers with auto-update support:

```bash
npm run build-win   # Windows NSIS installer
npm run build-mac   # macOS DMG
npm run build-linux # Linux AppImage/deb
```

## License

MIT License
