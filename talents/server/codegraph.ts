import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { StoredGraphSnapshot } from '../../shared/codegraph.ts';
import type { Artifact, TalentsState } from './model.ts';
import { root } from './config.ts';

// Each project's archived CodeGraph scan: data/codegraph/<project id>/current.json names the snapshot to show.
// The archive is taken to be the scan of the code repository bound to the project in Teams.
const directory = join(root, 'data/codegraph');
const validProject = (projectId: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(projectId);
const cache = new Map<string, { stamp: string; data: StoredGraphSnapshot }>();
/** Whether the project has an archived snapshot. */
export const hasCodegraph = (projectId: string | null) => !!projectId && validProject(projectId) && existsSync(join(directory, projectId, 'current.json'));
/** The project's archived snapshot; null when it has none. */
export function codegraphSnapshot(projectId: string): StoredGraphSnapshot | null {
  if (!hasCodegraph(projectId)) return null;
  const project = join(directory, projectId);
  const current = JSON.parse(readFileSync(join(project, 'current.json'), 'utf8'));
  if (current.schemaVersion !== 1 || !/^[a-f0-9]{16}$/.test(current.snapshotId)) throw new Error('CodeGraph 归档指针无效');
  const path = join(project, 'snapshots', current.snapshotId, 'graph.json');
  const stat = statSync(path), stamp = `${current.snapshotId}:${stat.mtimeMs}:${stat.size}`, cached = cache.get(projectId);
  if (cached?.stamp === stamp) return cached.data;
  const data = JSON.parse(readFileSync(path, 'utf8')) as StoredGraphSnapshot;
  if (data.schemaVersion !== 1 || data.metadata.project !== projectId || data.metadata.snapshotId !== current.snapshotId) throw new Error('CodeGraph 快照格式无效');
  cache.set(projectId, { stamp, data });
  return data;
}

/** A project's code graph artifact that has an archived snapshot to show. */
const archived = (a: Artifact) => a.cap === 'codegraph' && hasCodegraph(a.projectId);
/** Shows the snapshot's figures on the artifact, and its id as graphSnapshot (the page then shows the graph). The archive
 *  is not tied to a commit of the bound repository, so the published version names the snapshot and has no commit basis. */
function shown(a: Artifact): Artifact {
  const m = codegraphSnapshot(a.projectId!)!.metadata;
  return { ...a, graphSnapshot: m.snapshotId, stats: [['文件', m.files.toLocaleString('en-US')], ['节点', m.nodes.toLocaleString('en-US')], ['关系', m.edges.toLocaleString('en-US')]],
    ...(a.published ? { published: { ...a.published, at: m.indexedAt, note: `归档图谱快照 · ${m.snapshotId.slice(0, 8)}`, basis: null } } : {}) };
}
/** Snapshot metadata is authoritative even when a saved demo state still contains simulated counts. */
export function withCodegraph(state: TalentsState): TalentsState {
  return { ...state, artifacts: state.artifacts.map(a => archived(a) ? shown(a) : a) };
}
/** Undoes withCodegraph on a state the page saves back: the snapshot values are only shown, never stored. */
export function withoutCodegraph(saved: TalentsState, previous: TalentsState): TalentsState {
  return { ...saved, artifacts: saved.artifacts.map(a => {
    const before = previous.artifacts.find(x => x.id === a.id);
    if (!before || !archived(before)) return a;
    const display = shown(before), { graphSnapshot, ...next } = a;
    if (isDeepStrictEqual(next.stats, display.stats)) next.stats = before.stats;
    const p = next.published, q = display.published;
    if (p && q && before.published && p.version === q.version && p.at === q.at && p.note === q.note && isDeepStrictEqual(p.basis, q.basis))
      next.published = { ...p, at: before.published.at, note: before.published.note, basis: before.published.basis };
    return next;
  }) };
}
