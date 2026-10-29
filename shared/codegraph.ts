export interface GraphNode {
  id: string; kind: string; name: string; qualifiedName: string; filePath: string; language: string;
  startLine: number; endLine: number; signature: string | null;
  /** In test code (as the exporter judged it; the service judges again with talents/server/codegraph-query.ts isTestPath). */
  test: boolean;
}
export interface GraphEdge {
  id: number; source: string; target: string; kind: string;
  line: number | null; provenance: string | null;
}
export interface GraphSnapshot {
  schemaVersion: 1;
  metadata: {
    project: string; root: string; toolVersion: string; indexedAt: string; exportedAt: string;
    revision: string; sourceDigest: string; snapshotId: string; files: number; nodes: number; edges: number;
    parseErrors: number; unresolved: number;
    nodeKinds: Record<string, number>; edgeKinds: Record<string, number>;
  };
  nodes: GraphNode[]; edges: GraphEdge[];
}
export interface StoredGraphSnapshot extends GraphSnapshot { sources: Record<string, string> }

// What the page draws: the service picks and aggregates the part of the graph asked for (talents/server/codegraph-query.ts).
/** dir: directories and files under the scope, grouping their symbols; file: one node per file; symbol: one node per symbol. */
export type GraphLevel = 'dir' | 'file' | 'symbol';
/** scope: the directory (or, at symbol level, the file) shown, '' for the whole repository; focus: a symbol whose
 *  neighbourhood (hops) is shown instead. */
export interface ViewOptions { level: GraphLevel; scope: string; tests: boolean; kinds: string[]; relation: string; focus: string; hops: number }
/** group: what the node is coloured by (dir/file at directory level, the language at file level, the kind at symbol
 *  level); members: the symbols it stands for; node: the graph node whose details and source it shows. */
export interface ViewNode { id: string; name: string; kind: string; group: string; members: number; node?: string; x?: number; y?: number }
/** count: the graph edges the link stands for; kind: their relation (the most frequent one when several are merged). */
export interface ViewLink { source: string; target: string; kind: string; count: number }
/** A drawn view. options: what was drawn (the service picks the level and test filter when not asked); groups: the colour
 *  keys of the level in a stable order; total: the view's size before it was limited to what can be drawn smoothly. */
export interface GraphPage {
  metadata: GraphSnapshot['metadata']; notice?: string; options: ViewOptions; groups: string[];
  nodes: ViewNode[]; links: ViewLink[]; total: { nodes: number; links: number };
}
export interface GraphHit { id: string; name: string; kind: string; filePath: string; test: boolean }
/** A node's details: its first connections (total: all of them). */
export interface NodeDetail {
  node: GraphNode; total: number;
  connections: { id: number; kind: string; incoming: boolean; line: number | null; provenance: string | null; other: GraphHit }[];
}
