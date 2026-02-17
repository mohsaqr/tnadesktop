/**
 * Welcome screen: file drop zone + open button.
 */
import { state, render, showLoading, hideLoading } from '../main';
import { parseFile } from '../data';
import sampleCsv from '../sample-data.csv?raw';

export function renderWelcome(container: HTMLElement) {
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `<h1>TNA Desktop</h1><div class="spacer"></div>`;
  container.appendChild(toolbar);

  // Welcome card
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <div class="welcome-card">
      <h2>Transition Network Analysis</h2>
      <p>Load a CSV or Excel file containing sequential data to get started.<br>
      Rows represent sequences, columns represent time steps.</p>
      <div class="drop-zone" id="drop-zone">
        <div class="icon">&#128194;</div>
        <div class="label">Drag & drop a file here</div>
        <div class="sublabel">or click to browse (.csv, .xlsx, .xls)</div>
      </div>
      <button class="btn-primary" id="open-btn">Open File</button>
      <button class="btn-primary" id="sample-btn" style="margin-left:8px;background:#5a8f5a">Load Sample Data</button>
    </div>
  `;
  container.appendChild(welcome);

  // File input (hidden)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,.tsv,.txt,.xlsx,.xls';
  fileInput.style.display = 'none';
  container.appendChild(fileInput);

  const dropZone = document.getElementById('drop-zone')!;
  const openBtn = document.getElementById('open-btn')!;

  // Click handlers
  dropZone.addEventListener('click', () => fileInput.click());
  openBtn.addEventListener('click', () => fileInput.click());
  document.getElementById('sample-btn')!.addEventListener('click', loadSampleData);

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
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
    state.view = 'preview';
    hideLoading();
    render();
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
    state.format = result.format;
    state.view = 'preview';
    hideLoading();
    render();
  } catch (err) {
    hideLoading();
    state.error = (err as Error).message;
    alert('Error parsing file: ' + state.error);
  }
}
