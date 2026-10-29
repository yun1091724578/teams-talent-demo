/** Talents reading a running Teams: long polling for changes, the PR target from a bound workspace, Teams going away. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ID } from '../server/seed.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const remote = 'https://github.com/JeffyLiu003/carddemo-java-1025.git';
async function freePort() {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((done, fail) => socket.close(error => error ? fail(error) : done()));
  return port;
}

test('Talents follows Teams: changes arrive by long polling, PRs target the bound origin, Teams going away is reported', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'talents-live-'));
  const ports = new Set<number>(); while (ports.size < 3) ports.add(await freePort());
  const [teamsPort, talentPort, tracePort] = [...ports];
  const teamsOrigin = 'http://127.0.0.1:' + teamsPort, talentOrigin = 'http://127.0.0.1:' + talentPort;
  const configuration = join(directory, 'config.json'); await writeFile(configuration, '{}');
  const env = { ...process.env, DEMO_LOCAL_CONFIG: configuration, DEMO_PORT: String(teamsPort), DEMO_TALENT_PORT: String(talentPort), DEMO_TRACE_PORT: String(tracePort),
    DEMO_STATE_DIR: join(directory, 'teams'), DEMO_TALENT_STATE_DIR: join(directory, 'talents'), DEMO_SHARED_DIR: join(directory, 'shared'), DEMO_TRACE_DATA_DIR: join(directory, 'trace'), DEMO_NATIVE_DISABLED: '1' };
  // A business repository clone outside the platform repository, as the demo binds it.
  const clone = join(directory, 'carddemo-java-1025'); await mkdir(clone);
  const git = (...args: string[]) => execFileSync('git', ['-C', clone, ...args], { stdio: 'ignore' });
  git('init', '-q', '-b', 'develop'); git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'base'); git('remote', 'add', 'origin', remote);
  const children: ChildProcess[] = []; let logs = '';
  async function start(name: 'teams' | 'talents', origin: string) {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: join(repository, name), env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); child.stdout!.on('data', value => { logs += value; }); child.stderr!.on('data', value => { logs += value; });
    for (const deadline = Date.now() + 15000; Date.now() < deadline; await new Promise(done => setTimeout(done, 50))) {
      if (child.exitCode !== null) throw new Error(name + ' exited: ' + logs);
      try { if ((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) return child; } catch { /* starting */ }
    }
    throw new Error('startup timeout: ' + logs);
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
  }
  const get = async (path: string, init?: RequestInit) => {
    const response = await fetch(talentOrigin + path, { signal: AbortSignal.timeout(30000), ...init });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const teams = await start('teams', teamsOrigin);
    await start('talents', talentOrigin);
    const boot = (await get('/api/bootstrap')).body;
    assert.equal(boot.teams.online, true);
    assert.deepEqual(boot.state.projects.map((p: any) => [p.id, p.readonly]), [['carddemo', false], ['teams', true]]);
    const repo = boot.state.sources.find((s: any) => s.id === REPO_ID);
    assert.deepEqual([repo.bound, repo.path], [false, '']);
    assert.equal((await get('/api/pull-requests/target?project=carddemo')).status, 404);
    // Nothing changes: the wait ends with { changed: false } (about 25 s), so only check that it is still waiting.
    const quiet = fetch(talentOrigin + '/api/teams?after=' + boot.teams.revision, { signal: AbortSignal.timeout(500) });
    await assert.rejects(quiet, /TimeoutError|aborted/i);
    // Binding the workspace in Teams ends a waiting request with the new data.
    const waiting = get('/api/teams?after=' + encodeURIComponent(boot.teams.revision));
    await new Promise(done => setTimeout(done, 200));
    const { token } = await (await fetch(teamsOrigin + '/api/session')).json() as { token: string };
    const saved = await fetch(teamsOrigin + '/api/project-workspaces', { method: 'POST', headers: { origin: teamsOrigin, 'x-demo-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'owner', projectId: 'carddemo', directory: clone, remoteUrl: remote, baseBranch: 'develop' }) });
    assert.equal(saved.status, 200, await saved.text());
    const update = (await waiting).body;
    assert.equal(update.changed, true);
    assert.notEqual(update.teams.revision, boot.teams.revision);
    const bound = update.data.sources.find((s: any) => s.id === REPO_ID);
    assert.deepEqual([bound.bound, bound.path, bound.origin, bound.branch], [true, await realpath(clone), remote, 'develop']);
    assert.equal(bound.commit.sha, '4e1b7c2', 'Talents metadata stays on the repository');
    assert.deepEqual((await get('/api/pull-requests/target?project=carddemo')).body, { repository: 'JeffyLiu003/carddemo-java-1025', base: 'develop' });
    // Teams stops: the page is told, and actions that need Teams fail plainly.
    await stop(teams);
    const offline = (await get('/api/teams?after=' + encodeURIComponent(update.teams.revision))).body;
    assert.deepEqual([offline.changed, offline.teams.online], [true, false]);
    assert.match(offline.teams.error, /无法读取 iCode Teams 数据/);
    assert.equal((await get('/api/pull-requests/target?project=carddemo')).status, 503);
    assert.equal((await get('/api/bootstrap')).body.teams.online, false);
  } finally {
    await Promise.all(children.map(stop)); await rm(directory, { recursive: true, force: true });
  }
});
