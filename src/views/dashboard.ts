/**
 * Analysis dashboard: sidebar controls + tabbed visualization panels.
 */
import type { TNA, CentralityResult, CommunityResult, CentralityMeasure, CommunityMethod } from 'tnaj';
import type { NetworkSettings } from '../main';
import { state, render, saveState, buildModel, computeCentralities, computeCommunities, computeSummary, defaultNetworkSettings, AVAILABLE_MEASURES, AVAILABLE_METHODS } from '../main';
import { renderNetwork } from './network';
import { renderCentralityChart } from './centralities';
import { renderFrequencies } from './frequencies';
import { renderMosaic } from './mosaic';
import { renderSequences, renderDistribution } from './sequences';
import { showExportDialog } from './export';
import { NODE_COLORS } from './colors';

type Tab = 'network' | 'centralities' | 'sequences' | 'frequencies' | 'communities';

const TABS: { id: Tab; label: string }[] = [
  { id: 'network', label: 'Network' },
  { id: 'centralities', label: 'Centralities' },
  { id: 'frequencies', label: 'Frequencies' },
  { id: 'sequences', label: 'Sequences' },
  { id: 'communities', label: 'Communities' },
];

// ─── Cached model data for fast network-only re-render ───
let cachedModel: TNA | null = null;
let cachedCent: CentralityResult | null = null;
let cachedComm: CommunityResult | undefined = undefined;

// ─── Debounce helper ───
let networkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedNetworkUpdate() {
  if (networkDebounceTimer) clearTimeout(networkDebounceTimer);
  networkDebounceTimer = setTimeout(() => { updateNetworkOnly(); saveState(); }, 16);
}

function updateNetworkOnly() {
  if (!cachedModel) return;
  if (state.activeTab === 'network') {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, cachedModel, state.networkSettings);
  } else if (state.activeTab === 'communities') {
    const el = document.getElementById('viz-community-network');
    if (el) renderNetwork(el, cachedModel, state.networkSettings, cachedComm);
  }
}

