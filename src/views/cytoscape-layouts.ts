/**
 * Cytoscape.js layout wrapper — uses cytoscape headlessly for position
 * computation only, then returns {x,y}[] for the D3 renderer.
 *
 * Positions are extracted raw and rescaled by the caller (rescalePositions).
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import cola from 'cytoscape-cola';
import euler from 'cytoscape-euler';
import avsdf from 'cytoscape-avsdf';
import { rescalePositions } from './network';

// Register extensions once
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
  | 'avsdf';

/**
 * Compute node positions using a Cytoscape layout algorithm.
 * Returns positions already rescaled to fit [padding, width-padding] x [padding, height-padding].
 */
export function cytoscapeLayout(
  layoutName: CytoscapeLayoutName,
  n: number,
  weights: { get(i: number, j: number): number },
  width: number,
  height: number,
  padding: number,
  seed?: number,
): { x: number; y: number }[] {
  if (n === 0) return [];
  if (n === 1) return [{ x: width / 2, y: height / 2 }];

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

  // Create headless instance
  const cy = cytoscape({
    headless: true,
    styleEnabled: false,
    elements,
  });

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

  // Don't let cytoscape fit — we rescale ourselves for consistent behavior
  const baseOpts: any = {
    animate: false,
    fit: false,
  };

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
      // Scale parameters with node count for better SNA layouts
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
  }

  // Run layout synchronously
  cy.layout(layoutOpts).run();

  // Extract raw positions
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const pos = cy.getElementById(String(i)).position();
    positions.push({ x: pos.x, y: pos.y });
  }

  cy.destroy();

  // Rescale to fit canvas (same as all built-in layouts)
  rescalePositions(positions, width, height, padding);
  return positions;
}
