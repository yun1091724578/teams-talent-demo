import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type ICodeBinarySource = 'override' | 'official' | 'uv' | 'pipx' | 'path' | 'bundled' | 'missing';

export interface ICodeBinaryCandidate {
  path: string;
  source: ICodeBinarySource;
}

export interface ICodeBinaryResolution {
  path: string;
  source: ICodeBinarySource;
  notes: string[];
  candidates: ICodeBinaryCandidate[];
}

/** A candidate is usable only after it answers `--version`; locating a file is not locating an installation. */
export interface ICodeBinarySelection {
  path?: string;
  source: ICodeBinarySource;
  version?: string;
  status: 'ready' | 'none' | 'override-missing' | 'probe-failed';
  reason?: string;
  notes: string[];
}

export interface PlatformPathOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export interface SelectICodeOptions extends PlatformPathOptions {
  materialRoot?: string;
  probe?: (entry: string) => Promise<string>;
  /** Bypass the process-level verification cache (tests or an explicit re-probe). */
  fresh?: boolean;
}

const launcherNames = ['icode', 'chrys'];

const launcherFiles = (platform: NodeJS.Platform) => platform === 'win32' ? ['icode.exe', 'chrys.exe'] : launcherNames;

const pathSeparator = (platform: NodeJS.Platform) => platform === 'win32' ? ';' : ':';

function normalizePath(path: string, platform: NodeJS.Platform) {
  const unified = platform === 'win32' ? path.replaceAll('/', '\\') : path;
  return platform === 'win32' ? unified.toLowerCase() : unified;
}

function realpathOr(path: string) {
  try { return realpathSync(path); } catch { return path; }
}

/** Official launchers, in the same order as iCode-teams: `icode` first, `chrys` as compatibility name. */
export function officialICodePaths(options: PlatformPathOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local');
    return [join(local, 'chrys', 'bin', 'icode.exe'), join(local, 'chrys', 'bin', 'chrys.exe')];
  }
  return [join(home, '.local', 'bin', 'icode'), join(home, '.local', 'bin', 'chrys')];
}

/** Native user configuration root: Windows `%APPDATA%\chrys`, other platforms `~/.chrys`. */
export function nativeConfigRoot(options: PlatformPathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  if (platform === 'win32') return join(env.APPDATA?.trim() || join(home, 'AppData', 'Roaming'), 'chrys');
  return join(home, '.chrys');
}

export function nativeSessionsRoot(options: PlatformPathOptions = {}): string {
  return join(nativeConfigRoot(options), 'sessions');
}

function inspect(path: string) {
  try {
    const info = statSync(path);
    return { exists: true, file: info.isFile(), uid: info.uid };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { exists: false, file: false, uid: undefined };
    throw error;
  }
}

function usable(path: string, platform: NodeJS.Platform, notes: string[]) {
  let info: ReturnType<typeof inspect>;
  try { info = inspect(path); }
  catch (error) {
    notes.push(`无法检查候选路径 ${path}：${(error as Error).message}`);
    return false;
  }
  if (!info.exists) return false;
  if (!info.file) {
    notes.push(`候选路径不是文件：${path}`);
    return false;
  }
  const uid = platform === 'win32' ? undefined : process.getuid?.();
  if (uid !== undefined && info.uid !== undefined && info.uid !== uid) {
    notes.push(`候选文件属于另一个系统用户：${path}`);
    return false;
  }
  return true;
}

/** Every launcher a package manager recorded for this installation, wherever it was installed. */
interface PackageEntrypoint {
  install: string;
  toolDir: string;
}

function uvToolRoots(options: PlatformPathOptions): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const roots: string[] = [];
  const explicit = env.UV_TOOL_DIR?.trim();
  if (explicit && isAbsolute(explicit)) roots.push(explicit);
  roots.push(platform === 'win32'
    ? join(env.APPDATA?.trim() || join(home, 'AppData', 'Roaming'), 'uv', 'tools')
    : join(env.XDG_DATA_HOME?.trim() || join(home, '.local', 'share'), 'uv', 'tools'));
  return [...new Set(roots)];
}

