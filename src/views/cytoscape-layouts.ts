/**
 * Cytoscape.js layout wrapper — uses cytoscape headlessly for position
 * computation only, then returns {x,y}[] for the D3 renderer.
 *
 * ELK layouts bypass Cytoscape entirely and call elkjs directly.
 * This avoids bundling the cytoscape-elk webpack distribution (which trips
 * Rollup's CJS-to-ESM converter) while still providing access to ELK's
 * superior layered, stress, and mrtree algorithms.
 *
 * Positions are extracted raw and rescaled by the caller (rescalePositions).
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import cola from 'cytoscape-cola';
import euler from 'cytoscape-euler';
import avsdf from 'cytoscape-avsdf';
import ELK from 'elkjs/lib/elk.bundled.js';
import { rescalePositions } from './network';

// Register Cytoscape extensions once
cytoscape.use(fcose);
cytoscape.use(dagre);
cytoscape.use(cola);
cytoscape.use(euler);
cytoscape.use(avsdf);

export type CytoscapeLayoutName =
  | 'concentric'
  | 'fcose'
  | 'dagre'
  | 'cola'
  | 'euler'
  | 'avsdf'
  | 'breadthfirst'
  | 'elk_layered'
  | 'elk_stress'
  | 'elk_mrtree';

// ─── ELK direct implementation ───────────────────────────────────────────────

/**
 * Build the ELK graph structure from our weight matrix, run the chosen ELK
 * algorithm, and return normalised {x,y} positions.  Positions are returned
 * BEFORE rescalePositions — caller must rescale.
 *
 * ELK uses top-left corner as node origin; we convert to centre by adding w/2.
 */
async function elkLayout(
  elkAlgorithm: string,
  elkOptions: Record<string, string | number>,
  n: number,
  weights: { get(i: number, j: number): number },
  width: number,
  height: number,
  padding: number,
): Promise<{ x: number; y: number }[]> {
  const NODE_W = 30;
  const NODE_H = 30;

  const children = Array.from({ length: n }, (_, i) => ({
    id: String(i),
    width: NODE_W,
    height: NODE_H,
  }));

  const edges: { id: string; sources: string[]; targets: string[] }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (weights.get(i, j) > 0) {
        edges.push({ id: `e${i}-${j}`, sources: [String(i)], targets: [String(j)] });
      }
    }
  }

  const graph = {
    id: 'root',
    layoutOptions: { 'elk.algorithm': elkAlgorithm, ...elkOptions } as Record<string, string>,
    children,
    edges,
  };

  const elk = new (ELK as any)();
  const result = await elk.layout(graph);

  const positions = (result.children as any[]).map((node: any) => ({
    x: node.x + NODE_W / 2,
    y: node.y + NODE_H / 2,
  }));

  rescalePositions(positions, width, height, padding);
  return positions;
}

// ─── Cytoscape-based layouts ─────────────────────────────────────────────────

/**
 * Compute node positions using a Cytoscape layout algorithm.
 * Returns positions already rescaled to fit [padding, width-padding] x [padding, height-padding].
 *
 * ELK-based layouts call elkjs directly and are async; all Cytoscape layouts
 * (both sync and async extensions) resolve via the layoutstop event.
 */
