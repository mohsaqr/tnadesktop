/**
 * Data Import Wizard — modal-based 3-step wizard for loading and configuring data.
 * Step 1: Data Source (upload, sample, generate)
 * Step 2: Configure (format tabs + column mapping + data preview)
 * Step 3: Model & Analyze (data summary + model settings + analyze)
 */
import { state, render, showLoading, hideLoading, importOnehot, defaultNetworkSettings } from '../main';
import { clearLayoutCache } from './network';
import { parseFile, wideToSequences, longToSequences, guessColumns, guessEdgeListColumns, edgeListToMatrix } from '../data';
import { clearGroupAnalysisData, updateSubTabStates } from './dashboard';
import { buildColumnGroups } from './clustering';
import { erdosRenyi, barabasiAlbert, wattsStrogatz, stochasticBlockModel, matrixToEdgeRows } from '../analysis/random-networks';
import type { GeneratorResult } from '../analysis/random-networks';
import { simulateLongData, simulateOnehotData } from '../analysis/simulate';
import sampleCsv from '../sample-data.csv?raw';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Detect binary columns (all values 0 or 1) from raw data.
 * Excludes columns whose headers look like metadata (id, actor, group, time, etc.).
 */
function detectBinaryCols(headers: string[], rawData: string[][]): number[] {
  const metaPattern = /^(id|actor|group|course|time|date|timestamp|session|achiever|user|name|student|subject|seq)$/i;
  const binaryCols: number[] = [];
  const sample = rawData.slice(0, 50);
  for (let c = 0; c < headers.length; c++) {
    if (metaPattern.test(headers[c]!.trim())) continue;
    const allBinary = sample.every(row => {
      const v = (row[c] ?? '').trim();
      return v === '0' || v === '1' || v === '';
    });
    if (allBinary) binaryCols.push(c);
  }
  return binaryCols;
}

/**
 * Enhanced format detection: checks for binary columns in addition to wide/long.
 */
function detectBestFormat(headers: string[], rawData: string[][]): 'wide' | 'long' | 'onehot' {
  const binaryCols = detectBinaryCols(headers, rawData);
  if (binaryCols.length >= 3 && binaryCols.length >= headers.length * 0.5) {
    return 'onehot';
  }
  if (headers.length <= 5) return 'long';
  if (headers.length >= 6) {
    const sample = rawData.slice(0, 50);
    const allVals = new Set<string>();
    for (const row of sample) {
      for (const cell of row) {
        if (cell.trim()) allVals.add(cell.trim());
      }
    }
    if (allVals.size < headers.length * 2) return 'wide';
  }
  return 'long';
}

// ═══════════════════════════════════════════════════════════
//  Wizard State
// ═══════════════════════════════════════════════════════════
let wizardOverlay: HTMLElement | null = null;
let wizardStep = 1;
let wizardGoTo: ((step: number) => void) | null = null;

// Wizard-local pre-built data (stored at Step 2→3 transition, committed in commitAndAnalyze)
let wizardSequenceData: any = null;
let wizardGroupLabels: string[] | null = null;
let wizardUniqueStates: string[] = [];
let wizardSequenceCount = 0;
let wizardModelTypeLocked = false;
let wizardIsEdgeList = false;
let wizardEdgeListNodeCount = 0;
let wizardGroupAnalysis = false;

function clearWizardData() {
  wizardSequenceData = null;
  wizardGroupLabels = null;
  wizardUniqueStates = [];
  wizardSequenceCount = 0;
  wizardModelTypeLocked = false;
  wizardIsEdgeList = false;
  wizardEdgeListNodeCount = 0;
  wizardGroupAnalysis = false;
}

/** Close the data wizard modal if open. */
export function closeDataWizard() {
  if (wizardOverlay) {
    wizardOverlay.remove();
    wizardOverlay = null;
  }
  wizardGoTo = null;
  clearWizardData();
}

