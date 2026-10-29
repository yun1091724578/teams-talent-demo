// "应用" on a code graph: gives iCode's Code Agent the codegraph MCP server. ~/.chrys/agents/Code.yaml shadows the built-in
// Code Agent; the server is added to its tools.mcp, the rest of the file is kept as it is. Without that file, the built-in
// profile is copied there first. codegraph serve --mcp answers about the repository an iCode session works in.
import { execFile } from 'node:child_process';
import { copyFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isMap, isSeq, parseDocument, type YAMLMap } from 'yaml';
import { HttpError } from './model.ts';
import { atomicText } from './store.ts';

export const MCP_NAME = 'icode-knowledge-codegraph';
const ENTRY = { name: MCP_NAME, transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'], enabled: true, expose_instructions: true, tool_name_prefix: 'cg' };
const run = promisify(execFile);

export interface AgentOptions {
  /** iCode's user agent profiles (~/.chrys/agents). */
  agentsDir?: string;
  /** Text of the built-in Code.yaml; read from the installed iCode package when omitted. */
  builtinProfile?: () => Promise<string>;
}
const agentsDirOf = (options: AgentOptions) => options.agentsDir ?? process.env.DEMO_ICODE_AGENTS_DIR ?? join(homedir(), '.chrys', 'agents');

/** Built-in profiles ship in the installed iCode package: chrys/service/profiles/agents/builtins (as iCode Knowledge finds them). */
async function builtinCodeProfile() {
  const pythons: string[] = [];
  try {
    const { stdout } = await run('uv', ['tool', 'dir'], { timeout: 15_000 });
    const python = process.platform === 'win32' ? join(stdout.trim(), 'icode-tui', 'Scripts', 'python.exe') : join(stdout.trim(), 'icode-tui', 'bin', 'python');
    if (existsSync(python)) pythons.push(python);
  } catch { /* not a uv installation */ }
  if (!pythons.length) {
    try {
      const { stdout } = await run('icode', ['self', 'python-path'], { timeout: 15_000, env: { ...process.env, PYAPP_EXPOSE_PYTHON_PATH: 'true' } });
      if (stdout.trim()) pythons.push(stdout.trim());
    } catch { /* not an offline package either */ }
  }
  for (const python of pythons) {
    try {
      const { stdout } = await run(python, ['-c', 'import chrys.service as s; print(list(s.__path__)[0])'], { timeout: 15_000 });
      return await readFile(join(stdout.trim(), 'profiles', 'agents', 'builtins', 'Code.yaml'), 'utf8');
    } catch { /* try the next interpreter */ }
  }
  throw new HttpError('找不到 iCode 安装包中的内置 Code Agent 配置，请确认已安装 iCode', 422);
}

function parse(text: string, path: string) {
  const doc = parseDocument(text);
  if (doc.errors.length || !isMap(doc.contents)) throw new HttpError(path + ' 不是有效的 Agent 配置' + (doc.errors[0] ? '：' + doc.errors[0].message : ''), 422);
  return doc;
}
/** A codegraph MCP server already in the profile: the one named for it, or any that runs codegraph serve --mcp. */
function configured(doc: ReturnType<typeof parseDocument>) {
  const mcp = doc.getIn(['tools', 'mcp']);
  if (!isSeq(mcp)) return false;
  return mcp.items.some(item => {
    if (!isMap(item)) return false;
    const entry = (item as YAMLMap).toJSON() as Record<string, unknown>;
    return entry.name === MCP_NAME || (entry.command === 'codegraph' && JSON.stringify(entry.args) === JSON.stringify(['serve', '--mcp']));
  });
}

/** Whether the Code Agent already has the codegraph MCP server. */
export async function codegraphMcpStatus(options: AgentOptions = {}) {
  const path = join(agentsDirOf(options), 'Code.yaml');
  let text: string;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { configured: false, path }; throw error; }
  return { configured: configured(parse(text, path)), path };
}

/** Adds the codegraph MCP server to the Code Agent; nothing changes when it is there. The file is backed up first. */
export async function applyCodegraphMcp(options: AgentOptions = {}) {
  const path = join(agentsDirOf(options), 'Code.yaml');
  let text: string | null = null;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const created = text === null;
  const doc = parse(text ?? await (options.builtinProfile ?? builtinCodeProfile)(), path);
  if (configured(doc)) return { configured: true, changed: false, created: false, path };
  const tools = doc.get('tools');
  if (tools !== undefined && !isMap(tools)) throw new HttpError(path + ' 中的 tools 不是映射，无法自动添加', 422);
  const mcp = doc.getIn(['tools', 'mcp']);
  if (mcp !== undefined && mcp !== null && !isSeq(mcp)) throw new HttpError(path + ' 中的 tools.mcp 不是列表，无法自动添加', 422);
  if (isSeq(mcp)) mcp.add(doc.createNode(ENTRY));
  else doc.setIn(['tools', 'mcp'], doc.createNode([ENTRY]));
  if (!created) await copyFile(path, path + '.bak');
  await atomicText(path, doc.toString());
  return { configured: true, changed: true, created, path };
}
