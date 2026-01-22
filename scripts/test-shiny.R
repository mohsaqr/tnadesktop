# ============================================================================
# TNA Desktop - Test Shiny App Standalone
# ============================================================================
# Run this script to test the Shiny app without Electron
# ============================================================================

# Set working directory to project root
script_dir <- dirname(sys.frame(1)$ofile)
project_dir <- dirname(script_dir)
setwd(project_dir)

message("Testing TNA Desktop Shiny App")
message("Working directory: ", getwd())
message("")

# Source and run the app
source("app.R")
