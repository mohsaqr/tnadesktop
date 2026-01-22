# TNA Desktop - Quick Start Guide

## Step 1: Download and Setup R-Portable (Windows)

### Option A: Automatic Setup (Recommended)
```powershell
# Open PowerShell as Administrator and run:
cd path\to\tna-desktop
.\scripts\download-r-portable.ps1
```

### Option B: Manual Setup
1. Download R from: https://cloud.r-project.org/bin/windows/base/
2. Install to: `tna-desktop\R-Portable-Win\`
3. Run the R package installer:
   ```cmd
   R-Portable-Win\bin\Rscript.exe scripts\setup-r-packages.R
   ```

## Step 2: Test the Application

```bash
# Run in development mode
npm start
```

## Step 3: Build for Distribution

```bash
# Create Windows installer
npm run package-win

# Output will be in: dist\TNA-win32-x64\
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save analysis |
| Ctrl+O | Open analysis |

## Troubleshooting

### "R binary not found"
- Ensure R-Portable-Win folder exists and contains the R installation
- The R binary should be at: `R-Portable-Win\bin\Rscript.exe`

### "Package 'tna' not found"
- Run: `R-Portable-Win\bin\Rscript.exe scripts\setup-r-packages.R`

### App starts but shows blank screen
- Wait a few seconds for R to initialize
- Check the console for error messages
- Ensure all R packages are installed correctly

## Data Storage

Your analyses are saved locally in:
- **Windows**: `%APPDATA%\TNA_Desktop\analyses\`
- **macOS**: `~/Library/Application Support/TNA_Desktop/analyses/`
- **Linux**: `~/.tna_desktop/analyses/`