/** uv writes the resolved entry point into each tool's receipt, including shims it placed outside the tool venv. */
function uvEntrypoints(options: PlatformPathOptions, notes: string[] = []): PackageEntrypoint[] {
  const result: PackageEntrypoint[] = [];
  for (const root of uvToolRoots(options)) {
    let tools: string[];
    try { tools = readdirSync(root); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') notes.push(`无法读取 uv tool 目录 ${root}：${(error as Error).message}`);
      continue;
    }
    for (const tool of tools.sort()) {
      const toolDir = join(root, tool);
      let text: string;
      try { text = readFileSync(join(toolDir, 'uv-receipt.toml'), 'utf8'); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') notes.push(`无法读取 uv 安装回执 ${join(toolDir, 'uv-receipt.toml')}：${(error as Error).message}`);
        continue;
      }
      for (const object of text.matchAll(/\{[^}]*\}/g)) {
        const name = object[0].match(/\bname\s*=\s*"([^"]+)"/)?.[1];
        const install = object[0].match(/\binstall-path\s*=\s*"([^"]+)"/)?.[1];
        if (!name || !install || !launcherNames.includes(name) || !isAbsolute(install)) continue;
        result.push({ install, toolDir });
      }
    }
  }
  return result;
}

function pipxVenvs(options: PlatformPathOptions, notes: string[] = []): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const configured = env.PIPX_HOME?.trim();
  const root = configured && isAbsolute(configured) ? configured : platform === 'win32' ? join(home, 'pipx') : join(home, '.local', 'pipx');
  const venvs = join(root, 'venvs');
  try { return readdirSync(venvs).sort().map(name => join(venvs, name)); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') notes.push(`无法读取 pipx 虚拟环境目录 ${venvs}：${(error as Error).message}`);
    return [];
  }
}

function pipxLaunchers(options: PlatformPathOptions, notes: string[] = []): string[] {
  const platform = options.platform ?? process.platform;
  const directory = platform === 'win32' ? 'Scripts' : 'bin';
  return pipxVenvs(options, notes).flatMap(venv => launcherFiles(platform).map(name => join(venv, directory, name)));
}

function pathLaunchers(options: PlatformPathOptions): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const raw = env.PATH ?? env.Path ?? '';
  return raw.split(pathSeparator(platform))
    .map(entry => entry.trim().replace(/^"|"$/g, ''))
    .filter(entry => entry && isAbsolute(entry))
    .flatMap(dir => launcherFiles(platform).map(name => join(dir, name)));
}

/**
 * Interpreters that belong to the same installation as `entry`, most specific first.
 * A launcher inside a virtual environment (pipx, a plain checkout) sits next to its own Python;
 * a uv shim outside the venv is paired with the tool directory its receipt names.
 */
export function nativeInterpreters(entry: string, options: PlatformPathOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const result: string[] = [];
  const push = (path?: string) => { if (path && isAbsolute(path) && !result.includes(path) && inspect(path).file) result.push(path); };
  const same = (left: string, right: string) => normalizePath(realpathOr(left), platform) === normalizePath(realpathOr(right), platform);
  const directory = dirname(entry);
  if (platform === 'win32') push(join(directory, 'python.exe'));
  else { push(join(directory, 'python3')); push(join(directory, 'python')); }
  for (const { install, toolDir } of uvEntrypoints({ platform, env, home })) {
    if (!same(install, entry)) continue;
    if (platform === 'win32') push(join(toolDir, 'Scripts', 'python.exe'));
    else { push(join(toolDir, 'bin', 'python3')); push(join(toolDir, 'bin', 'python')); }
  }
  for (const venv of pipxVenvs({ platform, env, home })) {
    const launcher = join(venv, platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'icode.exe' : 'icode');
    if (!same(launcher, entry)) continue;
    if (platform === 'win32') push(join(venv, 'Scripts', 'python.exe'));
    else { push(join(venv, 'bin', 'python3')); push(join(venv, 'bin', 'python')); }
  }
  return result;
}

/**
 * Rank every launcher this machine actually has, without assuming an install location.
 * Explicit configuration still wins and never falls through; otherwise official installers,
 * package-manager receipts, PATH (the same contract every shell uses) and finally the
 * repository bundle are considered. Only files that exist are returned; `selectICodeBinary`
 * decides which of them really is an iCode.
 */