/** Open the data wizard modal. Starts at Step 2 if data is already loaded. */
export function showDataWizard() {
  closeDataWizard();

  const hasData = state.rawData.length > 0;
  wizardStep = hasData ? 2 : 1;

  // ─── Modal structure ───
  wizardOverlay = document.createElement('div');
  wizardOverlay.className = 'modal-overlay';
  wizardOverlay.id = 'wizard-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal wizard-modal';

  const stepsBar = document.createElement('div');
  stepsBar.className = 'wizard-steps';

  const body = document.createElement('div');
  body.className = 'wizard-body';

  const footer = document.createElement('div');
  footer.className = 'wizard-footer';

  modal.appendChild(stepsBar);
  modal.appendChild(body);
  modal.appendChild(footer);
  wizardOverlay.appendChild(modal);

  // ─── Navigation ───
  function goTo(step: number) {
    if (step === 1) {
      state.rawData = [];
      state.headers = [];
      state.filename = '';
      clearWizardData();
    }
    wizardStep = step;
    renderCurrentStep();
  }
  wizardGoTo = goTo;

  function updateStepsIndicator() {
    const steps = [
      { num: 1, label: 'Data' },
      { num: 2, label: 'Configure' },
      { num: 3, label: 'Model & Analyze' },
    ];
    stepsBar.innerHTML = steps.map((s, i) => {
      const cls = wizardStep === s.num ? 'active' : (wizardStep > s.num ? 'done' : '');
      const line = i < steps.length - 1
        ? `<div class="wizard-step-line ${wizardStep > s.num ? 'done' : ''}"></div>`
        : '';
      return `<div class="wizard-step ${cls}">
        <span class="wizard-step-num">${s.num}</span>
        <span class="wizard-step-label">${s.label}</span>
      </div>${line}`;
    }).join('');
  }

  function renderCurrentStep() {
    body.innerHTML = '';
    footer.innerHTML = '';
    updateStepsIndicator();

    switch (wizardStep) {
      case 1: renderStep1(body, footer); break;
      case 2: renderStep2(body, footer); break;
      case 3: renderStep3(body, footer); break;
    }
  }

  // ─── Step 1: Data Source ───
  function renderStep1(stepBody: HTMLElement, stepFooter: HTMLElement) {
    void stepFooter; // no footer for step 1

    stepBody.innerHTML = `
      <div class="wizard-welcome">
        <h1>Welcome to Dynalytics</h1>
        <p class="subtitle">Analytics of Dynamics</p>
        <div class="export-option" id="wiz-upload-btn">
          <div class="icon">&#128194;</div>
          <div class="info">
            <h4>Upload File</h4>
            <p>Import a CSV, XLSX, or XLS file</p>
          </div>
        </div>
        <div class="export-option" id="wiz-sample-btn">
          <div class="icon">&#128202;</div>
          <div class="info">
            <h4>Load Sample Data</h4>
            <p>Try TNA with the built-in group regulation dataset</p>
          </div>
        </div>
        <p class="welcome-generate-title">Generate Random Data</p>
        <div class="welcome-generate-row">
          <div class="welcome-generate-card" id="wiz-generate-btn">
            <div class="icon">&#128279;</div>
            <div class="label">Random Network</div>
          </div>
          <div class="welcome-generate-card" id="wiz-gen-long-btn">
            <div class="icon">&#128200;</div>
            <div class="label">Long Data</div>
          </div>
          <div class="welcome-generate-card" id="wiz-gen-onehot-btn">
            <div class="icon">&#9638;</div>
            <div class="label">One-Hot Data</div>
          </div>
        </div>
        <div class="welcome-drop-hint" id="wiz-drop-area">
          or drag &amp; drop a file anywhere
        </div>
      </div>
    `;

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.tsv,.txt,.xlsx,.xls';
    fileInput.style.display = 'none';
    stepBody.appendChild(fileInput);

    // Wire events
    stepBody.querySelector('#wiz-sample-btn')!.addEventListener('click', loadSampleData);
    stepBody.querySelector('#wiz-upload-btn')!.addEventListener('click', () => fileInput.click());
    stepBody.querySelector('#wiz-generate-btn')!.addEventListener('click', showGenerateNetworkModal);
    stepBody.querySelector('#wiz-gen-long-btn')!.addEventListener('click', () => showGenerateDataModal('long'));
    stepBody.querySelector('#wiz-gen-onehot-btn')!.addEventListener('click', () => showGenerateDataModal('onehot'));

    const dropArea = stepBody.querySelector('#wiz-drop-area')!;
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag-over');
    });
    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('drag-over');
    });
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      const file = (e as DragEvent).dataTransfer?.files[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) handleFile(file);
    });
  }

  // ─── Step 2: Configure & Analyze ───
  function renderStep2(stepBody: HTMLElement, stepFooter: HTMLElement) {
    // File info bar
    const infoHtml = `
      <div class="load-file-info">
        <span class="load-filename">${escHtml(state.filename)}</span>
        <span class="load-stats">${state.rawData.length} rows &middot; ${state.headers.length} columns</span>
      </div>
    `;
    stepBody.innerHTML = infoHtml;

    // Format tabs
    renderFormatTabs(stepBody);
    // Format options
    renderFormatOptions(stepBody);
    // Preview table
    renderPreviewTable(stepBody);

    // Footer: Back + Next
    stepFooter.innerHTML = `
      <button class="btn-secondary" id="wiz-back-2">&larr; Back</button>
      <button class="btn-primary" id="wiz-next-2">Next &rarr;</button>
    `;
    stepFooter.querySelector('#wiz-back-2')!.addEventListener('click', () => goTo(1));
    stepFooter.querySelector('#wiz-next-2')!.addEventListener('click', () => {
      tryBuildSequences();
    });
  }

  // ─── Step 3: Model & Analyze ───
  function renderStep3(stepBody: HTMLElement, stepFooter: HTMLElement) {
    // Summary cards row
    let summaryHtml = '<div class="wizard-summary-grid">';

    if (wizardIsEdgeList) {
      summaryHtml += `
        <div class="wizard-summary-item">
          <div class="wizard-summary-value">${wizardEdgeListNodeCount}</div>
          <div class="wizard-summary-label">Nodes</div>
        </div>
      `;
    } else {
      summaryHtml += `
        <div class="wizard-summary-item">
          <div class="wizard-summary-value">${wizardSequenceCount}</div>
          <div class="wizard-summary-label">Sequences</div>
        </div>
        <div class="wizard-summary-item">
          <div class="wizard-summary-value">${wizardUniqueStates.length}</div>
          <div class="wizard-summary-label">Unique States</div>
        </div>
      `;
    }

    if (wizardGroupLabels) {
      const uniqueGroups = new Set(wizardGroupLabels);
      summaryHtml += `
        <div class="wizard-summary-item">
          <div class="wizard-summary-value">${uniqueGroups.size}</div>
          <div class="wizard-summary-label">Groups</div>
        </div>
      `;
    }

    summaryHtml += '</div>';

    // Two-column area: model settings (left) + group panel (right, if groups exist)
    const hasGroups = wizardGroupLabels && wizardGroupLabels.length > 0;
    const useColumns = hasGroups && !wizardIsEdgeList;

    // --- Model settings column ---
    let modelHtml = '';
    if (!wizardIsEdgeList) {
      modelHtml = `<div class="wizard-model-config${useColumns ? '' : ' wizard-model-config-full'}">`;
      modelHtml += '<div class="wizard-config-section-title">Model Settings</div>';

      const mtDisabled = wizardModelTypeLocked ? 'disabled' : '';
      let mtOptions: string;
      if (wizardModelTypeLocked) {
        mtOptions = '<option value="ctna" selected>CTNA (Co-occurrence)</option>';
      } else {
        mtOptions = `
          <option value="tna" ${state.modelType === 'tna' ? 'selected' : ''}>TNA (Relative)</option>
          <option value="ftna" ${state.modelType === 'ftna' ? 'selected' : ''}>FTNA (Frequency)</option>
          <option value="ctna" ${state.modelType === 'ctna' ? 'selected' : ''}>CTNA (Co-occurrence)</option>
          <option value="atna" ${state.modelType === 'atna' ? 'selected' : ''}>ATNA (Attention)</option>
        `;
      }
      modelHtml += `
        <div class="wizard-config-row">
          <label>Model Type</label>
          <select id="wiz-model-type" ${mtDisabled}>${mtOptions}</select>
        </div>
      `;

      modelHtml += `
        <div class="wizard-config-row">
          <label>Scaling</label>
          <select id="wiz-scaling">
            <option value="" ${state.scaling === '' ? 'selected' : ''}>None</option>
            <option value="minmax" ${state.scaling === 'minmax' ? 'selected' : ''}>MinMax</option>
            <option value="max" ${state.scaling === 'max' ? 'selected' : ''}>Max</option>
            <option value="rank" ${state.scaling === 'rank' ? 'selected' : ''}>Rank</option>
          </select>
        </div>
      `;

      const showBeta = state.modelType === 'atna' && !wizardModelTypeLocked;
      modelHtml += `
        <div class="wizard-config-row" id="wiz-beta-row" style="display:${showBeta ? 'flex' : 'none'}">
          <label>ATNA Beta</label>
          <div class="slider-row" style="flex:1">
            <input type="range" id="wiz-atna-beta" min="0.01" max="2" step="0.01" value="${state.atnaBeta}">
            <span class="slider-value" id="wiz-beta-val">${state.atnaBeta.toFixed(2)}</span>
          </div>
        </div>
      `;

      modelHtml += '</div>';
    } else {
      modelHtml = '<div class="wizard-model-config wizard-model-config-full">';
      modelHtml += '<div class="wizard-config-section-title">Network Settings</div>';
      modelHtml += `
        <div class="wizard-config-row">
          <label>Type</label>
          <span style="font-size:13px;color:var(--text)">${state.snaDirected ? 'Directed' : 'Undirected'} Network</span>
        </div>
      `;
      modelHtml += '</div>';
    }

    // --- Group panel column ---
    let groupHtml = '';
    if (useColumns) {
      const groupCounts = new Map<string, number>();
      for (const label of wizardGroupLabels!) {
        groupCounts.set(label, (groupCounts.get(label) || 0) + 1);
      }
      const sortedGroups = [...groupCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

      groupHtml = '<div class="wizard-group-panel">';
      groupHtml += `<div class="wizard-config-section-title">Groups Detected &mdash; ${sortedGroups.length}</div>`;
      groupHtml += '<div class="wizard-group-summary">';
      for (const [name, count] of sortedGroups) {
        groupHtml += `<div class="wizard-group-row">
          <span class="wizard-group-name">${escHtml(name)}</span>
          <span class="wizard-group-count">${count} seq</span>
        </div>`;
      }
      groupHtml += '</div>';
      groupHtml += `<button class="wizard-group-toggle-btn${wizardGroupAnalysis ? ' active' : ''}" id="wiz-group-toggle">${wizardGroupAnalysis ? 'Group Analysis Enabled ✓' : 'Enable Group Analysis'}</button>`;
      groupHtml += '</div>';
    }

    // Wrap in columns container if groups present
    let configHtml: string;
    if (useColumns) {
      configHtml = `<div class="wizard-config-columns">${modelHtml}${groupHtml}</div>`;
    } else {
      configHtml = modelHtml;
    }

    stepBody.innerHTML = summaryHtml + configHtml;

    // Wire events
    setTimeout(() => {
      document.getElementById('wiz-model-type')?.addEventListener('change', (e) => {
        state.modelType = (e.target as HTMLSelectElement).value as typeof state.modelType;
        const betaRow = document.getElementById('wiz-beta-row');
        if (betaRow) betaRow.style.display = state.modelType === 'atna' ? 'flex' : 'none';
      });
      document.getElementById('wiz-scaling')?.addEventListener('change', (e) => {
        state.scaling = (e.target as HTMLSelectElement).value as typeof state.scaling;
      });
      document.getElementById('wiz-atna-beta')?.addEventListener('input', (e) => {
        state.atnaBeta = parseFloat((e.target as HTMLInputElement).value);
        const valEl = document.getElementById('wiz-beta-val');
        if (valEl) valEl.textContent = state.atnaBeta.toFixed(2);
      });
      document.getElementById('wiz-group-toggle')?.addEventListener('click', () => {
        wizardGroupAnalysis = !wizardGroupAnalysis;
        const btn = document.getElementById('wiz-group-toggle')!;
        btn.classList.toggle('active', wizardGroupAnalysis);
        btn.textContent = wizardGroupAnalysis ? 'Group Analysis Enabled ✓' : 'Enable Group Analysis';
      });
    }, 0);

    // Footer: Back + Analyze
    stepFooter.innerHTML = `
      <button class="btn-secondary" id="wiz-back-3">&larr; Back</button>
      <button class="btn-primary wizard-analyze-btn" id="wiz-commit">Analyze</button>
    `;
    stepFooter.querySelector('#wiz-back-3')!.addEventListener('click', () => goTo(2));
    stepFooter.querySelector('#wiz-commit')!.addEventListener('click', () => commitAndAnalyze());
  }

  // ─── Dismiss on overlay click (only if already analyzed data exists) ───
  wizardOverlay.addEventListener('click', (e) => {
    if (e.target === wizardOverlay && state.sequenceData) {
      closeDataWizard();
    }
  });

  // Render initial step and show
  renderCurrentStep();
  document.body.appendChild(wizardOverlay);
}

