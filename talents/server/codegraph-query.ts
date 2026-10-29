// Queries on a code graph for the page. The service keeps the whole graph and sends only what is drawn: directories,
// files or symbols under a scope, or a symbol's neighbourhood, limited to what the page draws smoothly; search and node
// details look at the whole graph.
import type { GraphHit, GraphPage, NodeDetail, StoredGraphSnapshot, ViewLink, ViewNode, ViewOptions } from '../../shared/codegraph.ts';

/** What one view draws at most: beyond this, layout and drawing in the page stop being smooth. dirGroups: how many
 *  directories and files a directory view splits its scope into at most (fewer stay readable as an overview). */
export const LIMITS = { nodes: 2000, links: 6000, dirGroups: 30 };
export type Limits = typeof LIMITS;

/** Test code by the usual conventions: test directories, and the test file names of Python, Go, JS/TS and Java/Kotlin. */
const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'specs']);
const TEST_FILE = /^test_.*\.py$|_test\.(py|go)$|^conftest\.py$|\.(test|spec)\.[cm]?[jt]sx?$|(Test|Tests|IT)\.(java|kt)$/;
export function isTestPath(path: string) {
  const parts = path.split('/');
  return TEST_FILE.test(parts.at(-1)!) || parts.slice(0, -1).some(part => TEST_DIRS.has(part));
}

/** The symbols a symbol view shows unless other kinds are asked for. */
const SYMBOLS = new Set(['class', 'interface', 'enum', 'method', 'function', 'route']);
/** Symbol kinds first in the palette, so the ones shown by default get distinct colours. */
const KIND_ORDER = ['class', 'interface', 'enum', 'method', 'function', 'route'];
const byKindOrder = (a: string, b: string) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

/** Lookups over one graph, built once per snapshot. */
interface Index {
  at: Map<string, number>; test: boolean[]; src: Int32Array; dst: Int32Array;
  /** Edge indices by source and by target node. */
  out: number[][]; inc: number[][];
  /** A file's file node. */
  fileNode: Map<string, number>;
  languages: string[]; kinds: string[];
}
const indexes = new WeakMap<StoredGraphSnapshot, Index>();
function indexOf(graph: StoredGraphSnapshot): Index {
  const known = indexes.get(graph);
  if (known) return known;
  const { nodes, edges } = graph, at = new Map(nodes.map((n, i) => [n.id, i]));
  const src = new Int32Array(edges.length), dst = new Int32Array(edges.length);
  const out: number[][] = nodes.map(() => []), inc: number[][] = nodes.map(() => []);
  edges.forEach((e, k) => { src[k] = at.get(e.source)!; dst[k] = at.get(e.target)!; out[src[k]].push(k); inc[dst[k]].push(k); });
  const fileNode = new Map<string, number>();
  nodes.forEach((n, i) => { if (n.kind === 'file' && !fileNode.has(n.filePath)) fileNode.set(n.filePath, i); });
  const index: Index = { at, test: nodes.map(n => isTestPath(n.filePath)), src, dst, out, inc, fileNode,
    languages: [...new Set(nodes.map(n => n.language || 'unknown'))].sort(), kinds: Object.keys(graph.metadata.nodeKinds).sort(byKindOrder) };
  indexes.set(graph, index);
  return index;
}
/** A long path (a collapsed package path) keeps its first two and last two segments. */
const shortPath = (path: string) => { const parts = path.split('/'); return parts.length > 5 ? [...parts.slice(0, 2), '…', ...parts.slice(-2)].join('/') : path; };
const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const within = (scope: string, path: string) => !scope || path === scope || path.startsWith(scope + '/');

/** The view the page asked for, with the level and test filter picked when not asked: a repository whose symbols (without
 *  tests) can all be drawn opens on them, a larger one on its directories. */
