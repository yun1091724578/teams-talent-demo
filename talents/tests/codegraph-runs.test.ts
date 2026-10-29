// CodeGraph builds on the service (server/codegraph-runs.ts) and how the page sees them (server/codegraph.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodegraphRunner, type RunnerOptions } from '../server/codegraph-runs.ts';
import { CodegraphViews } from '../server/codegraph-view.ts';
import { codegraphUpdate, setLiveCodegraph, withCodegraph, withoutCodegraph } from '../server/codegraph.ts';
import type { SnapshotMetadata } from '../server/codegraph-export.ts';
import { PROJECT_ID, REPO_ID, seedState } from '../server/seed.ts';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-codegraph-run.mjs');
const metadata = (snapshotId: string): SnapshotMetadata => ({ project: PROJECT_ID, root: '', toolVersion: '1.6.0', indexedAt: '', exportedAt: '', revision: 'abcdef1234567890', sourceDigest: '',
  snapshotId, files: 12, nodes: 3456, edges: 7890, parseErrors: 0, unresolved: 0, nodeKinds: {}, edgeKinds: {} });

async function setup(fake = '', extra: Partial<RunnerOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'codegraph-runs-'));
  const repository = join(directory, 'carddemo-java-1025'); await mkdir(repository);
  execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
  execFileSync('git', ['-C', repository, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'base']);
  const exported: string[] = [], changes: number[] = [];
  let version = 3;
  const views = new CodegraphViews(join(directory, 'state'), async options => { exported.push(options.output); return metadata('0123456789abcdef'); });
  const runner = await new CodegraphRunner({ directory: join(directory, 'state'), script, python: process.execPath, env: { ...process.env, FAKE_RUN: fake },
    nextVersion: () => ++version, onChange: () => changes.push(Date.now()), views, ...extra }).init();
  return { directory, repository: await realpath(repository), runner, exported, changes };
}
const start = (runner: CodegraphRunner, repository: string, taskId = 't-1') =>
  runner.start({ taskId, projectId: PROJECT_ID, sourceId: REPO_ID, repository, repoName: 'carddemo-java-1025' });
async function finished(runner: CodegraphRunner, taskId = 't-1') {
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; await new Promise(done => setTimeout(done, 20))) {
    const run = runner.run(taskId);
    if (run && run.status !== 'running') return run;
  }
  throw new Error('run did not finish');
}

test('a build runs the engine script in the repository, logs its output and publishes the next version', async () => {
  const { repository, runner, exported, changes } = await setup();
  const run = start(runner, repository);
  assert.equal(run.status, 'running');
  assert.deepEqual(run.steps, ['自检', '建立索引', '生成图谱数据']);
  const done = await finished(runner);
  assert.equal(done.status, 'success');
  assert.equal(done.step, 2);
  const logs = done.logs.join('\n');
  assert.match(logs, /自检通过：codegraph 1\.6\.0/);
  assert.match(logs, /代码版本：分支 main，上次：无记录，索引 .*\.codegraph/, 'the input names the repository, its branch and its index');
  assert.match(logs, /^Scanning 10 files$/m, 'a progress line rewritten with \\r shows its last state');
  assert.match(logs, /^warning: slow disk$/m, 'colour codes are removed');
  assert.match(logs, /完成：代码图谱已更新$/m);
  assert.deepEqual(exported, [runner.views.dir(PROJECT_ID, REPO_ID)], 'the graph is generated from the new index');
  assert.equal(changes.length, 1);
  const build = runner.build(PROJECT_ID, REPO_ID)!;
  assert.deepEqual([build.version, build.snapshotId, build.commit, build.nodes], [4, '0123456789abcdef', 'abcdef1234567890', 3456]);
  // The next build of the same repository syncs its index and names the previous build's commit.
  assert.equal(start(runner, repository, 't-2').steps[1], '同步索引');
  const again = await finished(runner, 't-2');
  assert.match(again.logs.join('\n'), /上次：abcdef1234567890/);
  assert.equal(runner.build(PROJECT_ID, REPO_ID)!.version, 5);
});