export function renderDashboard(container: HTMLElement) {
  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <h1>TNA Desktop</h1>
    <span class="filename">${state.filename}</span>
    <div class="spacer"></div>
    <button id="export-btn">Export</button>
    <button id="new-file-btn">Open File</button>
  `;
  container.appendChild(toolbar);

  // Dashboard grid
  const dashboard = document.createElement('div');
  dashboard.className = 'dashboard';
  container.appendChild(dashboard);

  // ─── Sidebar ───
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  const s = state.networkSettings;

  sidebar.innerHTML = `
    <div class="section-title">Controls</div>

    <div class="control-group">
      <label>Model Type</label>
      <select id="model-type">
        <option value="tna" ${state.modelType === 'tna' ? 'selected' : ''}>TNA (Relative)</option>
        <option value="ftna" ${state.modelType === 'ftna' ? 'selected' : ''}>FTNA (Frequency)</option>
        <option value="ctna" ${state.modelType === 'ctna' ? 'selected' : ''}>CTNA (Co-occurrence)</option>
        <option value="atna" ${state.modelType === 'atna' ? 'selected' : ''}>ATNA (Attention)</option>
      </select>
    </div>

    <div class="control-group">
      <label>Prune Threshold</label>
      <div class="slider-row">
        <input type="range" id="prune-threshold" min="0" max="0.30" step="0.01" value="${state.threshold}">
        <span class="slider-value" id="prune-value">${state.threshold.toFixed(2)}</span>
      </div>
    </div>

    <!-- Network Appearance (collapsible) -->
    <div class="collapsible-section collapsed" id="section-appearance">
      <div class="section-header" data-section="section-appearance">
        <span class="chevron">&#9656;</span> Network Appearance
      </div>
      <div class="section-body">

        <!-- Layout sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Layout</div>
          <div class="control-group">
            <label>Algorithm</label>
            <select id="ns-layout">
              <option value="circular" ${s.layout === 'circular' ? 'selected' : ''}>Circular</option>
              <option value="spring" ${s.layout === 'spring' ? 'selected' : ''}>Spring (Force)</option>
              <option value="kamada_kawai" ${s.layout === 'kamada_kawai' ? 'selected' : ''}>Kamada-Kawai</option>
              <option value="spectral" ${s.layout === 'spectral' ? 'selected' : ''}>Spectral</option>
            </select>
          </div>
          <div class="control-group">
            <label>Graph Padding</label>
            <div class="slider-row">
              <input type="range" id="ns-graphPadding" min="0" max="80" step="1" value="${s.graphPadding}">
              <span class="slider-value" id="ns-graphPadding-val">${s.graphPadding}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Drawing Height</label>
            <div class="slider-row">
              <input type="range" id="ns-networkHeight" min="300" max="1200" step="10" value="${s.networkHeight}">
              <span class="slider-value" id="ns-networkHeight-val">${s.networkHeight}</span>
            </div>
          </div>
        </div>

        <!-- Nodes sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Nodes</div>
          <div class="control-group">
            <label>Radius</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeRadius" min="6" max="100" step="1" value="${s.nodeRadius}">
              <span class="slider-value" id="ns-nodeRadius-val">${s.nodeRadius}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Border Width</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeBorderWidth" min="0" max="6" step="0.5" value="${s.nodeBorderWidth}">
              <span class="slider-value" id="ns-nodeBorderWidth-val">${s.nodeBorderWidth}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Border Color</label>
              <input type="color" id="ns-nodeBorderColor" value="${s.nodeBorderColor}">
            </div>
          </div>
          <div class="control-group">
            <label>Label Size</label>
            <div class="slider-row">
              <input type="range" id="ns-nodeLabelSize" min="0" max="24" step="1" value="${s.nodeLabelSize}">
              <span class="slider-value" id="ns-nodeLabelSize-val">${s.nodeLabelSize}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Label Color</label>
              <input type="color" id="ns-nodeLabelColor" value="${s.nodeLabelColor}">
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-showNodeLabels" ${s.showNodeLabels ? 'checked' : ''}>
              <span>Show Labels</span>
            </div>
          </div>
          <div class="control-group">
            <label>Pie Border Width</label>
            <div class="slider-row">
              <input type="range" id="ns-pieBorderWidth" min="0" max="3" step="0.5" value="${s.pieBorderWidth}">
              <span class="slider-value" id="ns-pieBorderWidth-val">${s.pieBorderWidth}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Pie Border Color</label>
              <input type="color" id="ns-pieBorderColor" value="${s.pieBorderColor}">
            </div>
          </div>
        </div>

        <!-- Edges sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Edges</div>
          <div class="control-group">
            <label>Width Min</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeWidthMin" min="0.1" max="5" step="0.1" value="${s.edgeWidthMin}">
              <span class="slider-value" id="ns-edgeWidthMin-val">${s.edgeWidthMin}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Width Max</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeWidthMax" min="0.5" max="10" step="0.1" value="${s.edgeWidthMax}">
              <span class="slider-value" id="ns-edgeWidthMax-val">${s.edgeWidthMax}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Opacity Min</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeOpacityMin" min="0.05" max="1" step="0.05" value="${s.edgeOpacityMin}">
              <span class="slider-value" id="ns-edgeOpacityMin-val">${s.edgeOpacityMin}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Opacity Max</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeOpacityMax" min="0.1" max="1" step="0.05" value="${s.edgeOpacityMax}">
              <span class="slider-value" id="ns-edgeOpacityMax-val">${s.edgeOpacityMax}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Edge Color</label>
              <input type="color" id="ns-edgeColor" value="${s.edgeColor}">
            </div>
          </div>
          <div class="control-group">
            <label>Curvature</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeCurvature" min="0" max="50" step="1" value="${s.edgeCurvature}">
              <span class="slider-value" id="ns-edgeCurvature-val">${s.edgeCurvature}</span>
            </div>
          </div>
          <div class="control-group">
            <label>Display Threshold</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeThreshold" min="0" max="0.50" step="0.01" value="${s.edgeThreshold}">
              <span class="slider-value" id="ns-edgeThreshold-val">${s.edgeThreshold}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-showSelfLoops" ${s.showSelfLoops ? 'checked' : ''}>
              <span>Show Self-Loops</span>
            </div>
          </div>
        </div>

        <!-- Arrows sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Arrows</div>
          <div class="control-group">
            <label>Size</label>
            <div class="slider-row">
              <input type="range" id="ns-arrowSize" min="0" max="20" step="1" value="${s.arrowSize}">
              <span class="slider-value" id="ns-arrowSize-val">${s.arrowSize}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Arrow Color</label>
              <input type="color" id="ns-arrowColor" value="${s.arrowColor}">
            </div>
          </div>
        </div>

        <!-- Edge Labels sub-section -->
        <div class="sub-section">
          <div class="sub-section-title">Edge Labels</div>
          <div class="control-group">
            <label>Size</label>
            <div class="slider-row">
              <input type="range" id="ns-edgeLabelSize" min="0" max="16" step="1" value="${s.edgeLabelSize}">
              <span class="slider-value" id="ns-edgeLabelSize-val">${s.edgeLabelSize}</span>
            </div>
          </div>
          <div class="control-group">
            <div class="color-picker-row">
              <label>Label Color</label>
              <input type="color" id="ns-edgeLabelColor" value="${s.edgeLabelColor}">
            </div>
          </div>
          <div class="control-group">
            <div class="checkbox-row">
              <input type="checkbox" id="ns-showEdgeLabels" ${s.showEdgeLabels ? 'checked' : ''}>
              <span>Show Labels</span>
            </div>
          </div>
        </div>

        <!-- Node Colors sub-section (last) -->
        <div class="sub-section">
          <div class="sub-section-title">Node Colors</div>
          <div id="node-color-container" class="node-color-container"></div>
          <button class="btn-reset" id="reset-node-colors">Reset Colors</button>
        </div>

      </div>
    </div>

    <div class="section-title">Model Summary</div>
    <div class="summary-card" id="model-summary"></div>
  `;
  dashboard.appendChild(sidebar);

  // ─── Main Content ───
  const main = document.createElement('div');
  main.className = 'main-content';
  dashboard.appendChild(main);

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'tab-bar';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    btn.dataset.tab = tab.id;
    if (tab.id === state.activeTab) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.activeTab = tab.id;
      updateTabContent();
      tabBar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveState();
    });
    tabBar.appendChild(btn);
  }
  main.appendChild(tabBar);

  // Content area
  const content = document.createElement('div');
  content.id = 'tab-content';
  main.appendChild(content);

  // ─── Collapsible section toggle ───
  sidebar.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const sectionId = (header as HTMLElement).dataset.section!;
      const section = document.getElementById(sectionId)!;
      section.classList.toggle('collapsed');
      const chevron = header.querySelector('.chevron')!;
      chevron.innerHTML = section.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
    });
  });

  // ─── Model / prune / community events ───
  document.getElementById('model-type')!.addEventListener('change', (e) => {
    state.modelType = (e.target as HTMLSelectElement).value as typeof state.modelType;
    updateAll();
  });

  document.getElementById('prune-threshold')!.addEventListener('input', (e) => {
    state.threshold = parseFloat((e.target as HTMLInputElement).value);
    document.getElementById('prune-value')!.textContent = state.threshold.toFixed(2);
    updateAll();
  });

  document.getElementById('export-btn')!.addEventListener('click', () => {
    const model = buildModel();
    const cent = computeCentralities(model);
    showExportDialog(model, cent);
  });

  document.getElementById('new-file-btn')!.addEventListener('click', () => {
    state.view = 'welcome';
    state.sequenceData = null;
    render();
  });

  // ─── Network appearance events ───
  wireSlider('ns-graphPadding', 'graphPadding', parseFloat);
  wireSlider('ns-nodeRadius', 'nodeRadius', parseFloat);
  wireSlider('ns-nodeBorderWidth', 'nodeBorderWidth', parseFloat);
  wireSlider('ns-nodeLabelSize', 'nodeLabelSize', parseFloat);
  wireSlider('ns-edgeWidthMin', 'edgeWidthMin', parseFloat);
  wireSlider('ns-edgeWidthMax', 'edgeWidthMax', parseFloat);
  wireSlider('ns-edgeOpacityMin', 'edgeOpacityMin', parseFloat);
  wireSlider('ns-edgeOpacityMax', 'edgeOpacityMax', parseFloat);
  wireSlider('ns-edgeCurvature', 'edgeCurvature', parseFloat);
  wireSlider('ns-edgeThreshold', 'edgeThreshold', parseFloat);
  wireSlider('ns-arrowSize', 'arrowSize', parseFloat);
  wireSlider('ns-edgeLabelSize', 'edgeLabelSize', parseFloat);
  wireSlider('ns-pieBorderWidth', 'pieBorderWidth', parseFloat);

  wireColor('ns-nodeBorderColor', 'nodeBorderColor');
  wireColor('ns-nodeLabelColor', 'nodeLabelColor');
  wireColor('ns-edgeColor', 'edgeColor');
  wireColor('ns-arrowColor', 'arrowColor');
  wireColor('ns-edgeLabelColor', 'edgeLabelColor');
  wireColor('ns-pieBorderColor', 'pieBorderColor');

  wireCheckbox('ns-showNodeLabels', 'showNodeLabels');
  wireCheckbox('ns-showEdgeLabels', 'showEdgeLabels');
  wireCheckbox('ns-showSelfLoops', 'showSelfLoops');

  // Network height slider: update container height + re-render
  const heightSlider = document.getElementById('ns-networkHeight') as HTMLInputElement | null;
  if (heightSlider) {
    heightSlider.addEventListener('input', () => {
      const val = parseFloat(heightSlider.value);
      state.networkSettings.networkHeight = val;
      const valEl = document.getElementById('ns-networkHeight-val');
      if (valEl) valEl.textContent = String(val);
      // Resize the viz container
      const vizEl = document.getElementById('viz-network') || document.getElementById('viz-community-network');
      if (vizEl) vizEl.style.height = `${val}px`;
      const panel = vizEl?.closest('.panel') as HTMLElement | null;
      if (panel) panel.style.minHeight = `${val + 40}px`;
      debouncedNetworkUpdate();
    });
  }

  document.getElementById('ns-layout')!.addEventListener('change', (e) => {
    state.networkSettings.layout = (e.target as HTMLSelectElement).value as NetworkSettings['layout'];
    debouncedNetworkUpdate();
  });

  document.getElementById('reset-node-colors')!.addEventListener('click', () => {
    state.networkSettings.nodeColors = {};
    populateNodeColors();
    debouncedNetworkUpdate();
  });

  // Initial render
  updateAll();
}

// ─── Wiring helpers ───
function wireSlider(id: string, prop: keyof NetworkSettings, parse: (v: string) => number) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('input', () => {
    (state.networkSettings as any)[prop] = parse(el.value);
    const valEl = document.getElementById(`${id}-val`);
    if (valEl) valEl.textContent = el.value;
    debouncedNetworkUpdate();
  });
}

function wireColor(id: string, prop: keyof NetworkSettings) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('input', () => {
    (state.networkSettings as any)[prop] = el.value;
    debouncedNetworkUpdate();
  });
}

function wireCheckbox(id: string, prop: keyof NetworkSettings) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener('change', () => {
    (state.networkSettings as any)[prop] = el.checked;
    debouncedNetworkUpdate();
  });
}

// ─── Node color pickers ───
function populateNodeColors() {
  const container = document.getElementById('node-color-container');
  if (!container || !cachedModel) return;
  container.innerHTML = '';
  cachedModel.labels.forEach((label, i) => {
    const currentColor = state.networkSettings.nodeColors[label] ?? NODE_COLORS[i % NODE_COLORS.length]!;
    const row = document.createElement('div');
    row.className = 'color-picker-row';
    row.innerHTML = `
      <label title="${label}">${label.length > 12 ? label.slice(0, 11) + '\u2026' : label}</label>
      <input type="color" value="${currentColor}" data-label="${label}">
    `;
    const input = row.querySelector('input')!;
    input.addEventListener('input', () => {
      state.networkSettings.nodeColors[label] = input.value;
      debouncedNetworkUpdate();
    });
    container.appendChild(row);
  });
}

function updateAll() {
  try {
    const model = buildModel();
    const cent = computeCentralities(model);
    const comm = computeCommunities(model);

    cachedModel = model;
    cachedCent = cent;
    cachedComm = comm;

    // Update summary
    const s = computeSummary(model);
    const summaryEl = document.getElementById('model-summary');
    if (summaryEl) {
      summaryEl.innerHTML = [
        row('Type', model.type),
        row('States', s.nStates),
        row('Edges', s.nEdges),
        row('Density', (s.density as number).toFixed(3)),
        row('Mean Wt', (s.meanWeight as number).toFixed(4)),
        row('Max Wt', (s.maxWeight as number).toFixed(4)),
        row('Self-loops', s.hasSelfLoops ? 'Yes' : 'No'),
      ].join('');
    }

    // Populate node color pickers
    populateNodeColors();

    updateTabContent(model, cent, comm);
    saveState();
  } catch (err) {
    const content = document.getElementById('tab-content');
    if (content) {
      content.innerHTML = `<div class="error-banner">Error: ${(err as Error).message}
        <button class="dismiss" onclick="this.parentElement.remove()">×</button></div>`;
    }
  }
}

function updateTabContent(model?: any, cent?: any, comm?: any) {
  const content = document.getElementById('tab-content');
  if (!content) return;

  if (!model) {
    try {
      model = buildModel();
      cent = computeCentralities(model);
      comm = computeCommunities(model);
    } catch { return; }
  }

  content.innerHTML = '';

  switch (state.activeTab as Tab) {
    case 'network':
      renderNetworkTab(content, model);
      break;
    case 'centralities':
      renderCentralitiesTab(content, model, cent);
      break;
    case 'frequencies':
      renderFrequenciesTab(content, model);
      break;
    case 'sequences':
      renderSequencesTab(content, model);
      break;
    case 'communities':
      renderCommunitiesTab(content, model, comm);
      break;
  }
}

function renderNetworkTab(content: HTMLElement, model: any) {
  const h = state.networkSettings.networkHeight;
  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel" style="min-height:${h + 40}px">
      <div class="panel-title">Network Graph</div>
      <div id="viz-network" style="width:100%;height:${h}px"></div>
    </div>
  `;
  content.appendChild(grid);

  requestAnimationFrame(() => {
    const el = document.getElementById('viz-network');
    if (el) renderNetwork(el, model, state.networkSettings);
  });
}

