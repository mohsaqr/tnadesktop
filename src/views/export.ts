/**
 * Export functionality: PNG, CSV, HTML, PDF.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { TNA, CentralityResult } from 'tnaj';
import { captureAllTabs, isGroupAnalysisActive, getActiveGroupModels, getActiveGroupCents } from './dashboard';
import { fmtNum } from './network';

export function showExportDialog(model: TNA, cent: CentralityResult) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Export Results</h3>
      <div class="export-option" id="export-html">
        <div class="icon">&#127760;</div>
        <div class="info">
          <h4>Current Analysis (HTML)</h4>
          <p>HTML report of tabs you have already viewed</p>
        </div>
      </div>
      <div class="export-option" id="export-pdf">
        <div class="icon">&#128209;</div>
        <div class="info">
          <h4>Current Analysis (PDF)</h4>
          <p>PDF report of tabs you have already viewed</p>
        </div>
      </div>
      <div class="export-option" id="export-full-html">
        <div class="icon">&#128218;</div>
        <div class="info">
          <h4>Full Analysis (HTML)</h4>
          <p>Generate complete HTML report with all tabs</p>
        </div>
      </div>
      <div class="export-option" id="export-full-pdf">
        <div class="icon">&#128214;</div>
        <div class="info">
          <h4>Full Analysis (PDF)</h4>
          <p>Generate complete PDF report with all tabs</p>
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

  document.getElementById('export-html')!.addEventListener('click', () => {
    overlay.remove();
    exportHtml(model, cent, true);
  });
  document.getElementById('export-pdf')!.addEventListener('click', () => {
    overlay.remove();
    exportPdf(model, cent, true);
  });
  document.getElementById('export-full-html')!.addEventListener('click', () => {
    overlay.remove();
    exportHtml(model, cent, false);
  });
  document.getElementById('export-full-pdf')!.addEventListener('click', () => {
    overlay.remove();
    exportPdf(model, cent, false);
  });
}

async function exportPng() {
  const networkEl = document.getElementById('viz-network');
  if (!networkEl) return;

  try {
    const canvas = await html2canvas(networkEl, { backgroundColor: '#fff', scale: 1.5 });
    const link = document.createElement('a');
    link.download = 'dynalytics-network.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    const svg = networkEl.querySelector('svg');
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = 'dynalytics-network.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
  }
}

function exportCentralitiesCsv(model: TNA, cent: CentralityResult) {
  if (isGroupAnalysisActive()) {
    const groupCents = getActiveGroupCents();
    const groups = Array.from(groupCents.keys()).sort();
    if (groups.length > 0) {
      const first = groupCents.get(groups[0]!)!;
      const measures = Object.keys(first.measures) as (keyof typeof first.measures)[];
      let csv = 'Group,State,' + measures.join(',') + '\n';
      for (const gName of groups) {
        const gc = groupCents.get(gName)!;
        for (let i = 0; i < gc.labels.length; i++) {
          csv += `"${gName}",${gc.labels[i]}`;
          for (const m of measures) {
            csv += ',' + gc.measures[m]![i]!.toFixed(6);
          }
          csv += '\n';
        }
      }
      downloadText(csv, 'dynalytics-centralities-groups.csv', 'text/csv');
      return;
    }
  }
  const measures = Object.keys(cent.measures) as (keyof typeof cent.measures)[];
  let csv = 'State,' + measures.join(',') + '\n';
  for (let i = 0; i < cent.labels.length; i++) {
    csv += cent.labels[i];
    for (const m of measures) {
      csv += ',' + cent.measures[m]![i]!.toFixed(6);
    }
    csv += '\n';
  }
  downloadText(csv, 'dynalytics-centralities.csv', 'text/csv');
}

function exportWeightsCsv(model: TNA) {
  if (isGroupAnalysisActive()) {
    const groupModels = getActiveGroupModels();
    const groups = Array.from(groupModels.keys()).sort();
    if (groups.length > 0) {
      let csv = '';
      for (const gName of groups) {
        const gm = groupModels.get(gName)!;
        const n = gm.labels.length;
        csv += `# Group: ${gName}\n`;
        csv += ',' + gm.labels.join(',') + '\n';
        for (let i = 0; i < n; i++) {
          csv += gm.labels[i]!;
          for (let j = 0; j < n; j++) {
            csv += ',' + gm.weights.get(i, j).toFixed(6);
          }
          csv += '\n';
        }
        csv += '\n';
      }
      downloadText(csv, 'dynalytics-weights-groups.csv', 'text/csv');
      return;
    }
  }
  const n = model.labels.length;
  let csv = ',' + model.labels.join(',') + '\n';
  for (let i = 0; i < n; i++) {
    csv += model.labels[i]!;
    for (let j = 0; j < n; j++) {
      csv += ',' + model.weights.get(i, j).toFixed(6);
    }
    csv += '\n';
  }
  downloadText(csv, 'dynalytics-weights.csv', 'text/csv');
}

function showProgressOverlay(message: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="modal" style="text-align:center;max-width:320px">
      <div class="spinner" style="width:24px;height:24px;border-width:3px;margin:0 auto 16px"></div>
      <div id="export-progress-msg" style="font-size:14px;color:#555">${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

async function exportHtml(model: TNA, cent: CentralityResult, onlyVisited: boolean) {
  const label = onlyVisited ? 'current analysis' : 'full analysis';
  const overlay = showProgressOverlay(`Generating ${label} HTML report...`);

  try {
    const sections = await captureAllTabs(onlyVisited, (cur, tot) => {
      const msg = document.getElementById('export-progress-msg');
      if (msg) msg.textContent = `Capturing tab ${cur}/${tot}...`;
    });

    if (sections.length === 0) {
      overlay.remove();
      alert(onlyVisited
        ? 'No tabs have been viewed yet. Visit some analysis tabs first, or use "Full Analysis" to generate a complete report.'
        : 'No panels could be captured.');
      return;
    }

    const isGroup = isGroupAnalysisActive();
    const groupModels = isGroup ? getActiveGroupModels() : null;
    const groupCents = isGroup ? getActiveGroupCents() : null;
    const groups = groupModels ? Array.from(groupModels.keys()).sort() : [];

    const n = model.labels.length;

    // --- Build centrality + weight tables ---
    let tablesHtml = '';

    if (isGroup && groupCents && groups.length > 0) {
      // Per-group centralities
      for (const gName of groups) {
        const gc = groupCents.get(gName)!;
        const measures = Object.keys(gc.measures) as (keyof typeof gc.measures)[];
        const centHeaders = '<th>State</th>' + measures.map(m => `<th>${m}</th>`).join('');
        let centRows = '';
        for (let i = 0; i < gc.labels.length; i++) {
          const cls = i % 2 === 0 ? 'even' : 'odd';
          centRows += `<tr class="${cls}"><td>${gc.labels[i]}</td>`;
          for (const m of measures) {
            centRows += `<td>${fmtNum(gc.measures[m]![i]!)}</td>`;
          }
          centRows += '</tr>';
        }
        tablesHtml += `<h2>Centrality Measures — ${gName}</h2>\n`;
        tablesHtml += `<table><thead><tr>${centHeaders}</tr></thead><tbody>${centRows}</tbody></table>\n`;
      }
      // Per-group weight matrices
      for (const gName of groups) {
        const gm = groupModels!.get(gName)!;
        const gn = gm.labels.length;
        const weightHeaders = '<th></th>' + gm.labels.map(l => `<th>${l}</th>`).join('');
        let weightRows = '';
        for (let i = 0; i < gn; i++) {
          const cls = i % 2 === 0 ? 'even' : 'odd';
          weightRows += `<tr class="${cls}"><td><strong>${gm.labels[i]}</strong></td>`;
          for (let j = 0; j < gn; j++) {
            weightRows += `<td>${fmtNum(gm.weights.get(i, j))}</td>`;
          }
          weightRows += '</tr>';
        }
        tablesHtml += `<h2>Weight Matrix — ${gName}</h2>\n`;
        tablesHtml += `<table><thead><tr>${weightHeaders}</tr></thead><tbody>${weightRows}</tbody></table>\n`;
      }
    } else {
      // Single model
      const measures = Object.keys(cent.measures) as (keyof typeof cent.measures)[];
      const centHeaders = '<th>State</th>' + measures.map(m => `<th>${m}</th>`).join('');
      let centRows = '';
      for (let i = 0; i < cent.labels.length; i++) {
        const cls = i % 2 === 0 ? 'even' : 'odd';
        centRows += `<tr class="${cls}"><td>${cent.labels[i]}</td>`;
        for (const m of measures) {
          centRows += `<td>${fmtNum(cent.measures[m]![i]!)}</td>`;
        }
        centRows += '</tr>';
      }
      tablesHtml += `<h2>Centrality Measures</h2>\n`;
      tablesHtml += `<table><thead><tr>${centHeaders}</tr></thead><tbody>${centRows}</tbody></table>\n`;

      const weightHeaders = '<th></th>' + model.labels.map(l => `<th>${l}</th>`).join('');
      let weightRows = '';
      for (let i = 0; i < n; i++) {
        const cls = i % 2 === 0 ? 'even' : 'odd';
        weightRows += `<tr class="${cls}"><td><strong>${model.labels[i]}</strong></td>`;
        for (let j = 0; j < n; j++) {
          weightRows += `<td>${fmtNum(model.weights.get(i, j))}</td>`;
        }
        weightRows += '</tr>';
      }
      tablesHtml += `<h2>Transition Weight Matrix</h2>\n`;
      tablesHtml += `<table><thead><tr>${weightHeaders}</tr></thead><tbody>${weightRows}</tbody></table>\n`;
    }

    // --- Group captured images by section ---
    let imagesHtml = '';
    let lastSection = '';
    for (const s of sections) {
      if (s.section !== lastSection) {
        imagesHtml += `<h2>${s.section}</h2>\n`;
        lastSection = s.section;
      }
      if (s.title) imagesHtml += `<h3>${s.title}</h3>\n`;
      imagesHtml += `<img src="${s.dataUrl}" alt="${s.title || s.section}">\n`;
    }

    const metaInfo = isGroup && groups.length > 0
      ? `Model: <strong>${model.type}</strong> &nbsp;|&nbsp; States: <strong>${n}</strong> &nbsp;|&nbsp; Groups: <strong>${groups.length}</strong> (${groups.join(', ')}) &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString()}`
      : `Model: <strong>${model.type}</strong> &nbsp;|&nbsp; States: <strong>${n}</strong> &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString()}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dynalytics Analysis Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.5; }
  h1 { border-bottom: 2px solid #333; padding-bottom: .4em; }
  h2 { margin-top: 2.5rem; color: #333; border-bottom: 1px solid #ddd; padding-bottom: .3em; }
  h3 { margin-top: 1rem; color: #555; font-size: 1em; }
  .meta { color: #555; margin-bottom: 2rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0 2rem; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  tr.odd td { background: #fafafa; }
  tr.even td { background: #fff; }
  img { max-width: 100%; height: auto; margin: .5rem 0 1rem; border: 1px solid #e0e0e0; border-radius: 4px; }
  @media print { body { padding: 0; } img { break-inside: avoid; } h2 { break-before: page; } }
</style>
</head>
<body>
<h1>Dynalytics Analysis Report</h1>
<p class="meta">${metaInfo}</p>

${tablesHtml}

${imagesHtml}
</body>
</html>`;

    downloadText(html, 'dynalytics-report.html', 'text/html');
  } finally {
    overlay.remove();
  }
}

async function exportPdf(model: TNA, cent: CentralityResult, onlyVisited: boolean) {
  const label = onlyVisited ? 'current analysis' : 'full analysis';
  const overlay = showProgressOverlay(`Generating ${label} PDF report...`);

  try {
    const sections = await captureAllTabs(onlyVisited, (cur, tot) => {
      const msg = document.getElementById('export-progress-msg');
      if (msg) msg.textContent = `Capturing tab ${cur}/${tot}...`;
    });

    if (sections.length === 0) {
      overlay.remove();
      alert(onlyVisited
        ? 'No tabs have been viewed yet. Visit some analysis tabs first, or use "Full Analysis" to generate a complete report.'
        : 'No panels could be captured.');
      return;
    }

    const isGroup = isGroupAnalysisActive();
    const groupModels = isGroup ? getActiveGroupModels() : null;
    const groupCents = isGroup ? getActiveGroupCents() : null;
    const groups = groupModels ? Array.from(groupModels.keys()).sort() : [];

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Title page
    doc.setFontSize(24);
    doc.text('Dynalytics Analysis Report', 20, 30);
    doc.setFontSize(12);
    doc.text(`Model: ${model.type}`, 20, 45);
    doc.text(`States: ${model.labels.length}`, 20, 52);
    if (isGroup && groups.length > 0) {
      doc.text(`Groups: ${groups.length} (${groups.join(', ')})`, 20, 59);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 66);
    } else {
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 59);
    }

    if (isGroup && groupCents && groups.length > 0) {
      // Per-group centralities
      for (const gName of groups) {
        const gc = groupCents.get(gName)!;
        const measures = Object.keys(gc.measures) as (keyof typeof gc.measures)[];
        doc.addPage();
        doc.setFontSize(16);
        doc.text(`Centrality Measures — ${gName}`, 20, 20);
        doc.setFontSize(9);
        let y = 35;
        doc.setFont(undefined!, 'bold');
        doc.text('State', 20, y);
        measures.forEach((m, i) => doc.text(m, 50 + i * 30, y));
        doc.setFont(undefined!, 'normal');
        y += 7;
        for (let i = 0; i < gc.labels.length; i++) {
          doc.text(gc.labels[i]!, 20, y);
          measures.forEach((m, j) => {
            doc.text(fmtNum(gc.measures[m]![i]!), 50 + j * 30, y);
          });
          y += 6;
          if (y > 185) { doc.addPage(); y = 20; }
        }
      }
      // Per-group weight matrices
      for (const gName of groups) {
        const gm = groupModels!.get(gName)!;
        const gn = gm.labels.length;
        doc.addPage();
        doc.setFontSize(16);
        doc.text(`Weight Matrix — ${gName}`, 20, 20);
        doc.setFontSize(8);
        let y = 35;
        doc.setFont(undefined!, 'bold');
        doc.text('', 20, y);
        gm.labels.forEach((l, i) => doc.text(l, 45 + i * 22, y));
        doc.setFont(undefined!, 'normal');
        y += 6;
        for (let i = 0; i < gn; i++) {
          doc.setFont(undefined!, 'bold');
          doc.text(gm.labels[i]!, 20, y);
          doc.setFont(undefined!, 'normal');
          for (let j = 0; j < gn; j++) {
            doc.text(fmtNum(gm.weights.get(i, j), 3), 45 + j * 22, y);
          }
          y += 5;
          if (y > 185) { doc.addPage(); y = 20; }
        }
      }
    } else {
      // Single model centralities
      const measures = Object.keys(cent.measures) as (keyof typeof cent.measures)[];
      doc.addPage();
      doc.setFontSize(16);
      doc.text('Centrality Measures', 20, 20);
      doc.setFontSize(9);
      let y = 35;
      doc.setFont(undefined!, 'bold');
      doc.text('State', 20, y);
      measures.forEach((m, i) => doc.text(m, 50 + i * 30, y));
      doc.setFont(undefined!, 'normal');
      y += 7;
      for (let i = 0; i < cent.labels.length; i++) {
        doc.text(cent.labels[i]!, 20, y);
        measures.forEach((m, j) => {
          doc.text(fmtNum(cent.measures[m]![i]!), 50 + j * 30, y);
        });
        y += 6;
        if (y > 185) { doc.addPage(); y = 20; }
      }

      // Single model weight matrix
      const n = model.labels.length;
      doc.addPage();
      doc.setFontSize(16);
      doc.text('Transition Weight Matrix', 20, 20);
      doc.setFontSize(8);
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
          doc.text(fmtNum(model.weights.get(i, j), 3), 45 + j * 22, y);
        }
        y += 5;
        if (y > 185) { doc.addPage(); y = 20; }
      }
    }

    // All captured visualizations — panel titles are already in the images
    for (const s of sections) {
      doc.addPage();
      try {
        const imgDims = await getImageDims(s.dataUrl);
        const { w, h } = fitImage(imgDims.w, imgDims.h, 277, 190);
        doc.addImage(s.dataUrl, 'JPEG', 10, 5, w, h);
      } catch {
        // skip images that fail
      }
    }

    doc.save('dynalytics-report.pdf');
  } finally {
    overlay.remove();
  }
}

/**
 * Add HTML/PDF export buttons to the top of a tab.
 * Captures all .panel elements within the container.
 */
