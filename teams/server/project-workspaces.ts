import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from '../src/domain.js';
import type { ProjectTaskWorktree, ProjectWorkspace, ProjectWorkspaces } from '../src/project-workspace.js';

async function atomicJson(path:string,value:unknown) {
  await mkdir(dirname(path),{recursive:true});
  const temporary=path+'.'+randomUUID()+'.tmp',file=await open(temporary,'wx',0o600);
  try {await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
  try {await rename(temporary,path);}catch(error){await unlink(temporary);throw error;}
}
const execute = promisify(execFile);
const git = async (directory: string, args: string[]) => (await execute('git', [...(process.platform==='win32'?['-c','core.longpaths=true']:[]),'-C', directory, ...args], {
  encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
})).stdout.trim();
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(id);
const inside = (parent: string, child: string) => { const path = relative(parent, child); return path === '' || path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); };
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, next);
  return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}
async function optionalJson(path: string) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function workspaceRepositoryIdentity(value: string) {
  if(typeof value!=='string')throw new DomainError('请输入 Git 仓库地址',400);
  const normalized = value.startsWith('git@') ? value.replace(/^git@([^:]+):/, 'ssh://git@$1/') : value;
  let url: URL; try { url = new URL(normalized); } catch { throw new DomainError('仓库地址需要无凭据的 HTTPS / SSH URL', 400); }
  if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.protocol === 'https:' && url.username || url.search || url.hash) throw new DomainError('仓库地址需要无凭据的 HTTPS / SSH URL', 400);
  return url.hostname.toLowerCase() + (url.port && !(url.protocol === 'ssh:' && url.port === '22') ? ':' + url.port : '') + url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
}
async function checkout(directory: string) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || directory.includes('\0')) throw new DomainError('请输入代码仓的本机绝对路径', 400);
  const canonical = await realpath(directory);
  if (!(await stat(canonical)).isDirectory() || await realpath(await git(canonical, ['rev-parse', '--show-toplevel'])) !== canonical) throw new DomainError('请选择独立 Git 仓库或 worktree 的根目录', 400);
  return canonical;
}
function validate(value: any) {
  if (!value || !validId(value.projectId) || !isAbsolute(value.directory ?? '') || !isAbsolute(value.commonDirectory ?? '') || typeof value.remoteUrl !== 'string' || !value.remoteUrl || typeof value.baseBranch !== 'string' || !value.baseBranch) throw new Error('项目工作区配置损坏');
  workspaceRepositoryIdentity(value.remoteUrl);
}
export async function readProjectWorkspaces(runtime: string): Promise<ProjectWorkspaces> {
  const value = await optionalJson(join(runtime, 'project-workspaces.json'));
  if (value === null) return { version: 1, defaultProjectId: null, projects: [] };
  if (value.version !== 1 || !Array.isArray(value.projects)) throw new Error('项目工作区配置损坏');
  const ids = new Set();
  for (const item of value.projects) { validate(item); if (ids.has(item.projectId)) throw new Error('项目工作区重复'); ids.add(item.projectId); }
  if (value.defaultProjectId !== null && !ids.has(value.defaultProjectId)) throw new Error('默认项目工作区不存在');
  return value;
}
export async function configuredProjectWorkspace(runtime: string, projectId?: string) {
  const config = await readProjectWorkspaces(runtime);
  return config.projects.find(item => item.projectId === (projectId ?? config.defaultProjectId)) ?? null;
}
export async function verifyProjectWorkspace(item: ProjectWorkspace) {
  validate(item);
  if (await checkout(item.directory) !== item.directory || await realpath(resolve(item.directory, await git(item.directory, ['rev-parse', '--git-common-dir']))) !== item.commonDirectory) throw new Error('工作区 Git 身份发生变化，请重新保存配置');
  if (workspaceRepositoryIdentity(await git(item.directory, ['remote', 'get-url', 'origin'])) !== workspaceRepositoryIdentity(item.remoteUrl)) throw new Error('工作区 origin 与已登记仓库不一致');
  await git(item.directory, ['check-ref-format', '--branch', item.baseBranch]);
  await git(item.directory, ['rev-parse', '--verify', 'refs/heads/' + item.baseBranch + '^{commit}']);
  return item;
}
export async function saveProjectWorkspace(runtime: string, platformRoot: string, input: {projectId: string; directory: string; remoteUrl: string; baseBranch: string}) {
  return serialized(runtime, async () => {
    if (!validId(input.projectId)) throw new DomainError('项目标识无效', 400);
    const directory = await checkout(input.directory), platform = await realpath(platformRoot);
    if (inside(platform, directory) || inside(directory, platform)) throw new DomainError('业务仓库必须位于 Teams 工程之外，不能使用其中的 workspace 子目录', 400);
    workspaceRepositoryIdentity(input.remoteUrl);
    const commonDirectory = await realpath(resolve(directory, await git(directory, ['rev-parse', '--git-common-dir'])));
    // The Teams client may be distributed as a ZIP with no Git metadata. Only the business checkout requires Git.
    let platformHasGit=true;try{await lstat(join(platform,'.git'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')platformHasGit=false;else throw error;}
    if (platformHasGit && commonDirectory === await realpath(resolve(platform, await git(platform, ['rev-parse', '--git-common-dir'])))) throw new DomainError('此工作区仍属于 Teams 仓库，请使用业务项目的独立仓库', 400);
    const item = await verifyProjectWorkspace({ ...input, directory, commonDirectory });
    const config = await readProjectWorkspaces(runtime);
    config.projects = [...config.projects.filter(old => old.projectId !== item.projectId), item]; config.defaultProjectId = item.projectId;
    await atomicJson(join(runtime, 'project-workspaces.json'), config);
    return config;
  });
}
type Task = {projectId: string; id: string; workDirectory?: string};
async function readBindings(runtime: string): Promise<ProjectTaskWorktree[]> {
  const value = await optionalJson(join(runtime, 'project-worktree-bindings.json'));
  if (value === null) return [];
  if (value.version !== 1 || !Array.isArray(value.bindings)) throw new Error('独立仓库任务绑定损坏');
  const ids = new Set(), paths = new Set();
  for (const item of value.bindings) {
    validate(item);
    const key = JSON.stringify([item.projectId, item.taskId]);
    if (item.kind !== 'project-worktree' || !validId(item.taskId) || !isAbsolute(item.repositoryDirectory ?? '') || !isAbsolute(item.worktreeRoot ?? '') || item.directory !== item.worktreeRoot || typeof item.branch !== 'string' || !item.branch.startsWith('codex/') || !/^[a-f0-9]{40}$/.test(item.baseCommit ?? '') || item.recordedDirectory !== null && !isAbsolute(item.recordedDirectory ?? '') || ids.has(key) || paths.has(item.directory)) throw new Error('独立仓库任务绑定字段无效或重复');
    ids.add(key); paths.add(item.directory);
  }
  return value.bindings;
}
export async function readProjectTaskBinding(runtime: string, task: Task): Promise<ProjectTaskWorktree | null> {
  const binding = (await readBindings(runtime)).find(item => item.projectId === task.projectId && item.taskId === task.id);
  if (!binding) return null;
  if ((task.workDirectory ?? null) !== binding.recordedDirectory) throw new Error('任务登记目录发生变化，不能更换原任务工作区');
  await verifyProjectWorkspace(binding);
  if (await git(binding.directory, ['symbolic-ref', '--short', 'HEAD']) !== binding.branch) throw new Error('任务工作区分支发生变化');
  await git(binding.directory, ['merge-base', '--is-ancestor', binding.baseCommit, 'HEAD']);
  return binding;
}
/** Only the confirmed preparation path creates a worktree. GET requests never mutate Git. */
export async function ensureProjectTaskWorkspace(runtime: string, task: Task, preparationId: string) {
  return serialized(runtime, async () => {
    const existing = await readProjectTaskBinding(runtime, task); if (existing) return existing;
    const configured = await configuredProjectWorkspace(runtime, task.projectId); if (!configured) return null;
    await verifyProjectWorkspace(configured);
    const currentTask = async () => {
      const state = JSON.parse(await readFile(join(runtime, 'state.json'), 'utf8'));
      const actual = state.workspace?.deliveryRequirements?.find((item: any) => item.id === task.id && item.projectId === task.projectId);
      const preparation = state.workspace?.taskAutomation?.find((item: any) => item.taskId === task.id && item.projectId === task.projectId)?.preparation;
      if (!actual || actual.workDirectory !== task.workDirectory || actual.preparedAt || actual.stage !== 'preparing' || Object.values(actual.nodes ?? {}).some((node: any) => node.status !== 'pending') || preparation?.id !== preparationId || preparation.status !== 'preparing-session' || preparation.session) throw new Error('任务已开始或准备请求发生变化，未迁移任务目录');
      return actual;
    };
    await currentTask();
    if (task.workDirectory) throw new Error('任务已有显式目录，请保留原目录；新需求将使用项目工作区');
    const slug = task.id.toLowerCase().slice(0, 48) + '-' + createHash('sha256').update(task.projectId + ':' + task.id).digest('hex').slice(0, 8);
    const branch = 'codex/' + task.projectId + '-' + slug;
    const directory = join(dirname(configured.directory), basename(configured.directory) + '-tasks', slug);
    const baseCommit = await git(configured.directory, ['rev-parse', '--verify', 'refs/heads/' + configured.baseBranch + '^{commit}']);
    await mkdir(dirname(directory), { recursive: true });
    // git worktree add explicitly rejects an existing path/branch; no reset, checkout or automatic reuse.
    await git(configured.directory, ['worktree', 'add', '-b', branch, directory, baseCommit]);
    const binding: ProjectTaskWorktree = { ...configured, kind: 'project-worktree', remote: 'origin', taskId: task.id, directory: await realpath(directory), worktreeRoot: await realpath(directory), repositoryDirectory: configured.directory, recordedDirectory: null, branch, baseCommit };
    await currentTask();
    const bindings = await readBindings(runtime); bindings.push(binding);
    await atomicJson(join(runtime, 'project-worktree-bindings.json'), {version: 1, bindings});
    return binding;
  });
}
