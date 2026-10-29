import type { StoredGraphSnapshot } from '../../shared/codegraph.ts';
import type { Artifact, TalentsState } from './model.ts';
import { localMinute } from './teams-data.ts';
import { durationText, type CodegraphBuild, type CodegraphRun } from './codegraph-runs.ts';
import { sourceKey, type CodegraphViews, type GraphView } from './codegraph-view.ts';
import type { SnapshotMetadata } from './codegraph-export.ts';

// What a code graph shows: the CodeGraph index of the repository (<repository>/.codegraph/) as it is when the graph is
// opened (server/codegraph-view.ts). Talents builds (server/codegraph-runs.ts) publish versions.
const validProject = (projectId: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(projectId);

/** The builds, runs and generated graphs of the service (a CodegraphRunner); none until the service sets it. */
export interface LiveCodegraph {
  build(projectId: string, sourceId: string): CodegraphBuild | undefined;
  builds(): CodegraphBuild[];
  run(taskId: string): CodegraphRun | undefined;
  runs(): CodegraphRun[];
  views: CodegraphViews;
}
let live: LiveCodegraph | null = null;
export function setLiveCodegraph(value: LiveCodegraph | null) { live = value; }

/** The graph last generated for a repository; null when there is none. */
export function codegraphSnapshot(projectId: string, sourceId: string | null): StoredGraphSnapshot | null {
  return validProject(projectId) && sourceId && live?.views.cached(projectId, sourceId) || null;
}
/** The graph to show when it is opened: the repository's index as it is now (repository: its bound directory), else the
 *  graph last generated for it. */
export async function codegraphView(projectId: string, sourceId: string | null, repository: string | null): Promise<GraphView | null> {
  if (!validProject(projectId) || !sourceId || !live) return null;
  if (repository) return live.views.view(projectId, sourceId, repository);
  const graph = codegraphSnapshot(projectId, sourceId);
  return graph && { graph };
}

const count = (n: number) => n.toLocaleString('en-US');
const isCodegraph = (a: Artifact) => a.cap === 'codegraph' && !!a.projectId;
/** A repository built in Talents or whose graph was generated: its latest build and generated graph. */
function liveOf(a: Artifact) {
  if (!isCodegraph(a) || !live) return null;
  const build = live.build(a.projectId!, a.sources[0]), graph = live.views.cached(a.projectId!, a.sources[0])?.metadata;
  return build || graph ? { build, graph } : null;
}
/** A live repository shows the graph last generated from its index, and when the index was last updated (also by syncs
 *  outside Talents). Each Talents build is the next published version (no review); the version is not shown, only used
 *  to name the export. */
function shownLive(a: Artifact, { build, graph }: { build?: CodegraphBuild; graph?: SnapshotMetadata }): Artifact {
  const figures = graph ?? build!, commit = (graph?.revision || build?.commit || '').slice(0, 7);
  const at = graph ? localMinute(graph.indexedAt) : localMinute(new Date(build!.at).toISOString());
  const published = build || a.published ? { version: build?.version ?? a.published!.version, at, note: '索引更新于 ' + at + (commit ? ' · 提交 ' + commit : ''),
    delivery: 'cloud' as const, agents: a.published?.agents, basis: commit ? { commit } : null, auto: true } : null;
  return { ...a, graphSnapshot: graph?.snapshotId ?? build!.snapshotId, stats: [['文件', count(figures.files)], ['节点', count(figures.nodes)], ['关系', count(figures.edges)]], draft: null, published };
}
/** The artifact of a repository's first build, until the page saves it. */
function builtArtifact(b: CodegraphBuild): Artifact {
  return { id: 'a-cg-' + sourceKey(b.sourceId), projectId: b.projectId, cap: 'codegraph', sources: [b.sourceId], kind: 'index', mcpName: 'codegraph',
    name: b.repoName + (/[\x21-\x7e]$/.test(b.repoName) ? ' ' : '') + '代码图谱', desc: '查询 ' + b.repoName + ' 中的代码定义与调用关系。', published: null, draft: null };
}
const artifactOf = (artifacts: Artifact[], projectId: string, sourceId: string) =>
  artifacts.find(a => a.cap === 'codegraph' && a.projectId === projectId && a.sources[0] === sourceId);

/** What a run sets on its task: running with live progress, or its outcome. run: null removes a running state. */
export type TaskPatch = Record<string, unknown>;
export function runPatch(r: CodegraphRun, artifacts: Artifact[]): TaskPatch {
  const lastRun = localMinute(new Date(r.startedAt).toISOString());
  if (r.status === 'running') return { status: 'running', lastRun, run: { startedAt: r.startedAt, plan: { seconds: 0, steps: r.steps, logs: r.logs }, live: { step: r.step } } };
  const produced = r.status === 'success' ? artifactOf(artifacts, r.projectId, r.sourceId)?.id ?? null : null;
  return { status: r.status, lastRun, duration: durationText(r), lastLogs: r.logs, run: null, produced, ...(produced ? { artifact: produced } : {}) };
}
export function applyPatch<T extends Record<string, unknown>>(task: T, patch: TaskPatch): T {
  const next: Record<string, unknown> = { ...task, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === null) delete next[key];
  return next as T;
}

/** The code graph artifacts as shown: generated or built figures are authoritative over what is stored, and a first build
 *  shows its new artifact. */
export function codegraphArtifacts(state: TalentsState): Artifact[] {
  const artifacts = state.artifacts.map(a => { const l = liveOf(a); return l ? shownLive(a, l) : a; });
  for (const b of live?.builds() ?? []) if (!artifactOf(artifacts, b.projectId, b.sourceId)) {
    const a = builtArtifact(b);
    artifacts.unshift(shownLive(a, liveOf(a)!));
  }
  return artifacts;
}
/** The state as shown: code graph artifacts (codegraphArtifacts) and the tasks of CodeGraph runs with their progress or outcome. */
export function withCodegraph(state: TalentsState): TalentsState {
  const artifacts = codegraphArtifacts(state);
  const tasks = state.tasks.map(t => { const r = live?.run(t.id as string); return r ? applyPatch(t, runPatch(r, artifacts)) : t; });
  return { ...state, artifacts, tasks };
}
/** What the page sees of CodeGraph runs: each run's task patch, and the code graph artifacts. */
export function codegraphUpdate(state: TalentsState) {
  const artifacts = codegraphArtifacts(state);
  return { runs: Object.fromEntries((live?.runs() ?? []).map(r => [r.taskId, runPatch(r, artifacts)])), artifacts: artifacts.filter(a => a.cap === 'codegraph') };
}
/** Undoes withCodegraph on a state the page saves back: graph figures and versions are only shown, never stored
 *  (run outcomes on tasks are shown over whatever is stored). */
export function withoutCodegraph(saved: TalentsState, previous: TalentsState): TalentsState {
  return { ...saved, artifacts: saved.artifacts.map(a => {
    if (!liveOf(a)) return a;
    const before = previous.artifacts.find(x => x.id === a.id), { graphSnapshot, ...next } = a;
    return before ? { ...next, stats: before.stats, published: before.published, draft: before.draft } : next;
  }) };
}
