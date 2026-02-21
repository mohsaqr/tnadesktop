## Generate 100 datasets with Saqrlab::simulate_sequences() and compute
## tna:::compare_() reference metrics. Saves tmp/equiv100.json.
suppressPackageStartupMessages({
  library(tna)
  library(Saqrlab)
  library(jsonlite)
})

# Map R metric names → TS keys (same order as RELIABILITY_METRICS)
METRIC_MAP <- c(
  "Mean Abs. Diff."       = "mad",
  "Median Abs. Diff."     = "median_ad",
  "RMS Diff."             = "rmsd",
  "Max Abs. Diff."        = "max_ad",
  "Rel. Mean Abs. Diff."  = "rel_mad",
  "CV Ratio"              = "cv_ratio",
  "Pearson"               = "pearson",
  "Spearman"              = "spearman",
  "Kendall"               = "kendall",
  "Distance"              = "dcor",
  "Euclidean"             = "euclidean",
  "Manhattan"             = "manhattan",
  "Canberra"              = "canberra",
  "Bray-Curtis"           = "braycurtis",
  "Frobenius"             = "frobenius",
  "Cosine"                = "cosine",
  "Jaccard"               = "jaccard",
  "Dice"                  = "dice",
  "Overlap"               = "overlap",
  "RV"                    = "rv",
  "Rank Agreement"        = "rank_agree",
  "Sign Agreement"        = "sign_agree"
)

results <- vector("list", 100)

for (seed in 1:100) {
  set.seed(seed)
  seqs <- simulate_sequences(
    n_sequences = 100, seq_length = 20, n_states = 5,
    include_na = FALSE, seed = seed
  )

  n   <- nrow(seqs)
  idx <- sample(n, n %/% 2L)
  ma  <- tna(seqs[idx, ])
  mb  <- tna(seqs[-idx, ])

  cmp <- tna:::compare_(ma, mb, scaling = "none",
                         network = FALSE, measures = character(0))
  sm  <- cmp$summary_metrics

  # Build named metric vector using TS keys
  r_metrics <- setNames(sm$value, METRIC_MAP[sm$metric])

  results[[seed]] <- list(
    seed        = seed,
    n_states    = nrow(ma$weights),
    labels      = rownames(ma$weights),
    weights_a   = as.vector(ma$weights),   # column-major
    weights_b   = as.vector(mb$weights),
    r_metrics   = r_metrics
  )
}

out_path <- file.path("tmp", "equiv100.json")
write(toJSON(results, auto_unbox = TRUE, digits = 15), out_path)
cat("Saved", length(results), "datasets to", out_path, "\n")