test('a failing script fails the run without a build; a second run of a busy repository is refused', async () => {
  const failing = await setup('fail');
  start(failing.runner, failing.repository);
  const run = await finished(failing.runner);
  assert.equal(run.status, 'failed');
  assert.match(run.logs.join('\n'), /失败：代码图谱构建失败/);
  assert.equal(failing.runner.build(PROJECT_ID, REPO_ID), undefined);

  const slow = await setup('wait');
  start(slow.runner, slow.repository);
  assert.throws(() => start(slow.runner, slow.repository, 't-2'), (e: any) => e.status === 409 && /正在构建代码图谱/.test(e.message));
  await assert.rejects(slow.runner.clear(), (e: any) => e.status === 409);
  await finished(slow.runner);
  await slow.runner.clear();
  assert.deepEqual([slow.runner.runs(), slow.runner.builds()], [[], []]);
});

test('a run the service did not see to its end is failed when the service starts again', async () => {
  const { directory, repository, runner } = await setup('wait');
  start(runner, repository);
  await new Promise(done => setTimeout(done, 100));
  const again = await new CodegraphRunner({ directory: join(directory, 'state'), nextVersion: () => 1 }).init();
  assert.equal(again.run('t-1')!.status, 'failed');
  assert.match(again.run('t-1')!.logs.at(-1)!, /服务在运行中停止/);
  await finished(runner);
});

test('the page sees builds over the saved state: tasks with their progress, the code graph as the next version, a first build as a new artifact', async () => {
  const { repository, runner } = await setup('wait');
  setLiveCodegraph(runner);
  try {
    const state = seedState();
    state.tasks.unshift({ id: 't-1', projectId: PROJECT_ID, cap: 'codegraph', sources: [REPO_ID], status: 'idle', schedule: { kind: 'now' } });
    state.artifacts.push({ id: 'a-cg-repo', projectId: PROJECT_ID, cap: 'codegraph', name: 'carddemo-java-1025 代码图谱', desc: '', sources: [REPO_ID], kind: 'index', stats: [], mcpName: 'codegraph',
      published: { version: 3, at: '2026-10-26 02:05', note: '首次发布', delivery: 'cloud', agents: ['Code'], basis: null, auto: true }, draft: null });
    start(runner, repository);
    const running = withCodegraph(state).tasks.find(t => t.id === 't-1') as any;
    assert.equal(running.status, 'running');
    assert.deepEqual(running.run.live, { step: 0 });
    assert.deepEqual(running.run.plan.steps, ['自检', '建立索引', '生成图谱数据']);

    await finished(runner);
    const shown = withCodegraph(state);
    const task = shown.tasks.find(t => t.id === 't-1') as any;
    assert.equal(task.status, 'success');
    assert.equal(task.run, undefined);
    assert.equal(task.produced, 'a-cg-repo');
    assert.match(task.lastLogs.join('\n'), /代码图谱已更新$/m);
    const graph = shown.artifacts.find(a => a.id === 'a-cg-repo')!;
    assert.equal(graph.graphSnapshot, '0123456789abcdef');
    assert.deepEqual(graph.stats, [['文件', '12'], ['节点', '3,456'], ['关系', '7,890']]);
    assert.equal(graph.published!.version, 4);
    assert.equal(graph.draft, null, 'a build is not reviewed');
    assert.deepEqual(graph.published!.basis, { commit: 'abcdef1' });

    // Saving the page state keeps the stored values: the build is shown over them.
    const saved = withoutCodegraph(shown, state);
    const stored = saved.artifacts.find(a => a.id === 'a-cg-repo')!;
    assert.equal(stored.published!.version, 3);
    assert.equal(stored.graphSnapshot, undefined);

    // A repository without an artifact gets one from its first build.
    const other = withCodegraph({ ...state, artifacts: state.artifacts.filter(a => a.id !== 'a-cg-repo') });
    const created = other.artifacts.find(a => a.cap === 'codegraph')!;
    assert.match(created.id, /^a-cg-[0-9a-f]{16}$/);
    assert.equal(created.name, 'carddemo-java-1025 代码图谱');
    assert.equal(created.published!.version, 4);
    const update = codegraphUpdate(state);
    assert.equal(update.runs['t-1'].status, 'success');
    assert.equal(update.runs['t-1'].run, null, 'the page drops the running state');
    assert.deepEqual(update.artifacts.map(a => a.id), ['a-cg-repo']);
  } finally { setLiveCodegraph(null); }
});