// ═══════════════════════════════════════════════════════════
//  Shared rendering helpers (used within wizard steps)
// ═══════════════════════════════════════════════════════════

function renderFormatTabs(container: HTMLElement) {
  const tabs = document.createElement('div');
  tabs.className = 'format-tabs';

  const formats: { id: string; label: string }[] = [
    { id: 'long', label: 'Long' },
    { id: 'onehot', label: 'One-Hot' },
    { id: 'group_onehot', label: 'Group One-Hot' },
    { id: 'wide', label: 'Wide' },
    { id: 'edgelist', label: 'Edge List' },
  ];

  for (const fmt of formats) {
    const btn = document.createElement('button');
    btn.textContent = fmt.label;
    btn.dataset.format = fmt.id;
    if (fmt.id === state.format) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const prevFormat = state.format;
      state.format = fmt.id as typeof state.format;
      const switchedOnehotVariant =
        (prevFormat === 'onehot' && state.format === 'group_onehot') ||
        (prevFormat === 'group_onehot' && state.format === 'onehot');
      if (switchedOnehotVariant || state.format === 'edgelist' || prevFormat === 'edgelist') {
        // Full re-render of step 2
        if (wizardGoTo) wizardGoTo(2);
      } else {
        tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateFormatOptions();
      }
    });
    tabs.appendChild(btn);
  }
  container.appendChild(tabs);
}

function updateFormatOptions() {
  const longOpts = document.getElementById('load-long-opts');
  const onehotOpts = document.getElementById('load-onehot-opts');
  const edgeOpts = document.getElementById('load-edgelist-opts');
  if (longOpts) longOpts.style.display = state.format === 'long' ? 'grid' : 'none';
  if (onehotOpts) onehotOpts.style.display = (state.format === 'onehot' || state.format === 'group_onehot') ? 'block' : 'none';
  if (edgeOpts) edgeOpts.style.display = state.format === 'edgelist' ? 'grid' : 'none';
}

