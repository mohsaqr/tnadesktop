# ============================================================================
# TNA Desktop App - Global Configuration
# ============================================================================
# Desktop version - No Google OAuth, local file storage
# ============================================================================

# Required packages
library(shiny)
library(shinydashboard)
library(DT)
library(tna)
library(bslib)
library(rio)
library(shinyjs)
library(shinyjqui)
library(jsonlite)

# Additional packages for full functionality
suppressPackageStartupMessages({
  library(rlang)
})

# Define %||% operator (null coalescing)
`%||%` <- function(x, y) if (is.null(x) || length(x) == 0 || (is.character(x) && x == "")) y else x

# ============================================================================
# App Constants
# ============================================================================

APP_NAME <- "TNA Desktop"
APP_VERSION <- "2.0.0"
APP_FOLDER_NAME <- "TNA_Desktop"

# Default plot margins
DEFAULT_MAR <- c(2.5, 2.5, 2.5, 2.5)
mar <- DEFAULT_MAR

# Default preferences
DEFAULT_PREFERENCES <- list(
  default_type = "relative",
  default_layout = "circle",
  default_cut = 0.1,
  default_minimum = 0.05,
  default_vsize = 8,
  default_edge_label = 1,
  default_node_label = 1,
  skin = "purple"
)

# Set seed for reproducibility
set.seed(19)

# ============================================================================
# Local Storage Configuration
# ============================================================================

#' Get the application data directory (cross-platform)
#' @return Character string with path to app data directory
get_app_data_dir <- function() {
  app_dir <- switch(Sys.info()["sysname"],
    "Windows" = file.path(Sys.getenv("APPDATA"), APP_FOLDER_NAME),
    "Darwin" = file.path(Sys.getenv("HOME"), "Library", "Application Support", APP_FOLDER_NAME),
    file.path(Sys.getenv("HOME"), paste0(".", tolower(APP_FOLDER_NAME)))
  )

  # Create directories if they don't exist
  if (!dir.exists(app_dir)) {
    dir.create(app_dir, recursive = TRUE)
  }

  return(app_dir)
}

# ============================================================================
# Helper Functions
# ============================================================================

#' Create a unique analysis ID
generate_analysis_id <- function() {
  paste0(
    format(Sys.time(), "%Y%m%d_%H%M%S"),
    "_",
    paste0(sample(letters, 6), collapse = "")
  )
}

#' Sanitize filename
sanitize_filename <- function(name) {
  name <- gsub("[^[:alnum:] _-]", "", name)
  name <- gsub("\\s+", " ", name)
  name <- trimws(name)
  if (nchar(name) > 50) name <- substr(name, 1, 50)
  if (nchar(name) == 0) name <- "Untitled"
  return(name)
}

#' Format file size for display
format_file_size <- function(bytes) {
  if (is.null(bytes) || is.na(bytes)) return("Unknown")
  if (bytes < 1024) return(paste(bytes, "B"))
  else if (bytes < 1024^2) return(paste(round(bytes / 1024, 1), "KB"))
  else if (bytes < 1024^3) return(paste(round(bytes / 1024^2, 1), "MB"))
  else return(paste(round(bytes / 1024^3, 1), "GB"))
}

#' Format date for display
format_date_display <- function(date) {
  if (is.null(date) || is.na(date)) return("Unknown")
  format(as.POSIXct(date), "%b %d, %Y %H:%M")
}

# ============================================================================
# Export Helper Functions
# ============================================================================

#' Generate table export buttons
tableExportButtons <- function(id) {
  ns <- NS(id)
  div(
    class = "export-buttons",
    style = "display: inline-block; margin-left: 10px;",
    downloadButton(paste0(id, "_csv"), "CSV", class = "btn-xs"),
    downloadButton(paste0(id, "_xlsx"), "Excel", class = "btn-xs")
  )
}

#' Generate plot export buttons
plotExportButtons <- function(id) {
  div(
    class = "export-buttons",
    style = "display: inline-block; margin-left: 10px;",
    downloadButton(paste0(id, "_png"), "PNG", class = "btn-xs"),
    downloadButton(paste0(id, "_pdf"), "PDF", class = "btn-xs")
  )
}

#' Create PNG download handler
plotDownloadPNG <- function(plot_fun, name = "plot", width = 800, height = 600) {
  downloadHandler(
    filename = function() paste0(name, "_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".png"),
    content = function(file) {
      png(file, width = width, height = height, res = 150)
      tryCatch({
        plot_fun()
      }, finally = {
        dev.off()
      })
    }
  )
}

#' Create PDF download handler
plotDownloadPDF <- function(plot_fun, name = "plot", width = 8, height = 6) {
  downloadHandler(
    filename = function() paste0(name, "_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".pdf"),
    content = function(file) {
      pdf(file, width = width, height = height)
      tryCatch({
        plot_fun()
      }, finally = {
        dev.off()
      })
    }
  )
}

#' Create CSV download handler
tableDownloadCSV <- function(data_fun, name = "data") {
  downloadHandler(
    filename = function() paste0(name, "_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv"),
    content = function(file) {
      write.csv(data_fun(), file, row.names = FALSE)
    }
  )
}

#' Create Excel download handler
tableDownloadXLSX <- function(data_fun, name = "data") {
  downloadHandler(
    filename = function() paste0(name, "_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".xlsx"),
    content = function(file) {
      rio::export(data_fun(), file)
    }
  )
}

# ============================================================================
# JavaScript Logging Helper
# ============================================================================

logjs <- function(x) {
  shinyjs::runjs(sprintf("console.log('%s')", gsub("'", "\\'", as.character(x), fixed = TRUE)))
}

# ============================================================================
# Source Modules
# ============================================================================

# Source the local Drive module (replaces Google Drive)
source("R/mod_drive_local.R")

# Source export module
if (file.exists("R/mod_export.R")) {
  source("R/mod_export.R")
  message("Loaded: mod_export.R")
}

# Source other modules
module_files <- list.files("R", pattern = "\\.R$", full.names = TRUE)
for (f in module_files) {
  if (!grepl("mod_drive|mod_export|mod_auth|mod_user_menu", f)) {
    tryCatch({
      source(f)
      message("Loaded: ", basename(f))
    }, error = function(e) {
      message("Warning: Could not load ", basename(f), ": ", e$message)
    })
  }
}

# ============================================================================
# Initialize App Data Directory
# ============================================================================

tryCatch({
  app_dir <- get_app_data_dir()
  message("App data directory: ", app_dir)
}, error = function(e) {
  message("Warning: Could not create app data directory: ", e$message)
})

message("TNA Desktop v", APP_VERSION, " - Configuration loaded")
