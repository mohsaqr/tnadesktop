/// <reference types="vite/client" />

declare module '*.csv?raw' {
  const content: string;
  export default content;
}

declare module 'cytoscape-fcose' {
  const ext: cytoscape.Ext;
  export default ext;
}
declare module 'cytoscape-dagre' {
  const ext: cytoscape.Ext;
  export default ext;
}
declare module 'cytoscape-cola' {
  const ext: cytoscape.Ext;
  export default ext;
}
declare module 'cytoscape-euler' {
  const ext: cytoscape.Ext;
  export default ext;
}
declare module 'cytoscape-avsdf' {
  const ext: cytoscape.Ext;
  export default ext;
}