function renderFormatOptions(container: HTMLElement) {
  // ─── Long format options ───
  const longOpts = document.createElement('div');
  longOpts.className = 'load-format-options';
  longOpts.id = 'load-long-opts';
  longOpts.style.display = state.format === 'long' ? 'grid' : 'none';

  const makeColOpts = (selected: number, includeNone = false) => {
    let opts = includeNone ? `<option value="-1" ${selected === -1 ? 'selected' : ''}>None (row order)</option>` : '';
    opts += state.headers.map((h, i) =>
      `<option value="${i}" ${i === selected ? 'selected' : ''}>${escHtml(h)}</option>`
    ).join('');
    return opts;
  };

  const makeGroupOpts = (selected: number) => {
    let opts = `<option value="-1" ${selected === -1 ? 'selected' : ''}>None (single TNA)</option>`;
    opts += state.headers.map((h, i) =>
      `<option value="${i}" ${i === selected ? 'selected' : ''}>${escHtml(h)}</option>`
    ).join('');
    return opts;
  };

  longOpts.innerHTML = `
    <div class="format-opt-pair">
      <label>Actor/ID:</label>
      <select id="load-long-id">${makeColOpts(state.longIdCol)}</select>
    </div>
    <div class="format-opt-pair">
      <label>Time:</label>
      <select id="load-long-time">${makeColOpts(state.longTimeCol, true)}</select>
    </div>
    <div class="format-opt-pair">
      <label>Action:</label>
      <select id="load-long-state">${makeColOpts(state.longStateCol)}</select>
    </div>
    <div class="format-opt-pair">
      <label>Group:</label>
      <select id="load-long-group">${makeGroupOpts(state.longGroupCol)}</select>
    </div>
  `;
  container.appendChild(longOpts);

  setTimeout(() => {
    document.getElementById('load-long-id')?.addEventListener('change', (e) => {
      state.longIdCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-long-time')?.addEventListener('change', (e) => {
      state.longTimeCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-long-state')?.addEventListener('change', (e) => {
      state.longStateCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-long-group')?.addEventListener('change', (e) => {
      state.longGroupCol = parseInt((e.target as HTMLSelectElement).value);
    });
  }, 0);

  // ─── One-Hot options (shared by onehot and group_onehot) ───
  const onehotOpts = document.createElement('div');
  onehotOpts.className = 'load-onehot-options';
  onehotOpts.id = 'load-onehot-opts';
  onehotOpts.style.display = (state.format === 'onehot' || state.format === 'group_onehot') ? 'block' : 'none';

  const binaryCols = detectBinaryCols(state.headers, state.rawData);

  let colChecksHtml = '<div class="load-onehot-label">Select binary state columns:</div>';
  if (binaryCols.length === 0) {
    colChecksHtml += '<div class="load-onehot-empty">No binary (0/1) columns detected.</div>';
  } else {
    colChecksHtml += '<div class="load-onehot-checks">';
    for (const c of binaryCols) {
      const checked = state.onehotCols.includes(state.headers[c]!) ? 'checked' : '';
      colChecksHtml += `<label class="load-onehot-check-label">
        <input type="checkbox" class="onehot-col-check" data-col="${escHtml(state.headers[c]!)}" ${checked}>
        ${escHtml(state.headers[c]!)}
      </label>`;
    }
    colChecksHtml += `<button class="load-onehot-select-all" id="load-onehot-select-all">Select All</button>`;
    colChecksHtml += '</div>';
  }

  const nonBinaryColOpts = (selected: number) => {
    let opts = `<option value="-1" ${selected === -1 ? 'selected' : ''}>None</option>`;
    for (let i = 0; i < state.headers.length; i++) {
      if (!binaryCols.includes(i)) {
        opts += `<option value="${i}" ${i === selected ? 'selected' : ''}>${escHtml(state.headers[i]!)}</option>`;
      }
    }
    return opts;
  };

  const isGroupOnehot = state.format === 'group_onehot';
  const groupColHtml = isGroupOnehot
    ? `<div class="format-opt-pair">
        <label>Group:</label>
        <select id="load-onehot-group">${nonBinaryColOpts(state.onehotGroupCol)}</select>
       </div>`
    : '';

  onehotOpts.innerHTML = `
    ${colChecksHtml}
    <div class="load-onehot-dropdowns">
      <div class="format-opt-pair">
        <label>Actor:</label>
        <select id="load-onehot-actor">${nonBinaryColOpts(state.onehotActorCol)}</select>
      </div>
      ${groupColHtml}
      <div class="format-opt-pair">
        <label>Session:</label>
        <select id="load-onehot-session">${nonBinaryColOpts(state.onehotSessionCol)}</select>
      </div>
      <div class="format-opt-pair">
        <label>Window size:</label>
        <input type="number" id="load-onehot-window-size" value="${state.onehotWindowSize}" min="1" max="100" style="width:60px">
      </div>
      <div class="format-opt-pair">
        <label>Window type:</label>
        <select id="load-onehot-window-type">
          <option value="tumbling" ${state.onehotWindowType === 'tumbling' ? 'selected' : ''}>Tumbling</option>
          <option value="sliding" ${state.onehotWindowType === 'sliding' ? 'selected' : ''}>Sliding</option>
        </select>
      </div>
    </div>
  `;
  container.appendChild(onehotOpts);

  setTimeout(() => {
    document.getElementById('load-onehot-select-all')?.addEventListener('click', () => {
      const checks = document.querySelectorAll('.onehot-col-check') as NodeListOf<HTMLInputElement>;
      const allChecked = Array.from(checks).every(c => c.checked);
      checks.forEach(c => { c.checked = !allChecked; });
    });
    document.getElementById('load-onehot-actor')?.addEventListener('change', (e) => {
      state.onehotActorCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-onehot-group')?.addEventListener('change', (e) => {
      state.onehotGroupCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-onehot-session')?.addEventListener('change', (e) => {
      state.onehotSessionCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-onehot-window-size')?.addEventListener('change', (e) => {
      state.onehotWindowSize = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1);
    });
    document.getElementById('load-onehot-window-type')?.addEventListener('change', (e) => {
      state.onehotWindowType = (e.target as HTMLSelectElement).value as 'tumbling' | 'sliding';
    });
  }, 0);

  // ─── Edge List format options ───
  const edgeOpts = document.createElement('div');
  edgeOpts.className = 'load-format-options';
  edgeOpts.id = 'load-edgelist-opts';
  edgeOpts.style.display = state.format === 'edgelist' ? 'grid' : 'none';

  if (state.format === 'edgelist' && state.headers.length >= 2) {
    const guessed = guessEdgeListColumns(state.headers);
    if (state.snaFromCol === 0 && state.snaToCol === 1) {
      state.snaFromCol = guessed.fromCol;
      state.snaToCol = guessed.toCol;
      state.snaWeightCol = guessed.weightCol;
    }
  }

  const makeEdgeColOpts = (selected: number, includeNone = false) => {
    let opts = includeNone ? `<option value="-1" ${selected === -1 ? 'selected' : ''}>None (unweighted)</option>` : '';
    opts += state.headers.map((h, i) =>
      `<option value="${i}" ${i === selected ? 'selected' : ''}>${escHtml(h)}</option>`
    ).join('');
    return opts;
  };

  edgeOpts.innerHTML = `
    <div class="format-opt-pair">
      <label>From:</label>
      <select id="load-edge-from">${makeEdgeColOpts(state.snaFromCol)}</select>
    </div>
    <div class="format-opt-pair">
      <label>To:</label>
      <select id="load-edge-to">${makeEdgeColOpts(state.snaToCol)}</select>
    </div>
    <div class="format-opt-pair">
      <label>Weight:</label>
      <select id="load-edge-weight">${makeEdgeColOpts(state.snaWeightCol, true)}</select>
    </div>
    <div class="format-opt-pair">
      <label style="display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="load-edge-directed" ${state.snaDirected ? 'checked' : ''}>
        Directed
      </label>
    </div>
  `;
  container.appendChild(edgeOpts);

  setTimeout(() => {
    document.getElementById('load-edge-from')?.addEventListener('change', (e) => {
      state.snaFromCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-edge-to')?.addEventListener('change', (e) => {
      state.snaToCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-edge-weight')?.addEventListener('change', (e) => {
      state.snaWeightCol = parseInt((e.target as HTMLSelectElement).value);
    });
    document.getElementById('load-edge-directed')?.addEventListener('change', (e) => {
      state.snaDirected = (e.target as HTMLInputElement).checked;
    });
  }, 0);
}

