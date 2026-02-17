/**
 * Export functionality: PNG, CSV, PDF.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { TNA, CentralityResult } from 'tnaj';

export function showExportDialog(model: TNA, cent: CentralityResult) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Export Results</h3>
      <div class="export-option" id="export-png">
        <div class="icon">&#128247;</div>
        <div class="info">
          <h4>Network Graph (PNG)</h4>
          <p>Save the network visualization as an image</p>
        </div>
      </div>
      <div class="export-option" id="export-csv">
        <div class="icon">&#128196;</div>
        <div class="info">
          <h4>Centralities (CSV)</h4>
          <p>Export centrality measures as a CSV table</p>
        </div>
      </div>
      <div class="export-option" id="export-weights">
        <div class="icon">&#128202;</div>
        <div class="info">
          <h4>Weight Matrix (CSV)</h4>
          <p>Export the transition weight matrix</p>
        </div>
      </div>
      <div class="export-option" id="export-pdf">
        <div class="icon">&#128209;</div>
        <div class="info">
          <h4>Full Report (PDF)</h4>
          <p>Generate a multi-page PDF with all visualizations</p>
        </div>
      </div>
      <button class="modal-close" id="export-close">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('export-close')!.addEventListener('click', () => overlay.remove());

  document.getElementById('export-png')!.addEventListener('click', () => {
    overlay.remove();
    exportPng();
  });
  document.getElementById('export-csv')!.addEventListener('click', () => {
    overlay.remove();
    exportCentralitiesCsv(model, cent);
  });
  document.getElementById('export-weights')!.addEventListener('click', () => {
    overlay.remove();
    exportWeightsCsv(model);
  });
  document.getElementById('export-pdf')!.addEventListener('click', () => {
    overlay.remove();
    exportPdf(model, cent);
  });
}

async function exportPng() {
  const networkEl = document.getElementById('viz-network');
  if (!networkEl) return;

  try {
    const canvas = await html2canvas(networkEl, { backgroundColor: '#fff', scale: 2 });
    const link = document.createElement('a');
    link.download = 'tna-network.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    // Fallback: serialize SVG
    const svg = networkEl.querySelector('svg');
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = 'tna-network.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
  }
}

function exportCentralitiesCsv(model: TNA, cent: CentralityResult) {
  const measures = Object.keys(cent.measures) as (keyof typeof cent.measures)[];
  let csv = 'State,' + measures.join(',') + '\n';
  for (let i = 0; i < cent.labels.length; i++) {
    csv += cent.labels[i];
    for (const m of measures) {
      csv += ',' + cent.measures[m]![i]!.toFixed(6);
    }
    csv += '\n';
  }
  downloadText(csv, 'tna-centralities.csv', 'text/csv');
}

function exportWeightsCsv(model: TNA) {
  const n = model.labels.length;
  let csv = ',' + model.labels.join(',') + '\n';
  for (let i = 0; i < n; i++) {
    csv += model.labels[i]!;
    for (let j = 0; j < n; j++) {
      csv += ',' + model.weights.get(i, j).toFixed(6);
    }
    csv += '\n';
  }
  downloadText(csv, 'tna-weights.csv', 'text/csv');
}

async function exportPdf(model: TNA, cent: CentralityResult) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title page
  doc.setFontSize(24);
  doc.text('TNA Analysis Report', 20, 30);
  doc.setFontSize(12);
  doc.text(`Model: ${model.type}`, 20, 45);
  doc.text(`States: ${model.labels.length}`, 20, 52);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 59);

  // Centralities table
  doc.addPage();
  doc.setFontSize(16);
  doc.text('Centrality Measures', 20, 20);
  doc.setFontSize(9);

  const measures = Object.keys(cent.measures) as (keyof typeof cent.measures)[];
  let y = 35;
  // Header
  doc.setFont(undefined!, 'bold');
  doc.text('State', 20, y);
  measures.forEach((m, i) => doc.text(m, 50 + i * 30, y));
  doc.setFont(undefined!, 'normal');
  y += 7;

  for (let i = 0; i < cent.labels.length; i++) {
    doc.text(cent.labels[i]!, 20, y);
    measures.forEach((m, j) => {
      doc.text(cent.measures[m]![i]!.toFixed(4), 50 + j * 30, y);
    });
    y += 6;
  }

  // Weight matrix
  doc.addPage();
  doc.setFontSize(16);
  doc.text('Transition Weight Matrix', 20, 20);
  doc.setFontSize(8);

  const n = model.labels.length;
  y = 35;
  doc.setFont(undefined!, 'bold');
  doc.text('', 20, y);
  model.labels.forEach((l, i) => doc.text(l, 45 + i * 22, y));
  doc.setFont(undefined!, 'normal');
  y += 6;

  for (let i = 0; i < n; i++) {
    doc.setFont(undefined!, 'bold');
    doc.text(model.labels[i]!, 20, y);
    doc.setFont(undefined!, 'normal');
    for (let j = 0; j < n; j++) {
      doc.text(model.weights.get(i, j).toFixed(3), 45 + j * 22, y);
    }
    y += 5;
  }

  // Capture visualizations as images
  const panels = ['viz-network', 'viz-cent-1', 'viz-cent-2'];
  for (const id of panels) {
    const el = document.getElementById(id);
    if (!el) continue;
    try {
      const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      doc.addPage();
      doc.addImage(imgData, 'PNG', 10, 10, 277, 170);
    } catch {
      // Skip if capture fails
    }
  }

  doc.save('tna-report.pdf');
}

export function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
}

// ═══════════════════════════════════════════════════════════
//  Per-panel download helpers
// ═══════════════════════════════════════════════════════════

/** Clone an SVG element and download as .svg file. */
export function downloadSvgFromElement(container: HTMLElement, filename: string) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const data = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([data], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  link.href = URL.createObjectURL(blob);
  link.click();
}

