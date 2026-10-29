// Code graphs read from the repository's index when opened (server/codegraph-view.ts, server/codegraph.ts), on a small
// made-up repository (tests/fixtures/codegraph-repo.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodegraphViews } from '../server/codegraph-view.ts';
import { exportSnapshot } from '../server/codegraph-export.ts';
import { codegraphSnapshot, codegraphView, setLiveCodegraph, withCodegraph } from '../server/codegraph.ts';
import type { Artifact } from '../server/model.ts';
import { PROJECT_ID, REPO_ID, seedState } from '../server/seed.ts';
import { codegraphRepository, FIXTURE } from './fixtures/codegraph-repo.ts';

async function repositoryWithIndex() {
  const directory = await mkdtemp(join(tmpdir(), 'codegraph-view-'));
  const repository = await codegraphRepository(join(directory, 'shop'));
  let generated = 0;
  const views = new CodegraphViews(join(directory, 'state'), options => { generated++; return exportSnapshot(options); });
  return { repository, views, generated: () => generated };
}
const setState = (repository: string, state: string) => {
  const db = new DatabaseSync(join(repository, '.codegraph', 'codegraph.db'));
  db.prepare("UPDATE project_metadata SET value = ? WHERE key = 'index_state'").run(state); db.close();
};

test('a graph is generated from the index when opened, and again only after the index changes', async () => {
  const { repository, views, generated } = await repositoryWithIndex();
  const first = (await views.view(PROJECT_ID, REPO_ID, repository))!;
  assert.equal(first.notice, undefined);
  assert.equal(first.graph.nodes.length, FIXTURE.files + FIXTURE.symbols);
  assert.equal(first.graph.metadata.root, repository);
  assert.equal(generated(), 1);
  await views.view(PROJECT_ID, REPO_ID, repository);
  assert.equal(generated(), 1, 'an unchanged index is not read again');
  const later = new Date(Date.now() + 5000);
  await utimes(join(repository, '.codegraph', 'codegraph.db'), later, later);
  await views.view(PROJECT_ID, REPO_ID, repository);
  assert.equal(generated(), 2, 'a written index is read again');
});

test('while the index is being updated, or after it is removed, the last graph shows with a notice', async () => {
  const { repository, views } = await repositoryWithIndex();
  setState(repository, 'indexing');
  await assert.rejects(views.view(PROJECT_ID, REPO_ID, repository), (e: any) => e.status === 409, 'nothing to show before the first complete index');
  setState(repository, 'complete');
  const shown = (await views.view(PROJECT_ID, REPO_ID, repository))!;
  setState(repository, 'indexing');
  const updating = (await views.view(PROJECT_ID, REPO_ID, repository))!;
  assert.match(updating.notice!, /^索引正在更新，显示的是 .* 的索引$/);
  assert.equal(updating.graph.metadata.snapshotId, shown.graph.metadata.snapshotId);
  await rm(join(repository, '.codegraph'), { recursive: true });
  assert.match((await views.view(PROJECT_ID, REPO_ID, repository))!.notice!, /^代码仓中已没有 CodeGraph 索引/);
  assert.equal(await new CodegraphViews(join(repository, 'other-state')).view(PROJECT_ID, REPO_ID, repository), null);
});

test('the artifact shows the graph generated from the index; without an index or a generated graph there is none', async () => {
  const { repository, views } = await repositoryWithIndex();
  setLiveCodegraph({ views, build: () => undefined, builds: () => [], run: () => undefined, runs: () => [] });
  try {
    assert.equal(await codegraphView(PROJECT_ID, REPO_ID, join(repository, 'missing')), null);
    assert.equal(codegraphSnapshot(PROJECT_ID, REPO_ID), null);
    const live = (await codegraphView(PROJECT_ID, REPO_ID, repository))!.graph;
    assert.equal(live.metadata.root, repository);
    assert.equal(codegraphSnapshot(PROJECT_ID, REPO_ID)!.metadata.snapshotId, live.metadata.snapshotId, 'source previews read the generated graph');
    assert.equal((await codegraphView(PROJECT_ID, REPO_ID, null))!.graph.metadata.snapshotId, live.metadata.snapshotId, 'without the bound directory, the generated graph');
    const state = seedState();
    const artifact: Artifact = { id: 'a-cg-shop', projectId: PROJECT_ID, cap: 'codegraph', name: 'shop 代码图谱', desc: '', sources: [REPO_ID], kind: 'index', stats: [], mcpName: 'codegraph',
      published: { version: 3, at: '2026-10-26 02:05', note: '首次发布', delivery: 'cloud', agents: ['Code'], basis: null, auto: true }, draft: null };
    state.artifacts.push(artifact);
    const a = withCodegraph(state).artifacts.find(x => x.id === 'a-cg-shop')!;
    assert.equal(a.graphSnapshot, live.metadata.snapshotId);
    assert.deepEqual(a.stats, [['文件', String(FIXTURE.files)], ['节点', String(FIXTURE.files + FIXTURE.symbols)], ['关系', String(live.metadata.edges)]]);
    assert.equal(a.published!.version, 3, 'a graph read without a Talents build keeps the version');
    assert.match(a.published!.note, /^索引更新于 /);
  } finally { setLiveCodegraph(null); }
});