function renderPreviewTable(container: HTMLElement) {
  const nRows = state.rawData.length;
  const nCols = state.headers.length;
  const maxPreview = Math.min(nRows, 50);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'load-table-wrap';

  let tableHtml = '<table class="preview-table"><thead><tr>';
  for (const h of state.headers) {
    tableHtml += `<th>${escHtml(h)}</th>`;
  }
  tableHtml += '</tr></thead><tbody>';
  for (let i = 0; i < maxPreview; i++) {
    tableHtml += '<tr>';
    for (const cell of state.rawData[i]!) {
      tableHtml += `<td>${escHtml(cell)}</td>`;
    }
    tableHtml += '</tr>';
  }
  if (nRows > maxPreview) {
    tableHtml += `<tr><td colspan="${nCols}" style="text-align:center;color:#888;font-style:italic;">... ${nRows - maxPreview} more rows</td></tr>`;
  }
  tableHtml += '</tbody></table>';
  tableWrap.innerHTML = tableHtml;
  container.appendChild(tableWrap);
}

// ═══════════════════════════════════════════════════════════
//  Analysis logic (unchanged from original)
// ═══════════════════════════════════════════════════════════

function runAnalyze() {
  try {
    clearGroupAnalysisData();
    state.networkSettings = defaultNetworkSettings();
    clearLayoutCache();

    if (state.format === 'edgelist') {
      const { matrix, labels } = edgeListToMatrix(
        state.rawData, state.snaFromCol, state.snaToCol, state.snaWeightCol, state.snaDirected,
      );
      if (labels.length === 0) {
        alert('No valid nodes found in edge list. Check your From/To column selections.');
        return;
      }
      state.sequenceData = [[]]; // sentinel
      state.groupLabels = null;
      state.activeGroup = null;
      state.activeMode = 'sna';
      state.activeSubTab = 'network';
      state.networkSettings.edgeWidthMax = 2;
      state.networkSettings.edgeWidthMin = 0.2;
      state.networkSettings.showEdgeLabels = false;
      closeDataWizard();
      render();
      return;
    } else if (state.format === 'wide') {
      state.sequenceData = wideToSequences(state.rawData);
      state.groupLabels = null;
      state.longGroupCol = -1;
    } else if (state.format === 'onehot' || state.format === 'group_onehot') {
      analyzeOnehot();
    } else {
      const idCol = state.longIdCol;
      const timeCol = state.longTimeCol;
      const stateCol = state.longStateCol;
      const groupCol = state.longGroupCol;
      const result = longToSequences(state.rawData, idCol, timeCol, stateCol, groupCol);
      state.sequenceData = result.sequences;
      state.groupLabels = result.groups;
    }

    if (!state.sequenceData || state.sequenceData.length === 0) {
      alert('No valid sequences found. Check your data format.');
      return;
    }

    state.activeGroup = null;
    if (state.format === 'onehot') {
      state.activeMode = 'onehot';
      state.activeSubTab = 'network';
    } else if (state.format === 'group_onehot') {
      state.activeMode = 'group_onehot';
      state.activeSubTab = 'setup';
    } else {
      state.activeMode = 'single';
      state.activeSubTab = 'network';
    }
    closeDataWizard();
    render();
  } catch (err) {
    if ((err as Error).message !== 'cancelled') {
      alert('Error building sequences: ' + (err as Error).message);
    }
  }
}

function analyzeOnehot() {
  const checks = document.querySelectorAll('.onehot-col-check') as NodeListOf<HTMLInputElement>;
  const selectedCols: string[] = [];
  checks.forEach(c => { if (c.checked) selectedCols.push(c.dataset.col!); });
  if (selectedCols.length < 2) {
    alert('Select at least 2 binary columns for one-hot analysis.');
    throw new Error('cancelled');
  }
  state.onehotCols = selectedCols;

  const records: Record<string, number>[] = state.rawData.map(row => {
    const rec: Record<string, number> = {};
    for (let c = 0; c < state.headers.length; c++) {
      rec[state.headers[c]!] = parseInt(row[c] ?? '0', 10) || 0;
    }
    return rec;
  });

  const opts: { actor?: string; session?: string; windowSize?: number; windowType?: 'tumbling' | 'sliding' } = {};
  if (state.onehotActorCol >= 0) {
    opts.actor = state.headers[state.onehotActorCol]!;
    for (let i = 0; i < state.rawData.length; i++) {
      const val = (state.rawData[i]![state.onehotActorCol] ?? '').trim();
      (records[i] as any)[state.headers[state.onehotActorCol]!] = val as any;
    }
  }
  if (state.onehotSessionCol >= 0) {
    opts.session = state.headers[state.onehotSessionCol]!;
    for (let i = 0; i < state.rawData.length; i++) {
      const val = (state.rawData[i]![state.onehotSessionCol] ?? '').trim();
      (records[i] as any)[state.headers[state.onehotSessionCol]!] = val as any;
    }
  }
  if (state.onehotWindowSize > 1) opts.windowSize = state.onehotWindowSize;
  opts.windowType = state.onehotWindowType;

  state.sequenceData = importOnehot(records, selectedCols, opts);
  state.modelType = 'ctna';

  if (state.format === 'group_onehot' && state.onehotGroupCol >= 0 && state.onehotActorCol >= 0) {
    const groupColIdx = state.onehotGroupCol;
    const actorColIdx = state.onehotActorCol;
    const labels: string[] = [];
    const seenActors = new Set<string>();
    for (const row of state.rawData) {
      const actorVal = (row[actorColIdx] ?? '').trim();
      if (!seenActors.has(actorVal)) {
        seenActors.add(actorVal);
        const groupVal = (row[groupColIdx] ?? '').trim();
        labels.push(groupVal);
      }
    }
    if (labels.length === state.sequenceData.length) {
      state.groupLabels = labels;
    } else {
      state.groupLabels = labels.slice(0, state.sequenceData.length);
    }
  } else if (state.format === 'group_onehot') {
    alert('Please select both an Actor column and a Group column for Group One-Hot analysis.');
    throw new Error('cancelled');
  } else {
    state.groupLabels = null;
  }
}

// ═══════════════════════════════════════════════════════════
//  Wizard Step 2→3: build sequences into wizard-local state
// ═══════════════════════════════════════════════════════════