/** Render an element to PNG via html2canvas (scale 2×), with SVG fallback. */
export async function downloadPngFromElement(container: HTMLElement, filename: string) {
  const fname = filename.endsWith('.png') ? filename : `${filename}.png`;
  try {
    const canvas = await html2canvas(container, { backgroundColor: '#fff', scale: 2 });
    const link = document.createElement('a');
    link.download = fname;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    // Fallback: serialize SVG
    downloadSvgFromElement(container, filename.replace(/\.png$/, '.svg'));
  }
}

/** Extract rows/cells from an HTML table and download as CSV. */
export function downloadTableAsCsv(tableOrContainer: HTMLElement, filename: string) {
  const table = tableOrContainer.tagName === 'TABLE'
    ? tableOrContainer as HTMLTableElement
    : tableOrContainer.querySelector('table');
  if (!table) return;

  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach(tr => {
    const cells: string[] = [];
    tr.querySelectorAll('th, td').forEach(cell => {
      let text = (cell as HTMLElement).innerText.replace(/"/g, '""').trim();
      cells.push(`"${text}"`);
    });
    if (cells.length > 0) rows.push(cells);
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  const fname = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  downloadText(csv, fname, 'text/csv');
}

interface PanelDownloadOptions {
  /** Base filename without extension. */
  filename: string;
  /** If true, offer SVG + PNG download (panel must contain an SVG). */
  image?: boolean;
  /** If true, offer CSV download (panel must contain a table). */
  csv?: boolean;
}

/**
 * Append small download buttons to a panel's .panel-title element.
 * PNG always captures the entire panel. SVG extracts the inner <svg>.
 * CSV extracts data from any <table> inside the panel.
 */
export function addPanelDownloadButtons(panelEl: HTMLElement, opts: PanelDownloadOptions) {
  const titleEl = panelEl.querySelector('.panel-title');
  if (!titleEl) return;

  // Make title a flex row so buttons push to the right
  (titleEl as HTMLElement).style.display = 'flex';
  (titleEl as HTMLElement).style.alignItems = 'center';

  const wrap = document.createElement('span');
  wrap.className = 'panel-download-btns';

  if (opts.image) {
    const svgBtn = document.createElement('button');
    svgBtn.className = 'panel-dl-btn';
    svgBtn.textContent = 'SVG';
    svgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadSvgFromElement(panelEl, opts.filename);
    });
    wrap.appendChild(svgBtn);

    const pngBtn = document.createElement('button');
    pngBtn.className = 'panel-dl-btn';
    pngBtn.textContent = 'PNG';
    pngBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadPngFromElement(panelEl, opts.filename);
    });
    wrap.appendChild(pngBtn);
  }

  if (opts.csv) {
    const csvBtn = document.createElement('button');
    csvBtn.className = 'panel-dl-btn';
    csvBtn.textContent = 'CSV';
    csvBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadTableAsCsv(panelEl, opts.filename);
    });
    wrap.appendChild(csvBtn);
  }

  titleEl.appendChild(wrap);
}
