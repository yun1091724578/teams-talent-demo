// iCode Talents demo service: serves the static front-end at /talents, keeps Talents-owned state,
// reads Teams data from the running Teams service and publishes knowledge to the shared data directory.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { root, port, origin, teamsOrigin, runtimeDir, sharedDir, publicDir, localConfiguration } from './config.ts';
import { Store } from './store.ts';
import { HttpError } from './model.ts';
import { clientState, ownedState, readSkill, readTeamsData, teamsRevision, teamsView, type TeamsData } from './teams-data.ts';
import { KnowledgeExporter } from './export.ts';
import { readContent } from './content.ts';
import { codegraphArtifacts, codegraphSnapshot, codegraphUpdate, codegraphView, setLiveCodegraph, withCodegraph, withoutCodegraph } from './codegraph.ts';
import { CodegraphRunner } from './codegraph-runs.ts';
import { CodegraphInstaller } from './codegraph-install.ts';
import { applyCodegraphMcp, codegraphMcpStatus } from './icode-agent.ts';
import { graphPage, nodeDetail, searchGraph } from './codegraph-query.ts';
import type { StoredGraphSnapshot } from '../../shared/codegraph.ts';
import { defaultTarget, submitPullRequest } from './pull-requests.ts';

const store = new Store(); await store.init();
const submissions = new Set<string>();
const exporter = new KnowledgeExporter(sharedDir);
const exportKnowledge = () => exporter.export(store.state).catch(error => console.error('Talents 知识导出失败：' + error.message));
// CodeGraph builds run in the repositories bound in Teams; a build publishes the next version of the repository's code graph.
// Installing CodeGraph and building with it exclude each other.
const installer: CodegraphInstaller = new CodegraphInstaller({ blocked: (): string | null => codegraph.running() ? '有正在运行的代码图谱构建，请等它结束后再安装' : null });
const codegraph: CodegraphRunner = await new CodegraphRunner({ directory: join(runtimeDir, 'codegraph'), onChange: () => void exportKnowledge(),
  blocked: (): string | null => installer.installing() ? '正在安装 CodeGraph，请等安装结束后再构建' : null,
  nextVersion: (projectId, sourceId) => (codegraphArtifacts(store.state).find(a => a.cap === 'codegraph' && a.projectId === projectId && a.sources[0] === sourceId)?.published?.version ?? 0) + 1 }).init();
setLiveCodegraph(codegraph);
await exporter.export(store.state, true);

/** Whether Teams was read, its revision, and why not when it was not (src/types.ts TeamsInfo). */
const teamsInfo = (teams: TeamsData) => ({ origin: teamsOrigin, online: teams.online, revision: teams.revision, error: teams.online ? undefined : teams.error });
async function bootstrap() {
  const teams = await readTeamsData();
  return { revision: store.state.revision, state: clientState(withCodegraph(store.state), teams.snapshot), teams: teamsInfo(teams) };
}
/** The directory a repository is bound to in Teams; while Teams cannot be read, the one it was last built in. */
async function repositoryPath(projectId: string, sourceId: string) {
  const teams = await readTeamsData();
  const bound = teams.snapshot.projects.find(p => p.id === projectId)?.repositories.find(r => r.id === sourceId)?.path;
  return bound ?? (teams.online ? null : codegraph.build(projectId, sourceId)?.repository ?? null);
}
/** Teams data an action needs; fails while Teams cannot be read. */
async function onlineTeams() {
  const teams = await readTeamsData();
  if (!teams.online) throw new HttpError(teams.error, 503);
  return teams.snapshot;
}
/** The Teams part of the page state. With ?after=<revision> it first waits until Teams' data changes (long polling,
 *  about 25 s at most) and answers { changed: false } if it has not. */
async function teamsUpdate(after: string | null, response: ServerResponse) {
  if (after !== null) {
    // The response closes early when the page goes away; the wait on Teams then stops too.
    const closed = new AbortController(); response.once('close', () => closed.abort());
    const revision = await teamsRevision(after, closed.signal);
    if (revision === after) return { changed: false, teams: { origin: teamsOrigin, online: true, revision } };
  }
  const teams = await readTeamsData();
  return { changed: true, teams: teamsInfo(teams), data: teamsView(teams.snapshot, store.state.sourceMeta) };
}