function tryBuildSequences() {
  try {
    wizardIsEdgeList = false;
    wizardModelTypeLocked = false;

    if (state.format === 'edgelist') {
      const { matrix, labels } = edgeListToMatrix(
        state.rawData, state.snaFromCol, state.snaToCol, state.snaWeightCol, state.snaDirected,
      );
      void matrix;
      if (labels.length === 0) {
        alert('No valid nodes found in edge list. Check your From/To column selections.');
        return;
      }
      wizardSequenceData = [[]]; // sentinel
      wizardGroupLabels = null;
      wizardUniqueStates = labels;
      wizardSequenceCount = 0;
      wizardModelTypeLocked = true;
      wizardIsEdgeList = true;
      wizardEdgeListNodeCount = labels.length;
    } else if (state.format === 'wide') {
      wizardSequenceData = wideToSequences(state.rawData);
      wizardGroupLabels = null;
      const uniqueSet = new Set<string>();
      for (const seq of wizardSequenceData) {
        for (const val of seq) {
          if (val != null) uniqueSet.add(val);
        }
      }
      wizardUniqueStates = [...uniqueSet].sort();
      wizardSequenceCount = wizardSequenceData.length;
    } else if (state.format === 'onehot' || state.format === 'group_onehot') {
      // Read selected columns from DOM
      const checks = document.querySelectorAll('.onehot-col-check') as NodeListOf<HTMLInputElement>;
      const selectedCols: string[] = [];
      checks.forEach(c => { if (c.checked) selectedCols.push(c.dataset.col!); });
      if (selectedCols.length < 2) {
        alert('Select at least 2 binary columns for one-hot analysis.');
        return;
      }
      state.onehotCols = selectedCols;

      const records: Record<string, number>[] = state.rawData.map(row => {
        const rec: Record<string, number> = {};
        for (let c = 0; c < state.headers.length; c++) {
          rec[state.headers[c]!] = parseInt(row[c] ?? '0', 10) || 0;
        }
        return rec;
      });

      const opts: { actor?: string; session?: string; windowSize?: number; windowType?: 'tumbling' | 'sliding' } = {};
      if (state.onehotActorCol >= 0) {
        opts.actor = state.headers[state.onehotActorCol]!;
        for (let i = 0; i < state.rawData.length; i++) {
          const val = (state.rawData[i]![state.onehotActorCol] ?? '').trim();
          (records[i] as any)[state.headers[state.onehotActorCol]!] = val as any;
        }
      }
      if (state.onehotSessionCol >= 0) {
        opts.session = state.headers[state.onehotSessionCol]!;
        for (let i = 0; i < state.rawData.length; i++) {
          const val = (state.rawData[i]![state.onehotSessionCol] ?? '').trim();
          (records[i] as any)[state.headers[state.onehotSessionCol]!] = val as any;
        }
      }
      if (state.onehotWindowSize > 1) opts.windowSize = state.onehotWindowSize;
      opts.windowType = state.onehotWindowType;

      wizardSequenceData = importOnehot(records, selectedCols, opts);
      state.modelType = 'ctna';
      wizardModelTypeLocked = true;
      wizardUniqueStates = selectedCols;
      wizardSequenceCount = wizardSequenceData.sequences
        ? wizardSequenceData.sequences.length
        : wizardSequenceData.length;

      // Group labels for group_onehot
      if (state.format === 'group_onehot' && state.onehotGroupCol >= 0 && state.onehotActorCol >= 0) {
        const groupColIdx = state.onehotGroupCol;
        const actorColIdx = state.onehotActorCol;
        const labels: string[] = [];
        const seenActors = new Set<string>();
        for (const row of state.rawData) {
          const actorVal = (row[actorColIdx] ?? '').trim();
          if (!seenActors.has(actorVal)) {
            seenActors.add(actorVal);
            const groupVal = (row[groupColIdx] ?? '').trim();
            labels.push(groupVal);
          }
        }
        wizardGroupLabels = labels.slice(0, wizardSequenceCount);
      } else if (state.format === 'group_onehot') {
        alert('Please select both an Actor column and a Group column for Group One-Hot analysis.');
        return;
      } else {
        wizardGroupLabels = null;
      }
    } else {
      // long format
      const result = longToSequences(state.rawData, state.longIdCol, state.longTimeCol, state.longStateCol, state.longGroupCol);
      wizardSequenceData = result.sequences;
      wizardGroupLabels = result.groups;
      const uniqueSet = new Set<string>();
      for (const seq of result.sequences) {
        for (const val of seq) {
          if (val != null) uniqueSet.add(val);
        }
      }
      wizardUniqueStates = [...uniqueSet].sort();
      wizardSequenceCount = result.sequences.length;
    }

    // Validate
    if (!wizardIsEdgeList && (!wizardSequenceData || wizardSequenceCount === 0)) {
      alert('No valid sequences found. Check your data format.');
      return;
    }

    if (wizardGoTo) wizardGoTo(3);
  } catch (err) {
    alert('Error building sequences: ' + (err as Error).message);
  }
}

function commitAndAnalyze() {
  clearGroupAnalysisData();
  state.networkSettings = defaultNetworkSettings();
  clearLayoutCache();

  if (wizardIsEdgeList) {
    state.sequenceData = [[]]; // sentinel
    state.groupLabels = null;
    state.activeGroup = null;
    state.activeMode = 'sna';
    state.activeSubTab = 'network';
    state.networkSettings.edgeWidthMax = 2;
    state.networkSettings.edgeWidthMin = 0.2;
    state.networkSettings.showEdgeLabels = false;
  } else {
    state.sequenceData = wizardSequenceData;
    state.groupLabels = wizardGroupLabels;
    state.activeGroup = null;

    if (state.format === 'onehot') {
      state.modelType = 'ctna';
      state.activeMode = 'onehot';
      state.activeSubTab = 'network';
    } else if (state.format === 'group_onehot') {
      state.modelType = 'ctna';
      state.activeMode = 'group_onehot';
      state.activeSubTab = 'setup';
    } else {
      state.activeMode = 'single';
      state.activeSubTab = 'network';
    }
  }

  // Capture before closeDataWizard() resets wizard state
  const enableGroupAnalysis = wizardGroupAnalysis;

  closeDataWizard();
  render();

  // Pre-build group models only if user opted in via the wizard toggle
  if (enableGroupAnalysis && state.groupLabels && state.groupLabels.length > 0 && state.activeMode !== 'sna') {
    buildColumnGroups(state.networkSettings);
    updateSubTabStates();
  }
}

// ═══════════════════════════════════════════════════════════
//  File / Sample loading
// ═══════════════════════════════════════════════════════════

