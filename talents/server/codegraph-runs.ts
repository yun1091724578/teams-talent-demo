// Real CodeGraph builds in the code repository bound in Teams. A run executes the CodeGraph engine script of iCode
// Knowledge (engines/codegraph/run.py, copied unchanged): its self-check, then `codegraph init` or `codegraph sync`
// and the status check, in the repository as it is (no branch switch, no fetch). A successful run then generates the graph
// the page shows (server/codegraph-view.ts). Runs and builds are kept in <state dir>/codegraph/, apart from the state the page saves.
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { root } from './config.ts';
import { HttpError } from './model.ts';
import { atomicJson } from './store.ts';
import { CodegraphViews } from './codegraph-view.ts';

export interface CodegraphRun {
  taskId: string; projectId: string; sourceId: string; repository: string; repoName: string;
  status: 'running' | 'success' | 'failed'; startedAt: number; endedAt?: number;
  steps: string[]; step: number; logs: string[];
}
/** The latest successful build of a repository: the version it published and the graph generated after it. */
export interface CodegraphBuild {
  projectId: string; sourceId: string; repoName: string; repository: string; taskId: string;
  version: number; at: number; commit: string; snapshotId: string; files: number; nodes: number; edges: number;
}
interface Data { runs: Record<string, CodegraphRun>; builds: Record<string, CodegraphBuild> }
export interface StartRequest { taskId: string; projectId: string; sourceId: string; repository: string; repoName: string }
export interface RunnerOptions {
  /** <state dir>/codegraph: runs.json and the exported snapshots. */
  directory: string;
  /** The version a successful build publishes: one more than the version its artifact shows. */
  nextVersion(projectId: string, sourceId: string): number;
  /** After a run ends. */
  onChange?(): void;
  script?: string; python?: string; env?: NodeJS.ProcessEnv;
  /** Generates the graphs; by default kept in `directory`. */
  views?: CodegraphViews;
  /** Milliseconds after which a run is stopped. */
  timeout?: number;
  /** Why a build cannot start now (CodeGraph is being installed); null when it can. */
  blocked?(): string | null;
}

const K = '[icode-knowledge]';
const MAX_LOG_LINES = 3000;
const git = promisify(execFile);
const buildKey = (projectId: string, sourceId: string) => projectId + '\n' + sourceId;
const seconds = (ms: number) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 60 ? s + ' 秒' : Math.floor(s / 60) + ' 分 ' + String(s % 60).padStart(2, '0') + ' 秒'; };
export const durationText = (run: CodegraphRun) => seconds((run.endedAt ?? Date.now()) - run.startedAt);
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** The environment run.py, codegraph and its installer get: the service's, with the official installer's ~/.local/bin on PATH. */
export function engineEnv(env: NodeJS.ProcessEnv) {
  const bin = join(homedir(), '.local', 'bin'), path = env.PATH ?? '';
  return { ...env, PYTHONUNBUFFERED: '1', PATH: process.platform !== 'win32' && existsSync(bin) && !path.split(delimiter).includes(bin) ? path + delimiter + bin : path };
}

/** Runs a command, passing its output to `log` line by line (a progress line rewritten with \r gives its last state,
 *  colour codes removed); resolves with the exit code (127 when it cannot start). The command and whatever it starts are
 *  stopped after `timeout` ms, or when the `kill` given to `started` is called. */
