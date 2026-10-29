// Installing CodeGraph, as iCode Knowledge does: the install command its engine.yaml declares for this platform (the
// official installer, pinned to the version the engine was accepted with), then the engine's self-check
// (engines/codegraph/run.py --check: the environment checks, the codegraph lookup and `codegraph --version`).
// Whether CodeGraph is installed is what the self-check says. An install is not run while a build runs, and the other way round.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { contentDir, root } from './config.ts';
import { HttpError } from './model.ts';
import { runLogged } from './codegraph-runs.ts';

/** installed: the self-check passed; missing: codegraph is not found; failed: anything else the self-check reports. */
export interface EngineStatus { state: 'installed' | 'missing' | 'failed'; version?: string; detail?: string; checkedAt: number }
export interface InstallRun { status: 'running' | 'success' | 'failed'; startedAt: number; endedAt?: number; command: string; logs: string[] }
export interface Command { command: string; args: string[] }
export interface InstallerOptions {
  /** The engine's install command; read from content/engines/codegraph/engine.yaml when omitted. */
  install?: Command | null;
  script?: string; python?: string; env?: NodeJS.ProcessEnv;
  /** Why an install cannot start now (a build is running); null when it can. */
  blocked?(): string | null;
  timeout?: number;
}

const K = '[icode-knowledge]';
const PLATFORMS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'macos', linux: 'linux', win32: 'windows' };
/** The install command engine.yaml declares for this platform; null when it declares none. */
export function declaredInstall(text = readFileSync(join(contentDir, 'engines', 'codegraph', 'engine.yaml'), 'utf8'), platform = process.platform): Command | null {
  const declared = parse(text)?.install?.platforms?.[PLATFORMS[platform] ?? ''];
  return declared && typeof declared.command === 'string' && Array.isArray(declared.args) ? { command: declared.command, args: declared.args.map(String) } : null;
}
export const commandText = (c: Command) => [c.command, ...c.args.map(a => /[\s"'|$;]/.test(a) ? JSON.stringify(a) : a)].join(' ');

export class CodegraphInstaller {
  private last: InstallRun | null = null;
  private status: Promise<EngineStatus> | null = null;
  private kill: (() => void) | null = null;
  readonly command: Command | null;
  constructor(private readonly options: InstallerOptions = {}) {
    this.command = options.install === undefined ? declaredInstall() : options.install;
  }
  installing() { return this.last?.status === 'running'; }
  /** The engine's state, from the last self-check; `fresh` checks again. */
  async state(fresh = false) {
    if (fresh || !this.status) this.status = this.check();
    return { status: await this.status, install: this.last, command: this.command && commandText(this.command) };
  }

  /** Runs the self-check (in the service's environment, as builds do). */
  private async check(): Promise<EngineStatus> {
    const { script = join(root, 'engines', 'codegraph', 'run.py'), python = process.platform === 'win32' ? 'py' : 'python3' } = this.options;
    const lines: string[] = [];
    const code = await runLogged(python, [script, '--check'], { env: this.options.env, timeout: 60_000, log: line => lines.push(line) });
    const checkedAt = Date.now(), text = lines.join('\n');
    if (code === 0) return { state: 'installed', version: /自检通过：codegraph ([^\s（(]+)/.exec(text)?.[1], checkedAt };
    const detail = lines.map(l => l.replace(/^\[icode-knowledge(-codegraph)?\] (自检失败：)?/, '')).join('\n').trim() || '自检没有通过';
    return { state: /找不到 codegraph/.test(text) ? 'missing' : 'failed', detail, checkedAt };
  }

  /** Starts the install; it goes on in the background and ends with a self-check. */
  install(): InstallRun {
    if (!this.command) throw new HttpError('CodeGraph 没有为这个平台声明安装命令，请按 README 手动安装', 422);
    if (this.installing()) throw new HttpError('正在安装 CodeGraph', 409);
    const blocked = this.options.blocked?.();
    if (blocked) throw new HttpError(blocked, 409);
    const run: InstallRun = { status: 'running', startedAt: Date.now(), command: commandText(this.command), logs: [K + ' 运行安装命令：' + commandText(this.command)] };
    this.last = run;
    void (async () => {
      const code = await runLogged(this.command!.command, this.command!.args, { env: this.options.env, timeout: this.options.timeout ?? 30 * 60_000,
        log: line => { run.logs.push(line); if (run.logs.length > 2000) run.logs.splice(1, run.logs.length - 2000); }, started: kill => { this.kill = kill; }, ended: () => { this.kill = null; } });
      run.logs.push(K + ' 安装命令退出，退出码 ' + code, K + ' 自检：run.py --check');
      this.status = this.check();
      const status = await this.status;
      run.logs.push(K + (status.state === 'installed' ? ' 自检通过：codegraph ' + (status.version ?? '') : ' 自检没有通过：' + status.detail));
      // The official installer links codegraph into ~/.local/bin, which the service adds to the PATH of builds; a
      // different location must be added to the PATH of the service.
      if (code === 0 && status.state === 'missing') run.logs.push(K + ' 安装完成但找不到 codegraph：请把它所在的目录加入启动 Talents 的环境的 PATH 后重启服务');
      run.status = code === 0 && status.state === 'installed' ? 'success' : 'failed';
      run.endedAt = Date.now();
    })();
    return run;
  }
  /** Stops an install (the service is shutting down). */
  stop() { this.kill?.(); }
}
