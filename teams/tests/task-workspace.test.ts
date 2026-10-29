import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareTaskWorkspace, readTaskWorkspace } from '../server/task-workspace.js';
import { ensureTaskWorkspace, taskWorkDirectory } from '../server/task-work-directory.js';
import { initialState } from '../src/domain.js';
import { createDeliveryRequirement } from '../src/delivery-requirements.js';
import { queueTaskPreparation } from '../src/task-automation.js';
import { ProjectWorkService, type WorkTransport } from '../server/project-work.js';
import { readFixtures } from '../server/http-shared.js';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';

const execute = promisify(execFile);
const git = async (directory: string, args: string[]) => (await execute('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true })).stdout.trim();
const task = { projectId: 'project-workspace-test', taskId: 'REQ-00000000-0000-4000-8000-000000000001' };

test('plain task folders become local Git workspaces with an empty base commit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-workspace-'));
  try {
    const runtime = join(root, 'runtime'), directory = join(root, 'task');
    await mkdir(directory);
    await writeFile(join(directory, 'existing.txt'), 'keep me untracked');
    const workspace = await prepareTaskWorkspace(runtime, { ...task, directory, projectRemoteUrl: '1' });
    assert.equal(workspace.mode, 'git'); assert.equal(workspace.localOnly, true); assert.equal(workspace.baseBranch, 'main'); assert.match(workspace.baseCommit!, /^[a-f0-9]{40}$/);
    assert.equal(await git(directory, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main');
    assert.equal(await git(directory, ['show', '--stat', '--oneline', 'HEAD']), workspace.baseCommit!.slice(0, 7) + ' Initial local workspace');
    assert.match(await git(directory, ['status', '--porcelain']), /existing\.txt/);
    assert.deepEqual(await readTaskWorkspace(runtime, task), workspace);
    assert.equal(await taskWorkDirectory(runtime, { projectId: task.projectId, id: task.taskId }), workspace.directory);
    const ensured = await ensureTaskWorkspace(runtime, task, 'preparation-test'); assert.ok(ensured); assert.equal(ensured.directory, workspace.directory);
    assert.equal((await stat(join(directory, '.git'))).isDirectory(), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('existing Git repositories are reused; a matching project origin is not local-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-workspace-git-'));
  try {
    const runtime = join(root, 'runtime'), directory = join(root, 'repo');
    await mkdir(directory); await git(directory, ['init']); await git(directory, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await writeFile(join(directory, 'README.md'), 'repo');
    await git(directory, ['add', 'README.md']);
    await git(directory, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'base']);
    await git(directory, ['remote', 'add', 'origin', 'https://github.com/example/project.git']);
    const workspace = await prepareTaskWorkspace(runtime, { ...task, directory, projectRemoteUrl: 'https://github.com/example/project' });
    assert.equal(workspace.mode, 'git'); assert.equal(workspace.localOnly, false); assert.equal(workspace.remoteUrl, 'https://github.com/example/project.git'); assert.equal(workspace.baseBranch, 'main');
    assert.equal(await git(directory, ['rev-list', '--count', 'HEAD']), '1');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('explicit no-Git mode keeps a task folder usable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-workspace-nogit-'));
  try {
    const runtime = join(root, 'runtime'), directory = join(root, 'task'); await mkdir(directory);
    const workspace = await prepareTaskWorkspace(runtime, { ...task, directory, mode: 'directory' });
    assert.equal(workspace.mode, 'directory'); assert.equal(workspace.localOnly, true); assert.equal(workspace.baseCommit, null);
    assert.equal(await taskWorkDirectory(runtime, { projectId: task.projectId, id: task.taskId }), await (await import('node:fs/promises')).realpath(directory));
    await assert.rejects(stat(join(directory, '.git')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('binding a task folder makes the work plan usable without a project workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-work-bind-'));
  try {
    const runtime = join(root, 'runtime'), work = join(root, 'ui-work'); await mkdir(work);
    const projectId = randomUUID(), taskId = 'REQ-' + randomUUID(), at = '2026-10-29T00:00:00.000Z';
    const state = initialState();
    state.workspace.projects = [{ id: projectId, name: 'UI 项目', description: '本地工作区', remoteUrl: '1', repositoryIdentity: '1', teamId: 'carddemo', owner: 'owner', createdAt: at, updatedAt: at, assets: [] }];
    createDeliveryRequirement(state, 'owner', { projectId, id: taskId, title: '信用卡注册数据统计 UI', description: '绘制页面', assigneeId: 'member' }, at);
    queueTaskPreparation(state, { projectId, taskId }, at);
    state.workspace.taskAutomation!.find(record => record.taskId === taskId)!.preparation!.status = 'ready';
    const transport: WorkTransport = { defaults: async () => ({ agent: 'code', agentLabel: 'Code', model: 'model', modelLabel: 'Model', terminal: { id: 'system', name: 'PowerShell' } }), history: async () => ({ available: false, directory: work, title: '', active: null }), focus: async () => { throw new Error('not used'); }, start: async () => { throw new Error('not used'); } };
    const service = new ProjectWorkService(() => state, await readFixtures(), runtime, transport, undefined as any, runtime);
    const plan = await service.bind('member', { projectId, tab: 'delivery', taskId, nodeId: 'prepare' }, work);
    assert.equal(plan.directory.valid, true); assert.equal(plan.directory.kind, 'task-workspace'); assert.equal(plan.directory.root, await realpath(work));
    assert.equal(plan.workspace?.mode, 'git'); assert.equal(plan.workspace?.localOnly, true);
    assert.equal(await readTaskWorkspace(runtime, { projectId, taskId }).then(item => item?.directory), await realpath(work));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a selected subdirectory resolves to the Git root; the Teams platform directory is refused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'task-workspace-root-'));
  try {
    const runtime = join(root, 'runtime'), repo = join(root, 'repo'), child = join(repo, 'ui');
    await mkdir(child, { recursive: true }); await git(repo, ['init']); await git(repo, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'base']);
    const workspace = await prepareTaskWorkspace(runtime, { ...task, directory: child });
    assert.equal(workspace.directory, await (async () => (await import('node:fs/promises')).realpath(repo))());
    await assert.rejects(prepareTaskWorkspace(runtime, { ...task, directory: process.cwd() }), /Teams 工程之外/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