function renderCentralitiesTab(content: HTMLElement, model: any, cent: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid row-2';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '16px';

  // Panel 1
  const p1 = document.createElement('div');
  p1.className = 'panel';
  p1.style.minHeight = '340px';
  p1.innerHTML = `
    <div class="panel-header">
      <div class="panel-title" style="margin-bottom:0">Centralities</div>
      <select id="measure-sel-1">
        ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <div id="viz-cent-1" style="width:100%;height:280px"></div>
  `;
  grid.appendChild(p1);

  // Panel 2
  const p2 = document.createElement('div');
  p2.className = 'panel';
  p2.style.minHeight = '340px';
  p2.innerHTML = `
    <div class="panel-header">
      <div class="panel-title" style="margin-bottom:0">Centralities</div>
      <select id="measure-sel-2">
        ${AVAILABLE_MEASURES.map(m => `<option value="${m}" ${m === state.selectedMeasure2 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <div id="viz-cent-2" style="width:100%;height:280px"></div>
  `;
  grid.appendChild(p2);

  content.appendChild(grid);

  requestAnimationFrame(() => {
    const el1 = document.getElementById('viz-cent-1');
    const el2 = document.getElementById('viz-cent-2');
    if (el1) renderCentralityChart(el1, cent, state.selectedMeasure1);
    if (el2) renderCentralityChart(el2, cent, state.selectedMeasure2);
  });

  // Events
  setTimeout(() => {
    document.getElementById('measure-sel-1')?.addEventListener('change', (e) => {
      state.selectedMeasure1 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-1');
      if (el) renderCentralityChart(el, cent, state.selectedMeasure1);
    });
    document.getElementById('measure-sel-2')?.addEventListener('change', (e) => {
      state.selectedMeasure2 = (e.target as HTMLSelectElement).value as CentralityMeasure;
      const el = document.getElementById('viz-cent-2');
      if (el) renderCentralityChart(el, cent, state.selectedMeasure2);
    });
  }, 0);
}

function renderFrequenciesTab(content: HTMLElement, model: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid row-2';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '16px';

  const p1 = document.createElement('div');
  p1.className = 'panel';
  p1.innerHTML = `<div class="panel-title">State Frequencies</div><div id="viz-freq" style="width:100%"></div>`;
  grid.appendChild(p1);

  const p2 = document.createElement('div');
  p2.className = 'panel';
  p2.innerHTML = `<div class="panel-title">State Associations (Mosaic)</div><div id="viz-mosaic" style="width:100%"></div>`;
  grid.appendChild(p2);

  content.appendChild(grid);

  requestAnimationFrame(() => {
    const freqEl = document.getElementById('viz-freq');
    const mosaicEl = document.getElementById('viz-mosaic');
    if (freqEl) renderFrequencies(freqEl, model);
    if (mosaicEl) renderMosaic(mosaicEl, model);
  });
}

function renderSequencesTab(content: HTMLElement, _model: any) {
  if (!state.sequenceData) return;

  const grid = document.createElement('div');
  grid.className = 'panels-grid';
  grid.innerHTML = `
    <div class="panel full-width">
      <div class="panel-title">State Distribution Over Time</div>
      <div id="viz-dist" style="width:100%"></div>
    </div>
    <div class="panel full-width">
      <div class="panel-title">Sequence Index Plot</div>
      <div id="viz-seq" style="width:100%;overflow-x:auto"></div>
    </div>
  `;
  content.appendChild(grid);

  requestAnimationFrame(() => {
    const distEl = document.getElementById('viz-dist');
    const seqEl = document.getElementById('viz-seq');
    if (distEl) renderDistribution(distEl, state.sequenceData!, cachedModel!);
    if (seqEl) renderSequences(seqEl, state.sequenceData!, cachedModel!);
  });
}

function renderCommunitiesTab(content: HTMLElement, model: any, comm: any) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div class="checkbox-row">
        <input type="checkbox" id="community-toggle" ${state.showCommunities ? 'checked' : ''}>
        <span>Enable Community Detection</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Method:</label>
        <select id="community-method" style="font-size:12px" ${state.showCommunities ? '' : 'disabled'}>
          ${AVAILABLE_METHODS.map(m =>
            `<option value="${m}" ${m === state.communityMethod ? 'selected' : ''}>${m.replace(/_/g, ' ')}</option>`
          ).join('')}
        </select>
      </div>
    </div>
  `;
  grid.appendChild(controls);

  // Network with communities
  const h = state.networkSettings.networkHeight;
  const netPanel = document.createElement('div');
  netPanel.className = 'panel';
  netPanel.style.minHeight = `${h + 40}px`;
  netPanel.innerHTML = `
    <div class="panel-title">Network with Communities</div>
    <div id="viz-community-network" style="width:100%;height:${h}px"></div>
  `;
  grid.appendChild(netPanel);

  // Community membership table
  if (state.showCommunities && comm) {
    const methodKey = Object.keys(comm.assignments)[0]!;
    const assign: number[] = comm.assignments[methodKey]!;
    const nComms = Math.max(...assign) + 1;

    const memberPanel = document.createElement('div');
    memberPanel.className = 'panel';
    memberPanel.innerHTML = `<div class="panel-title">Community Membership (${methodKey})</div>`;

    let tableHtml = '<table class="preview-table" style="font-size:12px"><thead><tr><th>Community</th><th>Members</th><th>Count</th></tr></thead><tbody>';
    for (let c = 0; c < nComms; c++) {
      const members = model.labels.filter((_: string, i: number) => assign[i] === c);
      tableHtml += `<tr><td style="font-weight:600">C${c + 1}</td><td>${members.join(', ')}</td><td>${members.length}</td></tr>`;
    }
    tableHtml += '</tbody></table>';
    memberPanel.innerHTML += tableHtml;
    grid.appendChild(memberPanel);
  }

  content.appendChild(grid);

  // Wire events
  setTimeout(() => {
    document.getElementById('community-toggle')?.addEventListener('change', (e) => {
      state.showCommunities = (e.target as HTMLInputElement).checked;
      const methodSel = document.getElementById('community-method') as HTMLSelectElement | null;
      if (methodSel) methodSel.disabled = !state.showCommunities;
      updateAll();
    });

    document.getElementById('community-method')?.addEventListener('change', (e) => {
      state.communityMethod = (e.target as HTMLSelectElement).value as CommunityMethod;
      if (state.showCommunities) updateAll();
    });
  }, 0);

  // Render network
  requestAnimationFrame(() => {
    const el = document.getElementById('viz-community-network');
    if (el) renderNetwork(el, model, state.networkSettings, state.showCommunities ? comm : undefined);
  });
}

function row(label: string, value: unknown): string {
  return `<div><strong>${label}</strong><span>${value}</span></div>`;
}
