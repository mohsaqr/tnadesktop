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
      <div class="export-option" id="export-html">
        <div class="icon">&#127760;</div>
        <div class="info">
          <h4>Full Report (HTML)</h4>
          <p>Self-contained HTML file with tables and images</p>
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
  document.getElementById('export-html')!.addEventListener('click', () => {
    overlay.remove();
    exportHtml(model, cent);
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

async function exportHtml(model: TNA, cent: CentralityResult) {
  const measures = Object.keys(cent.measures) as (keyof typeof cent.measures)[];
  const n = model.labels.length;

  // --- Centralities table ---
  let centRows = '';
  for (let i = 0; i < cent.labels.length; i++) {
    const cls = i % 2 === 0 ? 'even' : 'odd';
    centRows += `<tr class="${cls}"><td>${cent.labels[i]}</td>`;
    for (const m of measures) {
      centRows += `<td>${cent.measures[m]![i]!.toFixed(4)}</td>`;
    }
    centRows += '</tr>';
  }
  const centHeaders = '<th>State</th>' + measures.map(m => `<th>${m}</th>`).join('');

  // --- Weight matrix table ---
  let weightRows = '';
  for (let i = 0; i < n; i++) {
    const cls = i % 2 === 0 ? 'even' : 'odd';
    weightRows += `<tr class="${cls}"><td><strong>${model.labels[i]}</strong></td>`;
    for (let j = 0; j < n; j++) {
      weightRows += `<td>${model.weights.get(i, j).toFixed(4)}</td>`;
    }
    weightRows += '</tr>';
  }
  const weightHeaders = '<th></th>' + model.labels.map(l => `<th>${l}</th>`).join('');

  // --- Capture visible panel visualizations ---
  let imagesHtml = '';
  const tabContent = document.getElementById('tab-content');
  if (tabContent) {
    const panels = tabContent.querySelectorAll('.panel');
    for (const panel of panels) {
      const el = panel as HTMLElement;
      if (!el.querySelector('svg, canvas')) continue;
      const titleEl = el.querySelector('.panel-title');
      const title = titleEl ? (titleEl as HTMLElement).innerText.replace(/SVG|PNG|CSV/g, '').trim() : 'Visualization';
      try {
        const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 2 });
        const dataUrl = canvas.toDataURL('image/png');
        imagesHtml += `<h2>${title}</h2><img src="${dataUrl}" alt="${title}">\n`;
      } catch {
        // skip panels that fail
      }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TNA Analysis Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.5; }
  h1 { border-bottom: 2px solid #333; padding-bottom: .4em; }
  h2 { margin-top: 2rem; color: #333; }
  .meta { color: #555; margin-bottom: 2rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0 2rem; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  tr.odd td { background: #fafafa; }
  tr.even td { background: #fff; }
  img { max-width: 100%; height: auto; margin: 1rem 0; border: 1px solid #e0e0e0; border-radius: 4px; }
  @media print { body { padding: 0; } img { break-inside: avoid; } }
</style>
</head>
<body>
<h1>TNA Analysis Report</h1>
<p class="meta">Model: <strong>${model.type}</strong> &nbsp;|&nbsp; States: <strong>${n}</strong> &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString()}</p>

<h2>Centrality Measures</h2>
<table>${centHeaders}${centRows}</table>

<h2>Transition Weight Matrix</h2>
<table>${weightHeaders}${weightRows}</table>

${imagesHtml}
</body>
</html>`;

  downloadText(html, 'tna-report.html', 'text/html');
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
