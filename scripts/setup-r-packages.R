# ============================================================================
# TNA Desktop - R Package Installation Script
# ============================================================================
# Run this script to install all required R packages for TNA Desktop
# ============================================================================

# Set CRAN mirror
options(repos = c(CRAN = "https://cloud.r-project.org"))

# Required packages
packages <- c(
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
)

# Function to install packages if not already installed
install_if_missing <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    message("Installing: ", pkg)
    install.packages(pkg, dependencies = TRUE)
  } else {
    message("Already installed: ", pkg)
  }
}

# Install all packages
message("Installing required packages for TNA Desktop...")
message("This may take several minutes...\n")

for (pkg in packages) {
  tryCatch({
    install_if_missing(pkg)
  }, error = function(e) {
    message("ERROR installing ", pkg, ": ", e$message)
  })
}

# Verify installation
message("\n============================================")
message("Verifying package installation...")
message("============================================\n")

all_installed <- TRUE
for (pkg in packages) {
  if (requireNamespace(pkg, quietly = TRUE)) {
    version <- packageVersion(pkg)
    message("OK: ", pkg, " (", version, ")")
  } else {
    message("MISSING: ", pkg)
    all_installed <- FALSE
  }
}

if (all_installed) {
  message("\n SUCCESS: All packages installed correctly!")
} else {
  message("\n WARNING: Some packages are missing. Please install them manually.")
}