export function graphPage(graph: StoredGraphSnapshot, asked: Partial<ViewOptions>, limits: Limits = LIMITS): Omit<GraphPage, 'metadata' | 'notice'> {
  const ix = indexOf(graph), { nodes, edges } = graph;
  const o: ViewOptions = { level: asked.level ?? 'symbol', scope: asked.scope ?? '', tests: asked.tests ?? false, kinds: asked.kinds ?? [],
    relation: asked.relation ?? '', focus: asked.focus && ix.at.has(asked.focus) ? asked.focus : '', hops: asked.hops === 2 ? 2 : 1 };
  if (!asked.level && !o.focus) {
    let symbols = 0;
    nodes.forEach((n, i) => { if (SYMBOLS.has(n.kind) && !ix.test[i] && within(o.scope, n.filePath)) symbols++; });
    o.level = symbols <= limits.nodes ? 'symbol' : 'dir';
  }
  if (o.focus) o.level = 'symbol';
  // A file has no directories: its symbols are shown.
  if (o.level === 'dir' && ix.fileNode.has(o.scope)) o.level = 'symbol';
  const kindOk = (kind: string) => o.kinds.length ? o.kinds.includes(kind) : SYMBOLS.has(kind);
  const relOk = (k: number) => !o.relation || edges[k].kind === o.relation;

  // The graph nodes in view: in the scope (or the focus's neighbourhood), of the kinds asked for, without tests unless asked.
  const keep = new Uint8Array(nodes.length);
  nodes.forEach((n, i) => {
    if (!o.tests && ix.test[i]) return;
    if (o.level === 'symbol' ? kindOk(n.kind) && (!!o.focus || within(o.scope, n.filePath)) : within(o.scope, n.filePath)) keep[i] = 1;
  });
  let dist: Map<number, number> | null = null;
  if (o.focus) {
    const start = ix.at.get(o.focus)!;
    keep[start] = 1; dist = new Map([[start, 0]]);
    for (let hop = 1, frontier = [start]; hop <= o.hops; hop++) {
      const next: number[] = [];
      for (const i of frontier) for (const k of [...ix.out[i], ...ix.inc[i]]) {
        const j = ix.src[k] === i ? ix.dst[k] : ix.src[k];
        if (relOk(k) && keep[j] && !dist.has(j)) { dist.set(j, hop); next.push(j); }
      }
      frontier = next;
    }
  }
  const inView = (i: number) => keep[i] === 1 && (!dist || dist.has(i));

  // Grouping: a node per symbol, per file, or per directory or file of the directory split.
  const groupOf: (string | undefined)[] = new Array(nodes.length), views = new Map<string, ViewNode>(), rank = new Map<string, number>();
  const add = (i: number, id: string, make: () => ViewNode) => {
    groupOf[i] = id;
    const view = views.get(id) ?? views.set(id, make()).get(id)!;
    view.members++;
    if (dist) rank.set(id, Math.min(rank.get(id) ?? Infinity, dist.get(i)!));
  };
  if (o.level === 'dir') {
    const groups = dirSplit(nodes.map(n => n.filePath), inView, o.scope, limits.dirGroups);
    nodes.forEach((n, i) => {
      if (!inView(i)) return;
      const id = groups.get(n.filePath)!, file = ix.fileNode.has(id);
      add(i, id, () => ({ id, name: shortPath(o.scope ? id.slice(o.scope.length + 1) : id), kind: file ? 'file' : 'dir', group: file ? 'file' : 'dir', members: 0,
        ...(file ? { node: nodes[ix.fileNode.get(id)!].id } : {}) }));
    });
  } else nodes.forEach((n, i) => {
    if (!inView(i)) return;
    if (o.level === 'file') add(i, n.filePath, () => ({ id: n.filePath, name: n.filePath.split('/').at(-1)!, kind: 'file', group: n.language || 'unknown', members: 0,
      ...(ix.fileNode.has(n.filePath) ? { node: nodes[ix.fileNode.get(n.filePath)!].id } : {}) }));
    else add(i, n.id, () => ({ id: n.id, name: n.name, kind: n.kind, group: n.kind, members: 0, node: n.id }));
  });

  // Links between groups: each relation separately between symbols, merged (counted) between files and directories.
  const merged = new Map<string, ViewLink & { kinds: Map<string, number> }>();
  for (let k = 0; k < edges.length; k++) {
    const a = groupOf[ix.src[k]], b = groupOf[ix.dst[k]];
    if (a === undefined || b === undefined || a === b || !relOk(k)) continue;
    const kind = edges[k].kind, key = a + '\0' + b + (o.level === 'symbol' ? '\0' + kind : '');
    const link = merged.get(key) ?? merged.set(key, { source: a, target: b, kind, count: 0, kinds: new Map() }).get(key)!;
    link.count++; link.kinds.set(kind, (link.kinds.get(kind) ?? 0) + 1);
  }
  const total = { nodes: views.size, links: merged.size };

  // Limited to what can be drawn: nodes nearest the focus, then the best connected; links the strongest between them.
  const degree = new Map<string, number>();
  for (const l of merged.values()) { degree.set(l.source, (degree.get(l.source) ?? 0) + 1); degree.set(l.target, (degree.get(l.target) ?? 0) + 1); }
  let shown = [...views.values()];
  if (shown.length > limits.nodes) {
    const score = (v: ViewNode) => [rank.get(v.id) ?? 0, -(degree.get(v.id) ?? 0), -v.members];
    shown = shown.sort((x, y) => { const a = score(x), b = score(y); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }).slice(0, limits.nodes);
  }
  const kept = new Set(shown.map(v => v.id));
  let links = [...merged.values()].filter(l => kept.has(l.source) && kept.has(l.target));
  if (links.length > limits.links) {
    const near = (l: ViewLink) => Math.max(rank.get(l.source) ?? 0, rank.get(l.target) ?? 0);
    const reach = (l: ViewLink) => (degree.get(l.source) ?? 0) + (degree.get(l.target) ?? 0);
    links = links.sort((x, y) => near(x) - near(y) || y.count - x.count || reach(y) - reach(x)).slice(0, limits.links);
  }
  const groups = o.level === 'symbol' ? ix.kinds : o.level === 'file' ? ix.languages : ['dir', 'file'];
  return { options: o, groups, total, nodes: shown,
    links: links.map(({ kinds, ...l }) => ({ ...l, kind: o.level === 'symbol' ? l.kind : [...kinds].sort((x, y) => y[1] - x[1])[0][0] })) };
}

