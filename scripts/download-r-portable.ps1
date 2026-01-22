# ============================================================================
# TNA Desktop - Download R-Portable for Windows
# ============================================================================
# Run this script in PowerShell to download R-Portable
# ============================================================================

$ErrorActionPreference = "Stop"

$R_VERSION = "4.4.2"
$DOWNLOAD_URL = "https://cran.r-project.org/bin/windows/base/old/4.4.2/R-4.4.2-win.exe"
$TEMP_DIR = "$env:TEMP\tna-r-download"
$TARGET_DIR = Join-Path $PSScriptRoot "..\R-Portable-Win"

Write-Host "TNA Desktop - R-Portable Setup for Windows" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Create temp directory
if (-not (Test-Path $TEMP_DIR)) {
    New-Item -ItemType Directory -Path $TEMP_DIR | Out-Null
}

# Download R installer
$installerPath = Join-Path $TEMP_DIR "R-$R_VERSION-win.exe"
if (-not (Test-Path $installerPath)) {
    Write-Host "Downloading R $R_VERSION..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $DOWNLOAD_URL -OutFile $installerPath
    Write-Host "Download complete!" -ForegroundColor Green
} else {
    Write-Host "R installer already downloaded." -ForegroundColor Green
}

# Extract/Install R to target directory
Write-Host "Installing R to $TARGET_DIR..." -ForegroundColor Yellow

if (Test-Path $TARGET_DIR) {
    Write-Host "Removing existing R-Portable-Win directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $TARGET_DIR
}

# Run installer in silent mode
$installArgs = "/VERYSILENT /NORESTART /DIR=`"$TARGET_DIR`" /COMPONENTS=`"main,x64`""
Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow

Write-Host "R installation complete!" -ForegroundColor Green

# Install required packages
Write-Host ""
Write-Host "Installing R packages..." -ForegroundColor Yellow
$rscript = Join-Path $TARGET_DIR "bin\Rscript.exe"
$packageScript = Join-Path $PSScriptRoot "setup-r-packages.R"

if (Test-Path $rscript) {
    & $rscript $packageScript
} else {
    Write-Host "ERROR: Rscript not found at $rscript" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "R-Portable setup complete!" -ForegroundColor Green
Write-Host "You can now run 'npm start' to test the app." -ForegroundColor Cyan