export function addTabExportBar(container: HTMLElement, tabLabel: string) {
  const bar = document.createElement('div');
  bar.className = 'tab-export-bar';
  bar.innerHTML = `
    <button class="panel-dl-btn" id="tab-export-html">HTML</button>
    <button class="panel-dl-btn" id="tab-export-pdf">PDF</button>
  `;
  container.insertBefore(bar, container.firstChild);

  const slug = tabLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  bar.querySelector('#tab-export-html')!.addEventListener('click', async () => {
    const panels = container.querySelectorAll('.panel');
    if (panels.length === 0) return;

    const overlay = showProgressOverlay(`Exporting ${tabLabel}...`);
    try {
      const images: { title: string; dataUrl: string }[] = [];
      for (const panel of panels) {
        const el = panel as HTMLElement;
        if (!el.querySelector('svg, canvas, table, img')) continue;
        const titleEl = el.querySelector('.panel-title');
        const title = titleEl ? (titleEl as HTMLElement).innerText.replace(/SVG|PNG|CSV|HTML|PDF/g, '').trim() : '';
        try {
          const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 1.5 });
          images.push({ title, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
        } catch { /* skip */ }
      }

      if (images.length === 0) { overlay.remove(); return; }

      let imagesHtml = '';
      for (const img of images) {
        if (img.title) imagesHtml += `<h3>${img.title}</h3>\n`;
        imagesHtml += `<img src="${img.dataUrl}" alt="${img.title}">\n`;
      }

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${tabLabel} — Dynalytics</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
  h1 { border-bottom: 2px solid #333; padding-bottom: .4em; }
  h3 { margin-top: 1rem; color: #555; font-size: 1em; }
  .meta { color: #555; margin-bottom: 2rem; }
  img { max-width: 100%; height: auto; margin: .5rem 0 1rem; border: 1px solid #e0e0e0; border-radius: 4px; }
  @media print { body { padding: 0; } img { break-inside: avoid; } }
</style></head><body>
<h1>${tabLabel}</h1>
<p class="meta">Date: ${new Date().toLocaleDateString()}</p>
${imagesHtml}
</body></html>`;

      downloadText(html, `dynalytics-${slug}.html`, 'text/html');
    } finally { overlay.remove(); }
  });

  bar.querySelector('#tab-export-pdf')!.addEventListener('click', async () => {
    const panels = container.querySelectorAll('.panel');
    if (panels.length === 0) return;

    const overlay = showProgressOverlay(`Exporting ${tabLabel}...`);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(18);
      doc.text(tabLabel, 20, 20);
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 30);

      let first = true;
      for (const panel of panels) {
        const el = panel as HTMLElement;
        if (!el.querySelector('svg, canvas, table, img')) continue;
        const titleEl = el.querySelector('.panel-title');
        const title = titleEl ? (titleEl as HTMLElement).innerText.replace(/SVG|PNG|CSV|HTML|PDF/g, '').trim() : '';

        try {
          const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 1.5 });
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (!first) doc.addPage();
          first = false;
          const { w, h } = fitImage(canvas.width, canvas.height, 277, 190);
          doc.addImage(dataUrl, 'JPEG', 10, 5, w, h);
        } catch { /* skip */ }
      }

      doc.save(`dynalytics-${slug}.pdf`);
    } finally { overlay.remove(); }
  });
}

/**
 * Fit an image into a bounding box while preserving aspect ratio.
 * Returns { w, h } in the same units as maxW/maxH.
 */
function fitImage(imgW: number, imgH: number, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  return { w: imgW * ratio, h: imgH * ratio };
}

/** Load a data URL image and return its pixel dimensions. */
function getImageDims(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 800, h: 600 }); // fallback
    img.src = dataUrl;
  });
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

/** Render an element to PNG via html2canvas (scale 2x), with SVG fallback. */
export async function downloadPngFromElement(container: HTMLElement, filename: string) {
  const fname = filename.endsWith('.png') ? filename : `${filename}.png`;
  try {
    const canvas = await html2canvas(container, { backgroundColor: '#fff', scale: 1.5 });
    const link = document.createElement('a');
    link.download = fname;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
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
 */
export function addPanelDownloadButtons(panelEl: HTMLElement, opts: PanelDownloadOptions) {
  // Only add CSV buttons — image export is handled by tab-level HTML/PDF buttons
  if (!opts.csv) return;

  const titleEl = panelEl.querySelector('.panel-title');
  if (!titleEl) return;

  (titleEl as HTMLElement).style.display = 'flex';
  (titleEl as HTMLElement).style.alignItems = 'center';

  const wrap = document.createElement('span');
  wrap.className = 'panel-download-btns';

  const csvBtn = document.createElement('button');
  csvBtn.className = 'panel-dl-btn';
  csvBtn.textContent = 'CSV';
  csvBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadTableAsCsv(panelEl, opts.filename);
  });
  wrap.appendChild(csvBtn);

  titleEl.appendChild(wrap);
}
