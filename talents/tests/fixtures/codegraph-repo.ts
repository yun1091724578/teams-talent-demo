// A small made-up repository with a CodeGraph index (<repository>/.codegraph/codegraph.db) in the tables and columns
// CodeGraph 1.6 writes: two Java services (orders with a test, billing) and a TypeScript web page with a test.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

interface Sym { kind: string; name: string; members?: string[] }
const JAVA = (pkg: string) => ({ language: 'java', pkg });
const FILES: { path: string; language: string; pkg?: string; symbols: Sym[] }[] = [
  { path: 'services/orders/src/main/java/demo/orders/OrderController.java', ...JAVA('demo.orders'), symbols: [{ kind: 'class', name: 'OrderController', members: ['create', 'cancel', 'list'] }] },
  { path: 'services/orders/src/main/java/demo/orders/OrderService.java', ...JAVA('demo.orders'), symbols: [{ kind: 'class', name: 'OrderService', members: ['place', 'cancel', 'find', 'validate'] }] },
  { path: 'services/orders/src/main/java/demo/orders/OrderRepository.java', ...JAVA('demo.orders'), symbols: [{ kind: 'interface', name: 'OrderRepository', members: ['save', 'findById'] }] },
  { path: 'services/orders/src/main/java/demo/orders/JpaOrderRepository.java', ...JAVA('demo.orders'), symbols: [{ kind: 'class', name: 'JpaOrderRepository', members: ['save', 'findById'] }] },
  { path: 'services/orders/src/main/java/demo/orders/OrderStatus.java', ...JAVA('demo.orders'), symbols: [{ kind: 'enum', name: 'OrderStatus' }] },
  { path: 'services/orders/src/test/java/demo/orders/OrderServiceTest.java', ...JAVA('demo.orders'), symbols: [{ kind: 'class', name: 'OrderServiceTest', members: ['placesOrder', 'cancelsOrder'] }] },
  { path: 'services/billing/src/main/java/demo/billing/BillingService.java', ...JAVA('demo.billing'), symbols: [{ kind: 'class', name: 'BillingService', members: ['charge', 'refund'] }] },
  { path: 'services/billing/src/main/java/demo/billing/Invoice.java', ...JAVA('demo.billing'), symbols: [{ kind: 'class', name: 'Invoice', members: ['total', 'addLine'] }] },
  { path: 'services/billing/src/main/java/demo/billing/InvoiceRepository.java', ...JAVA('demo.billing'), symbols: [{ kind: 'interface', name: 'InvoiceRepository', members: ['save'] }] },
  { path: 'web/src/api.ts', language: 'typescript', symbols: [{ kind: 'function', name: 'get' }, { kind: 'function', name: 'post' }] },
  { path: 'web/src/app.ts', language: 'typescript', symbols: [{ kind: 'function', name: 'render' }, { kind: 'function', name: 'submitOrder' }, { kind: 'function', name: 'cancelOrder' }] },
  { path: 'web/src/app.test.ts', language: 'typescript', symbols: [{ kind: 'function', name: 'rendersOrders' }] },
];
/** Relations between symbols, named Type.member (or file name.function for TypeScript). */
const EDGES: [string, string, string][] = [
  ['OrderController.create', 'calls', 'OrderService.place'], ['OrderController.cancel', 'calls', 'OrderService.cancel'], ['OrderController.list', 'calls', 'OrderService.find'],
  ['OrderService.place', 'calls', 'OrderService.validate'], ['OrderService.place', 'calls', 'OrderRepository.save'], ['OrderService.place', 'calls', 'BillingService.charge'],
  ['OrderService.place', 'references', 'OrderStatus'], ['OrderService.cancel', 'calls', 'OrderRepository.findById'], ['OrderService.cancel', 'calls', 'BillingService.refund'],
  ['OrderService.find', 'calls', 'OrderRepository.findById'], ['JpaOrderRepository', 'implements', 'OrderRepository'],
  ['BillingService.charge', 'calls', 'Invoice.addLine'], ['BillingService.charge', 'calls', 'Invoice.total'], ['BillingService.charge', 'calls', 'InvoiceRepository.save'],
  ['BillingService.refund', 'calls', 'Invoice.total'], ['OrderServiceTest.placesOrder', 'calls', 'OrderService.place'], ['OrderServiceTest.cancelsOrder', 'calls', 'OrderService.cancel'],
  ['app.render', 'calls', 'api.get'], ['app.submitOrder', 'calls', 'api.post'], ['app.cancelOrder', 'calls', 'api.post'], ['app.test.rendersOrders', 'calls', 'app.render'],
];
export const FIXTURE = { files: FILES.length, symbols: FILES.flatMap(f => f.symbols.flatMap(s => [s, ...(s.members ?? [])])).length };

