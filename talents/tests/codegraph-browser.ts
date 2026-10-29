// The code graph page on a small made-up repository (tests/fixtures/codegraph-repo.ts) bound in (fake) Teams, whose code
// graph artifact an earlier build left: the service reads the repository's index when the graph is opened.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fakeTeams } from './fixtures/fake-teams.ts';
import { codegraphRepository } from './fixtures/codegraph-repo.ts';
import { PROJECT_ID, REPO_ID, seedState } from '../server/seed.ts';

const port = 45988, origin = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), 'codegraph-browser-'));
const teams = await fakeTeams(45979, { path: await codegraphRepository(join(directory, 'shop')) });
const state = seedState();
state.artifacts.unshift({ id: 'a-cg-shop', projectId: PROJECT_ID, cap: 'codegraph', name: 'shop 代码图谱', desc: '查询 shop 中的代码定义与调用关系。', sources: [REPO_ID], kind: 'index',
  stats: [], mcpName: 'codegraph', published: { version: 1, at: '2026-10-26 02:05', note: '首次发布', delivery: 'cloud', agents: ['Code'], basis: null, auto: true }, draft: null });
await mkdir(join(directory, 'state'));
await writeFile(join(directory, 'state', 'state.json'), JSON.stringify(state));
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, DEMO_TALENT_PORT: String(port), DEMO_PORT: '45979', DEMO_TALENT_STATE_DIR: join(directory, 'state'), DEMO_SHARED_DIR: join(directory, 'shared') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
const stopped = new Promise(resolve => server.once('close', resolve));
server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
let browser;
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw new Error('Service exited: ' + logs);
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch { /* Server is starting. */ }
    if (i === 60) throw new Error('Service did not start: ' + logs);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  // The service sends one view at a time: a small repository opens on its symbols, without tests.
  const api = (part: string, query: string) => fetch(origin + '/api/codegraph/carddemo' + part + '?source=' + encodeURIComponent(REPO_ID) + '&' + query);
  const graph = await (await api('', '')).json();
  assert.deepEqual([graph.options.level, graph.options.tests], ['symbol', false]);
  assert.ok(graph.nodes.length > 0 && graph.nodes.length <= 2000 && !('sources' in graph) && !('edges' in graph));
  const dirs = await (await api('', 'level=dir&snapshot=' + graph.metadata.snapshotId)).json();
  assert.ok(dirs.nodes.length <= 30 && dirs.nodes.every((n: { kind: string }) => ['dir', 'file'].includes(n.kind)));
  assert.equal((await api('', 'level=dir&snapshot=stale')).status, 409);
  const hits = await (await api('/search', 'q=place&snapshot=' + graph.metadata.snapshotId)).json();
  assert.ok(hits.length && hits.every((h: { name: string }) => h.name.toLowerCase().includes('place')));
  assert.equal((await api('/source', 'snapshot=stale&id=' + graph.nodes[0].id)).status, 409);
  assert.equal((await api('/source', 'snapshot=' + graph.metadata.snapshotId + '&id=../../etc/passwd')).status, 404);
  assert.equal((await fetch(origin + '/api/codegraph/teams')).status, 404, 'a project without a built repository has no graph');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/talents/#/projects?project=carddemo&tab=review&id=a-cg-shop');
  await page.locator('.cg-canvas canvas').waitFor();
  await page.getByRole('searchbox', { name: '搜索图谱' }).fill('OrderService');
  await page.locator('.cg-results button').first().click();
  await page.locator('.cg-source').waitFor();
  assert.match(await page.locator('.cg-source').innerText(), /class OrderService/);
  await page.locator('.cg-detail h3', { hasText: /^OrderService$/ }).waitFor();
  // Choosing a search result shows its neighbourhood.
  await page.locator('.cg-scope', { hasText: '邻域：' }).waitFor();
  await page.getByRole('searchbox', { name: '搜索图谱' }).fill('place');
  await page.locator('.cg-results button', { hasText: 'place' }).first().click();
  await page.locator('.cg-detail h3', { hasText: /^place$/ }).waitFor();
  await page.locator('.cg-connections button').first().waitFor();
  await page.getByRole('button', { name: '取消聚焦' }).click();
  await page.locator('.cg-scope', { hasText: '全部' }).waitFor();
  await page.screenshot({ path: '/tmp/codegraph-desktop.png', fullPage: true });
  assert.equal(await page.getByText('服务概览', { exact: true }).count(), 0, 'graphs have no services');
  await page.getByText('文件关系', { exact: true }).click();
  await page.locator('.cg-legend', { hasText: 'java' }).waitFor();
  // Directories open level by level, down to a file's symbols (this repository is small enough to show its files at once).
  await page.getByText('目录结构', { exact: true }).click();
  await page.locator('.cg-legend', { hasText: '文件' }).waitFor();
  await page.getByRole('searchbox', { name: '搜索图谱' }).fill('OrderController.java');
  await page.locator('.cg-results button').first().click();
  await page.locator('.cg-detail h3', { hasText: /OrderController\.java$/ }).waitFor();
  await page.getByRole('button', { name: '查看文件内符号' }).click();
  await page.locator('.cg-scope', { hasText: 'OrderController.java' }).waitFor();
  await page.locator('.cg-legend', { hasText: 'method' }).waitFor();
  await page.getByRole('checkbox', { name: '包含测试', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/codegraph-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page overflows horizontally');
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.deepEqual(errors, []);
  console.log('CodeGraph API, graph navigation, source preview, mobile layout passed');
} finally {
  await browser?.close(); server.kill('SIGTERM'); teams.close();
  await stopped;
  await rm(directory, { recursive: true, force: true });
}
