// Exports a CodeGraph index (<repository>/.codegraph/codegraph.db) as the graph snapshot the page shows (shared/codegraph.ts).
// Reads one consistent SQLite transaction; no CodeGraph internals or native addons required.
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { GraphSnapshot } from '../../shared/codegraph.ts';
import { isTestPath } from './codegraph-query.ts';

export type SnapshotMetadata = GraphSnapshot['metadata'];
export interface ExportOptions {
  /** The indexed repository (absolute). */
  repository: string;
  projectId: string;
  /** Where the snapshot goes: <output>/current.json names <output>/snapshots/<id>/. */
  output: string;
  /** metadata.root: how the repository is named in the snapshot. */
  root: string;
  /** Remove the other snapshots once current.json names the new one. */
  prune?: boolean;
  /** Kept in current.json: what the snapshot was made from (server/codegraph-view.ts compares it with the index). */
  stamp?: string;
}

/** The index is being built or synced (or a build was interrupted): there is nothing consistent to show yet. */
export class IncompleteIndex extends Error {
  constructor(readonly state: string | undefined) { super('CodeGraph index is incomplete (' + (state ?? 'unknown') + '); finish indexing before exporting'); }
}
const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
/** HEAD of the repository; empty when it is not a Git work tree. */
function revision(repository: string) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

/** Writes the snapshot and points current.json at it; returns its metadata. */
export async function exportSnapshot({ repository, projectId, output, root, prune = false, stamp }: ExportOptions): Promise<SnapshotMetadata> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(projectId)) throw new Error('Invalid project id: ' + projectId);
  const temp = mkdtempSync(resolve(tmpdir(), 'talents-codegraph-'));
  const databasePath = resolve(temp, 'codegraph.db');
  const live = new DatabaseSync(resolve(repository, '.codegraph/codegraph.db'), { readOnly: true });
  let db: DatabaseSync | undefined;
  try {
    // SQLite backup includes committed WAL pages and produces a standalone, consistent database.
    await backup(live, databasePath);
    live.close();
    db = new DatabaseSync(databasePath, { readOnly: true });
    db.exec('BEGIN');
    for (const [table, fields] of Object.entries({ nodes: ['id', 'kind', 'file_path', 'start_line'], edges: ['id', 'source', 'target', 'kind', 'provenance'], files: ['path', 'content_hash', 'errors'] })) {
      const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
      if (fields.some(f => !columns.has(f))) throw new Error(`Unsupported CodeGraph schema: ${table}`);
    }
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM project_metadata').all().map(r => [r.key, r.value])) as Record<string, string>;
    if (meta.index_state !== 'complete') throw new IncompleteIndex(meta.index_state);
    const nodes = (db.prepare(`SELECT id, kind, name, language, qualified_name AS qualifiedName, file_path AS filePath,
      start_line AS startLine, end_line AS endLine, signature FROM nodes ORDER BY id`).all() as any[]).map(n => ({ ...n, test: isTestPath(n.filePath) }));
    const ids = new Set(nodes.map(n => n.id));
    const edges = db.prepare('SELECT id, source, target, kind, line, provenance FROM edges ORDER BY id').all() as any[];
    for (const e of edges) if (!ids.has(e.source) || !ids.has(e.target)) throw new Error(`Dangling edge ${e.id}`);
    const files = db.prepare('SELECT path, content_hash, errors FROM files ORDER BY path').all() as { path: string; content_hash: string; errors: string | null }[];
    const sources: Record<string, string> = {};
    const digest = createHash('sha256');
    for (const f of files) {
      const path = resolve(repository, f.path);
      if (!path.startsWith(repository + sep)) throw new Error(`Invalid source path ${f.path}`);
      // The working tree may have moved on since indexing: only attach source that matches the index.
      try {
        const bytes = readFileSync(path);
        if (checksum(bytes) === f.content_hash) sources[f.path] = bytes.toString('utf8');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      digest.update(f.path).update('\0').update(f.content_hash).update('\0');
    }
    const count = (list: { kind: string }[]) => list.reduce<Record<string, number>>((a, n) => ({ ...a, [n.kind]: (a[n.kind] ?? 0) + 1 }), {});
    const sourceDigest = digest.digest('hex');
    const indexedAt = new Date(Number((db.prepare('SELECT max(indexed_at) AS t FROM files').get() as any).t)).toISOString();
    const metadata: SnapshotMetadata = { project: projectId, root, toolVersion: meta.indexed_with_version,
      indexedAt, exportedAt: new Date().toISOString(), revision: revision(repository),
      sourceDigest, snapshotId: createHash('sha256').update(JSON.stringify([meta.indexed_with_version, meta.indexed_with_extraction_version, indexedAt, sourceDigest, nodes, edges])).digest('hex').slice(0, 16),
      files: files.length, nodes: nodes.length, edges: edges.length,
      parseErrors: files.filter(f => f.errors && JSON.parse(f.errors).length).length,
      unresolved: Number((db.prepare('SELECT count(*) AS n FROM unresolved_refs').get() as any).n),
      nodeKinds: count(nodes), edgeKinds: count(edges) };
    db.exec('COMMIT');
    const snapshots = resolve(output, 'snapshots'), destination = resolve(snapshots, metadata.snapshotId);
    if (!existsSync(destination)) {
      const staging = resolve(snapshots, '.' + metadata.snapshotId + '.tmp');
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging, { recursive: true });
      writeFileSync(resolve(staging, 'graph.json'), JSON.stringify({ schemaVersion: 1, metadata, nodes, edges, sources }) + '\n');
      renameSync(staging, destination);
    }
    writeFileSync(resolve(output, 'current.json.tmp'), JSON.stringify({ schemaVersion: 1, snapshotId: metadata.snapshotId, ...(stamp ? { stamp } : {}) }, null, 2) + '\n');
    renameSync(resolve(output, 'current.json.tmp'), resolve(output, 'current.json'));
    if (prune) for (const name of readdirSync(snapshots)) if (name !== metadata.snapshotId) rmSync(join(snapshots, name), { recursive: true, force: true });
    return metadata;
  } finally { db?.close(); if (live.isOpen) live.close(); rmSync(temp, { recursive: true, force: true }); }
}
