// Installing CodeGraph (server/codegraph-install.ts): the declared install command, then the self-check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodegraphInstaller, declaredInstall, type InstallerOptions } from '../server/codegraph-install.ts';

const fake = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-codegraph-install.mjs');
async function installer(extra: Partial<InstallerOptions> & { fail?: boolean } = {}) {
  const marker = join(await mkdtemp(join(tmpdir(), 'codegraph-install-')), 'installed');
  return new CodegraphInstaller({ python: process.execPath, script: fake, install: { command: process.execPath, args: [fake, 'install'] },
    env: { ...process.env, FAKE_MARKER: marker, FAKE_INSTALL: extra.fail ? 'fail' : '' }, ...extra });
}
async function ended(i: CodegraphInstaller) {
  for (const deadline = Date.now() + 10_000; i.installing(); await new Promise(done => setTimeout(done, 20))) if (Date.now() > deadline) throw new Error('install did not end');
  return i.state();
}

test('the install command is the one engine.yaml declares for the platform', () => {
  assert.deepEqual(declaredInstall(undefined, 'darwin'), { command: 'sh', args: ['-c', 'curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | CODEGRAPH_VERSION=v1.6.0 sh'] });
  assert.equal(declaredInstall(undefined, 'win32')!.command, 'powershell');
  assert.equal(declaredInstall(undefined, 'aix'), null);
  assert.equal(declaredInstall('id: x\n', 'darwin'), null);
});

test('a missing CodeGraph is installed, then passes its self-check', async () => {
  const i = await installer();
  const before = await i.state();
  assert.equal(before.status.state, 'missing');
  assert.match(before.status.detail!, /找不到 codegraph/);
  assert.match(before.command!, /fake-codegraph-install\.mjs install$/);
  assert.equal(i.install().status, 'running');
  assert.throws(() => i.install(), (e: any) => e.status === 409, 'one install at a time');
  const after = await ended(i);
  assert.deepEqual([after.install!.status, after.status.state, after.status.version], ['success', 'installed', '1.6.0']);
  const log = after.install!.logs.join('\n');
  assert.match(log, /运行安装命令：/);
  assert.match(log, /^✓ Installed to ~\/\.local\/bin\/codegraph$/m, 'colour codes are removed');
  assert.match(log, /自检通过：codegraph 1\.6\.0/);
});

test('a failed install leaves CodeGraph missing; an install is refused while a build runs', async () => {
  const failing = await installer({ fail: true });
  failing.install();
  const after = await ended(failing);
  assert.deepEqual([after.install!.status, after.status.state], ['failed', 'missing']);
  assert.match(after.install!.logs.join('\n'), /Could not resolve host[\s\S]*退出码 6[\s\S]*自检没有通过/);
  const busy = await installer({ blocked: () => '有正在运行的代码图谱构建' });
  assert.throws(() => busy.install(), (e: any) => e.status === 409 && /构建/.test(e.message));
  const none = await installer({ install: null });
  assert.throws(() => none.install(), (e: any) => e.status === 422);
});
