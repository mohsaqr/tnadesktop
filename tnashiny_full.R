# ============================================================================
# TNA Desktop - Full Version with Group TNA
# ============================================================================
# Desktop version without Google OAuth - all features included
# ============================================================================

# UI - Dashboard directly (no login)
ui <- function(request) {
  # Build header without user menu (desktop mode)
  db_header <- dashboardHeader(
    title = "TNA Desktop",
    tags$li(
      class = "dropdown",
      tags$span(style = "color: white; padding: 15px; display: block;",
        icon("desktop"), " Desktop Mode"
      )
    )
  )

  # Add logo to header
  tryCatch({
    logo <- tags$span(
      tags$img(src = "logo.png", height = "44", width = "40", style = "margin-right: 10px;"),
      "TNA"
    )
    if (length(db_header$children) >= 2 && !is.null(db_header$children[[2]])) {
      db_header$children[[2]]$children <- logo
    }
  }, error = function(e) {
    message("Could not modify header logo: ", e$message)
  })

  # Build full dashboard
  dashboardPage(
    skin = "purple",
    title = "TNA Desktop",
    db_header,
    dashboardSidebar(
      sidebarMenu(
        id = "sidebar_menu",
        menuItem("About TNA", tabName = "about", icon = icon("circle-info")),
        menuItem("Input Data", tabName = "input", icon = icon("table"), selected = TRUE),
        menuItem("Summary results", tabName = "results", icon = icon("chart-bar")),
        menuItem("Visualization", tabName = "tna_plot", icon = icon("circle-nodes")),
        menuItem("Sequences", tabName = "sequences", icon = icon("list-ol")),
        menuItem("Frequencies", tabName = "frequencies", icon = icon("chart-column")),
        menuItem("Associations", tabName = "associations", icon = icon("link")),
        menuItem("Centrality Measures", tabName = "centrality", icon = icon("chart-line")),
        menuItem("Community Detection", tabName = "communities", icon = icon("users")),
        menuItem("Edge Betweenness", tabName = "edgebet", icon = icon("people-arrows")),
        menuItem("Cliques", tabName = "cliques", icon = icon("sitemap")),
        menuItem("Comparison", tabName = "comparison", icon = icon("balance-scale")),
        menuItem("Group Networks", tabName = "group_networks", icon = icon("object-group")),
        menuItem("Bootstrap", tabName = "bootstrap", icon = icon("check-circle")),
        menuItem("Permutation", tabName = "permutation", icon = icon("shuffle"))
      )
    ),
    dashboardBody(
      useShinyjs(),
      tags$html(lang = "en"),
      tags$head(
        tags$style(HTML("a[data-value='permutation'] { display: none; }"))
      ),

      # Top-level mode tabs (TNA vs Group TNA)
      div(
        class = "mode-tabs",
        style = "padding: 10px 15px; background: #f4f4f4; border-bottom: 1px solid #ddd; margin-bottom: 10px;",
        tags$span(
          actionLink("mode_tna", "TNA", style = "font-size: 18px; font-weight: bold; color: #3c8dbc; margin-right: 20px; text-decoration: none;"),
          actionLink("mode_group_tna", "Group TNA", style = "font-size: 18px; font-weight: bold; color: #999; margin-right: 30px; text-decoration: none;")
        ),
        actionButton("btn_save", tagList(icon("save"), " Save"), class = "btn btn-primary btn-sm", style = "margin-right: 5px;"),
        actionButton("btn_load", tagList(icon("folder-open"), " Load"), class = "btn btn-info btn-sm", style = "margin-right: 5px;"),
        actionButton("btn_export", tagList(icon("file-export"), " Export"), class = "btn btn-default btn-sm")
      ),

      # All tab items
      tabItems(
        # About Tab
        tabItem(
          tabName = "about",
          h2("Transition Network Analysis (TNA)"),
          p("Transition Network Analysis (TNA) is designed for analyzing transition networks,
            providing methods for examining sequences, identifying communities, calculating
            centrality measures, and visualizing network dynamics."),
          h3("Usage"),
          p("TNA offers a set of tools for researchers and analysts working with transition networks.",
            tags$a("Check the package documentation", href = "https://sonsoles.me/tna/"), "."),
          tags$ul(
            tags$li(tags$b("Transition Analysis"), ": Understand transitions and connections in sequential data."),
            tags$li(tags$b("Community Detection"), ": Apply multiple algorithms to find community structures."),
            tags$li(tags$b("Centrality Measures"), ": Calculate centrality measures to identify key nodes."),
            tags$li(tags$b("Visualization"), ": Generate interactive and static plots.")
          ),
          h3("Citation"),
          p("Please cite the tna package if you use it in your research:"),
          tags$blockquote("Lopez-Pernas S, Saqr M, Tikka S (2024). tna: An R package for Transition Network Analysis.")
        ),

        # Input Data Tab
        tabItem(
          tabName = "input",
          fluidRow(
            column(
              width = 3,
              fluidRow(
                box(
                  title = "Data Input", width = 12,
                  radioButtons("inputType", "Input Type:",
                    selected = character(0),
                    choices = c("Sample data" = "sample", "Sequence Data" = "sequence",
                                "Long Data" = "long", "Transition Matrix" = "matrix")
                  ),
                  conditionalPanel("input.inputType == 'sequence'",
                    fileInput("fileInput", "Upload data file (sequence or wide data)")
                  ),
                  conditionalPanel("input.inputType == 'long'",
                    fileInput("longInput", "Upload long data"),
                    selectInput("longAction", "Action:", choices = NULL, selectize = FALSE),
                    selectInput("longActor", "Actor:", choices = NULL, selectize = FALSE),
                    selectInput("longTime", "Time:", choices = NULL, selectize = FALSE),
                    selectInput("longOrder", "Order:", choices = NULL, selectize = FALSE),
                    numericInput("longThreshold", "Threshold:", min = 0, value = 900, step = 1),
                    textInput("longDate", "Date format:", placeholder = "Not mandatory")
                  ),
                  conditionalPanel("input.inputType == 'matrix'",
                    fileInput("matrixInput", "Upload transition matrix")
                  ),
                  selectInput("type", "Analysis Type:", choices = c("relative", "frequency", "co-occurrence")),
                  div(id = "group_input_container", style = "display: none;",
                    selectInput("gm_groupVar", "Group:", choices = NULL)
                  ),
                  actionButton("analyze", "Analyze", class = "btn-primary")
                )
              )
            ),
            column(
              width = 9,
              fluidRow(
                conditionalPanel("!(input.inputType)",
                  fluidRow(box(
                    width = 12, title = "Welcome to TNA Desktop!",
                    fluidRow(column(12, p("Select the format of your data on the left panel or use our example data."))),
                    fluidRow(
                      column(4, span("Sequence Data", class = "datatype"),
                        p("Wide-format data stores each time point in a separate column.")
                      ),
                      column(4, span("Long Data", class = "datatype"),
                        p("Long-format data stacks repeated measurements in rows.")
                      ),
                      column(4, span("Transition Matrix", class = "datatype"),
                        p("You can also upload directly a transition probability matrix.")
                      )
                    )
                  ))
                ),
                conditionalPanel("input.inputType",
                  box(title = "Data Preview", width = 12,
                    DTOutput("dataPreview"),
                    tags$br(), uiOutput("tnaModel")
                  )
                )
              )
            )
          )
        ),

        # Results Tab
        tabItem(
          tabName = "results",
          fluidRow(
            box(width = 3,
              div(class = "box-header-with-export",
                h3(class = "box-title", "Summary Statistics"),
                tableExportButtons("summaryStats")
              ),
              tableOutput("summaryStats")
            ),
            box(width = 4,
              div(class = "box-header-with-export",
                h3(class = "box-title", "Initial Probabilities"),
                tableExportButtons("initialProbs")
              ),
              DTOutput("initialProbs")
            ),
            box(width = 5,
              div(class = "box-header-with-export",
                h3(class = "box-title", "Transition Matrix"),
                tableExportButtons("transitionMatrix")
              ),
              div(class = "responsive-table", DTOutput("transitionMatrix"))
            )
          )
        ),

        # Visualization Tab
        tabItem(
          tabName = "tna_plot",
          fluidRow(
            column(width = 3,
              fluidRow(box(title = "Settings", width = 12,
                sliderInput("cut", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                sliderInput("minimum", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
                sliderInput("edge.label", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                sliderInput("vsize", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                sliderInput("node.label", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                selectInput("layout", "Layout", choices = c("circle", "spring"), selected = "circle")
              ))
            ),
            column(width = 9,
              fluidRow(box(width = 12,
                div(class = "box-header-with-export",
                  h3(class = "box-title", "Visualization"),
                  plotExportButtons("tnaPlot")
                ),
                div(jqui_resizable(plotOutput("tnaPlot", width = "600px", height = "600px"),
                  options = list(ghost = TRUE, helper = "resizable-helper")
                ), align = "center")
              ))
            )
          )
        ),

        # Sequences Tab
        tabItem(
          tabName = "sequences",
          conditionalPanel("input.inputType != 'matrix'",
            fluidRow(
              column(width = 3,
                fluidRow(box(title = "Sequence Plot Settings", width = 12,
                  selectInput("seqPlotType", "Plot Type:",
                    choices = c("Sequence Index" = "index", "Distribution" = "distribution"), selected = "index"
                  ),
                  conditionalPanel("input.seqPlotType == 'distribution'",
                    selectInput("seqScale", "Scale:", choices = c("Proportion" = "proportion", "Count" = "count")),
                    selectInput("seqGeom", "Geometry:", choices = c("Bar" = "bar", "Area" = "area"))
                  ),
                  selectInput("seqGroup", "Group by:", choices = NULL),
                  checkboxInput("seqIncludeNA", "Include NA values", value = FALSE),
                  checkboxInput("seqShowN", "Show sample size (n)", value = TRUE),
                  numericInput("seqTick", "X-axis tick interval:", value = 5, min = 1, max = 20),
                  numericInput("seqNcol", "Number of columns:", value = 2, min = 1, max = 4),
                  textInput("seqTitle", "Plot title:", placeholder = "Optional title"),
                  textInput("seqXlab", "X-axis label:", value = "Time"),
                  textInput("seqYlab", "Y-axis label:", placeholder = "Auto")
                ))
              ),
              column(width = 9,
                fluidRow(box(width = 12,
                  div(class = "box-header-with-export",
                    h3(class = "box-title", "Sequence Visualization"),
                    plotExportButtons("seqPlot")
                  ),
                  div(jqui_resizable(plotOutput("seqPlot", width = "800px", height = "600px"),
                    options = list(ghost = TRUE, helper = "resizable-helper")
                  ), align = "center")
                ))
              )
            )
          ),
          conditionalPanel("input.inputType == 'matrix'",
            box(span(icon("circle-info", class = "text-danger"),
              "Sequence plots require sequence or long data format, not a transition matrix"
            ), width = 7)
          )
        ),

        # Frequencies Tab
        tabItem(
          tabName = "frequencies",
          fluidRow(
            column(width = 3,
              fluidRow(box(title = "Frequency Plot Settings", width = 12,
                sliderInput("freqWidth", "Bar width:", min = 0.1, max = 1, value = 0.7, step = 0.1),
                checkboxInput("freqShowLabel", "Show frequency labels", value = TRUE),
                sliderInput("freqHjust", "Label position:", min = 0, max = 2, value = 1.2, step = 0.1)
              ))
            ),
            column(width = 9,
              fluidRow(box(width = 12,
                div(class = "box-header-with-export",
                  h3(class = "box-title", "State Frequencies"),
                  plotExportButtons("freqPlot")
                ),
                div(jqui_resizable(plotOutput("freqPlot", width = "700px", height = "500px"),
                  options = list(ghost = TRUE, helper = "resizable-helper")
                ), align = "center")
              ))
            )
          )
        ),

        # Associations Tab
        tabItem(
          tabName = "associations",
          fluidRow(
            column(width = 3,
              fluidRow(box(title = "Association Plot Settings", width = 12,
                sliderInput("assocCut", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                sliderInput("assocMinimum", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
                sliderInput("assocEdgeLabel", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                sliderInput("assocVsize", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                sliderInput("assocNodeLabel", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                selectInput("assocLayout", "Layout", choices = c("circle", "spring"), selected = "circle")
              ))
            ),
            column(width = 9,
              fluidRow(box(width = 12,
                div(class = "box-header-with-export",
                  h3(class = "box-title", "Association Network"),
                  plotExportButtons("assocPlot")
                ),
                div(jqui_resizable(plotOutput("assocPlot", width = "600px", height = "600px"),
                  options = list(ghost = TRUE, helper = "resizable-helper")
                ), align = "center")
              ))
            )
          )
        ),

        # Centrality Tab
        tabItem(
          tabName = "centrality",
          fluidRow(box(fluidRow(
            column(width = 6, selectInput("centralitiesChoice", "Centralities",
              multiple = TRUE,
              choices = c("OutStrength", "InStrength", "ClosenessIn", "ClosenessOut", "Closeness",
                          "BetweennessRSP", "Betweenness", "Diffusion", "Clustering"),
              selected = c("OutStrength", "InStrength", "ClosenessIn", "ClosenessOut", "Closeness",
                          "BetweennessRSP", "Betweenness", "Diffusion", "Clustering")
            )),
            column(width = 2, tags$label("Properties"),
              checkboxInput("loops", "Loops?", value = FALSE),
              checkboxInput("normalize", "Normalize?", value = FALSE), class = "checkboxcentralities"
            ),
            column(width = 2, numericInput("nColsCentralities", "Columns", 3, min = 1, max = 9, step = 1))
          ), width = 12)),
          fluidRow(box(width = 12,
            div(class = "box-header-with-export",
              h3(class = "box-title", "Centrality Measures"),
              div(style = "display: flex; gap: 10px;",
                span("Table:", style = "color: #666; font-size: 0.9em;"), tableExportButtons("centralityPrint"),
                span("Plot:", style = "color: #666; font-size: 0.9em; margin-left: 15px;"), plotExportButtons("centralityPlot")
              )
            ),
            div(tableOutput("centralityPrint"), align = "center", width = 12),
            div(jqui_resizable(plotOutput("centralityPlot", width = "800px", height = "800px"),
              options = list(ghost = TRUE, helper = "resizable-helper")
            ), align = "center", width = 12)
          ))
        ),

        # Communities Tab
        tabItem(
          tabName = "communities",
          fluidRow(
            column(width = 3, fluidRow(
              box(title = "Community Detection Settings", width = 12,
                selectInput("communityAlgorithm", "Choose Algorithm:", choices = "spinglass"),
                numericInput("gamma", "Gamma:", value = 1, min = 0, max = 100)
              ),
              box(title = "Plotting Settings", width = 12,
                sliderInput("cutCom", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                sliderInput("minimumCom", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
                sliderInput("edge.labelCom", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                sliderInput("vsizeCom", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                sliderInput("node.labelCom", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                selectInput("layoutCom", "Layout", choices = c("circle", "spring"), selected = "circle")
              )
            )),
            box(width = 9,
              div(class = "box-header-with-export",
                h3(class = "box-title", "Community Detection Results"),
                plotExportButtons("communityPlot")
              ),
              div(jqui_resizable(plotOutput("communityPlot", width = "600px", height = "600px"),
                options = list(ghost = TRUE, helper = "resizable-helper")
              ), align = "center", width = 12)
            )
          )
        ),

        # Edge Betweenness Tab
        tabItem(
          tabName = "edgebet",
          fluidRow(
            column(width = 3, fluidRow(box(title = "Settings", width = 12,
              sliderInput("cutEbet", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
              sliderInput("minimumEbet", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
              sliderInput("edge.labelEbet", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
              sliderInput("vsizeEbet", "Node size", min = 0, max = 30, value = 8, step = 0.1),
              sliderInput("node.labelEbet", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
              selectInput("layoutEbet", "Layout", choices = c("circle", "spring"), selected = "circle")
            ))),
            column(width = 9, fluidRow(box(width = 12,
              div(class = "box-header-with-export",
                h3(class = "box-title", "Edge Betweenness"),
                plotExportButtons("edgeBetPlot")
              ),
              div(jqui_resizable(plotOutput("edgeBetPlot", width = "600px", height = "600px"),
                options = list(ghost = TRUE, helper = "resizable-helper")
              ), align = "center")
            )))
          )
        ),

        # Cliques Tab
        tabItem(
          tabName = "cliques",
          fluidRow(
            column(width = 3, fluidRow(
              box(title = "Clique Settings", width = 12,
                numericInput("cliqueSize", "Clique Size (n):", value = 3, min = 2, max = 10),
                numericInput("cliqueThreshold", "Threshold:", value = 0, min = 0, max = 1, step = 0.05),
                actionButton("findCliques", "Find Cliques", class = "btn-primary")
              ),
              box(title = "Plotting Settings", width = 12,
                sliderInput("cutClique", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                sliderInput("minimumClique", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
                sliderInput("edge.labelClique", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                sliderInput("vsizeClique", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                sliderInput("node.labelClique", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                selectInput("layoutClique", "Layout", choices = c("circle", "spring"), selected = "circle")
              )
            )),
            column(width = 9, fluidRow(box(width = 12,
              div(class = "box-header-with-export",
                h3(class = "box-title", "Cliques Found"),
                plotExportButtons("cliquesPlot")
              ),
              selectInput("cliqueSelect", "Choose Clique:", choices = NULL, width = "30%"),
              div(jqui_resizable(plotOutput("cliquesPlot"),
                options = list(ghost = TRUE, helper = "resizable-helper")
              ), align = "center", width = 12)
            )))
          )
        ),

        # Comparison Tab
        tabItem(
          tabName = "comparison",
          conditionalPanel("(input.inputType == 'long') | (input.inputType == 'sample')",
            fluidRow(
              column(width = 3, fluidRow(
                box(title = "Comparison Settings", width = 12,
                  selectInput("compareSelect", "Choose grouping column:", choices = NULL),
                  selectInput("group1", "Choose group 1:", choices = NULL),
                  selectInput("group2", "Choose group 2:", choices = NULL),
                  input_switch("compare_sig", "Permutation test"),
                  conditionalPanel("input.compare_sig",
                    numericInput("iterPerm", "Iteration:", min = 0, max = 10000, value = 1000, step = 100),
                    numericInput("levelPerm", "Level:", min = 0, max = 1, value = 0.05, step = 0.01),
                    input_switch("pairedPerm", "Paired test")
                  )
                ),
                box(title = "Plotting Settings", width = 12,
                  sliderInput("cutGroup", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                  sliderInput("minimumGroup", "Minimum Value", min = 0, max = 1, value = 0, step = 0.01),
                  sliderInput("edge.labelGroup", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                  sliderInput("vsizeGroup", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                  sliderInput("node.labelGroup", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                  selectInput("layoutGroup", "Layout", choices = c("circle", "spring"), selected = "circle")
                )
              )),
              column(width = 9, fluidRow(
                tabBox(id = "tabset1", width = 12,
                  tabPanel("Difference",
                    div(class = "box-header-with-export", style = "margin-bottom: 10px;",
                      span("Export:", style = "color: #666;"), plotExportButtons("comparisonPlot")
                    ),
                    div(jqui_resizable(plotOutput("comparisonPlot", width = "600px", height = "600px"),
                      options = list(ghost = TRUE, helper = "resizable-helper")
                    ), align = "center")
                  ),
                  tabPanel("Mosaic",
                    div(class = "box-header-with-export", style = "margin-bottom: 10px;",
                      span("Export:", style = "color: #666;"), plotExportButtons("mosaicPlot")
                    ),
                    div(jqui_resizable(plotOutput("mosaicPlot", width = "1400px", height = "900px"),
                      options = list(ghost = TRUE, helper = "resizable-helper")
                    ), align = "center")
                  ),
                  tabPanel("Centralities",
                    fluidRow(box(fluidRow(
                      column(width = 6, selectInput("centralitiesChoiceGroup", "Centralities",
                        multiple = TRUE,
                        choices = c("OutStrength", "InStrength", "ClosenessIn", "ClosenessOut", "Closeness",
                                    "BetweennessRSP", "Betweenness", "Diffusion", "Clustering"),
                        selected = c("OutStrength", "InStrength", "ClosenessIn", "ClosenessOut", "Closeness",
                                    "BetweennessRSP", "Betweenness", "Diffusion", "Clustering")
                      )),
                      column(width = 2, tags$label("Properties"),
                        checkboxInput("loopsGroup", "Loops?", value = FALSE),
                        checkboxInput("normalizeGroup", "Normalize?", value = FALSE), class = "checkboxcentralities"
                      ),
                      column(width = 2, numericInput("nColsCentralitiesGroup", "Columns", 3, min = 1, max = 9, step = 1))
                    ), width = 12)),
                    div(class = "box-header-with-export", style = "margin-bottom: 10px;",
                      span("Export:", style = "color: #666;"), plotExportButtons("groupCentralitiesPlot")
                    ),
                    div(jqui_resizable(plotOutput("groupCentralitiesPlot", width = "900px", height = "600px"),
                      options = list(ghost = TRUE, helper = "resizable-helper")
                    ), align = "center")
                  )
                )
              ))
            )
          ),
          conditionalPanel("input.inputType != 'long' & input.inputType != 'sample'",
            box(span(icon("circle-info", class = "text-danger"), "Comparison operations are only supported in long data"), width = 7)
          )
        ),

        # Group Networks Tab
        tabItem(
          tabName = "group_networks",
          conditionalPanel("(input.inputType == 'long') | (input.inputType == 'sample')",
            fluidRow(
              column(width = 3,
                fluidRow(box(title = "Group Network Settings", width = 12,
                  selectInput("groupNetSelect", "Grouping Variable:", choices = NULL),
                  fluidRow(
                    column(6, numericInput("groupNetNcol", "Columns:", value = 2, min = 1, max = 6)),
                    column(6, numericInput("groupNetNrow", "Rows:", value = 1, min = 1, max = 6))
                  ),
                  hr(),
                  sliderInput("groupNetCut", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                  sliderInput("groupNetMinimum", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
                  sliderInput("groupNetEdgeLabel", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                  sliderInput("groupNetVsize", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                  sliderInput("groupNetNodeLabel", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                  selectInput("groupNetLayout", "Layout", choices = c("circle", "spring"), selected = "circle")
                ))
              ),
              column(width = 9,
                fluidRow(box(width = 12,
                  div(class = "box-header-with-export",
                    h3(class = "box-title", "Group Network Visualization"),
                    plotExportButtons("groupNetPlot")
                  ),
                  div(jqui_resizable(plotOutput("groupNetPlot", width = "900px", height = "600px"),
                    options = list(ghost = TRUE, helper = "resizable-helper")
                  ), align = "center")
                ))
              )
            )
          ),
          conditionalPanel("input.inputType == 'sequence' || input.inputType == 'matrix'",
            box(span(icon("circle-info", class = "text-danger"),
              "Group network plots require long data or sample data with grouping variables"
            ), width = 7)
          )
        ),

        # Bootstrap Tab
        tabItem(
          tabName = "bootstrap",
          conditionalPanel("input.inputType != 'matrix'",
            fluidRow(
              column(width = 3, fluidRow(
                box(title = "Bootstrap", width = 12,
                  numericInput("iterBoot", "Iteration:", min = 0, max = 10000, value = 1000, step = 100),
                  numericInput("levelBoot", "Level:", min = 0, max = 1, value = 0.05, step = 0.01),
                  selectInput("methodBoot", "Method", choices = c("stability", "threshold"), selected = "stability"),
                  conditionalPanel("input.methodBoot == 'threshold'",
                    numericInput("thresBoot", "Threshold:", min = 0, max = 1, value = 0.1, step = 0.01)
                  ),
                  conditionalPanel("input.methodBoot == 'stability'",
                    h4("Consistency Range"),
                    numericInput("constLowerBoot", "Lower:", min = 0, max = 10, value = 0.75, step = 0.01),
                    numericInput("constUpperBoot", "Upper:", min = 0, max = 10, value = 1.25, step = 0.01)
                  ),
                  actionButton("bootstrapButton", "Bootstrap", class = "btn-primary")
                ),
                box(title = "Settings", width = 12,
                  sliderInput("cutBoot", "Cut Value", min = 0, max = 1, value = 0.1, step = 0.01),
                  sliderInput("minimumBoot", "Minimum Value", min = 0, max = 1, value = 0.05, step = 0.01),
                  sliderInput("edge.labelBoot", "Edge label size", min = 0, max = 10, value = 1, step = 0.1),
                  sliderInput("vsizeBoot", "Node size", min = 0, max = 30, value = 8, step = 0.1),
                  sliderInput("node.labelBoot", "Node label size", min = 0, max = 10, value = 1, step = 0.1),
                  selectInput("layoutBoot", "Layout", choices = c("circle", "spring"), selected = "circle")
                )
              )),
              column(width = 9, fluidRow(box(width = 12,
                div(class = "box-header-with-export",
                  h3(class = "box-title", "Bootstrap"),
                  plotExportButtons("tnaPlotBoot")
                ),
                div(jqui_resizable(plotOutput("tnaPlotBoot", width = "600px", height = "600px"),
                  options = list(ghost = TRUE, helper = "resizable-helper")
                ), align = "center")
              )))
            )
          ),
          conditionalPanel("input.inputType == 'matrix'",
            box(span(icon("circle-info", class = "text-danger"), "Bootstrap requires full data (not matrix input)"), width = 7)
          )
        ),

        # Permutation Tab (Group TNA mode only)
        tabItem(
          tabName = "permutation",
          conditionalPanel("input.inputType != 'matrix'",
            fluidRow(
              column(width = 3, fluidRow(box(title = "Permutation", width = 12,
                numericInput("iterPerm2", "Iterations:", min = 100, max = 10000, value = 1000, step = 100),
                numericInput("levelPerm2", "Level:", min = 0, max = 1, value = 0.05, step = 0.01),
                checkboxInput("pairedPerm2", "Paired", value = FALSE),
                actionButton("permutationButton", "Run Permutation", class = "btn-primary")
              ))),
              column(width = 9, fluidRow(box(width = 12,
                div(class = "box-header-with-export",
                  h3(class = "box-title", "Permutation"),
                  plotExportButtons("permutationPlot")
                ),
                div(jqui_resizable(plotOutput("permutationPlot", width = "900px", height = "600px"),
                  options = list(ghost = TRUE, helper = "resizable-helper")
                ), align = "center")
              )))
            )
          ),
          conditionalPanel("input.inputType == 'matrix'",
            box(span(icon("circle-info", class = "text-danger"), "Permutation requires full data (not matrix input)"), width = 7)
          )
        )
      )
    )
  )
}

# ============================================================================
# Server Function
# ============================================================================

server <- function(input, output, session) {
  # Initialize local storage
  folder_ids <- reactiveVal(NULL)

  observe({
    if (is.null(folder_ids())) {
      message("Initializing local storage...")
      folders <- initialize_drive_folders()
      folder_ids(folders)
      message("Storage ready: ", folders$root)
    }
  })

  # User settings
  user_settings <- reactiveVal(list(preferences = DEFAULT_PREFERENCES))

  # --------------------------------------------------------------------------
  # Analysis Reactive Values
  # --------------------------------------------------------------------------

  rv <- reactiveValues(
    original = NULL,
    data = NULL,
    tna_result = NULL,
    centrality_result = NULL,
    cliques_result = NULL,
    clique_plots = list(),
    community_result = NULL,
    bootstrap_result = NULL,
    gm_data = NULL,
    gm_group_tna = NULL,
    gm_cliques = NULL,
    gm_bootstrap = NULL,
    permutation_result = NULL
  )

  mar <- DEFAULT_MAR

  # --------------------------------------------------------------------------
  # Mode Tab Switching (TNA vs Group TNA)
  # --------------------------------------------------------------------------

  current_mode <- reactiveVal("tna")

  observeEvent(input$mode_tna, {
    current_mode("tna")
    shinyjs::runjs("$('#mode_tna').css('color', '#3c8dbc'); $('#mode_group_tna').css('color', '#999');")
    shinyjs::hide("group_input_container")
    shinyjs::runjs("$('a[data-value=\"results\"]').parent().show();")
    shinyjs::runjs("$('a[data-value=\"associations\"]').parent().show();")
    shinyjs::runjs("$('a[data-value=\"group_networks\"]').parent().show();")
    shinyjs::runjs("$('a[data-value=\"comparison\"]').parent().show();")
    shinyjs::runjs("$('a[data-value=\"cliques\"]').parent().show();")
    shinyjs::runjs("$('a[data-value=\"edgebet\"]').parent().show();")
    shinyjs::runjs("$('a[data-value=\"permutation\"]').hide();")
    shinyjs::runjs("$('a[data-value=\"permutation\"]').parent().hide();")
  })

  observeEvent(input$mode_group_tna, {
    current_mode("group_tna")
    shinyjs::runjs("$('#mode_tna').css('color', '#999'); $('#mode_group_tna').css('color', '#3c8dbc');")
    shinyjs::show("group_input_container")
    shinyjs::runjs("$('a[data-value=\"results\"]').parent().hide();")
    shinyjs::runjs("$('a[data-value=\"associations\"]').parent().hide();")
    shinyjs::runjs("$('a[data-value=\"group_networks\"]').parent().hide();")
    shinyjs::runjs("$('a[data-value=\"comparison\"]').parent().hide();")
    shinyjs::runjs("$('a[data-value=\"cliques\"]').parent().hide();")
    shinyjs::runjs("$('a[data-value=\"permutation\"]').show();")
    shinyjs::runjs("$('a[data-value=\"permutation\"]').parent().show();")
  })

  # --------------------------------------------------------------------------
  # Save/Load Handlers (Local Storage)
  # --------------------------------------------------------------------------

  load_list <- reactiveVal(data.frame())
  selected_file <- reactiveVal(NULL)

  observeEvent(input$btn_save, {
    if (is.null(rv$tna_result)) {
      showNotification("No analysis to save. Please run an analysis first.", type = "warning")
      return()
    }
    showModal(modalDialog(
      title = tagList(icon("save"), " Save Analysis"),
      textInput("save_name", "Analysis Name", placeholder = "Enter a name for your analysis"),
      textAreaInput("save_description", "Description (optional)", placeholder = "Add notes...", rows = 3),
      div(class = "save-info", icon("folder"),
        span("Your analysis will be saved to: ", folder_ids()$analyses)
      ),
      footer = tagList(
        modalButton("Cancel"),
        actionButton("do_save", "Save", class = "btn-primary", icon = icon("save"))
      )
    ))
  })

  observeEvent(input$do_save, {
    name <- trimws(input$save_name)
    if (name == "") {
      showNotification("Please enter a name", type = "error")
      return()
    }

    showNotification("Saving...", id = "save_prog", duration = NULL)

    analysis_data <- list(
      tna_result = rv$tna_result,
      centrality_result = rv$centrality_result,
      community_result = rv$community_result,
      cliques_result = rv$cliques_result,
      bootstrap_result = rv$bootstrap_result,
      original = rv$original,
      data = rv$data,
      settings = list(type = input$type, cut = input$cut, minimum = input$minimum,
                      layout = input$layout, vsize = input$vsize)
    )

    result <- save_analysis_to_drive(folder_ids(), analysis_data, name, input$save_description)
    removeNotification("save_prog")

    if (result$success) {
      showNotification(paste("Saved:", result$name), type = "message", duration = 3)
      removeModal()
    } else {
      showNotification(paste("Failed:", result$error), type = "error", duration = 5)
    }
  })

  observeEvent(input$btn_load, {
    load_list(list_analyses_from_drive(folder_ids()))
    df <- load_list()

    showModal(modalDialog(
      title = tagList(icon("folder-open"), " Load Analysis"),
      size = "l",
      if (nrow(df) == 0) {
        div(style = "text-align: center; padding: 30px; color: #999;",
          icon("folder-open", class = "fa-3x"), h4("No saved analyses")
        )
      } else {
        DTOutput("load_tbl")
      },
      footer = if (nrow(df) > 0) {
        tagList(
          actionButton("do_delete", "Delete", class = "btn-danger"),
          modalButton("Cancel"),
          actionButton("do_load", "Open", class = "btn-primary")
        )
      } else modalButton("Close")
    ))
  })

  output$load_tbl <- renderDT({
    df <- load_list()
    if (nrow(df) == 0) return(NULL)
    datatable(
      data.frame(Name = df$name, Modified = format(df$modified, "%Y-%m-%d %H:%M")),
      selection = "single", options = list(pageLength = 5, dom = 'tip'), rownames = FALSE
    )
  })

  observeEvent(input$load_tbl_rows_selected, {
    sel <- input$load_tbl_rows_selected
    if (length(sel) > 0) selected_file(load_list()[sel, ])
  })

  observeEvent(input$do_load, {
    sel <- selected_file()
    if (is.null(sel)) {
      showNotification("Select an analysis", type = "error")
      return()
    }
    data <- load_analysis_from_drive(sel$id)
    if (!is.null(data)) {
      rv$tna_result <- data$tna_result
      rv$centrality_result <- data$centrality_result
      rv$community_result <- data$community_result
      rv$cliques_result <- data$cliques_result
      rv$bootstrap_result <- data$bootstrap_result
      rv$original <- data$original_data
      rv$data <- data$processed_data
      if (!is.null(data$settings$type)) {
        updateSelectInput(session, "type", selected = data$settings$type)
      }
      showNotification(paste("Loaded:", data$meta$name), type = "message")
      removeModal()
    }
  })

  observeEvent(input$do_delete, {
    sel <- selected_file()
    if (is.null(sel)) return()
    showModal(modalDialog(
      title = "Delete?", p("Delete '", sel$name, "'?"),
      footer = tagList(
        modalButton("Cancel"),
        actionButton("confirm_del", "Delete", class = "btn-danger")
      )
    ))
  })

  observeEvent(input$confirm_del, {
    sel <- selected_file()
    if (!is.null(sel)) {
      delete_analysis_from_drive(sel$id)
      showNotification("Deleted", type = "message")
    }
    removeModal()
    click("btn_load")
  })

  observeEvent(input$btn_export, {
    if (is.null(rv$tna_result)) {
      showNotification("No analysis to export", type = "warning")
      return()
    }
    showModal(modalDialog(
      title = "Export",
      p("Use the download buttons on each plot/table to export results."),
      footer = modalButton("Close")
    ))
  })

  # --------------------------------------------------------------------------
  # Data Analysis Logic
  # --------------------------------------------------------------------------

  observeEvent(input$inputType, { rv$original <- NULL })

  observeEvent(input$analyze, {
    req(input$inputType)
    req(input$type)

    if (is.null(rv$original)) {
      showNotification("No data loaded. Please upload a file first.", type = "error")
      return()
    }

    if (input$inputType == "sequence") {
      rv$data <- rv$original
      tryCatch({
        rv$tna_result <- build_model(rv$data, type = req(input$type))
      }, error = function(e) {
        message("Sequence analysis error: ", e$message)
        showNotification(paste("Error:", e$message), type = "error", duration = 5)
      })
    } else if (input$inputType == "long") {
      tryCatch({
        whitelist <- c(".session_id", ".standardized_time", ".session_nr")
        prep_args <- list(data = rv$original)

        if (!is.null(input$longAction) && input$longAction != "") {
          prep_args$action <- input$longAction
          whitelist <- c(whitelist, input$longAction)
        }
        if (!is.null(input$longActor) && input$longActor != "") {
          prep_args$actor <- input$longActor
          whitelist <- c(whitelist, input$longActor)
        }
        if (!is.null(input$longTime) && input$longTime != "") {
          prep_args$time <- input$longTime
          whitelist <- c(whitelist, input$longTime)
        }
        if (!is.null(input$longOrder) && input$longOrder != "") {
          prep_args$order <- input$longOrder
          whitelist <- c(whitelist, input$longOrder)
        }
        if (!is.null(input$longDate) && input$longDate != "") {
          prep_args$custom_format <- input$longDate
        }
        prep_args$time_threshold <- if (!is.null(input$longThreshold) && input$longThreshold != "") input$longThreshold else Inf

        rv$data <- do.call(prepare_data, prep_args)
        rv$tna_result <- build_model(rv$data, type = req(input$type))

        meta <- rv$data$meta_data
        groupchoices <- names(meta)
        groupchoices <- groupchoices[sapply(groupchoices, \(x) !(x %in% whitelist))]
        if (length(groupchoices) > 0) {
          groupchoices <- groupchoices[sapply(groupchoices, function(col) {
            n_unique <- length(unique(meta[[col]]))
            n_unique > 1 && n_unique <= 50
          })]
        }
        if (length(groupchoices) == 0) groupchoices <- NULL
        updateSelectInput(session, "compareSelect", choices = groupchoices)
      }, error = function(e) {
        err_msg <- conditionMessage(e)
        if (is.null(err_msg) || err_msg == "") err_msg <- as.character(e)
        message("Long data analysis error: ", err_msg)
        showNotification(paste("Error:", err_msg), type = "error", duration = 5)
      })
    } else if (input$inputType == "matrix") {
      tryCatch({
        matrix_data <- as.matrix(rv$original)
        rv$data <- matrix_data
        rv$tna_result <- tna(matrix_data)
      }, error = function(e) {
        message("Matrix analysis error: ", e$message)
        showNotification(paste("Error:", e$message), type = "error", duration = 5)
      })
    } else if (input$inputType == "sample") {
      tryCatch({
        rv$data <- structure(
          list(long_data = NULL, sequence_data = rv$original,
               meta_data = data.frame(Achiever = c(rep("High", 1000), rep("Low", 1000))),
               statistics = NULL),
          class = "tna_data"
        )
        groupchoices <- names(rv$data$meta_data)
        updateSelectInput(session, "compareSelect", choices = groupchoices)
        rv$tna_result <- build_model(rv$data, type = req(input$type))
        rv$tna_result$data$Achiever <- c(rep("High", 1000), rep("Low", 1000))
      }, error = function(e) {
        message("Sample data analysis error: ", e$message)
        showNotification(paste("Error:", e$message), type = "error", duration = 5)
      })
    }

    if (is.null(rv$tna_result)) return()

    # Update slider ranges
    if ((req(input$type) == "frequency") || (req(input$type) == "co-occurrence")) {
      max_val <- max(rv$tna_result$weights)
      updateSliderInput(session, "minimum", max = max_val)
      updateSliderInput(session, "minimumCom", max = max_val)
      updateSliderInput(session, "cut", max = max_val)
      updateSliderInput(session, "cutCom", max = max_val)
    } else {
      updateSliderInput(session, "minimum", max = 1)
      updateSliderInput(session, "minimumCom", max = 1)
      updateSliderInput(session, "cut", max = 1)
      updateSliderInput(session, "cutCom", max = 1)
    }

    vsize <- 8 * exp(-1 * nrow(rv$tna_result$weights) / 80) + 1
    updateSliderInput(session, "vsize", value = vsize)
    updateSliderInput(session, "vsizeCom", value = vsize)

    # Create group model if in Group TNA mode
    if (current_mode() == "group_tna" && !is.null(input$gm_groupVar) && input$gm_groupVar != "") {
      tryCatch({
        rv$gm_group_tna <- group_model(rv$data, type = input$type, group = input$gm_groupVar)
        showNotification(paste("Group TNA created with", length(rv$gm_group_tna), "groups"), type = "message")
      }, error = function(e) {
        message("Group model error: ", e$message)
        showNotification(paste("Group model error:", e$message), type = "error")
        rv$gm_group_tna <- NULL
      })
    } else {
      rv$gm_group_tna <- NULL
    }
  })

  # Data Preview
  output$dataPreview <- renderDT({
    if (is.null(input$inputType)) return(NULL)

    if (!is.null(input$longInput) && input$inputType == "long") {
      rv$original <- import(input$longInput$datapath)
      theoptions <- c(Empty = "", names(rv$original))
      updateSelectInput(session, "longAction", choices = theoptions)
      updateSelectInput(session, "longActor", choices = theoptions)
      updateSelectInput(session, "longOrder", choices = theoptions)
      updateSelectInput(session, "longTime", choices = theoptions)
      updateSelectInput(session, "gm_groupVar", choices = theoptions)
    } else if (!is.null(input$matrixInput) && input$inputType == "matrix") {
      rv$original <- import(input$matrixInput$datapath, row.names = 1)
    } else if (!is.null(input$fileInput) && input$inputType == "sequence") {
      rv$original <- import(input$fileInput$datapath)
      theoptions <- c(Empty = "", names(rv$original))
      updateSelectInput(session, "gm_groupVar", choices = theoptions)
    } else if (input$inputType == "sample") {
      rv$original <- group_regulation
      theoptions <- c(Empty = "", names(group_regulation))
      updateSelectInput(session, "gm_groupVar", choices = theoptions)
    }

    rv$tna_result <- NULL
    rv$centrality_result <- NULL
    rv$cliques_result <- NULL
    rv$clique_plots <- list()
    rv$community_result <- NULL
    rv$bootstrap_result <- NULL

    datatable(rv$original, options = list(scrollX = TRUE))
  })

  output$summary_model <- renderPrint({ rv$tna_result })
  output$tnaModel <- renderUI({
    if (is.null(rv$tna_result)) NULL else verbatimTextOutput("summary_model")
  })

  # Transition Matrix
  output$transitionMatrix <- renderDT({
    req(rv$tna_result)
    datatable(round(rv$tna_result$weights, 3), options = list(pageLength = 10, scrollX = TRUE))
  })

  # Initial Probabilities
  output$initialProbs <- renderDT({
    req(rv$tna_result)
    inits <- rv$tna_result$inits
    if (!is.null(inits)) {
      init_probs <- data.frame(Probability = round(inits, 3))
      datatable(init_probs, options = list(pageLength = 10, scrollX = TRUE))
    }
  })

  # Summary Statistics
  output$summaryStats <- renderTable({
    req(rv$tna_result)
    summary(rv$tna_result)
  })

  # Centrality Measures
  output$centralityPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      if (current_mode() == "group_tna" && !is.null(rv$gm_group_tna)) {
        centrality_result <- centralities(rv$gm_group_tna,
          measures = input$centralitiesChoice, normalize = input$normalize, loops = input$loops)
        rv$centrality_result <- centrality_result
        plot(centrality_result, ncol = input$nColsCentralities)
      } else {
        centrality_result <- centralities(rv$tna_result,
          measures = input$centralitiesChoice, normalize = input$normalize, loops = input$loops)
        rv$centrality_result <- centrality_result
        plot(centrality_result, ncol = input$nColsCentralities)
      }
    }, error = function(e) showNotification("Error plotting centralities", type = "error"))
  }, res = 100)

  output$centralityPrint <- renderTable({
    req(rv$centrality_result)
    data.frame(rv$centrality_result)
  })

  # TNA Plot
  output$tnaPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      if (current_mode() == "group_tna" && !is.null(rv$gm_group_tna)) {
        n_groups <- length(rv$gm_group_tna)
        par(mfrow = c(1, n_groups))
        group_names <- names(rv$gm_group_tna)
        for (i in seq_along(rv$gm_group_tna)) {
          plot(rv$gm_group_tna[[i]], title = group_names[i], cut = input$cut, minimum = input$minimum,
               label.cex = input$node.label, edge.label.cex = input$edge.label, vsize = input$vsize,
               layout = input$layout, mar = mar)
        }
      } else {
        plot(rv$tna_result, cut = input$cut, minimum = input$minimum, label.cex = input$node.label,
             edge.label.cex = input$edge.label, vsize = input$vsize, layout = input$layout, mar = mar)
      }
    }, error = function(e) showNotification("Error plotting TNA", type = "error"))
  }, res = 600)

  # Sequence Plot
  output$seqPlot <- renderPlot({
    req(rv$tna_result, rv$data)
    req(input$inputType != "matrix")
    tryCatch({
      args <- list(x = rv$data, type = input$seqPlotType, include_na = input$seqIncludeNA,
                   show_n = input$seqShowN, tick = input$seqTick, ncol = input$seqNcol, xlab = input$seqXlab)
      if (input$seqPlotType == "distribution") {
        args$scale <- input$seqScale
        args$geom <- input$seqGeom
      }
      if (!is.null(input$seqTitle) && input$seqTitle != "") args$title <- input$seqTitle
      if (!is.null(input$seqYlab) && input$seqYlab != "") args$ylab <- input$seqYlab
      if (current_mode() == "group_tna" && !is.null(input$gm_groupVar) && input$gm_groupVar != "") {
        args$group <- input$gm_groupVar
      } else if (!is.null(input$seqGroup) && input$seqGroup != "" && input$seqGroup != "None") {
        args$group <- input$seqGroup
      }
      do.call(plot_sequences, args)
    }, error = function(e) {
      message("Sequence plot error: ", e$message)
      showNotification(paste("Error plotting sequences:", e$message), type = "error")
    })
  }, res = 100)

  observeEvent(rv$data, {
    if (!is.null(rv$data) && !is.null(rv$data$meta_data)) {
      choices <- c("None" = "", names(rv$data$meta_data))
      updateSelectInput(session, "seqGroup", choices = choices)
    } else {
      updateSelectInput(session, "seqGroup", choices = c("None" = ""))
    }
  })

  # Frequencies Plot
  output$freqPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      if (current_mode() == "group_tna" && !is.null(rv$gm_group_tna)) {
        plot_frequencies(rv$gm_group_tna, width = input$freqWidth, hjust = input$freqHjust, show_label = input$freqShowLabel)
      } else {
        plot_frequencies(rv$tna_result, width = input$freqWidth, hjust = input$freqHjust, show_label = input$freqShowLabel)
      }
    }, error = function(e) {
      message("Frequency plot error: ", e$message)
      showNotification(paste("Error plotting frequencies:", e$message), type = "error")
    })
  }, res = 100)

  # Associations Plot
  output$assocPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      plot_associations(rv$tna_result, cut = input$assocCut, minimum = input$assocMinimum,
                        label.cex = input$assocNodeLabel, edge.label.cex = input$assocEdgeLabel,
                        vsize = input$assocVsize, layout = input$assocLayout, mar = mar)
    }, error = function(e) {
      message("Association plot error: ", e$message)
      showNotification(paste("Error plotting associations:", e$message), type = "error")
    })
  }, res = 600)

  # Edge Betweenness Plot
  output$edgeBetPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      if (current_mode() == "group_tna" && !is.null(rv$gm_group_tna)) {
        n_groups <- length(rv$gm_group_tna)
        par(mfrow = c(1, n_groups))
        group_names <- names(rv$gm_group_tna)
        for (i in seq_along(rv$gm_group_tna)) {
          ebet <- betweenness_network(rv$gm_group_tna[[i]])
          plot(ebet, title = group_names[i], cut = input$cutEbet, minimum = input$minimumEbet,
               label.cex = input$node.labelEbet, edge.label.cex = input$edge.labelEbet,
               vsize = input$vsizeEbet, layout = input$layoutEbet, mar = mar)
        }
      } else {
        plot(betweenness_network(rv$tna_result), cut = input$cutEbet, minimum = input$minimumEbet,
             label.cex = input$node.labelEbet, edge.label.cex = input$edge.labelEbet,
             vsize = input$vsizeEbet, layout = input$layoutEbet, mar = mar)
      }
    }, error = function(e) showNotification("Error plotting edge betweenness", type = "error"))
  }, res = 600)

  # Community Plot
  output$communityPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      if (current_mode() == "group_tna" && !is.null(rv$gm_group_tna)) {
        n_groups <- length(rv$gm_group_tna)
        par(mfrow = c(1, n_groups))
        group_names <- names(rv$gm_group_tna)
        for (i in seq_along(rv$gm_group_tna)) {
          comm <- tna::communities(rv$gm_group_tna[[i]], gamma = input$gamma)
          plot(comm, method = input$communityAlgorithm, title = group_names[i], cut = input$cutCom,
               minimum = input$minimumCom, label.cex = input$node.labelCom, edge.label.cex = input$edge.labelCom,
               vsize = input$vsizeCom, layout = input$layoutCom, mar = mar)
        }
      } else {
        rv$community_result <- tna::communities(rv$tna_result, gamma = input$gamma)
        algorithm_choices <- sapply(names(rv$community_result$counts), function(alg) {
          paste0(alg, " (", rv$community_result$counts[[alg]], " communities)")
        })
        choices <- names(algorithm_choices)
        names(choices) <- paste0(names(rv$community_result$counts), " (", rv$community_result$counts, ")")
        updateSelectInput(session, "communityAlgorithm", choices = choices, selected = input$communityAlgorithm)
        plot(rv$community_result, method = input$communityAlgorithm, mar = mar, cut = input$cutCom,
             minimum = input$minimumCom, label.cex = input$node.labelCom, edge.label.cex = input$edge.labelCom,
             vsize = input$vsizeCom, layout = input$layoutCom)
      }
    }, error = function(e) showNotification("Error plotting communities", type = "error"))
  }, res = 600)

  # Clique Finding
  observeEvent(input$findCliques, {
    req(rv$tna_result)
    req(input$cliqueSize)
    req(input$cliqueThreshold)

    if (current_mode() == "group_tna" && !is.null(rv$gm_group_tna)) {
      rv$cliques_result <- tna::cliques(rv$gm_group_tna, size = input$cliqueSize,
                                         threshold = input$cliqueThreshold, n = 1000)
    } else {
      rv$cliques_result <- tna::cliques(rv$tna_result, size = input$cliqueSize,
                                         threshold = input$cliqueThreshold, n = 1000)
    }

    if (length(rv$cliques_result$inits) > 0) {
      choices <- seq_along(rv$cliques_result$inits)
      names(choices) <- lapply(rv$cliques_result$inits, \(x) names(x) |> paste(collapse = " - "))
      names(choices) <- paste0("Clique ", choices, ": ", names(choices))
      updateSelectInput(session, "cliqueSelect", choices = choices, selected = 1)
    } else {
      updateSelectInput(session, "cliqueSelect", selected = NULL, choices = NULL)
    }
  })

  output$cliquesPlot <- renderPlot({
    req(rv$cliques_result)
    if (is.null(input$cliqueSelect) || input$cliqueSelect == "") return(NULL)
    tryCatch({
      plot(rv$cliques_result, first = as.integer(input$cliqueSelect), n = 1, ask = FALSE,
           cut = input$cutClique, minimum = input$minimumClique, label.cex = input$node.labelClique,
           edge.label.cex = input$edge.labelClique, vsize = input$vsizeClique, layout = input$layoutClique, mar = mar)
    }, error = function(e) showNotification("Error plotting cliques", type = "error"))
  }, res = 600)

  # Comparison
  observeEvent(input$compareSelect, {
    if (is.null(rv$data$meta_data)) return()
    choices <- unique(data.frame(rv$data$meta_data)[, input$compareSelect])
    updateSelectInput(session, "group1", choices = choices,
                      selected = if (!is.null(choices) && length(choices) > 0) choices[1] else rlang::missing_arg())
    updateSelectInput(session, "group2", choices = choices,
                      selected = if (!is.null(choices) && length(choices) > 1) choices[2] else rlang::missing_arg())
  })

  output$comparisonPlot <- renderPlot({
    req(rv$data)
    tryCatch({
      group_tnad <- group_model(req(rv$data), type = req(input$type), group = req(input$compareSelect))
      if (input$compare_sig) {
        differentrows <- nrow(group_tnad[[req(input$group1)]]$data) != nrow(group_tnad[[req(input$group2)]]$data)
        permtest <- permutation_test(group_tnad[[req(input$group1)]], group_tnad[[req(input$group2)]],
                                     iter = input$iterPerm, paired = if (differentrows) FALSE else input$pairedPerm, level = input$levelPerm)
        if (differentrows && input$pairedPerm) {
          showNotification("Paired test cannot be applied - groups have different sizes", type = "warning")
        }
        plot(permtest, cut = input$cutGroup, minimum = input$minimumGroup, label.cex = input$node.labelGroup,
             edge.label.cex = input$edge.labelGroup, vsize = input$vsizeGroup, layout = input$layoutGroup, mar = mar)
      } else {
        plot_compare(group_tnad[[req(input$group1)]], group_tnad[[req(input$group2)]],
                     cut = input$cutGroup, minimum = input$minimumGroup, label.cex = input$node.labelGroup,
                     edge.label.cex = input$edge.labelGroup, vsize = input$vsizeGroup, layout = input$layoutGroup,
                     posCol = "darkblue", negCol = "red", mar = mar)
      }
    }, error = function(e) showNotification("Error in comparison", type = "error"))
  }, res = 600)

  output$mosaicPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      group_tnad <- group_model(req(rv$data), type = req(input$type), group = req(input$compareSelect))
      plot_mosaic(group_tnad)
    }, error = function(e) showNotification("Error plotting mosaic", type = "error"))
  }, res = 100)

  output$groupCentralitiesPlot <- renderPlot({
    req(rv$tna_result)
    tryCatch({
      group_tnad <- group_model(req(rv$data), type = req(input$type), group = req(input$compareSelect))
      plot(centralities(group_tnad, measures = input$centralitiesChoiceGroup,
                        normalize = input$normalizeGroup, loops = input$loopsGroup), ncol = input$nColsCentralitiesGroup)
    }, error = function(e) showNotification("Error plotting group centralities", type = "error"))
  }, res = 100)

  # Group Networks
  observeEvent(rv$data, {
    if (!is.null(rv$data) && !is.null(rv$data$meta_data)) {
      meta <- rv$data$meta_data
      choices <- names(meta)
      choices <- choices[!grepl("^\\.session|^\\.standardized|^\\.session_nr", choices)]
      if (length(choices) > 0) {
        choices <- choices[sapply(choices, function(col) {
          n_unique <- length(unique(meta[[col]]))
          n_unique > 1 && n_unique <= 50
        })]
      }
      if (length(choices) > 0) {
        updateSelectInput(session, "groupNetSelect", choices = choices)
      } else {
        updateSelectInput(session, "groupNetSelect", choices = c("No suitable grouping variables" = ""))
      }
    } else {
      updateSelectInput(session, "groupNetSelect", choices = NULL)
    }
  })

  output$groupNetPlot <- renderPlot({
    req(rv$tna_result, rv$data, input$groupNetSelect)
    req(input$groupNetSelect != "")
    tryCatch({
      group_tnad <- group_model(rv$data, type = input$type, group = input$groupNetSelect)
      n_groups <- length(group_tnad)
      ncol <- input$groupNetNcol %||% 2
      nrow <- input$groupNetNrow %||% ceiling(n_groups / ncol)
      par(mfrow = c(nrow, ncol))
      group_names <- names(group_tnad)
      for (i in seq_along(group_tnad)) {
        plot(group_tnad[[i]], title = group_names[i], cut = input$groupNetCut, minimum = input$groupNetMinimum,
             label.cex = input$groupNetNodeLabel, edge.label.cex = input$groupNetEdgeLabel,
             vsize = input$groupNetVsize, layout = input$groupNetLayout, mar = mar)
      }
    }, error = function(e) {
      message("Group network plot error: ", e$message)
      showNotification(paste("Error plotting group networks:", e$message), type = "error")
    })
  }, res = 150)

  # Bootstrap
  observeEvent(input$bootstrapButton, {
    is_group_mode <- current_mode() == "group_tna"

    tryCatch({
      if (is_group_mode) {
        if (is.null(rv$gm_group_tna)) {
          showNotification("Please run 'Analyze' first in Group TNA mode.", type = "error")
          return()
        }
        showNotification("Running group bootstrap...", id = "boot_prog", duration = NULL)
        rv$gm_bootstrap <- tna::bootstrap(rv$gm_group_tna, iter = input$iterBoot, level = input$levelBoot,
                                          method = input$methodBoot, threshold = input$thresBoot,
                                          consistency_range = sort(c(input$constLowerBoot, input$constUpperBoot)))
        rv$bootstrap_result <- NULL
        removeNotification("boot_prog")
        showNotification("Group bootstrap completed!", type = "message")
      } else {
        if (is.null(rv$tna_result)) {
          showNotification("Please load data and run 'Analyze' first.", type = "error")
          return()
        }
        showNotification("Running bootstrap...", id = "boot_prog", duration = NULL)
        boot <- tna::bootstrap(rv$tna_result, iter = input$iterBoot, level = input$levelBoot,
                               method = input$methodBoot, threshold = input$thresBoot,
                               consistency_range = sort(c(input$constLowerBoot, input$constUpperBoot)))
        rv$bootstrap_result <- prune(rv$tna_result, method = "bootstrap", boot = boot)
        rv$gm_bootstrap <- NULL
        removeNotification("boot_prog")
        showNotification("Bootstrap completed!", type = "message")
      }
    }, error = function(e) {
      removeNotification("boot_prog")
      showNotification(paste("Error in bootstrap:", e$message), type = "error")
    })
  })

  output$tnaPlotBoot <- renderPlot({
    tryCatch({
      if (current_mode() == "group_tna" && !is.null(rv$gm_bootstrap)) {
        n <- length(rv$gm_bootstrap)
        if (n <= 4) par(mfrow = c(2, 2))
        else if (n <= 6) par(mfrow = c(2, 3))
        else { ncol <- ceiling(sqrt(n)); nrow <- ceiling(n / ncol); par(mfrow = c(nrow, ncol)) }
        plot(rv$gm_bootstrap)
      } else {
        req(rv$bootstrap_result)
        plot(rv$bootstrap_result, cut = input$cutBoot, minimum = input$minimumBoot,
             label.cex = input$node.labelBoot, edge.label.cex = input$edge.labelBoot,
             vsize = input$vsizeBoot, layout = input$layoutBoot, mar = mar)
      }
    }, error = function(e) {
      message("Error plotting bootstrap: ", e$message)
      showNotification(paste("Error plotting:", e$message), type = "error")
    })
  }, res = 600)

  # Permutation Test
  observeEvent(input$permutationButton, {
    if (is.null(rv$gm_group_tna)) {
      showNotification("Please run 'Analyze' first in Group TNA mode.", type = "error")
      return()
    }
    tryCatch({
      showNotification("Running permutation test...", id = "perm_prog", duration = NULL)
      rv$permutation_result <- tna::permutation_test(x = rv$gm_group_tna,
        iter = input$iterPerm2 %||% 1000, paired = input$pairedPerm2 %||% FALSE, level = input$levelPerm2 %||% 0.05)
      removeNotification("perm_prog")
      showNotification("Permutation test completed!", type = "message")
    }, error = function(e) {
      removeNotification("perm_prog")
      showNotification(paste("Error in permutation test:", e$message), type = "error")
    })
  })

  output$permutationPlot <- renderPlot({
    req(rv$permutation_result)
    tryCatch({
      n <- length(rv$permutation_result)
      if (n <= 4) par(mfrow = c(2, 2))
      else if (n <= 6) par(mfrow = c(2, 3))
      else { ncol <- ceiling(sqrt(n)); nrow <- ceiling(n / ncol); par(mfrow = c(nrow, ncol)) }
      plot(rv$permutation_result)
    }, error = function(e) showNotification(paste("Error plotting permutation:", e$message), type = "error"))
  }, res = 600)

  # --------------------------------------------------------------------------
  # Export Download Handlers
  # --------------------------------------------------------------------------

  output$summaryStats_csv <- tableDownloadCSV(function() {
    if (!is.null(rv$tna_result)) as.data.frame(summary(rv$tna_result)) else NULL
  }, "summary_stats")
  output$summaryStats_xlsx <- tableDownloadXLSX(function() {
    if (!is.null(rv$tna_result)) as.data.frame(summary(rv$tna_result)) else NULL
  }, "summary_stats")

  output$initialProbs_csv <- tableDownloadCSV(function() {
    if (!is.null(rv$tna_result) && !is.null(rv$tna_result$inits)) {
      data.frame(State = names(rv$tna_result$inits), Probability = round(rv$tna_result$inits, 3))
    } else NULL
  }, "initial_probs")
  output$initialProbs_xlsx <- tableDownloadXLSX(function() {
    if (!is.null(rv$tna_result) && !is.null(rv$tna_result$inits)) {
      data.frame(State = names(rv$tna_result$inits), Probability = round(rv$tna_result$inits, 3))
    } else NULL
  }, "initial_probs")

  output$transitionMatrix_csv <- tableDownloadCSV(function() {
    if (!is.null(rv$tna_result)) round(rv$tna_result$weights, 3) else NULL
  }, "transition_matrix")
  output$transitionMatrix_xlsx <- tableDownloadXLSX(function() {
    if (!is.null(rv$tna_result)) round(rv$tna_result$weights, 3) else NULL
  }, "transition_matrix")

  output$centralityPrint_csv <- tableDownloadCSV(function() { rv$centrality_result }, "centrality_measures")
  output$centralityPrint_xlsx <- tableDownloadXLSX(function() { rv$centrality_result }, "centrality_measures")

  # Plot exports
  output$tnaPlot_png <- plotDownloadPNG(function() {
    req(rv$tna_result)
    plot(rv$tna_result, cut = input$cut, minimum = input$minimum, label.cex = input$node.label,
         edge.label.cex = input$edge.label, vsize = input$vsize, layout = input$layout, mar = DEFAULT_MAR)
  }, "tna_network", 1200, 1000)
  output$tnaPlot_pdf <- plotDownloadPDF(function() {
    req(rv$tna_result)
    plot(rv$tna_result, cut = input$cut, minimum = input$minimum, label.cex = input$node.label,
         edge.label.cex = input$edge.label, vsize = input$vsize, layout = input$layout, mar = DEFAULT_MAR)
  }, "tna_network", 10, 8)

  output$seqPlot_png <- plotDownloadPNG(function() {
    req(rv$data)
    args <- list(x = rv$data, type = input$seqPlotType, include_na = input$seqIncludeNA,
                 show_n = input$seqShowN, tick = input$seqTick, ncol = input$seqNcol, xlab = input$seqXlab)
    if (input$seqPlotType == "distribution") { args$scale <- input$seqScale; args$geom <- input$seqGeom }
    if (!is.null(input$seqTitle) && input$seqTitle != "") args$title <- input$seqTitle
    if (!is.null(input$seqYlab) && input$seqYlab != "") args$ylab <- input$seqYlab
    if (!is.null(input$seqGroup) && input$seqGroup != "" && input$seqGroup != "None") args$group <- input$seqGroup
    do.call(plot_sequences, args)
  }, "sequence_plot", 1600, 1200)
  output$seqPlot_pdf <- plotDownloadPDF(function() {
    req(rv$data)
    args <- list(x = rv$data, type = input$seqPlotType, include_na = input$seqIncludeNA,
                 show_n = input$seqShowN, tick = input$seqTick, ncol = input$seqNcol, xlab = input$seqXlab)
    if (input$seqPlotType == "distribution") { args$scale <- input$seqScale; args$geom <- input$seqGeom }
    if (!is.null(input$seqTitle) && input$seqTitle != "") args$title <- input$seqTitle
    if (!is.null(input$seqYlab) && input$seqYlab != "") args$ylab <- input$seqYlab
    if (!is.null(input$seqGroup) && input$seqGroup != "" && input$seqGroup != "None") args$group <- input$seqGroup
    do.call(plot_sequences, args)
  }, "sequence_plot", 12, 10)

  output$freqPlot_png <- plotDownloadPNG(function() {
    req(rv$tna_result)
    plot_frequencies(rv$tna_result, width = input$freqWidth, hjust = input$freqHjust, show_label = input$freqShowLabel)
  }, "frequencies_plot", 1400, 1000)
  output$freqPlot_pdf <- plotDownloadPDF(function() {
    req(rv$tna_result)
    plot_frequencies(rv$tna_result, width = input$freqWidth, hjust = input$freqHjust, show_label = input$freqShowLabel)
  }, "frequencies_plot", 10, 8)

  output$assocPlot_png <- plotDownloadPNG(function() {
    req(rv$tna_result)
    plot_associations(rv$tna_result, cut = input$assocCut, minimum = input$assocMinimum,
                      label.cex = input$assocNodeLabel, edge.label.cex = input$assocEdgeLabel,
                      vsize = input$assocVsize, layout = input$assocLayout, mar = DEFAULT_MAR)
  }, "associations_plot", 1200, 1000)
  output$assocPlot_pdf <- plotDownloadPDF(function() {
    req(rv$tna_result)
    plot_associations(rv$tna_result, cut = input$assocCut, minimum = input$assocMinimum,
                      label.cex = input$assocNodeLabel, edge.label.cex = input$assocEdgeLabel,
                      vsize = input$assocVsize, layout = input$assocLayout, mar = DEFAULT_MAR)
  }, "associations_plot", 10, 8)

  output$centralityPlot_png <- plotDownloadPNG(function() {
    req(rv$centrality_result)
    plot(rv$centrality_result, ncol = input$nColsCentralities)
  }, "centrality_plot", 1600, 1200)
  output$centralityPlot_pdf <- plotDownloadPDF(function() {
    req(rv$centrality_result)
    plot(rv$centrality_result, ncol = input$nColsCentralities)
  }, "centrality_plot", 12, 10)

  output$communityPlot_png <- plotDownloadPNG(function() {
    req(rv$community_result)
    plot(rv$community_result, cut = input$cutCom, minimum = input$minimumCom,
         label.cex = input$node.labelCom, edge.label.cex = input$edge.labelCom,
         vsize = input$vsizeCom, layout = input$layoutCom, mar = DEFAULT_MAR)
  }, "community_plot", 1200, 1000)
  output$communityPlot_pdf <- plotDownloadPDF(function() {
    req(rv$community_result)
    plot(rv$community_result, cut = input$cutCom, minimum = input$minimumCom,
         label.cex = input$node.labelCom, edge.label.cex = input$edge.labelCom,
         vsize = input$vsizeCom, layout = input$layoutCom, mar = DEFAULT_MAR)
  }, "community_plot", 10, 8)

  output$edgeBetPlot_png <- plotDownloadPNG(function() {
    req(rv$tna_result)
    plot(betweenness_network(rv$tna_result), cut = input$cutEbet, minimum = input$minimumEbet,
         label.cex = input$node.labelEbet, edge.label.cex = input$edge.labelEbet,
         vsize = input$vsizeEbet, layout = input$layoutEbet, mar = DEFAULT_MAR)
  }, "edge_betweenness", 1200, 1000)
  output$edgeBetPlot_pdf <- plotDownloadPDF(function() {
    req(rv$tna_result)
    plot(betweenness_network(rv$tna_result), cut = input$cutEbet, minimum = input$minimumEbet,
         label.cex = input$node.labelEbet, edge.label.cex = input$edge.labelEbet,
         vsize = input$vsizeEbet, layout = input$layoutEbet, mar = DEFAULT_MAR)
  }, "edge_betweenness", 10, 8)

  output$cliquesPlot_png <- plotDownloadPNG(function() {
    req(rv$cliques_result, input$cliqueSelect)
    if (input$cliqueSelect == "") return()
    plot(rv$cliques_result, first = as.integer(input$cliqueSelect), n = 1, ask = FALSE,
         cut = input$cutClique, minimum = input$minimumClique, label.cex = input$node.labelClique,
         edge.label.cex = input$edge.labelClique, vsize = input$vsizeClique, layout = input$layoutClique, mar = DEFAULT_MAR)
  }, "cliques_plot", 1200, 1000)
  output$cliquesPlot_pdf <- plotDownloadPDF(function() {
    req(rv$cliques_result, input$cliqueSelect)
    if (input$cliqueSelect == "") return()
    plot(rv$cliques_result, first = as.integer(input$cliqueSelect), n = 1, ask = FALSE,
         cut = input$cutClique, minimum = input$minimumClique, label.cex = input$node.labelClique,
         edge.label.cex = input$edge.labelClique, vsize = input$vsizeClique, layout = input$layoutClique, mar = DEFAULT_MAR)
  }, "cliques_plot", 10, 8)

  output$comparisonPlot_png <- plotDownloadPNG(function() {
    req(rv$data, input$type, input$compareSelect, input$group1, input$group2)
    group_tnad <- group_model(rv$data, type = input$type, group = input$compareSelect)
    if (input$compare_sig) {
      permtest <- permutation_test(group_tnad[[input$group1]], group_tnad[[input$group2]],
                                   iter = input$iterPerm, paired = input$pairedPerm, level = input$levelPerm)
      plot(permtest, cut = input$cutGroup, minimum = input$minimumGroup, label.cex = input$node.labelGroup,
           edge.label.cex = input$edge.labelGroup, vsize = input$vsizeGroup, layout = input$layoutGroup, mar = DEFAULT_MAR)
    } else {
      plot_compare(group_tnad[[input$group1]], group_tnad[[input$group2]],
                   cut = input$cutGroup, minimum = input$minimumGroup, label.cex = input$node.labelGroup,
                   edge.label.cex = input$edge.labelGroup, vsize = input$vsizeGroup, layout = input$layoutGroup,
                   posCol = "darkblue", negCol = "red", mar = DEFAULT_MAR)
    }
  }, "comparison_plot", 1200, 1000)
  output$comparisonPlot_pdf <- plotDownloadPDF(function() {
    req(rv$data, input$type, input$compareSelect, input$group1, input$group2)
    group_tnad <- group_model(rv$data, type = input$type, group = input$compareSelect)
    if (input$compare_sig) {
      permtest <- permutation_test(group_tnad[[input$group1]], group_tnad[[input$group2]],
                                   iter = input$iterPerm, paired = input$pairedPerm, level = input$levelPerm)
      plot(permtest, cut = input$cutGroup, minimum = input$minimumGroup, label.cex = input$node.labelGroup,
           edge.label.cex = input$edge.labelGroup, vsize = input$vsizeGroup, layout = input$layoutGroup, mar = DEFAULT_MAR)
    } else {
      plot_compare(group_tnad[[input$group1]], group_tnad[[input$group2]],
                   cut = input$cutGroup, minimum = input$minimumGroup, label.cex = input$node.labelGroup,
                   edge.label.cex = input$edge.labelGroup, vsize = input$vsizeGroup, layout = input$layoutGroup,
                   posCol = "darkblue", negCol = "red", mar = DEFAULT_MAR)
    }
  }, "comparison_plot", 10, 8)

  output$mosaicPlot_png <- plotDownloadPNG(function() {
    req(rv$data, rv$tna_result, input$type, input$compareSelect)
    group_tnad <- group_model(rv$data, type = input$type, group = input$compareSelect)
    plot_mosaic(group_tnad)
  }, "mosaic_plot", 2000, 1400)
  output$mosaicPlot_pdf <- plotDownloadPDF(function() {
    req(rv$data, rv$tna_result, input$type, input$compareSelect)
    group_tnad <- group_model(rv$data, type = input$type, group = input$compareSelect)
    plot_mosaic(group_tnad)
  }, "mosaic_plot", 14, 10)

  output$groupCentralitiesPlot_png <- plotDownloadPNG(function() {
    req(rv$data, rv$tna_result, input$type, input$compareSelect)
    group_tnad <- group_model(rv$data, type = input$type, group = input$compareSelect)
    plot(centralities(group_tnad, measures = input$centralitiesChoiceGroup,
                      normalize = input$normalizeGroup, loops = input$loopsGroup), ncol = input$nColsCentralitiesGroup)
  }, "group_centralities", 1600, 1200)
  output$groupCentralitiesPlot_pdf <- plotDownloadPDF(function() {
    req(rv$data, rv$tna_result, input$type, input$compareSelect)
    group_tnad <- group_model(rv$data, type = input$type, group = input$compareSelect)
    plot(centralities(group_tnad, measures = input$centralitiesChoiceGroup,
                      normalize = input$normalizeGroup, loops = input$loopsGroup), ncol = input$nColsCentralitiesGroup)
  }, "group_centralities", 12, 10)

  output$groupNetPlot_png <- plotDownloadPNG(function() {
    req(rv$data, rv$tna_result, input$type, input$groupNetSelect)
    group_tnad <- group_model(rv$data, type = input$type, group = input$groupNetSelect)
    n_groups <- length(group_tnad)
    ncol <- input$groupNetNcol %||% 2
    nrow <- input$groupNetNrow %||% ceiling(n_groups / ncol)
    par(mfrow = c(nrow, ncol))
    group_names <- names(group_tnad)
    for (i in seq_along(group_tnad)) {
      plot(group_tnad[[i]], title = group_names[i], cut = input$groupNetCut, minimum = input$groupNetMinimum,
           label.cex = input$groupNetNodeLabel, edge.label.cex = input$groupNetEdgeLabel,
           vsize = input$groupNetVsize, layout = input$groupNetLayout, mar = DEFAULT_MAR)
    }
  }, "group_networks", 1600, 1000)
  output$groupNetPlot_pdf <- plotDownloadPDF(function() {
    req(rv$data, rv$tna_result, input$type, input$groupNetSelect)
    group_tnad <- group_model(rv$data, type = input$type, group = input$groupNetSelect)
    n_groups <- length(group_tnad)
    ncol <- input$groupNetNcol %||% 2
    nrow <- input$groupNetNrow %||% ceiling(n_groups / ncol)
    par(mfrow = c(nrow, ncol))
    group_names <- names(group_tnad)
    for (i in seq_along(group_tnad)) {
      plot(group_tnad[[i]], title = group_names[i], cut = input$groupNetCut, minimum = input$groupNetMinimum,
           label.cex = input$groupNetNodeLabel, edge.label.cex = input$groupNetEdgeLabel,
           vsize = input$groupNetVsize, layout = input$groupNetLayout, mar = DEFAULT_MAR)
    }
  }, "group_networks", 14, 10)

  output$tnaPlotBoot_png <- plotDownloadPNG(function() {
    req(rv$bootstrap_result)
    plot(rv$bootstrap_result, cut = input$cutBoot, minimum = input$minimumBoot,
         label.cex = input$node.labelBoot, edge.label.cex = input$edge.labelBoot,
         vsize = input$vsizeBoot, layout = input$layoutBoot, mar = DEFAULT_MAR)
  }, "bootstrap_validation", 1200, 1000)
  output$tnaPlotBoot_pdf <- plotDownloadPDF(function() {
    req(rv$bootstrap_result)
    plot(rv$bootstrap_result, cut = input$cutBoot, minimum = input$minimumBoot,
         label.cex = input$node.labelBoot, edge.label.cex = input$edge.labelBoot,
         vsize = input$vsizeBoot, layout = input$layoutBoot, mar = DEFAULT_MAR)
  }, "bootstrap_validation", 10, 8)

  output$permutationPlot_png <- plotDownloadPNG(function() {
    req(rv$permutation_result)
    n <- length(rv$permutation_result)
    if (n <= 4) par(mfrow = c(2, 2))
    else if (n <= 6) par(mfrow = c(2, 3))
    else { ncol <- ceiling(sqrt(n)); nrow <- ceiling(n / ncol); par(mfrow = c(nrow, ncol)) }
    plot(rv$permutation_result)
  }, "permutation_test", 1200, 1000)
  output$permutationPlot_pdf <- plotDownloadPDF(function() {
    req(rv$permutation_result)
    n <- length(rv$permutation_result)
    if (n <= 4) par(mfrow = c(2, 2))
    else if (n <= 6) par(mfrow = c(2, 3))
    else { ncol <- ceiling(sqrt(n)); nrow <- ceiling(n / ncol); par(mfrow = c(nrow, ncol)) }
    plot(rv$permutation_result)
  }, "permutation_test", 10, 8)

  # Clean shutdown
  session$onSessionEnded(function() {
    message("Session ended")
    stopApp()
  })
}