function loadSampleData() {
  showLoading('Loading sample data...');
  try {
    const lines = sampleCsv.split('\n').filter((l: string) => l.trim());
    const headers = lines[0]!.split(',').map((h: string) => h.trim());
    const rows = lines.slice(1).map((line: string) => line.split(',').map((c: string) => c.trim()));
    state.filename = 'group_regulation_long.csv';
    state.headers = headers;
    state.rawData = rows;
    state.format = 'long';
    const guessed = guessColumns(state.headers, state.rawData);
    state.longIdCol = guessed.idCol;
    state.longTimeCol = guessed.timeCol;
    state.longStateCol = guessed.stateCol;
    hideLoading();
    if (wizardGoTo) wizardGoTo(2);
  } catch (err) {
    hideLoading();
    alert('Error loading sample data: ' + (err as Error).message);
  }
}

async function handleFile(file: File) {
  showLoading('Parsing file...');
  try {
    const result = await parseFile(file);
    state.filename = file.name;
    state.headers = result.headers;
    state.rawData = result.rows;
    const detected = detectBestFormat(state.headers, state.rawData);
    state.format = detected;
    if (detected === 'long') {
      const guessed = guessColumns(state.headers, state.rawData);
      state.longIdCol = guessed.idCol;
      state.longTimeCol = guessed.timeCol;
      state.longStateCol = guessed.stateCol;
    }
    if (detected === 'onehot' || detected === 'wide') {
      const binaryCols = detectBinaryCols(state.headers, state.rawData);
      state.onehotCols = binaryCols.map(c => state.headers[c]!);
    }
    hideLoading();
    if (wizardGoTo) wizardGoTo(2);
  } catch (err) {
    hideLoading();
    alert('Error parsing file: ' + (err as Error).message);
  }
}

// ═══════════════════════════════════════════════════════════
//  Generate modals (close wizard on success)
// ═══════════════════════════════════════════════════════════

function showGenerateNetworkModal() {
  const existing = document.querySelector('.modal-overlay:not(#wizard-overlay)');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:480px">
      <h3>Generate Random Network</h3>
      <div class="generate-network-body">
        <div class="generate-network-row">
          <label>Model:</label>
          <select id="gen-model">
            <option value="er">Erdos-Renyi</option>
            <option value="ba">Barabasi-Albert</option>
            <option value="ws">Watts-Strogatz</option>
            <option value="sbm">Stochastic Block Model</option>
          </select>
        </div>
        <div class="generate-network-params">
          <div id="gen-er-params" class="gen-param-group">
            <label>Edge prob:</label>
            <input type="number" id="gen-er-p" value="0.15" min="0" max="1" step="0.01" style="width:70px">
            <label style="display:flex;align-items:center;gap:4px">
              <input type="checkbox" id="gen-er-weighted">
              Weighted
            </label>
          </div>
          <div id="gen-ba-params" class="gen-param-group" style="display:none">
            <label>Edges/node:</label>
            <input type="number" id="gen-ba-m" value="2" min="1" max="20" style="width:60px">
          </div>
          <div id="gen-ws-params" class="gen-param-group" style="display:none">
            <label>Neighbors (k):</label>
            <input type="number" id="gen-ws-k" value="4" min="2" max="20" style="width:60px">
            <label>Rewiring (beta):</label>
            <input type="number" id="gen-ws-beta" value="0.3" min="0" max="1" step="0.05" style="width:70px">
          </div>
          <div id="gen-sbm-params" class="gen-param-group" style="display:none">
            <label>Communities:</label>
            <input type="number" id="gen-sbm-k" value="3" min="2" max="10" style="width:60px">
            <label>P_in:</label>
            <input type="number" id="gen-sbm-pin" value="0.3" min="0" max="1" step="0.01" style="width:70px">
            <label>P_out:</label>
            <input type="number" id="gen-sbm-pout" value="0.05" min="0" max="1" step="0.01" style="width:70px">
          </div>
        </div>
        <div class="generate-network-row">
          <label>Nodes:</label>
          <input type="number" id="gen-nodes" value="30" min="3" max="200" style="width:60px">
          <label style="display:flex;align-items:center;gap:4px">
            <input type="checkbox" id="gen-directed" checked>
            Directed
          </label>
          <label>Seed:</label>
          <input type="number" id="gen-seed" value="42" min="0" style="width:60px">
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button class="btn-primary" id="gen-analyze-btn">Generate &amp; Analyze</button>
        </div>
      </div>
      <button class="modal-close" id="gen-modal-close">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('gen-modal-close')!.addEventListener('click', () => overlay.remove());

  const modelSel = document.getElementById('gen-model') as HTMLSelectElement;
  const dirCheck = document.getElementById('gen-directed') as HTMLInputElement;
  modelSel.addEventListener('change', () => {
    const m = modelSel.value;
    document.getElementById('gen-er-params')!.style.display = m === 'er' ? '' : 'none';
    document.getElementById('gen-ba-params')!.style.display = m === 'ba' ? '' : 'none';
    document.getElementById('gen-ws-params')!.style.display = m === 'ws' ? '' : 'none';
    document.getElementById('gen-sbm-params')!.style.display = m === 'sbm' ? '' : 'none';
    if (m === 'ws') { dirCheck.checked = false; dirCheck.disabled = true; }
    else { dirCheck.disabled = false; }
  });

  document.getElementById('gen-analyze-btn')!.addEventListener('click', () => {
    try {
      const model = modelSel.value;
      const n = parseInt((document.getElementById('gen-nodes') as HTMLInputElement).value) || 30;
      const directed = dirCheck.checked;
      const seed = parseInt((document.getElementById('gen-seed') as HTMLInputElement).value) || 42;

      let result: GeneratorResult;
      let description: string;

      switch (model) {
        case 'er': {
          const p = parseFloat((document.getElementById('gen-er-p') as HTMLInputElement).value) || 0.15;
          const weighted = (document.getElementById('gen-er-weighted') as HTMLInputElement).checked;
          result = erdosRenyi({ n, p, directed, weighted, seed });
          description = `Generated: Erdos-Renyi (n=${n}, p=${p})`;
          break;
        }
        case 'ba': {
          const m = parseInt((document.getElementById('gen-ba-m') as HTMLInputElement).value) || 2;
          result = barabasiAlbert({ n, m, directed, seed });
          description = `Generated: Barabasi-Albert (n=${n}, m=${m})`;
          break;
        }
        case 'ws': {
          const k = parseInt((document.getElementById('gen-ws-k') as HTMLInputElement).value) || 4;
          const beta = parseFloat((document.getElementById('gen-ws-beta') as HTMLInputElement).value) || 0.3;
          result = wattsStrogatz({ n, k, beta, seed });
          description = `Generated: Watts-Strogatz (n=${n}, k=${k}, beta=${beta})`;
          break;
        }
        case 'sbm': {
          const k = parseInt((document.getElementById('gen-sbm-k') as HTMLInputElement).value) || 3;
          const pIn = parseFloat((document.getElementById('gen-sbm-pin') as HTMLInputElement).value) || 0.3;
          const pOut = parseFloat((document.getElementById('gen-sbm-pout') as HTMLInputElement).value) || 0.05;
          result = stochasticBlockModel({ n, k, pIn, pOut, directed, seed });
          description = `Generated: SBM (n=${n}, k=${k}, p_in=${pIn}, p_out=${pOut})`;
          break;
        }
        default:
          return;
      }

      overlay.remove();
      closeDataWizard();

      const edgeRows = matrixToEdgeRows(result.matrix, result.labels, directed);

      clearGroupAnalysisData();
      state.networkSettings = defaultNetworkSettings();
      clearLayoutCache();

      state.rawData = edgeRows;
      state.headers = ['From', 'To', 'Weight'];
      state.format = 'edgelist';
      state.snaFromCol = 0;
      state.snaToCol = 1;
      state.snaWeightCol = 2;
      state.snaDirected = directed;
      state.filename = description;
      state.sequenceData = [[]]; // sentinel
      state.groupLabels = null;
      state.activeGroup = null;
      state.activeMode = 'sna';
      state.activeSubTab = 'network';
      state.networkSettings.edgeWidthMax = 2;
      state.networkSettings.edgeWidthMin = 0.2;
      state.networkSettings.showEdgeLabels = false;
      render();
    } catch (err) {
      alert('Error generating network: ' + (err as Error).message);
    }
  });
}

