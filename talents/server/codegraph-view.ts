// The code graph a repository shows, generated from the index in its .codegraph/ when the graph is opened, and generated
// again only when the index has changed since. codegraph owns .codegraph/, so generated graphs are kept in
// <state dir>/codegraph/<project>/<repository key>/ (current.json names the graph and the index state it was made from).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { StoredGraphSnapshot } from '../../shared/codegraph.ts';
import { HttpError } from './model.ts';
import { localMinute } from './teams-data.ts';
import { exportSnapshot, IncompleteIndex, type SnapshotMetadata } from './codegraph-export.ts';

/** A directory name for a repository id (ids contain ':'). */
export const sourceKey = (sourceId: string) => createHash('sha256').update(sourceId).digest('hex').slice(0, 16);

const parsed = new Map<string, { stamp: string; data: StoredGraphSnapshot }>();
/** The graph current.json in `dir` names; null when there is none. */
export function readSnapshot(dir: string, projectId: string): StoredGraphSnapshot | null {
  if (!existsSync(join(dir, 'current.json'))) return null;
  const current = JSON.parse(readFileSync(join(dir, 'current.json'), 'utf8'));
  if (current.schemaVersion !== 1 || !/^[a-f0-9]{16}$/.test(current.snapshotId)) throw new Error('CodeGraph 快照指针无效');
  const path = join(dir, 'snapshots', current.snapshotId, 'graph.json');
  const stat = statSync(path), stamp = `${current.snapshotId}:${stat.mtimeMs}:${stat.size}`, cached = parsed.get(dir);
  if (cached?.stamp === stamp) return cached.data;
  const data = JSON.parse(readFileSync(path, 'utf8')) as StoredGraphSnapshot;
  if (data.schemaVersion !== 1 || data.metadata.project !== projectId || data.metadata.snapshotId !== current.snapshotId) throw new Error('CodeGraph 快照格式无效');
  parsed.set(dir, { stamp, data });
  return data;
}

/** The index files' sizes and modification times, which change with every write codegraph makes; null without an index.
 *  An empty write-ahead log holds nothing (reading the database creates one; a checkpoint that empties it rewrites the database). */
export function indexStamp(repository: string): string | null {
  const parts: string[] = [];
  for (const name of ['codegraph.db', 'codegraph.db-wal']) {
    try { const s = statSync(join(repository, '.codegraph', name)); if (s.size || name === 'codegraph.db') parts.push(`${name}:${s.mtimeMs}:${s.size}`); }
    catch { if (name === 'codegraph.db') return null; }
  }
  return parts.join('|');
}

/** A graph to show; notice: why it is not the index's current state. */
export interface GraphView { graph: StoredGraphSnapshot; notice?: string }

export class CodegraphViews {
  private pending = new Map<string, Promise<SnapshotMetadata>>();
  constructor(readonly directory: string, private readonly exporter: typeof exportSnapshot = exportSnapshot) {}
  dir(projectId: string, sourceId: string) { return join(this.directory, projectId, sourceKey(sourceId)); }
  /** The graph last generated for the repository, without looking at its index. */
  cached(projectId: string, sourceId: string) { return readSnapshot(this.dir(projectId, sourceId), projectId); }

  /** Generates the graph again when the index has changed since it was last generated (or it never was). */
  async refresh(projectId: string, sourceId: string, repository: string): Promise<SnapshotMetadata> {
    const dir = this.dir(projectId, sourceId), stamp = indexStamp(repository);
    if (!stamp) throw new HttpError('代码仓中还没有 CodeGraph 索引', 404);
    const running = this.pending.get(dir);
    if (running) return running;
    const last = this.cached(projectId, sourceId);
    if (last && JSON.parse(readFileSync(join(dir, 'current.json'), 'utf8')).stamp === stamp) return last.metadata;
    // The stamp is taken before reading: a write during the export makes the next opening generate again.
    const job = this.exporter({ repository, projectId, output: dir, root: repository, prune: true, stamp }).finally(() => this.pending.delete(dir));
    this.pending.set(dir, job);
    return job;
  }

  /** The graph to show, generated from the index if it changed. While the index is being built or synced, or after it was
   *  removed, the last generated graph with a notice. Null when there is neither an index nor a generated graph. */
  async view(projectId: string, sourceId: string, repository: string): Promise<GraphView | null> {
    try { await this.refresh(projectId, sourceId, repository); }
    catch (error) {
      const last = this.cached(projectId, sourceId), when = last && localMinute(last.metadata.indexedAt);
      if (error instanceof IncompleteIndex) {
        if (!last) throw new HttpError('索引正在构建或更新，请稍后刷新', 409);
        return { graph: last, notice: '索引正在更新，显示的是 ' + when + ' 的索引' };
      }
      if (error instanceof HttpError && error.status === 404) return last && { graph: last, notice: '代码仓中已没有 CodeGraph 索引，显示的是 ' + when + ' 的索引' };
      throw error;
    }
    return { graph: this.cached(projectId, sourceId)! };
  }
}
