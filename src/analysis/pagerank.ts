/**
 * PageRank centrality via headless Cytoscape instance.
 * Leverages Cytoscape's built-in pageRank() so we don't need a separate implementation.
 */
import cytoscape from 'cytoscape';
import type { TNA } from 'tnaj';

export function computePageRank(model: TNA): Float64Array {
  const n = model.labels.length;
  const result = new Float64Array(n);
  if (n === 0) return result;

  // Build elements
  const elements: cytoscape.ElementDefinition[] = [];
  for (let i = 0; i < n; i++) {
    elements.push({ group: 'nodes', data: { id: String(i) } });
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = model.weights.get(i, j);
      if (w > 0) {
        elements.push({
          group: 'edges',
          data: { id: `e${i}-${j}`, source: String(i), target: String(j), weight: w },
        });
      }
    }
  }

  const cy = cytoscape({ headless: true, styleEnabled: false, elements });
  const pr = cy.elements().pageRank({ dampingFactor: 0.85 });

  for (let i = 0; i < n; i++) {
    result[i] = pr.rank(cy.getElementById(String(i)));
  }

  cy.destroy();
  return result;
}
