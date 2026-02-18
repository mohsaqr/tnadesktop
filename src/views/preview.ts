/**
 * Data preview screen: shows parsed data table and format selection.
 */
import { state, render, importOnehot } from '../main';
import { wideToSequences, longToSequences, guessColumns } from '../data';

export function renderPreview(container: HTMLElement) {
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <h1>TNA Desktop</h1>
    <span class="filename">${state.filename}</span>
    <div class="spacer"></div>
  `;
  container.appendChild(toolbar);

  const screen = document.createElement('div');
  screen.className = 'preview-screen';
  container.appendChild(screen);

  // Header
  const header = document.createElement('div');
  header.className = 'preview-header';
  const nRows = state.rawData.length;
  const nCols = state.headers.length;
  header.innerHTML = `
    <h2>Data Preview</h2>
    <div class="preview-info">
      <span><strong>${nRows}</strong> rows</span>
      <span><strong>${nCols}</strong> columns</span>
    </div>
  `;
  screen.appendChild(header);

  // Guess columns for long format
  const guessed = guessColumns(state.headers, state.rawData);
  if (state.format === 'long') {
    state.longIdCol = guessed.idCol;
    state.longTimeCol = guessed.timeCol;
    state.longStateCol = guessed.stateCol;
  }

  // Format selector
  const formatDiv = document.createElement('div');
  formatDiv.className = 'format-selector';
  formatDiv.innerHTML = `
    <label>Format:</label>
    <select id="format-select">
      <option value="wide" ${state.format === 'wide' ? 'selected' : ''}>Wide (rows = sequences, cols = time steps)</option>
      <option value="long" ${state.format === 'long' ? 'selected' : ''}>Long (ID, time, state columns)</option>
      <option value="onehot" ${state.format === 'onehot' ? 'selected' : ''}>One-Hot (binary 0/1 columns)</option>
    </select>
  `;
  screen.appendChild(formatDiv);

  // Long format column selectors (with "None" for time)
  const longCols = document.createElement('div');
  longCols.className = 'format-selector';
  longCols.id = 'long-cols';
  longCols.style.display = state.format === 'long' ? 'flex' : 'none';

  const makeColOpts = (selected: number, includeNone = false) => {
    let opts = includeNone ? `<option value="-1" ${selected === -1 ? 'selected' : ''}>None (row order)</option>` : '';
    opts += state.headers.map((h, i) =>
      `<option value="${i}" ${i === selected ? 'selected' : ''}>${h}</option>`
    ).join('');
    return opts;
  };

  const makeGroupOpts = (selected: number) => {
    let opts = `<option value="-1" ${selected === -1 ? 'selected' : ''}>None (single TNA)</option>`;
    opts += state.headers.map((h, i) =>
      `<option value="${i}" ${i === selected ? 'selected' : ''}>${h}</option>`
    ).join('');
    return opts;
  };

  longCols.innerHTML = `
    <label>ID col:</label>
    <select id="long-id">${makeColOpts(state.longIdCol)}</select>
    <label>Time col:</label>
    <select id="long-time">${makeColOpts(state.longTimeCol, true)}</select>
    <label>State col:</label>
    <select id="long-state">${makeColOpts(state.longStateCol)}</select>
    <label>Group col:</label>
    <select id="long-group">${makeGroupOpts(state.longGroupCol)}</select>
  `;
  screen.appendChild(longCols);

  // One-hot column selector (checkboxes for binary columns)
  const onehotDiv = document.createElement('div');
  onehotDiv.className = 'format-selector';
  onehotDiv.id = 'onehot-cols';
  onehotDiv.style.display = state.format === 'onehot' ? 'flex' : 'none';
  onehotDiv.style.flexWrap = 'wrap';
  onehotDiv.style.gap = '8px';
  onehotDiv.style.alignItems = 'center';

  // Detect binary columns (all values are 0 or 1)
  const binaryCols: number[] = [];
  for (let c = 0; c < state.headers.length; c++) {
    const sample = state.rawData.slice(0, 50);
    const allBinary = sample.every(row => {
      const v = (row[c] ?? '').trim();
      return v === '0' || v === '1' || v === '';
    });
    if (allBinary) binaryCols.push(c);
  }

  let onehotHtml = '<label style="font-weight:600;width:100%">Select binary state columns:</label>';
  if (binaryCols.length === 0) {
    onehotHtml += '<span style="color:#888;font-size:12px">No binary (0/1) columns detected.</span>';
  } else {
    for (const c of binaryCols) {
      const checked = state.onehotCols.includes(state.headers[c]!) ? 'checked' : '';
      onehotHtml += `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
        <input type="checkbox" class="onehot-col-check" data-col="${state.headers[c]}" ${checked}>
        ${escHtml(state.headers[c]!)}
      </label>`;
    }
    onehotHtml += `<button id="onehot-select-all" style="font-size:11px;padding:2px 8px;margin-left:8px;cursor:pointer">Select All</button>`;
  }
  onehotDiv.innerHTML = onehotHtml;
  screen.appendChild(onehotDiv);

  // Table
  const tableWrap = document.createElement('div');
  tableWrap.className = 'preview-table-wrap';
  const maxPreview = Math.min(nRows, 50);
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
  screen.appendChild(tableWrap);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'preview-actions';
  actions.innerHTML = `
    <button class="btn-secondary" id="back-btn">Back</button>
    <button class="btn-primary" id="analyze-btn">Analyze</button>
  `;
  screen.appendChild(actions);

  // Events
  document.getElementById('format-select')!.addEventListener('change', (e) => {
    state.format = (e.target as HTMLSelectElement).value as 'wide' | 'long' | 'onehot';
    document.getElementById('long-cols')!.style.display = state.format === 'long' ? 'flex' : 'none';
    document.getElementById('onehot-cols')!.style.display = state.format === 'onehot' ? 'flex' : 'none';
  });

  // One-hot: select-all button
  document.getElementById('onehot-select-all')?.addEventListener('click', () => {
    const checks = document.querySelectorAll('.onehot-col-check') as NodeListOf<HTMLInputElement>;
    const allChecked = Array.from(checks).every(c => c.checked);
    checks.forEach(c => { c.checked = !allChecked; });
  });

  document.getElementById('back-btn')!.addEventListener('click', () => {
    state.view = 'welcome';
    render();
  });

  document.getElementById('analyze-btn')!.addEventListener('click', () => {
    try {
      if (state.format === 'wide') {
        state.sequenceData = wideToSequences(state.rawData);
        state.groupLabels = null;
        state.longGroupCol = -1;
      } else if (state.format === 'onehot') {
        // Gather selected binary columns
        const checks = document.querySelectorAll('.onehot-col-check') as NodeListOf<HTMLInputElement>;
        const selectedCols: string[] = [];
        checks.forEach(c => { if (c.checked) selectedCols.push(c.dataset.col!); });
        if (selectedCols.length < 2) {
          alert('Select at least 2 binary columns for one-hot analysis.');
          return;
        }
        state.onehotCols = selectedCols;
        // Convert rawData rows into record objects for importOnehot
        const records: Record<string, number>[] = state.rawData.map(row => {
          const rec: Record<string, number> = {};
          for (let c = 0; c < state.headers.length; c++) {
            rec[state.headers[c]!] = parseInt(row[c] ?? '0', 10) || 0;
          }
          return rec;
        });
        state.sequenceData = importOnehot(records, selectedCols);
        state.groupLabels = null;
        state.longGroupCol = -1;
        // Default to CTNA for co-occurrence data
        state.modelType = 'ctna';
      } else {
        const idCol = parseInt((document.getElementById('long-id') as HTMLSelectElement).value);
        const timeCol = parseInt((document.getElementById('long-time') as HTMLSelectElement).value);
        const stateCol = parseInt((document.getElementById('long-state') as HTMLSelectElement).value);
        const groupCol = parseInt((document.getElementById('long-group') as HTMLSelectElement).value);
        state.longIdCol = idCol;
        state.longTimeCol = timeCol;
        state.longStateCol = stateCol;
        state.longGroupCol = groupCol;
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

      state.view = 'dashboard';
      render();
    } catch (err) {
      alert('Error building sequences: ' + (err as Error).message);
    }
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