export async function cytoscapeLayout(
  layoutName: CytoscapeLayoutName,
  n: number,
  weights: { get(i: number, j: number): number },
  width: number,
  height: number,
  padding: number,
  seed?: number,
): Promise<{ x: number; y: number }[]> {
  if (n === 0) return [];
  if (n === 1) return [{ x: width / 2, y: height / 2 }];

  // ── ELK layouts — handled without Cytoscape ──────────────────────────────
  if (layoutName === 'elk_layered') {
    return elkLayout('layered', {
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.spacing.nodeNode': '40',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
    }, n, weights, width, height, padding);
  }
  if (layoutName === 'elk_stress') {
    return elkLayout('stress', {
      'elk.stress.desiredEdgeLength': '120',
      'elk.stress.epsilon': '0.0001',
      'elk.stress.iterationLimit': '300',
    }, n, weights, width, height, padding);
  }
  if (layoutName === 'elk_mrtree') {
    return elkLayout('mrtree', {
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '50',
    }, n, weights, width, height, padding);
  }

  // ── Cytoscape-based layouts ───────────────────────────────────────────────

  // Build elements
  const elements: cytoscape.ElementDefinition[] = [];
  for (let i = 0; i < n; i++) {
    elements.push({ group: 'nodes', data: { id: String(i) } });
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w > 0) {
        elements.push({
          group: 'edges',
          data: { id: `e${i}-${j}`, source: String(i), target: String(j), weight: w },
        });
      }
    }
  }

  const cy = cytoscape({ headless: true, styleEnabled: false, elements });

  // Compute node degrees for concentric layout
  const degreeMap = new Map<string, number>();
  if (layoutName === 'concentric') {
    for (let i = 0; i < n; i++) {
      let deg = 0;
      for (let j = 0; j < n; j++) {
        if (i !== j && (weights.get(i, j) > 0 || weights.get(j, i) > 0)) deg++;
      }
      degreeMap.set(String(i), deg);
    }
  }

  // Don't let cytoscape fit — we rescale ourselves for consistent behaviour
  const baseOpts: any = { animate: false, fit: false };

  let layoutOpts: any;

  switch (layoutName) {
    case 'concentric':
      layoutOpts = {
        ...baseOpts,
        name: 'concentric',
        concentric: (node: any) => degreeMap.get(node.id()) ?? 0,
        levelWidth: () => 1,
        minNodeSpacing: 30,
      };
      break;

    case 'fcose': {
      const isSna = n > 20;
      const idealEdge = isSna ? 60 + 400 / Math.sqrt(n) : 80;
      const repulsion = isSna ? 4000 + n * 50 : 4500;
      const numIter = isSna ? Math.max(2500, n * 20) : 2500;
      const gravRange = isSna ? 5.0 : 3.8;
      layoutOpts = {
        ...baseOpts,
        name: 'fcose',
        quality: 'default',
        randomize: true,
        idealEdgeLength: () => idealEdge,
        nodeRepulsion: () => repulsion,
        edgeElasticity: () => 0.45,
        numIter,
        gravity: 0.25,
        gravityRange: gravRange,
        seed: seed ?? 42,
      };
      break;
    }

    case 'dagre':
      layoutOpts = {
        ...baseOpts,
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 80,
        edgeSep: 10,
      };
      break;

    case 'cola': {
      const colaSpacing = n > 20 ? 20 + 200 / Math.sqrt(n) : 30;
      const colaTime = n > 20 ? Math.max(4000, n * 40) : 4000;
      layoutOpts = {
        ...baseOpts,
        name: 'cola',
        nodeSpacing: colaSpacing,
        randomize: true,
        maxSimulationTime: colaTime,
      };
      break;
    }

    case 'euler':
      layoutOpts = {
        ...baseOpts,
        name: 'euler',
        springLength: 80,
        springCoeff: 0.0008,
        mass: 4,
        gravity: -1.2,
        randomize: true,
        maxIterations: 1000,
        maxSimulationTime: 4000,
      };
      break;

    case 'avsdf':
      layoutOpts = {
        ...baseOpts,
        name: 'avsdf',
        nodeSeparation: 60,
      };
      break;

    // ─── Breadth-first (built-in Cytoscape, synchronous) ────────────────────
    // Organises nodes in BFS levels — great for directed flows and DAGs.
    case 'breadthfirst':
      layoutOpts = {
        ...baseOpts,
        name: 'breadthfirst',
        directed: true,
        spacingFactor: 1.75,
        maximal: false,
        circle: false,
      };
      break;

    default:
      layoutOpts = { ...baseOpts, name: 'concentric' };
  }

  // Wait for layout completion — works for both sync (layoutstop fires during
  // .run()) and async Cytoscape extension layouts.
  await new Promise<void>((resolve) => {
    cy.one('layoutstop', () => resolve());
    cy.layout(layoutOpts).run();
  });

  // Extract raw positions
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const pos = cy.getElementById(String(i)).position();
    positions.push({ x: pos.x, y: pos.y });
  }

  cy.destroy();

  rescalePositions(positions, width, height, padding);
  return positions;
}
