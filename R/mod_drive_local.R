# ============================================================================
# Local Storage Module (Desktop Version)
# ============================================================================
# Replaces Google Drive operations with local filesystem
# Drop-in replacement for mod_drive.R functions
# ============================================================================

#' Initialize local folder structure (replaces Google Drive init)
#' @return List with folder paths
initialize_drive_folders <- function() {
  message("=== INITIALIZING LOCAL FOLDERS ===")

  tryCatch({
    app_dir <- get_app_data_dir()

    # Create subdirectories
    folders <- list(
      root = app_dir,
      datasets = file.path(app_dir, "datasets"),
      analyses = file.path(app_dir, "analyses"),
      exports = file.path(app_dir, "exports")
    )

    for (name in names(folders)) {
      if (!dir.exists(folders[[name]])) {
        dir.create(folders[[name]], recursive = TRUE)
        message("Created folder: ", folders[[name]])
      }
    }

    message("Local folders initialized at: ", app_dir)
    return(folders)
  }, error = function(e) {
    message("Error initializing folders: ", e$message)
    return(NULL)
  })
}

#' Load user settings from local file
#' @param folder_ids List with folder paths
#' @return List with user settings
load_user_settings <- function(folder_ids) {
  tryCatch({
    settings_file <- file.path(folder_ids$root, "settings.json")

    if (file.exists(settings_file)) {
      settings <- jsonlite::read_json(settings_file)
      message("Loaded settings from: ", settings_file)
      return(settings)
    } else {
      message("No settings file found, using defaults")
      return(list(preferences = DEFAULT_PREFERENCES))
    }
  }, error = function(e) {
    message("Error loading settings: ", e$message)
    return(list(preferences = DEFAULT_PREFERENCES))
  })
}

#' Save user settings to local file
#' @param folder_ids List with folder paths
#' @param settings List of settings to save
#' @return Boolean indicating success
save_user_settings <- function(folder_ids, settings) {
  tryCatch({
    settings_file <- file.path(folder_ids$root, "settings.json")
    jsonlite::write_json(settings, settings_file, auto_unbox = TRUE, pretty = TRUE)
    message("Saved settings to: ", settings_file)
    return(TRUE)
  }, error = function(e) {
    message("Error saving settings: ", e$message)
    return(FALSE)
  })
}

#' Save analysis to local filesystem
#' @param folder_ids List with folder paths
#' @param analysis_data List containing analysis data
#' @param name Name for the analysis
#' @param description Optional description
#' @return List with success status and details
save_analysis_to_drive <- function(folder_ids, analysis_data, name, description = "") {
  tryCatch({
    analyses_dir <- folder_ids$analyses

    # Create sanitized filename
    safe_name <- sanitize_filename(name)
    analysis_id <- generate_analysis_id()
    filename <- paste0(safe_name, "_", analysis_id, ".rds")
    filepath <- file.path(analyses_dir, filename)

    # Prepare save data
    save_data <- list(
      meta = list(
        id = analysis_id,
        name = name,
        description = description,
        created = Sys.time(),
        modified = Sys.time(),
        version = APP_VERSION
      ),
      tna_result = analysis_data$tna_result,
      centrality_result = analysis_data$centrality_result,
      community_result = analysis_data$community_result,
      cliques_result = analysis_data$cliques_result,
      bootstrap_result = analysis_data$bootstrap_result,
      original_data = analysis_data$original,
      processed_data = analysis_data$data,
      settings = analysis_data$settings
    )

    # Save to file
    saveRDS(save_data, filepath)
    message("Analysis saved: ", filepath)

    return(list(
      success = TRUE,
      name = name,
      filename = filename
    ))
  }, error = function(e) {
    message("Error saving analysis: ", e$message)
    return(list(
      success = FALSE,
      error = e$message
    ))
  })
}