function collectCandidates(options: PlatformPathOptions & { materialRoot?: string }) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const notes: string[] = [];
  const candidates: ICodeBinaryCandidate[] = [];
  const seen = new Set<string>();
  const add = (path: string, source: ICodeBinarySource) => {
    const key = normalizePath(path, platform);
    if (seen.has(key)) return false;
    if (!usable(path, platform, notes)) return false;
    seen.add(key);
    candidates.push({ path, source });
    return true;
  };

  const override = env.DEMO_ICODE_BINARY?.trim();
  if (override) {
    if (!isAbsolute(override)) notes.push('DEMO_ICODE_BINARY 不是绝对路径，已按当前工作目录解析');
    const path = resolve(override);
    if (usable(path, platform, notes)) candidates.push({ path, source: 'override' });
    else notes.push(`显式配置的 iCode 不存在或不可用：${path}`);
    return { candidates, notes, override: { path } };
  }

  const official = officialICodePaths({ platform, env, home });
  for (const candidate of official) add(candidate, 'official');
  if (!candidates.length) notes.push(`官方安装位置未找到可用的 iCode：${official.join(' 与 ')}`);
  for (const entry of uvEntrypoints({ platform, env, home }, notes)) {
    if (!add(entry.install, 'uv')) {
      let present = false;
      try { present = inspect(entry.install).exists; } catch { present = false; }
      if (!present) notes.push(`uv 安装回执指向的 iCode 不存在：${entry.install}`);
    }
  }
  for (const candidate of pipxLaunchers({ platform, env, home }, notes)) add(candidate, 'pipx');
  for (const candidate of pathLaunchers({ platform, env, home })) add(candidate, 'path');
  if (options.materialRoot) {
    const bundled = join(options.materialRoot, 'runtime', 'icode-0.31.0', platform === 'win32' ? 'icode.exe' : 'icode');
    if (usable(bundled, platform, notes)) {
      notes.push('使用仓库内开发包路径；该路径不是普通用户的安装位置');
      add(bundled, 'bundled');
    }
  }
  return { candidates, notes, override: undefined };
}

/** The synchronous view: the best existing candidate plus why the other sources were skipped. */
export function resolveICodeBinary(options: PlatformPathOptions & { materialRoot?: string } = {}): ICodeBinaryResolution {
  const collected = collectCandidates(options);
  if (collected.override) {
    return { path: collected.candidates[0]?.path ?? collected.override.path, source: 'override', notes: collected.notes, candidates: collected.candidates };
  }
  const first = collected.candidates[0];
  if (first) return { path: first.path, source: first.source, notes: collected.notes, candidates: collected.candidates };
  return { path: officialICodePaths(options)[0]!, source: 'missing', notes: collected.notes, candidates: [] };
}

const probeTimeoutMs = 5_000;

async function defaultProbe(entry: string) {
  const result = await exec(entry, ['--version'], { timeout: probeTimeoutMs, maxBuffer: 65536, windowsHide: true, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } });
  return result.stdout;
}

function fileIdentity(path: string | undefined) {
  if (!path) return undefined;
  try {
    const info = statSync(path);
    return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    throw error;
  }
}

let cachedSelection: { key: string; identity: string; value: ICodeBinarySelection } | undefined;

/**
 * Ask the candidates in order and use the first one that reports a version. A launcher that is
 * present but broken (a stale shim, a half-removed install) must not mask a working one;
 * an explicit override is still a lock, so a broken override is reported instead of replaced.
 */
export async function selectICodeBinary(options: SelectICodeOptions = {}): Promise<ICodeBinarySelection> {
  const collected = collectCandidates(options);
  const probe = options.probe ?? defaultProbe;
  const key = collected.candidates.map(candidate => `${candidate.source}:${candidate.path}`).join('\0');
  if (!options.probe && !options.fresh && cachedSelection?.key === key) {
    const identity = fileIdentity(cachedSelection.value.path);
    if (identity !== undefined && identity === cachedSelection.identity) return structuredClone(cachedSelection.value);
  }

  if (collected.override && !collected.candidates.length) {
    return { path: collected.override.path, source: 'override', status: 'override-missing', reason: `显式配置的 iCode 不存在或不是文件：${collected.override.path}`, notes: collected.notes };
  }
  if (!collected.candidates.length) {
    return { source: 'missing', status: 'none', reason: `未找到可用的 iCode：${officialICodePaths(options)[0]}`, notes: collected.notes };
  }

  const failures: string[] = [];
  for (const candidate of collected.candidates) {
    try {
      const raw = (await probe(candidate.path)).trim();
      const version = raw.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
      if (!version) throw new Error(raw ? `版本输出无法识别：${raw.slice(0, 80)}` : '版本输出为空');
      const value: ICodeBinarySelection = { path: candidate.path, source: candidate.source, version, status: 'ready', notes: [...collected.notes, ...failures] };
      if (!options.probe) {
        const identity = fileIdentity(candidate.path);
        if (identity !== undefined) cachedSelection = { key, identity, value: structuredClone(value) };
      }
      return value;
    } catch (error) {
      failures.push(`候选 iCode 版本探测失败：${candidate.path}：${(error as Error).message}`);
    }
  }
  const first = collected.candidates[0]!;
  return { path: first.path, source: first.source, status: 'probe-failed', reason: failures.at(-1)!, notes: [...collected.notes, ...failures] };
}
