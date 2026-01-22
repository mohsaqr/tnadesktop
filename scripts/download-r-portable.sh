#!/bin/bash
# ============================================================================
# TNA Desktop - Download R-Portable for Linux/macOS
# ============================================================================

set -e

R_VERSION="4.3.3"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "TNA Desktop - R-Portable Setup"
echo "============================================"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
    TARGET_DIR="$PROJECT_DIR/R-Portable-Mac"
    echo "Detected: macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    TARGET_DIR="$PROJECT_DIR/R-Portable-Linux"
    echo "Detected: Linux"
else
    echo "ERROR: Unsupported operating system: $OSTYPE"
    exit 1
fi

# Create target directory
mkdir -p "$TARGET_DIR"

if [[ "$OS" == "mac" ]]; then
    echo ""
    echo "For macOS, please:"
    echo "1. Download R from: https://cran.r-project.org/bin/macosx/"
    echo "2. Install it normally"
    echo "3. Copy the R.framework to $TARGET_DIR"
    echo ""
    echo "Or use Homebrew:"
    echo "  brew install r"
    echo ""

    # Check if R is installed via Homebrew
    if command -v R &> /dev/null; then
        R_PATH=$(which R)
        echo "Found R at: $R_PATH"
        echo "Creating symlinks..."

        mkdir -p "$TARGET_DIR/bin"
        ln -sf "$R_PATH" "$TARGET_DIR/bin/R"
        ln -sf "$(dirname $R_PATH)/Rscript" "$TARGET_DIR/bin/Rscript"

        echo "Symlinks created!"
    fi

elif [[ "$OS" == "linux" ]]; then
    echo ""
    echo "Installing R packages (assuming R is installed system-wide)..."

    # Check if R is installed
    if ! command -v R &> /dev/null; then
        echo "R is not installed. Please install R first:"
        echo ""
        echo "Ubuntu/Debian:"
        echo "  sudo apt-get update"
        echo "  sudo apt-get install r-base r-base-dev"
        echo ""
        echo "Fedora/RHEL:"
        echo "  sudo dnf install R"
        echo ""
        exit 1
    fi

    # Create symlinks
    mkdir -p "$TARGET_DIR/bin"
    ln -sf "$(which R)" "$TARGET_DIR/bin/R"
    ln -sf "$(which Rscript)" "$TARGET_DIR/bin/Rscript"

    echo "Symlinks created!"
fi

# Install R packages
echo ""
echo "Installing required R packages..."
Rscript "$SCRIPT_DIR/setup-r-packages.R"

echo ""
echo "============================================"
echo "Setup complete!"
echo "You can now run 'npm start' to test the app."
