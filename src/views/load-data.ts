/**
 * Inline load-data panel: file drop zone + format tabs + options + preview table + analyze.
 * Replaces the old welcome + preview screens as a single inline component.
 */
import { state, render, showLoading, hideLoading, importOnehot } from '../main';
import { parseFile, wideToSequences, longToSequences, guessColumns } from '../data';
import sampleCsv from '../sample-data.csv?raw';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Detect binary columns (all values 0 or 1) from raw data.
 */
function detectBinaryCols(headers: string[], rawData: string[][]): number[] {
  const binaryCols: number[] = [];
  const sample = rawData.slice(0, 50);
  for (let c = 0; c < headers.length; c++) {
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
  // If more than half the columns are binary, suggest one-hot
  if (binaryCols.length >= 3 && binaryCols.length >= headers.length * 0.5) {
    return 'onehot';
  }
  // Fall back to existing heuristic
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

export function renderLoadPanel(container: HTMLElement) {
  const panel = document.createElement('div');
  panel.className = 'load-panel';
  container.appendChild(panel);

  if (state.rawData.length === 0) {
    // ─── Welcome landing page ───
    renderWelcomePage(panel);
  } else {
    // ─── File loaded: show format tabs + options + table + analyze ───
    renderDropZone(panel);
    renderFileInfo(panel);
    renderFormatTabs(panel);
    renderFormatOptions(panel);
    renderAnalyzeButton(panel);
    renderPreviewTable(panel);
  }
}

function renderWelcomePage(panel: HTMLElement) {
  const welcome = document.createElement('div');
  welcome.className = 'welcome-landing';

  welcome.innerHTML = `
    <div class="welcome-hero">
      <h1 class="welcome-title">Welcome to TNA Desktop</h1>
      <p class="welcome-subtitle">Upload a CSV file or load sample data to get started with Transition Network Analysis</p>
      <div class="welcome-buttons">
        <button class="welcome-btn welcome-btn-sample" id="welcome-sample-btn">
          <span class="welcome-btn-icon">&#9654;</span>
          Load Sample Data
        </button>
        <button class="welcome-btn welcome-btn-upload" id="welcome-upload-btn">
          <span class="welcome-btn-icon">&#128194;</span>
          Upload CSV
        </button>
      </div>
      <div class="welcome-drop-hint" id="welcome-drop-area">
        or drag &amp; drop a file here (.csv, .xlsx, .xls)
      </div>
    </div>

    <div class="welcome-cards">
      <div class="welcome-card">
        <h3 class="welcome-card-title">How to Get Started</h3>
        <ol class="welcome-steps">
          <li><strong>Load your data</strong> &mdash; Upload a CSV file or use the built-in sample dataset</li>
          <li><strong>Choose a format</strong> &mdash; Select Wide, Long, One-Hot, or Group One-Hot</li>
          <li><strong>Configure columns</strong> &mdash; Map your columns to Actor, Time, Action, and Group</li>
          <li><strong>Analyze</strong> &mdash; Build transition networks, compute centralities, detect communities, and more</li>
        </ol>
      </div>

      <div class="welcome-card">
        <h3 class="welcome-card-title">Your Data Should Include</h3>
        <div class="welcome-formats">
          <div class="welcome-format">
            <div class="welcome-format-name">Wide Format</div>
            <div class="welcome-format-desc">Each row is one sequence. Columns are time steps with state values.</div>
          </div>
          <div class="welcome-format">
            <div class="welcome-format-name">Long Format</div>
            <div class="welcome-format-desc">Each row is one event with Actor/ID, Time, and Action columns.</div>
          </div>
          <div class="welcome-format">
            <div class="welcome-format-name">One-Hot Format</div>
            <div class="welcome-format-desc">Binary (0/1) columns indicating state presence at each time step.</div>
          </div>
          <div class="welcome-format">
            <div class="welcome-format-name">Group One-Hot</div>
            <div class="welcome-format-desc">One-Hot with an actor/group column for per-group analysis.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  panel.appendChild(welcome);

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,.tsv,.txt,.xlsx,.xls';
  fileInput.style.display = 'none';
  fileInput.id = 'welcome-file-input';
  panel.appendChild(fileInput);

  // Wire events
  welcome.querySelector('#welcome-sample-btn')!.addEventListener('click', loadSampleData);
  welcome.querySelector('#welcome-upload-btn')!.addEventListener('click', () => fileInput.click());

  const dropArea = welcome.querySelector('#welcome-drop-area')!;
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

function renderDropZone(panel: HTMLElement) {
  const zone = document.createElement('div');
  zone.className = 'load-drop-zone';
  zone.innerHTML = `
    <div class="load-drop-area" id="load-drop-area">
      <div class="drop-zone-inner">
        <div class="icon">&#128194;</div>
        <div>
          <div class="label">Drag & drop a file here</div>
          <div class="sublabel">or click to browse (.csv, .xlsx, .xls)</div>
        </div>
      </div>
    </div>
    <div class="load-drop-buttons">
      <button class="btn-primary" id="load-open-btn">Open File</button>
      <button class="btn-primary load-sample-btn" id="load-sample-btn">Sample Data</button>
    </div>
  `;
  panel.appendChild(zone);

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,.tsv,.txt,.xlsx,.xls';
  fileInput.style.display = 'none';
  fileInput.id = 'load-file-input';
  panel.appendChild(fileInput);

  const dropArea = zone.querySelector('#load-drop-area')!;
  const openBtn = zone.querySelector('#load-open-btn')!;
  const sampleBtn = zone.querySelector('#load-sample-btn')!;

  dropArea.addEventListener('click', () => fileInput.click());
  openBtn.addEventListener('click', () => fileInput.click());
  sampleBtn.addEventListener('click', loadSampleData);

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
    // Guess columns for long format
    const guessed = guessColumns(state.headers, state.rawData);
    state.longIdCol = guessed.idCol;
    state.longTimeCol = guessed.timeCol;
    state.longStateCol = guessed.stateCol;
    hideLoading();
    rerenderPanel();
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
    // Use enhanced format detection
    const detected = detectBestFormat(state.headers, state.rawData);
    state.format = detected;
    if (detected === 'long') {
      const guessed = guessColumns(state.headers, state.rawData);
      state.longIdCol = guessed.idCol;
      state.longTimeCol = guessed.timeCol;
      state.longStateCol = guessed.stateCol;
    }
    // Auto-select all binary columns for one-hot
    if (detected === 'onehot' || detected === 'wide') {
      const binaryCols = detectBinaryCols(state.headers, state.rawData);
      state.onehotCols = binaryCols.map(c => state.headers[c]!);
    }
    hideLoading();
    rerenderPanel();
  } catch (err) {
    hideLoading();
    alert('Error parsing file: ' + (err as Error).message);
  }
}

/** Re-render just the load panel (no full render() call). */
function rerenderPanel() {
  const existing = document.querySelector('.load-panel');
  if (existing) {
    existing.innerHTML = '';
    renderDropZone(existing as HTMLElement);
    if (state.rawData.length > 0) {
      renderFileInfo(existing as HTMLElement);
      renderFormatTabs(existing as HTMLElement);
      renderFormatOptions(existing as HTMLElement);
      renderAnalyzeButton(existing as HTMLElement);
      renderPreviewTable(existing as HTMLElement);
    }
  }
}

function renderFileInfo(panel: HTMLElement) {
  const info = document.createElement('div');
  info.className = 'load-file-info';
  info.innerHTML = `
    <span class="load-filename">${escHtml(state.filename)}</span>
    <span class="load-stats">${state.rawData.length} rows &middot; ${state.headers.length} columns</span>
  `;
  panel.appendChild(info);
}

function renderFormatTabs(panel: HTMLElement) {
  const tabs = document.createElement('div');
  tabs.className = 'format-tabs';
  tabs.id = 'format-tabs';

  const formats: { id: string; label: string }[] = [
    { id: 'long', label: 'Long' },
    { id: 'onehot', label: 'One-Hot' },
    { id: 'group_onehot', label: 'Group One-Hot' },
    { id: 'wide', label: 'Wide' },
  ];

  for (const fmt of formats) {
    const btn = document.createElement('button');
    btn.textContent = fmt.label;
    btn.dataset.format = fmt.id;
    if (fmt.id === state.format) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const prevFormat = state.format;
      state.format = fmt.id as typeof state.format;
      // Switching between onehot and group_onehot needs a full re-render
      // (Group column dropdown only exists for group_onehot)
      const switchedOnehotVariant =
        (prevFormat === 'onehot' && state.format === 'group_onehot') ||
        (prevFormat === 'group_onehot' && state.format === 'onehot');
      if (switchedOnehotVariant) {
        rerenderPanel();
      } else {
        tabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateFormatOptions();
      }
    });
    tabs.appendChild(btn);
  }
  panel.appendChild(tabs);
}

function updateFormatOptions() {
  const longOpts = document.getElementById('load-long-opts');
  const onehotOpts = document.getElementById('load-onehot-opts');
  if (longOpts) longOpts.style.display = state.format === 'long' ? 'flex' : 'none';
  if (onehotOpts) onehotOpts.style.display = (state.format === 'onehot' || state.format === 'group_onehot') ? 'block' : 'none';
}

function renderFormatOptions(panel: HTMLElement) {
  // ─── Long format options ───
  const longOpts = document.createElement('div');
  longOpts.className = 'load-format-options';
  longOpts.id = 'load-long-opts';
  longOpts.style.display = state.format === 'long' ? 'flex' : 'none';

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
    <label>Actor/ID:</label>
    <select id="load-long-id">${makeColOpts(state.longIdCol)}</select>
    <label>Time:</label>
    <select id="load-long-time">${makeColOpts(state.longTimeCol, true)}</select>
    <label>Action:</label>
    <select id="load-long-state">${makeColOpts(state.longStateCol)}</select>
    <label>Group:</label>
    <select id="load-long-group">${makeGroupOpts(state.longGroupCol)}</select>
  `;
  panel.appendChild(longOpts);

  // Wire long-format change handlers
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

  // Non-binary columns for actor/session dropdowns
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
    ? `<label>Group:</label>
       <select id="load-onehot-group">${nonBinaryColOpts(state.onehotGroupCol)}</select>`
    : '';

  onehotOpts.innerHTML = `
    ${colChecksHtml}
    <div class="load-onehot-dropdowns">
      <label>Actor:</label>
      <select id="load-onehot-actor">${nonBinaryColOpts(state.onehotActorCol)}</select>
      ${groupColHtml}
      <label>Session:</label>
      <select id="load-onehot-session">${nonBinaryColOpts(state.onehotSessionCol)}</select>
      <label>Window size:</label>
      <input type="number" id="load-onehot-window-size" value="${state.onehotWindowSize}" min="1" max="100" style="width:60px">
      <label>Window type:</label>
      <select id="load-onehot-window-type">
        <option value="tumbling" ${state.onehotWindowType === 'tumbling' ? 'selected' : ''}>Tumbling</option>
        <option value="sliding" ${state.onehotWindowType === 'sliding' ? 'selected' : ''}>Sliding</option>
      </select>
    </div>
  `;
  panel.appendChild(onehotOpts);

  // Wire one-hot event handlers
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
}

function renderPreviewTable(panel: HTMLElement) {
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
  panel.appendChild(tableWrap);
}

function renderAnalyzeButton(panel: HTMLElement) {
  const actions = document.createElement('div');
  actions.className = 'load-actions';
  actions.innerHTML = `<button class="btn-primary" id="load-analyze-btn">Analyze</button>`;
  panel.appendChild(actions);

  actions.querySelector('#load-analyze-btn')!.addEventListener('click', () => {
    try {
      if (state.format === 'wide') {
        state.sequenceData = wideToSequences(state.rawData);
        state.groupLabels = null;
        state.longGroupCol = -1;
      } else if (state.format === 'onehot' || state.format === 'group_onehot') {
        analyzeOnehot();
      } else {
        // Long format
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

      // Reset active group when loading new data
      state.activeGroup = null;
      // Route to the correct analysis mode based on format
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
      render();
    } catch (err) {
      alert('Error building sequences: ' + (err as Error).message);
    }
  });
}

function analyzeOnehot() {
  // Gather selected binary columns
  const checks = document.querySelectorAll('.onehot-col-check') as NodeListOf<HTMLInputElement>;
  const selectedCols: string[] = [];
  checks.forEach(c => { if (c.checked) selectedCols.push(c.dataset.col!); });
  if (selectedCols.length < 2) {
    alert('Select at least 2 binary columns for one-hot analysis.');
    throw new Error('cancelled');
  }
  state.onehotCols = selectedCols;

  // Build records for importOnehot
  const records: Record<string, number>[] = state.rawData.map(row => {
    const rec: Record<string, number> = {};
    for (let c = 0; c < state.headers.length; c++) {
      rec[state.headers[c]!] = parseInt(row[c] ?? '0', 10) || 0;
    }
    return rec;
  });

  // Build options
  const opts: { actor?: string; session?: string; windowSize?: number; windowType?: 'tumbling' | 'sliding' } = {};
  if (state.onehotActorCol >= 0) {
    opts.actor = state.headers[state.onehotActorCol]!;
    // Actor column values need to be in records as strings mapped to numbers — but actor is a string column.
    // We need to put the actual string values back for grouping. importOnehot uses the actor field as a
    // column name to group by, so we need to include it in the records even if not numeric.
    for (let i = 0; i < state.rawData.length; i++) {
      const val = (state.rawData[i]![state.onehotActorCol] ?? '').trim();
      // Use a hash-like numeric mapping so importOnehot can group by it
      // Actually importOnehot reads the raw value from the record, so we need it there
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
    // Extract group labels: one per sequence (actor), using the group column.
    // Each unique actor maps to one sequence; the group label for that actor is taken
    // from the group column of their first row.
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
    // Ensure labels array matches sequenceData length
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