function showGenerateDataModal(format: 'long' | 'onehot') {
  const existing = document.querySelector('.modal-overlay:not(#wizard-overlay)');
  if (existing) existing.remove();

  const title = format === 'long' ? 'Generate Long Data' : 'Generate One-Hot Data';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:480px">
      <h3>${title}</h3>
      <div class="generate-network-body">
        <div class="generate-network-row">
          <label>Rows:</label>
          <input type="number" id="sim-rows" value="1000" min="2" max="100000" style="width:80px">
          <label>Actors:</label>
          <input type="number" id="sim-actors" value="50" min="1" max="500" style="width:60px">
          <label>States:</label>
          <input type="number" id="sim-nstates" value="9" min="2" max="26" style="width:60px">
        </div>
        <div class="generate-network-row">
          <label>Seed:</label>
          <input type="number" id="sim-seed" value="42" min="0" style="width:60px">
          <label style="display:flex;align-items:center;gap:4px">
            <input type="checkbox" id="sim-use-groups">
            Group column
          </label>
          <span id="sim-groups-wrap" style="display:none">
            <label>Groups:</label>
            <input type="number" id="sim-groups" value="5" min="2" max="50" style="width:60px">
          </span>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button class="btn-primary" id="sim-generate-btn">Generate &amp; Analyze</button>
        </div>
      </div>
      <button class="modal-close" id="sim-modal-close">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('sim-modal-close')!.addEventListener('click', () => overlay.remove());

  const useGroupsCheck = document.getElementById('sim-use-groups') as HTMLInputElement;
  const groupsWrap = document.getElementById('sim-groups-wrap')!;
  useGroupsCheck.addEventListener('change', () => {
    groupsWrap.style.display = useGroupsCheck.checked ? '' : 'none';
  });

  document.getElementById('sim-generate-btn')!.addEventListener('click', () => {
    try {
      const useGroups = useGroupsCheck.checked;
      const nGroups = useGroups ? (parseInt((document.getElementById('sim-groups') as HTMLInputElement).value) || 5) : 1;
      const totalRows = parseInt((document.getElementById('sim-rows') as HTMLInputElement).value) || 1000;
      const nActors = parseInt((document.getElementById('sim-actors') as HTMLInputElement).value) || 50;
      const nStates = parseInt((document.getElementById('sim-nstates') as HTMLInputElement).value) || 9;
      const seed = parseInt((document.getElementById('sim-seed') as HTMLInputElement).value) || 42;

      const seqLen = Math.max(1, Math.round(totalRows / nActors));
      const actorsPerGroup = Math.max(1, Math.round(nActors / nGroups));

      const params = {
        nGroups,
        nActors: actorsPerGroup,
        nStates,
        seqLengthRange: [seqLen, seqLen] as [number, number],
        seed,
      };

      const simResult = format === 'long'
        ? simulateLongData(params)
        : simulateOnehotData(params);

      overlay.remove();
      closeDataWizard();

      state.filename = format === 'long'
        ? `simulated_long_${nActors}a.csv`
        : `simulated_onehot_${nActors}a.csv`;
      state.headers = simResult.headers;
      state.rawData = simResult.rows;

      clearGroupAnalysisData();
      state.networkSettings = defaultNetworkSettings();
      clearLayoutCache();

      if (format === 'long') {
        const idCol = simResult.headers.indexOf('Actor');
        const timeCol = simResult.headers.indexOf('Time');
        const stateCol = simResult.headers.indexOf('Action');
        const groupCol = useGroups ? simResult.headers.indexOf('Group') : -1;
        state.format = 'long';
        state.longIdCol = idCol;
        state.longTimeCol = timeCol;
        state.longStateCol = stateCol;
        state.longGroupCol = groupCol;
        const seqResult = longToSequences(simResult.rows, idCol, timeCol, stateCol, groupCol);
        state.sequenceData = seqResult.sequences;
        state.groupLabels = seqResult.groups;
      } else {
        state.format = 'onehot';
        const stateCols = simResult.headers.filter(h => !['Actor', 'Group', 'Time'].includes(h));
        state.onehotCols = stateCols;

        const records: Record<string, number>[] = simResult.rows.map(row => {
          const rec: Record<string, number> = {};
          for (let c = 0; c < simResult.headers.length; c++) {
            rec[simResult.headers[c]!] = parseInt(row[c] ?? '0', 10) || 0;
          }
          const actorIdx = simResult.headers.indexOf('Actor');
          if (actorIdx >= 0) (rec as any)['Actor'] = (row[actorIdx] ?? '').trim();
          return rec;
        });

        const opts: { actor?: string; windowSize?: number; windowType?: 'tumbling' | 'sliding' } = {};
        opts.actor = 'Actor';
        state.sequenceData = importOnehot(records, stateCols, opts);
        state.modelType = 'ctna';

        if (useGroups) {
          const actorIdx = simResult.headers.indexOf('Actor');
          const groupIdx = simResult.headers.indexOf('Group');
          const labels: string[] = [];
          const seenActors = new Set<string>();
          for (const row of simResult.rows) {
            const actorVal = (row[actorIdx] ?? '').trim();
            if (!seenActors.has(actorVal)) {
              seenActors.add(actorVal);
              labels.push((row[groupIdx] ?? '').trim());
            }
          }
          state.groupLabels = labels.slice(0, state.sequenceData.length);
        } else {
          state.groupLabels = null;
        }
      }

      if (!state.sequenceData || state.sequenceData.length === 0) {
        alert('No valid sequences generated.');
        return;
      }

      state.activeGroup = null;
      state.activeMode = 'single';
      state.activeSubTab = 'network';
      render();
    } catch (err) {
      alert('Error generating data: ' + (err as Error).message);
    }
  });
}
