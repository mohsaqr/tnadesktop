# TNA Desktop - Complete Development Guide

This document provides a comprehensive guide to reproducing the TNA Desktop application from scratch, including how to adapt the TNA Shiny code for desktop use.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Project Setup from Scratch](#project-setup-from-scratch)
5. [Adapting TNA Shiny Code](#adapting-tna-shiny-code)
6. [Understanding the Code Structure](#understanding-the-code-structure)
7. [R-Portable Setup](#r-portable-setup)
8. [Electron Configuration](#electron-configuration)
9. [Local Storage Implementation](#local-storage-implementation)
10. [Development Workflow](#development-workflow)
11. [Modifying TNA Features](#modifying-tna-features)
12. [Building for Distribution](#building-for-distribution)
13. [Troubleshooting](#troubleshooting)

---

## Overview

TNA Desktop is a standalone desktop application that wraps the TNA (Transition Network Analysis) Shiny web app using Electron. The key modifications from the original web version:

- **Removed Google OAuth** - No login required
- **Local file storage** - Analyses saved to local filesystem instead of Google Drive
- **Bundled R runtime** - Users don't need to install R
- **Cross-platform** - Works on Windows, macOS, and Linux

### Original Source

The original TNA Shiny app is at: https://github.com/mohsaqr/tnashiny (branch: `tnashiny`)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron (Node.js)                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │                   main.js                        │    │
│  │  - Spawns R process                             │    │
│  │  - Creates browser window                       │    │
│  │  - Health checks Shiny server                   │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │              R-Portable + Shiny                  │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │  app.R → global.R → tnashiny_full.R     │    │    │
│  │  │                                          │    │    │
│  │  │  Shiny Server on http://127.0.0.1:9193  │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │              BrowserWindow (Chromium)            │    │
│  │         Displays Shiny UI at localhost          │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### For Development

- **Node.js** v18+ (https://nodejs.org/)
- **R** v4.3+ (https://www.r-project.org/) - for testing
- **Git** (https://git-scm.com/)

### For End Users

- Nothing! R-Portable is bundled with the app.

---

## Project Setup from Scratch

### Step 1: Create Project Directory

```bash
mkdir tna-desktop
cd tna-desktop
```

### Step 2: Initialize Node.js Project

```bash
npm init -y
```

### Step 3: Install Dependencies

```bash
npm install electron config js-yaml tree-kill
npm install --save-dev electron-builder
```

### Step 4: Create package.json

```json
{
  "name": "tna-desktop",
  "version": "2.0.0",
  "description": "TNA Desktop - Transition Network Analysis",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "package-win": "electron-builder --win --dir",
    "package-mac": "electron-builder --mac --dir",
    "package-linux": "electron-builder --linux --dir"
  },
  "dependencies": {
    "config": "^3.3.9",
    "electron": "^27.0.0",
    "js-yaml": "^4.1.0",
    "tree-kill": "^1.2.2"
  },
  "devDependencies": {
    "electron-builder": "^24.6.4"
  },
  "build": {
    "appId": "com.tna.desktop",
    "productName": "TNA Desktop",
    "files": [
      "**/*",
      "!R-Portable-*",
      "R-Portable-${os}/**/*"
    ],
    "extraResources": [
      {
        "from": "R-Portable-${os}",
        "to": "R-Portable",
        "filter": ["**/*"]
      }
    ]
  }
}
```

### Step 5: Create Directory Structure

```bash
mkdir -p config R www scripts build
```

---

## Adapting TNA Shiny Code

### Step 1: Get the Original Code

```bash
# Clone the original repo
git clone -b tnashiny https://github.com/mohsaqr/tnashiny.git temp-tna
```

### Step 2: Understand the Original Structure

The original `app.R` (3626 lines) contains:
- **Lines 1-67**: UI function with Google OAuth JavaScript
- **Lines 68-325**: Login page UI and auth handlers
- **Lines 326-1489**: Main dashboard UI (tabs, inputs, outputs)
- **Lines 1490-3620**: Server logic (data processing, plots, exports)
- **Line 3626**: `shinyApp(ui, server)` call

### Step 3: Remove OAuth Dependencies

The original code has these OAuth-related parts to remove:

```r
# REMOVE: Google OAuth configuration
GOOGLE_CLIENT_ID <- "..."
GOOGLE_CLIENT_SECRET <- "..."

# REMOVE: Login page UI
login_page_ui <- function() { ... }

# REMOVE: Auth reactive values
auth <- reactiveValues(
  logged_in = FALSE,
  access_token = NULL,
  ...
)

# REMOVE: OAuth handlers
observeEvent(input$google_auth_code, { ... })
```

### Step 4: Create Desktop Version

Instead of modifying the original file, create a new `tnashiny_full.R`:

1. **Copy the dashboard UI** (lines 326-1489) as the main `ui` function
2. **Copy the server logic** (lines 1490-3620) as the `server` function
3. **Remove all auth checks** like `req(auth$logged_in)`
4. **Replace Google Drive calls** with local storage functions

### Step 5: Key Code Transformations

#### Original (with auth):
```r
ui <- function(request) {
  if (!is.null(getQueryString()$code)) {
    # OAuth callback
    ...
  } else if (auth$logged_in) {
    main_dashboard_ui()
  } else {
    login_page_ui()
  }
}
```

#### Desktop Version (no auth):
```r
ui <- function(request) {
  # Directly show dashboard - no login needed
  dashboardPage(
    dashboardHeader(title = "TNA Desktop"),
    dashboardSidebar(...),
    dashboardBody(...)
  )
}
```

#### Original (Google Drive save):
```r
observeEvent(input$do_save, {
  # Save to Google Drive
  drive_upload(file, path = folder_ids()$analyses)
})
```

#### Desktop Version (local save):
```r
observeEvent(input$do_save, {
  # Save to local filesystem
  saveRDS(data, file.path(folder_ids()$analyses, filename))
})
```

---

## Understanding the Code Structure

### File Purposes

| File | Purpose |
|------|---------|
| `app.R` | Entry point - sets port, sources other files, runs app |
| `global.R` | Global config, constants, helper functions, loads modules |
| `tnashiny_full.R` | Main UI and server logic (full version with Group TNA) |
| `tnashiny_core.R` | Simpler version without Group TNA (backup) |
| `R/mod_drive_local.R` | Local storage functions replacing Google Drive |
| `R/mod_export.R` | Export handlers for PNG, PDF, CSV, XLSX |
| `main.js` | Electron main process |
| `loading.html` | Loading screen shown while R starts |

### Data Flow

```
User clicks "Analyze"
        │
        ▼
input$analyze triggers observeEvent
        │
        ▼
rv$original (uploaded data) processed
        │
        ▼
rv$tna_result <- build_model(rv$data, type)
        │
        ▼
Plots and tables render from rv$tna_result
```

### Key Reactive Values

```r
rv <- reactiveValues(
  original = NULL,           # Raw uploaded data
  data = NULL,               # Processed tna_data object
  tna_result = NULL,         # TNA model result
  centrality_result = NULL,  # Centrality calculations
  cliques_result = NULL,     # Clique detection result
  community_result = NULL,   # Community detection result
  bootstrap_result = NULL,   # Bootstrap validation result
  gm_group_tna = NULL,       # Group TNA model (for Group TNA mode)
  permutation_result = NULL  # Permutation test result
)
```

---

## R-Portable Setup

### Windows

```powershell
# Download R installer
$url = "https://cran.r-project.org/bin/windows/base/old/4.4.2/R-4.4.2-win.exe"
Invoke-WebRequest -Uri $url -OutFile "R-installer.exe"

# Silent install to R-Portable-Win folder
Start-Process -Wait -FilePath "R-installer.exe" -ArgumentList "/VERYSILENT /DIR=R-Portable-Win"
```

### Install Required Packages

```r
# Run from R-Portable
install.packages(c(
  "shiny",
  "shinydashboard",
  "DT",
  "tna",
  "bslib",
  "rio",
  "shinyjs",
  "shinyjqui",
  "jsonlite",
  "rlang"
), repos = "https://cloud.r-project.org")
```

### Verify Installation

```r
# Test that all packages load
library(shiny)
library(tna)
library(DT)
cat("All packages loaded successfully!\n")
```

---

## Electron Configuration

### main.js Key Components

#### 1. R Process Spawning

```javascript
const R_CONFIG = {
  port: 9193,
  isPortable: true,
  binaryName: process.platform === 'win32' ? 'Rscript.exe' : 'Rscript'
};

function startRProcess() {
  const rBinary = path.join(app.getAppPath(), 'R-Portable-Win', 'bin', R_CONFIG.binaryName);
  const appFile = path.join(app.getAppPath(), 'app.R');

  const env = { ...process.env, SHINY_PORT: String(R_CONFIG.port) };

  rProcess = spawn(rBinary, [appFile], {
    cwd: app.getAppPath(),
    env: env
  });
}
```

#### 2. Health Check

```javascript
async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${R_CONFIG.port}/`);
      if (response.status === 200) return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}
```

#### 3. Window Creation

```javascript
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: { nodeIntegration: false }
  });

  mainWindow.loadURL(`http://127.0.0.1:${R_CONFIG.port}`);
}
```

### Platform-Specific Config (config/default.yaml)

```yaml
app:
  name: TNA Desktop
  version: 2.0.0

R:
  port: 9193
  startupTimeout: 60000
  healthCheckInterval: 1000

window:
  width: 1400
  height: 900
  minWidth: 1024
  minHeight: 768
```

---

## Local Storage Implementation

### Storage Location

```r
get_app_data_dir <- function() {
  app_dir <- switch(Sys.info()["sysname"],
    "Windows" = file.path(Sys.getenv("APPDATA"), "TNA_Desktop"),
    "Darwin" = file.path(Sys.getenv("HOME"), "Library/Application Support/TNA_Desktop"),
    file.path(Sys.getenv("HOME"), ".tna_desktop")  # Linux
  )
  if (!dir.exists(app_dir)) dir.create(app_dir, recursive = TRUE)
  return(app_dir)
}
```

### Folder Structure

```
TNA_Desktop/
├── analyses/          # Saved .rds analysis files
├── datasets/          # User datasets
├── exports/           # Exported files
└── settings.json      # User preferences
```

### Save Analysis Function

```r
save_analysis_to_drive <- function(folder_ids, analysis_data, name, description = "") {
  # Create filename
  safe_name <- sanitize_filename(name)
  analysis_id <- generate_analysis_id()
  filename <- paste0(safe_name, "_", analysis_id, ".rds")
  filepath <- file.path(folder_ids$analyses, filename)

  # Prepare data
  save_data <- list(
    meta = list(
      id = analysis_id,
      name = name,
      description = description,
      created = Sys.time(),
      version = APP_VERSION
    ),
    tna_result = analysis_data$tna_result,
    centrality_result = analysis_data$centrality_result,
    # ... other results
  )

  # Save
  saveRDS(save_data, filepath)
  return(list(success = TRUE, name = name))
}
```

### Load Analysis Function

```r
load_analysis_from_drive <- function(file_id) {
  filepath <- file.path(get_app_data_dir(), "analyses", file_id)
  if (!file.exists(filepath)) return(NULL)
  return(readRDS(filepath))
}
```

---

## Development Workflow

### Quick Iteration (R only)

```bash
cd tna-desktop
R-Portable-Win/bin/Rscript.exe app.R
# Open http://127.0.0.1:9193 in browser
```

### Full App Testing

```bash
npm start
```

### Code Change Workflow

1. **Edit R files** (`tnashiny_full.R`, `global.R`, etc.)
2. **Close the app** (Ctrl+C or close window)
3. **Restart**: `npm start`
4. **Test changes**

### Debugging

#### R-side debugging:
```r
# Add to your R code
message("DEBUG: variable = ", variable)

# Or use browser() for interactive debugging
browser()
```

#### Electron-side debugging:
```javascript
// In main.js
console.log('Debug info:', variable);

// Open DevTools in window
mainWindow.webContents.openDevTools();
```

---

## Modifying TNA Features

### Adding a New Tab

#### 1. Add to UI (tnashiny_full.R)

```r
# In dashboardSidebar:
menuItem("My New Tab", tabName = "new_tab", icon = icon("star"))

# In dashboardBody tabItems:
tabItem(
  tabName = "new_tab",
  fluidRow(
    box(title = "Settings", width = 3,
      sliderInput("new_param", "Parameter:", min = 0, max = 1, value = 0.5)
    ),
    box(title = "Output", width = 9,
      plotOutput("newPlot")
    )
  )
)
```

#### 2. Add Server Logic

```r
# In server function:
output$newPlot <- renderPlot({
  req(rv$tna_result)
  # Your plotting code
  plot(rv$tna_result, ...)
})
```

### Adding Export Buttons

```r
# In UI:
div(class = "box-header-with-export",
  h3(class = "box-title", "My Plot"),
  plotExportButtons("myPlot")
)

# In server:
output$myPlot_png <- plotDownloadPNG(function() {
  req(rv$tna_result)
  plot(rv$tna_result)
}, "my_plot", 1200, 1000)

output$myPlot_pdf <- plotDownloadPDF(function() {
  req(rv$tna_result)
  plot(rv$tna_result)
}, "my_plot", 10, 8)
```

### Modifying Group TNA Mode

Group TNA mode is controlled by `current_mode()` reactive:

```r
# Check current mode
if (current_mode() == "group_tna") {
  # Group TNA specific logic
  group_tnad <- group_model(rv$data, type = input$type, group = input$gm_groupVar)
  plot(group_tnad)
} else {
  # Regular TNA logic
  plot(rv$tna_result)
}
```

### Adding New Analysis Types

```r
# In the analyze observeEvent:
observeEvent(input$analyze, {
  if (input$inputType == "my_new_type") {
    tryCatch({
      rv$data <- process_my_data(rv$original)
      rv$tna_result <- build_model(rv$data, type = input$type)
    }, error = function(e) {
      showNotification(paste("Error:", e$message), type = "error")
    })
  }
})
```

---

## Building for Distribution

### Windows Build

```bash
# Package (creates unpacked directory)
npm run package-win

# Build installer
npm run build-win
```

### macOS Build

```bash
npm run package-mac
npm run build-mac
```

### Linux Build

```bash
npm run package-linux
npm run build-linux
```

### Build Output

```
dist/
├── win-unpacked/           # Windows portable
│   ├── TNA Desktop.exe
│   └── resources/
│       └── R-Portable/
├── TNA Desktop Setup.exe   # Windows installer
├── mac/                    # macOS app
│   └── TNA Desktop.app
└── linux-unpacked/         # Linux portable
    └── tna-desktop
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
netstat -ano | findstr "9193"

# Kill process
taskkill /F /PID <PID>

# Or change port in config/default.yaml and app.R
```

### R Packages Not Found

```r
# Check library path
.libPaths()

# Install to correct location
install.packages("package", lib = "R-Portable-Win/library")
```

### Shiny Server Not Starting

1. Test R directly:
```bash
R-Portable-Win/bin/Rscript.exe app.R
```

2. Check for syntax errors in R files
3. Verify all packages are installed

### Electron Window Blank

1. Check if Shiny server is running: `curl http://127.0.0.1:9193`
2. Check main.js console output
3. Open DevTools: Add `mainWindow.webContents.openDevTools()` to main.js

### HTTP 500 Errors

This usually means an R error. Check:
1. R console output for error messages
2. Run app.R directly to see full error

### Package Version Conflicts

```r
# Update all packages
update.packages(ask = FALSE)

# Or reinstall specific package
remove.packages("problematic_package")
install.packages("problematic_package")
```

---

## Quick Reference

### Key Files to Edit

| Task | File(s) |
|------|---------|
| Change UI layout | `tnashiny_full.R` (ui function) |
| Add new analysis | `tnashiny_full.R` (server function) |
| Modify settings | `global.R` |
| Change port | `config/default.yaml` + `app.R` |
| Electron behavior | `main.js` |
| Local storage | `R/mod_drive_local.R` |

### Useful Commands

```bash
# Start app
npm start

# Test R only
R-Portable-Win/bin/Rscript.exe app.R

# Check git status
git status

# Commit changes
git add -A && git commit -m "Description"

# Push to GitHub
git push origin master
```

### Important URLs

- TNA Package Docs: https://sonsoles.me/tna/
- Original Shiny App: https://github.com/mohsaqr/tnashiny
- Electron Docs: https://www.electronjs.org/docs
- Shiny Docs: https://shiny.rstudio.com/

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and test
4. Commit: `git commit -m "Add my feature"`
5. Push: `git push origin feature/my-feature`
6. Create Pull Request

---

*Last updated: January 2025*