const SCHEMA = `
CREATE TABLE schema_versions ( version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL, description TEXT );
CREATE TABLE nodes ( id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, qualified_name TEXT NOT NULL, file_path TEXT NOT NULL, language TEXT NOT NULL,
  start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, start_column INTEGER NOT NULL, end_column INTEGER NOT NULL, docstring TEXT, signature TEXT, visibility TEXT,
  is_exported INTEGER DEFAULT 0, is_async INTEGER DEFAULT 0, is_static INTEGER DEFAULT 0, is_abstract INTEGER DEFAULT 0, decorators TEXT, type_parameters TEXT, return_type TEXT, updated_at INTEGER NOT NULL );
CREATE TABLE edges ( id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, metadata TEXT, line INTEGER, col INTEGER, provenance TEXT DEFAULT NULL,
  FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE, FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE );
CREATE TABLE files ( path TEXT PRIMARY KEY, content_hash TEXT NOT NULL, language TEXT NOT NULL, size INTEGER NOT NULL, modified_at INTEGER NOT NULL, indexed_at INTEGER NOT NULL,
  node_count INTEGER DEFAULT 0, errors TEXT, generated INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE unresolved_refs ( id INTEGER PRIMARY KEY AUTOINCREMENT, from_node_id TEXT NOT NULL, reference_name TEXT NOT NULL, reference_kind TEXT NOT NULL, line INTEGER NOT NULL, col INTEGER NOT NULL,
  candidates TEXT, file_path TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'unknown', status TEXT NOT NULL DEFAULT 'pending', name_tail TEXT NOT NULL DEFAULT '' );
CREATE TABLE project_metadata ( key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL );`;

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const id = (kind: string, key: string) => kind + ':' + createHash('md5').update(key).digest('hex');
const declaration = (kind: string, name: string, language: string) => language === 'typescript' ? `export function ${name}() {`
  : kind === 'method' ? `  public void ${name}() {` : `public ${kind === 'interface' ? 'interface' : kind === 'enum' ? 'enum' : 'class'} ${name} {`;

/** Writes the repository with its sources and its index into `repository`; the index state is 'complete' unless given. */
export async function codegraphRepository(repository: string, state = 'complete') {
  const now = Date.now(), nodes: unknown[][] = [], edges: [string, string, string][] = [], files: unknown[][] = [], named = new Map<string, string>();
  const node = (nodeId: string, kind: string, name: string, qualified: string, file: typeof FILES[number], start: number, end: number) =>
    nodes.push([nodeId, kind, name, qualified, file.path, file.language, start, end, 0, 0, null, kind === 'file' ? null : name + '()', null, 0, 0, 0, 0, null, null, null, now]);
  for (const file of FILES) {
    const lines = file.pkg ? [`package ${file.pkg};`, ''] : [`// ${file.path}`, ''];
    const fileId = 'file:' + file.path, base = file.path.split('/').at(-1)!.replace(/\.(java|ts)$/, '');
    for (const symbol of file.symbols) {
      const start = lines.length + 1, symbolId = id(symbol.kind, file.path + '#' + symbol.name);
      lines.push(declaration(symbol.kind, symbol.name, file.language));
      const members = (symbol.members ?? []).map(member => {
        const at = lines.length + 1;
        lines.push(declaration('method', member, file.language), '  }');
        return { member, at, memberId: id('method', file.path + '#' + symbol.name + '.' + member) };
      });
      lines.push('}', '');
      node(symbolId, symbol.kind, symbol.name, (file.pkg ? file.pkg + '.' : '') + symbol.name, file, start, lines.length - 1);
      edges.push([fileId, 'contains', symbolId]);
      named.set(file.language === 'typescript' ? base + '.' + symbol.name : symbol.name, symbolId);
      for (const { member, at, memberId } of members) {
        node(memberId, 'method', member, (file.pkg ? file.pkg + '.' : '') + symbol.name + '.' + member, file, at, at + 1);
        edges.push([symbolId, 'contains', memberId]);
        named.set(symbol.name + '.' + member, memberId);
      }
    }
    const text = lines.join('\n');
    node(fileId, 'file', file.path.split('/').at(-1)!, file.path, file, 1, lines.length);
    files.push([file.path, hash(text), file.language, Buffer.byteLength(text), now, now, file.symbols.length, null]);
    await mkdir(dirname(join(repository, file.path)), { recursive: true });
    await writeFile(join(repository, file.path), text);
  }
  for (const [from, kind, to] of EDGES) edges.push([named.get(from)!, kind, named.get(to)!]);

  await mkdir(join(repository, '.codegraph'), { recursive: true });
  const db = new DatabaseSync(join(repository, '.codegraph', 'codegraph.db'));
  try {
    db.exec(SCHEMA);
    db.prepare('INSERT INTO schema_versions VALUES (?, ?, ?)').run(9, now, 'Initial schema includes all migrations');
    const insertNode = db.prepare(`INSERT INTO nodes VALUES (${Array(21).fill('?').join(', ')})`);
    for (const row of nodes) insertNode.run(...(row as never[]));
    const insertEdge = db.prepare('INSERT INTO edges (source, target, kind, line) VALUES (?, ?, ?, ?)');
    for (const [source, kind, target] of edges) insertEdge.run(source, target, kind, kind === 'contains' ? null : 1);
    const insertFile = db.prepare('INSERT INTO files (path, content_hash, language, size, modified_at, indexed_at, node_count, errors) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const row of files) insertFile.run(...(row as never[]));
    const insertMeta = db.prepare('INSERT INTO project_metadata VALUES (?, ?, ?)');
    for (const [key, value] of [['index_state', state], ['indexed_with_version', '1.6.0'], ['indexed_with_extraction_version', '25']]) insertMeta.run(key, value, now);
  } finally { db.close(); }
  return repository;
}