async function bodyJson(request: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new HttpError('请求过大', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()) as Record<string, any>; } catch { throw new HttpError('JSON 请求无效', 400); }
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function staticFile(path: string, response: ServerResponse) {
  const relative = normalize(decodeURIComponent(path.slice('/talents/'.length)) || 'index.html');
  if (relative.startsWith('..') || relative.includes('\0')) return false;
  const file = join(publicDir, relative);
  if (!file.startsWith(publicDir + sep)) return false;
  let content: Buffer;
  try { content = await readFile(file); }
  catch (error) { if (['ENOENT', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false; throw error; }
  response.writeHead(200, { 'Content-Type': (TYPES[extname(file)] ?? 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-cache' });
  response.end(content); return true;
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const json = (code: number, value: unknown) => {
    response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value));
  };
  try {
    if (request.headers.host !== '127.0.0.1:' + port) { json(403, { error: '请使用本机 127.0.0.1 地址' }); return; }
    const url = new URL(request.url ?? '/', origin), path = url.pathname, method = request.method ?? 'GET';
    if (path.startsWith('/api/')) {
      if (method !== 'GET') {
        if (request.headers.origin && request.headers.origin !== origin) { json(403, { error: '请求来源不匹配' }); return; }
        if (!request.headers['content-type']?.startsWith('application/json')) { json(415, { error: '请使用 JSON 请求' }); return; }
      }
      if (method === 'GET' && path === '/api/health') { json(200, { app: 'talents-carddemo', service: 'talents', workspaceRoot: root, stateRoot: runtimeDir, sharedDir, version: '0.1.0', pid: process.pid, origin, teamsOrigin }); return; }
      if (method === 'GET' && path === '/api/bootstrap') { json(200, await bootstrap()); return; }
      if (method === 'GET' && path === '/api/teams') { json(200, await teamsUpdate(url.searchParams.get('after'), response)); return; }
      // Content files too large to bundle into the page, e.g. a trajectory diagnosis report (see tools/bundle-content.mjs).
      if (method === 'GET' && path === '/api/content') {
        const key = url.searchParams.get('key') ?? '', text = readContent(key);
        if (text == null) throw new HttpError('内容不存在', 404);
        response.writeHead(200, { 'Content-Type': (TYPES[extname(key)] ?? 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-cache' }); response.end(text); return;
      }
      if (method === 'GET' && path === '/api/skill') { json(200, await readSkill(await onlineTeams(), url.searchParams.get('project') ?? '', url.searchParams.get('id') ?? '')); return; }
      // CodeGraph runs: each run's task patch and the code graph artifacts; POST starts a build in the repository bound in Teams.
      if (method === 'GET' && path === '/api/codegraph-runs') { json(200, codegraphUpdate(store.state)); return; }
      if (method === 'POST' && path === '/api/codegraph-runs') {
        const body = await bodyJson(request);
        if (![body.taskId, body.projectId, body.sourceId].every(v => typeof v === 'string' && v)) throw new HttpError('缺少任务、项目或代码仓', 400);
        const project = (await onlineTeams()).projects.find(p => p.id === body.projectId);
        const repo = project?.repositories.find(r => r.id === body.sourceId);
        if (!project || !repo) throw new HttpError('iCode Teams 中没有这个代码仓', 404);
        if (!repo.path) throw new HttpError('代码仓 ' + repo.name + ' 未在 iCode Teams 绑定本机目录', 400);
        codegraph.start({ taskId: body.taskId, projectId: project.id, sourceId: repo.id, repository: repo.path, repoName: repo.name });
        json(200, codegraphUpdate(store.state)); return;
      }
      // CodeGraph on this machine: whether its self-check passes (?check=1 checks again), and installing it.
      if (method === 'GET' && path === '/api/engines/codegraph') { json(200, await installer.state(url.searchParams.get('check') === '1')); return; }
      if (method === 'POST' && path === '/api/engines/codegraph/install') { await bodyJson(request); installer.install(); json(200, await installer.state()); return; }
      // "应用": whether iCode's Code Agent has the codegraph MCP server, and adding it.
      if (method === 'GET' && path === '/api/codegraph-mcp') { json(200, await codegraphMcpStatus()); return; }
      if (method === 'POST' && path === '/api/codegraph-mcp') { await bodyJson(request); json(200, await applyCodegraphMcp()); return; }
      // A code graph: the repository's index as it is now (generated again when it changed).
      // The page asks for one view at a time. Opening (no snapshot) reads the index again when it changed; later requests
      // name the snapshot they belong to and get 409 once the graph has been generated again.
      const graphPath = /^\/api\/codegraph\/([^/]+)(?:\/(source|search|node))?$/.exec(path);
      if (method === 'GET' && graphPath) {
        const projectId = decodeURIComponent(graphPath[1]), sourceId = url.searchParams.get('source'), snapshot = url.searchParams.get('snapshot');
        let graph: StoredGraphSnapshot, notice: string | undefined;
        if (snapshot === null && !graphPath[2]) {
          const view = await codegraphView(projectId, sourceId, sourceId && await repositoryPath(projectId, sourceId));
          if (!view) throw new HttpError('还没有代码图谱：在“知识任务”中新建 CodeGraph 任务构建', 404);
          ({ graph, notice } = view);
        } else {
          const current = codegraphSnapshot(projectId, sourceId);
          if (!current) throw new HttpError('还没有代码图谱', 404);
          if (snapshot !== current.metadata.snapshotId) throw new HttpError('图谱已更新，请刷新后重试', 409);
          graph = current;
        }
        const param = (name: string) => url.searchParams.get(name) ?? undefined;
        if (!graphPath[2]) {
          const level = param('level'), tests = param('tests');
          json(200, { metadata: graph.metadata, notice, ...graphPage(graph, { level: level === 'dir' || level === 'file' || level === 'symbol' ? level : undefined,
            scope: param('scope'), tests: tests === undefined ? undefined : tests === '1', kinds: param('kinds')?.split(',').filter(Boolean),
            relation: param('relation'), focus: param('focus'), hops: Number(param('hops') ?? 1) }) }); return;
        }
        if (graphPath[2] === 'search') { json(200, searchGraph(graph, param('q') ?? '', param('tests') === '1')); return; }
        if (graphPath[2] === 'node') {
          const detail = nodeDetail(graph, param('id') ?? '');
          if (!detail) throw new HttpError('符号不存在', 404);
          json(200, detail); return;
        }
        const node = nodeDetail(graph, param('id') ?? '', 0)?.node;
        if (!node) throw new HttpError('符号不存在', 404);
        const source = graph.sources[node.filePath];
        if (source === undefined) throw new HttpError('快照中没有此源码', 404);
        const start = Math.max(1, node.startLine - 3), end = Math.min(source.split('\n').length, node.endLine + 3, start + 299);
        json(200, { filePath: node.filePath, startLine: start, endLine: end, content: source.split('\n').slice(start - 1, end).join('\n') }); return;
      }
      if (method === 'PUT' && path === '/api/state') {
        const body = await bodyJson(request);
        if (!Number.isInteger(body.revision)) throw new HttpError('缺少 revision', 400);
        const state = await store.mutate(body.revision, previous => withoutCodegraph(ownedState(body.state, previous), previous));
        await exportKnowledge();
        json(200, { revision: state.revision }); return;
      }
      if (method === 'POST' && path === '/api/reset') {
        await codegraph.clear();
        await store.reset();
        await exportKnowledge();
        json(200, await bootstrap()); return;
      }
      if (method === 'GET' && path === '/api/pull-requests/target') { json(200, defaultTarget(await onlineTeams(), url.searchParams.get('project'))); return; }
      if (method === 'POST' && path === '/api/pull-requests') {
        const body = await bodyJson(request);
        const key = body.artifactId + '/' + (body.suggestionId ?? '');
        if (submissions.has(key)) throw new HttpError('正在提交，请稍候', 409);
        const artifact = store.state.artifacts.find(a => a.id === body.artifactId);
        if (!artifact) throw new HttpError('产物不存在', 404);
        const existing = body.suggestionId ? artifact.suggestions?.find(s => s.id === body.suggestionId)?.submission : !artifact.draft && artifact.submission;
        if (existing) { json(200, await bootstrap()); return; }
        // One JSON line per step as it starts ({ step }), then { boot } or { error }, so the page can show progress.
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
        const send = (value: unknown) => response.write(JSON.stringify(value) + '\n');
        submissions.add(key);
        try {
          const submitted = await submitPullRequest(structuredClone(artifact), { repository: body.repository, base: body.base, note: body.note, skillDirectory: body.skillDirectory }, body.suggestionId, undefined, step => send({ step }));
          await store.mutate(null, previous => {
            const next = structuredClone(previous), a = next.artifacts.find(a => a.id === body.artifactId)!;
            if (body.suggestionId) {
              a.suggestions = [...(a.suggestions ?? []).filter(s => s.id !== body.suggestionId), { id: body.suggestionId, status: 'submitted', submission: submitted, at: submitted.at }];
            } else {
              a.submission = submitted;
              a.published = { version: submitted.version, at: submitted.at, note: body.note, delivery: 'local', files: a.files, specs: a.specs,
                over: Object.fromEntries((a.files ?? []).map((key, i) => [key, { text: submitted.files[i].text }])), basis: a.draft?.basis as any };
              a.draft = null;
            }
            return next;
          });
          send({ boot: await bootstrap() });
        } catch (error) {
          if (!(error instanceof HttpError)) console.error(error);
          send({ error: error instanceof Error ? error.message : '提交失败' });
        } finally { submissions.delete(key); response.end(); }
        return;
      }
      throw new HttpError('接口不存在', 404);
    }
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError('不支持的请求', 405);
    // Relative asset URLs in index.html need the trailing slash; the hash (#/page?project=…) survives the redirect.
    if (path === '/' || path === '/talent' || path === '/talents') { response.writeHead(302, { Location: '/talents/' + url.search }); response.end(); return; }
    if (path.startsWith('/talents/') && await staticFile(path, response)) return;
    json(404, { error: '页面不存在' });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    json(status, { error: error instanceof Error ? error.message : '请求失败' });
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  if (localConfiguration.loaded) console.log('本机配置：' + localConfiguration.file);
  console.log('Talents: ' + origin + '/talents');
  console.log('共享数据目录：' + sharedDir);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { codegraph.stop(); installer.stop(); server.close(() => process.exit(0)); });