/** Splits the files under `scope` into directories and files, one level at a time: the scope's entries, then all their
 *  subdirectories' entries, and so on while the split stays within `target` entries (a directory with a single entry is
 *  replaced by it, so long package paths do not take a level each). Returns each file's group (a directory or the file). */
function dirSplit(paths: string[], inView: (i: number) => boolean, scope: string, target: number) {
  interface Entry { path: string; count: number; file: boolean; children: Map<string, Entry> }
  const root: Entry = { path: scope, count: 0, file: false, children: new Map() };
  paths.forEach((path, i) => {
    if (!inView(i)) return;
    let entry = root;
    const parts = (scope ? path.slice(scope.length + 1) : path).split('/');
    parts.forEach((part, depth) => {
      const child = entry.children.get(part) ?? entry.children.set(part, { path: (entry.path ? entry.path + '/' : '') + part, count: 0, file: depth === parts.length - 1, children: new Map() }).get(part)!;
      child.count++; entry = child;
    });
  });
  const single = (e: Entry): Entry => !e.file && e.children.size === 1 ? single([...e.children.values()][0]) : e;
  let split = [...single(root).children.values()].map(single);
  for (;;) {
    const open = split.filter(e => !e.file);
    const next = split.filter(e => e.file).concat(open.flatMap(e => [...e.children.values()].map(single)));
    if (!open.length || next.length > target) break;
    split = next;
  }
  const groups = new Map<string, string>(), at = new Set(split.map(e => e.path));
  for (const path of new Set(paths)) {
    let p = path;
    while (p && !at.has(p)) p = parent(p);
    if (p) groups.set(path, p);
  }
  return groups;
}

const hit = (graph: StoredGraphSnapshot, i: number): GraphHit => {
  const n = graph.nodes[i];
  return { id: n.id, name: n.name, kind: n.kind, filePath: n.filePath, test: indexOf(graph).test[i] };
};
/** Symbols and files whose name (or a file's path) contains the query, best matches first. */
export function searchGraph(graph: StoredGraphSnapshot, query: string, tests: boolean, limit = 30): GraphHit[] {
  const q = query.trim().toLowerCase(), ix = indexOf(graph);
  if (!q) return [];
  const found: [number, number][] = [];
  graph.nodes.forEach((n, i) => {
    if (n.kind === 'import' || (!tests && ix.test[i])) return;
    const name = n.name.toLowerCase();
    const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : n.kind === 'file' && n.filePath.toLowerCase().includes(q) ? 3 : -1;
    if (score >= 0) found.push([score, i]);
  });
  const order = (i: number) => KIND_ORDER.indexOf(graph.nodes[i].kind) + 1 || 99;
  return found.sort((a, b) => a[0] - b[0] || graph.nodes[a[1]].name.length - graph.nodes[b[1]].name.length || order(a[1]) - order(b[1]))
    .slice(0, limit).map(([, i]) => hit(graph, i));
}
/** A node and its first connections: what it points to, then what points to it. */
export function nodeDetail(graph: StoredGraphSnapshot, id: string, limit = 40): NodeDetail | null {
  const ix = indexOf(graph), i = ix.at.get(id);
  if (i === undefined) return null;
  const all = [...ix.out[i], ...ix.inc[i]];
  return { node: graph.nodes[i], total: all.length, connections: all.slice(0, limit).map(k => {
    const e = graph.edges[k], incoming = ix.dst[k] === i && ix.src[k] !== i;
    return { id: e.id, kind: e.kind, incoming, line: e.line, provenance: e.provenance, other: hit(graph, incoming ? ix.src[k] : ix.dst[k]) };
  }) };
}