#' Load analysis from local filesystem
#' @param file_id Filename of the analysis (used as ID)
#' @return List containing analysis data or NULL
load_analysis_from_drive <- function(file_id) {
  tryCatch({
    # file_id is the filename for local storage
    analyses_dir <- file.path(get_app_data_dir(), "analyses")
    filepath <- file.path(analyses_dir, file_id)

    if (!file.exists(filepath)) {
      # Try adding .rds extension if not present
      if (!grepl("\\.rds$", file_id)) {
        filepath <- file.path(analyses_dir, paste0(file_id, ".rds"))
      }
    }

    if (!file.exists(filepath)) {
      message("Analysis file not found: ", filepath)
      return(NULL)
    }

    data <- readRDS(filepath)
    message("Analysis loaded: ", filepath)
    return(data)
  }, error = function(e) {
    message("Error loading analysis: ", e$message)
    return(NULL)
  })
}

#' List all saved analyses from local filesystem
#' @param folder_ids List with folder paths
#' @return Data frame with analysis information
list_analyses_from_drive <- function(folder_ids) {
  tryCatch({
    analyses_dir <- folder_ids$analyses

    files <- list.files(analyses_dir, pattern = "\\.rds$", full.names = TRUE)

    if (length(files) == 0) {
      return(data.frame(
        id = character(),
        name = character(),
        filename = character(),
        description = character(),
        modified = as.POSIXct(character()),
        size = numeric(),
        stringsAsFactors = FALSE
      ))
    }

    # Get info for each file
    analyses <- lapply(files, function(f) {
      tryCatch({
        data <- readRDS(f)
        info <- file.info(f)

        list(
          id = basename(f),  # Use filename as ID
          name = data$meta$name %||% gsub("\\.rds$", "", basename(f)),
          filename = basename(f),
          description = data$meta$description %||% "",
          modified = info$mtime,
          size = info$size
        )
      }, error = function(e) {
        info <- file.info(f)
        list(
          id = basename(f),
          name = gsub("\\.rds$", "", basename(f)),
          filename = basename(f),
          description = "",
          modified = info$mtime,
          size = info$size
        )
      })
    })

    # Convert to data frame
    df <- do.call(rbind, lapply(analyses, as.data.frame, stringsAsFactors = FALSE))

    # Sort by modified date (newest first)
    df <- df[order(df$modified, decreasing = TRUE), ]

    return(df)
  }, error = function(e) {
    message("Error listing analyses: ", e$message)
    return(data.frame(
      id = character(),
      name = character(),
      filename = character(),
      description = character(),
      modified = as.POSIXct(character()),
      size = numeric(),
      stringsAsFactors = FALSE
    ))
  })
}

#' Delete analysis from local filesystem
#' @param file_id Filename of the analysis to delete
#' @return Boolean indicating success
delete_analysis_from_drive <- function(file_id) {
  tryCatch({
    analyses_dir <- file.path(get_app_data_dir(), "analyses")
    filepath <- file.path(analyses_dir, file_id)

    if (!file.exists(filepath) && !grepl("\\.rds$", file_id)) {
      filepath <- file.path(analyses_dir, paste0(file_id, ".rds"))
    }

    if (file.exists(filepath)) {
      file.remove(filepath)
      message("Analysis deleted: ", filepath)
      return(TRUE)
    } else {
      message("Analysis file not found: ", filepath)
      return(FALSE)
    }
  }, error = function(e) {
    message("Error deleting analysis: ", e$message)
    return(FALSE)
  })
}

# ============================================================================
# Stub functions for Google OAuth (not needed in desktop mode)
# ============================================================================

#' Configure drive token (stub - not needed for local storage)
configure_drive_token <- function(access_token, refresh_token = NULL) {
  message("Desktop mode: Google Drive token configuration skipped")
  return(TRUE)
}

#' Exchange code for token (stub - not needed for local storage)
exchange_code_for_token <- function(code, session) {
  message("Desktop mode: OAuth token exchange skipped")
  return(NULL)
}

#' Get user info (stub - returns desktop user)
get_user_info <- function(access_token) {
  return(list(
    email = "desktop@local",
    name = "Desktop User",
    picture = NULL
  ))
}

#' Get Google login URL (stub - not needed)
get_google_login_url <- function(session) {
  return("#")
}