export function runLogged(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; log(line: string): void;
  started?(kill: () => void): void; ended?(): void }) {
  return new Promise<number>(resolve => {
    const group = process.platform !== 'win32';
    const child = spawn(command, args, { cwd: options.cwd, env: engineEnv(options.env ?? process.env), stdio: ['ignore', 'pipe', 'pipe'], detached: group, windowsHide: true });
    // The command starts others (run.py starts codegraph, the installer curl and sh): stop the whole process group.
    const kill = () => { try { if (group && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch { /* already gone */ } };
    options.started?.(kill);
    const limit = options.timeout ?? 30 * 60_000;
    const timer = setTimeout(() => { options.log(K + ' 超过 ' + Math.round(limit / 60_000) + ' 分钟没有完成，已停止'); kill(); }, limit);
    const pending = { stdout: '', stderr: '' };
    const take = (stream: 'stdout' | 'stderr', text: string, end = false) => {
      const parts = (pending[stream] + text).split('\n');
      pending[stream] = end ? '' : parts.pop()!;
      for (const part of parts) { const line = part.replace(/\r+$/, '').split('\r').pop()!.replace(ANSI, '').trimEnd(); if (line) options.log(line); }
    };
    child.stdout.setEncoding('utf8').on('data', text => take('stdout', text));
    child.stderr.setEncoding('utf8').on('data', text => take('stderr', text));
    const done = (code: number) => { clearTimeout(timer); options.ended?.(); resolve(code); };
    // A command that cannot start may not close.
    child.on('error', error => {
      options.log(K + ' 无法启动 ' + command + '：' + ((error as NodeJS.ErrnoException).code === 'ENOENT' ? '在 PATH 中找不到' : error.message));
      done(127);
    });
    child.on('close', code => { take('stdout', '', true); take('stderr', '', true); done(code ?? 1); });
  });
}

export class CodegraphRunner {
  private data: Data = { runs: {}, builds: {} };
  private children = new Map<string, { kill(): void }>();
  private saving: Promise<unknown> = Promise.resolve();
  private readonly file: string;
  readonly views: CodegraphViews;
  constructor(private readonly options: RunnerOptions) {
    this.file = join(options.directory, 'runs.json');
    this.views = options.views ?? new CodegraphViews(options.directory);
  }

  async init() {
    try { this.data = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // A run the service did not see to its end failed with it.
    for (const run of Object.values(this.data.runs)) if (run.status === 'running') {
      run.status = 'failed'; run.endedAt ??= run.startedAt;
      run.logs.push(K + ' 失败：Talents 服务在运行中停止，这次运行已中断；需要时重新运行。');
    }
    await this.save();
    return this;
  }
  run(taskId: string) { return this.data.runs[taskId]; }
  runs() { return Object.values(this.data.runs); }
  build(projectId: string, sourceId: string) { return this.data.builds[buildKey(projectId, sourceId)]; }
  builds() { return Object.values(this.data.builds); }
  running() { return this.runs().some(r => r.status === 'running'); }

  /** Starts a build; the run goes on in the background. */
  start(request: StartRequest): CodegraphRun {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(request.projectId)) throw new HttpError('项目无效', 400);
    const blocked = this.options.blocked?.();
    if (blocked) throw new HttpError(blocked, 409);
    let repository: string;
    try { repository = realpathSync(request.repository); if (!statSync(repository).isDirectory()) throw new Error('不是目录'); }
    catch (error) { throw new HttpError('无法访问代码仓目录 ' + request.repository + '：' + (error as Error).message, 400); }
    const busy = this.runs().find(r => r.status === 'running' && (r.taskId === request.taskId || r.repository === repository));
    if (busy) throw new HttpError(busy.taskId === request.taskId ? '任务正在运行' : '代码仓 ' + request.repoName + ' 正在构建代码图谱，请等这次运行结束', 409);
    const sync = existsSync(join(repository, '.codegraph', 'codegraph.db'));
    const run: CodegraphRun = { ...request, repository, status: 'running', startedAt: Date.now(), steps: ['自检', sync ? '同步索引' : '建立索引', '生成图谱数据'], step: 0, logs: [] };
    this.data.runs[request.taskId] = run;
    void this.save();
    void this.execute(run);
    return run;
  }

  /** Forgets every run, build and generated graph (the repositories' .codegraph indexes stay). */
  async clear() {
    if (this.running()) throw new HttpError('有正在运行的代码图谱构建，请等它结束后再重置', 409);
    this.data = { runs: {}, builds: {} };
    await this.saving;
    await rm(this.options.directory, { recursive: true, force: true });
    await this.save();
  }
  /** Stops the running builds (the service is shutting down). */
  stop() { for (const child of this.children.values()) child.kill(); }

  private save() {
    const next = this.saving.then(() => atomicJson(this.file, this.data));
    this.saving = next.catch(error => console.error('CodeGraph 运行记录保存失败：' + error.message));
    return next;
  }
  private log(run: CodegraphRun, ...lines: string[]) {
    run.logs.push(...lines);
    if (run.logs.length > MAX_LOG_LINES) run.logs.splice(0, run.logs.length - MAX_LOG_LINES, '（日志过长，只保留最近 ' + MAX_LOG_LINES + ' 行）');
  }

  private async execute(run: CodegraphRun) {
    const { script = join(root, 'engines', 'codegraph', 'run.py'), python = process.platform === 'win32' ? 'py' : 'python3' } = this.options;
    const work = join(this.options.directory, 'runs', randomUUID());
    let outcome: CodegraphRun['status'] = 'failed';
    try {
      this.log(run, K + ' 构建代码图谱：' + run.repoName, K + ' 代码仓目录：' + run.repository + '（按当前工作区构建，不切换分支、不拉取远端）');
      this.log(run, K + ' 自检：' + python + ' run.py --check');
      if (await this.spawn(run, python, [script, '--check']) !== 0) throw new Error('自检没有通过，请确认 python3 和 codegraph 已安装，codegraph 在 PATH 中');
      run.step = 1;
      const previous = this.build(run.projectId, run.sourceId);
      const gitInfo = await this.gitInfo(run.repository, previous);
      const input = join(work, 'input.json');
      await mkdir(work, { recursive: true });
      await writeFile(input, JSON.stringify({ input: { repositories: [{ sourceId: run.sourceId, path: run.repository, ...(gitInfo ? { git: gitInfo } : {}) }] },
        output: { index: { path: join(run.repository, '.codegraph') } } }, null, 2));
      if (await this.spawn(run, python, [script, '--input-file', input]) !== 0) throw new Error('代码图谱构建失败，见上面的日志');
      run.step = 2;
      this.log(run, K + ' 生成图谱数据');
      const metadata = await this.views.refresh(run.projectId, run.sourceId, run.repository);
      const version = this.options.nextVersion(run.projectId, run.sourceId);
      this.data.builds[buildKey(run.projectId, run.sourceId)] = { projectId: run.projectId, sourceId: run.sourceId, repoName: run.repoName, repository: run.repository, taskId: run.taskId,
        version, at: Date.now(), commit: metadata.revision, snapshotId: metadata.snapshotId, files: metadata.files, nodes: metadata.nodes, edges: metadata.edges };
      this.log(run, K + ' 图谱：' + metadata.files.toLocaleString('en-US') + ' 个文件、' + metadata.nodes.toLocaleString('en-US') + ' 个节点、'
        + metadata.edges.toLocaleString('en-US') + ' 条关系' + (metadata.revision ? '，提交 ' + metadata.revision.slice(0, 7) : ''), K + ' 完成：代码图谱已更新');
      outcome = 'success';
    } catch (error) {
      this.log(run, K + ' 失败：' + (error as Error).message);
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
      // The run ends once nothing of it is left to clean up; its record is saved before a reset can remove the directory.
      run.status = outcome; run.endedAt = Date.now();
      const saved = this.save();
      this.options.onChange?.();
      await saved.catch(() => undefined);
    }
  }

  /** The code version run.py logs: branch, HEAD and the commit of the previous build. Null outside a Git work tree. */
  private async gitInfo(repository: string, previous: CodegraphBuild | undefined) {
    try {
      const read = async (...args: string[]) => (await git('git', ['-C', repository, ...args], { timeout: 10_000 })).stdout.trim();
      const commit = await read('rev-parse', 'HEAD');
      const branch = await read('branch', '--show-current').catch(() => '');
      return { branch: branch || '(detached)', sync: 'local', commit, previous: previous?.commit ? { commit: previous.commit } : null };
    } catch { return null; }
  }

  /** Runs a command in the repository, adding its output to the run's log. */
  private spawn(run: CodegraphRun, command: string, args: string[]) {
    return runLogged(command, args, { cwd: run.repository, env: this.options.env, timeout: this.options.timeout, log: line => this.log(run, line),
      started: kill => this.children.set(run.taskId, { kill }), ended: () => this.children.delete(run.taskId) });
  }
}
