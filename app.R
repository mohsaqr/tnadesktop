# ============================================================================
# TNA Desktop App - Main Application Entry Point
# ============================================================================
# Desktop version with full features including Group TNA
# ============================================================================

# Get port from environment (set by Electron) or use default
port <- as.integer(Sys.getenv("SHINY_PORT", "9193"))

# Configure Shiny options
options(
  shiny.port = port,
  shiny.host = "127.0.0.1",
  shiny.launch.browser = FALSE
)

# Source global configuration
source("global.R")

# Source the full TNA app with all features (ui and server)
source("tnashiny_full.R")

# ============================================================================
# Run Application
# ============================================================================

message("Starting TNA Desktop on port ", port, "...")

runApp(
  shinyApp(ui = ui, server = server),
  port = port,
  host = "127.0.0.1",
  launch.browser = FALSE
)
