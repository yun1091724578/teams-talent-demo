import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeConfigRoot, nativeInterpreters, nativeSessionsRoot, officialICodePaths, resolveICodeBinary, selectICodeBinary } from '../server/icode-binary.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'icode-binary-'));
  return { root, done: () => rm(root, { recursive: true, force: true }) };
}
async function file(path: string) { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, ''); }

test('explicit DEMO_ICODE_BINARY wins and a missing override does not fall through', async () => {
  const { root, done } = await fixture();
  try {
    const explicit = join(root, 'tools', 'icode.exe');
    await file(explicit);
    const resolved = resolveICodeBinary({ platform: 'win32', env: { DEMO_ICODE_BINARY: explicit, LOCALAPPDATA: join(root, 'local') }, home: root, materialRoot: root });
    assert.equal(resolved.path, explicit);
    assert.equal(resolved.source, 'override');

    const missing = join(root, 'tools', 'missing.exe');
    const failed = resolveICodeBinary({ platform: 'win32', env: { DEMO_ICODE_BINARY: missing, LOCALAPPDATA: join(root, 'local') }, home: root, materialRoot: root });
    assert.equal(failed.path, missing);
    assert.equal(failed.source, 'override');
    assert.ok(failed.notes.some(note => note.includes('不存在或不可用')));
  } finally { await done(); }
});

test('official Windows launcher is found without configuration and chrys.exe remains compatible', async () => {
  const { root, done } = await fixture();
  try {
    const local = join(root, 'local');
    const icode = join(local, 'chrys', 'bin', 'icode.exe');
    await file(icode);
    const resolved = resolveICodeBinary({ platform: 'win32', env: { LOCALAPPDATA: local }, home: root, materialRoot: root });
    assert.equal(resolved.path, icode);
    assert.equal(resolved.source, 'official');
    assert.deepEqual(officialICodePaths({ platform: 'win32', env: { LOCALAPPDATA: local }, home: root }), [icode, join(local, 'chrys', 'bin', 'chrys.exe')]);

    const chrysOnly = join(root, 'other', 'chrys', 'bin', 'chrys.exe');
    await file(chrysOnly);
    const compat = resolveICodeBinary({ platform: 'win32', env: { LOCALAPPDATA: join(root, 'other') }, home: root, materialRoot: root });
    assert.equal(compat.path, chrysOnly);
    assert.equal(compat.source, 'official');
  } finally { await done(); }
});

test('official macOS/Linux launcher and the repository bundle are ordered after it', async () => {
  const { root, done } = await fixture();
  try {
    const official = join(root, '.local', 'bin', 'icode');
    await file(official);
    const resolved = resolveICodeBinary({ platform: 'linux', env: {}, home: root, materialRoot: root });
    assert.equal(resolved.path, official);
    assert.equal(resolved.source, 'official');

    const { root: empty, done: doneEmpty } = await fixture();
    try {
      const bundled = join(empty, 'runtime', 'icode-0.31.0', 'icode');
      await file(bundled);
      const fallback = resolveICodeBinary({ platform: 'linux', env: {}, home: empty, materialRoot: empty });
      assert.equal(fallback.path, bundled);
      assert.equal(fallback.source, 'bundled');
      assert.ok(fallback.notes.some(note => note.includes('开发包')));
    } finally { await doneEmpty(); }
  } finally { await done(); }
});

test('missing launcher is reported with the official candidates instead of throwing', async () => {
  const { root, done } = await fixture();
  try {
    const resolved = resolveICodeBinary({ platform: 'win32', env: { LOCALAPPDATA: join(root, 'local') }, home: root, materialRoot: root });
    assert.equal(resolved.source, 'missing');
    assert.equal(resolved.path, join(root, 'local', 'chrys', 'bin', 'icode.exe'));
    assert.ok(resolved.notes.some(note => note.includes('官方安装位置')));
  } finally { await done(); }
});

test('native configuration and session roots follow the platform contract', async () => {
  const { root, done } = await fixture();
  try {
    const windows = { platform: 'win32' as const, env: { APPDATA: join(root, 'roaming') }, home: root };
    assert.equal(nativeConfigRoot(windows), join(root, 'roaming', 'chrys'));
    assert.equal(nativeSessionsRoot(windows), join(root, 'roaming', 'chrys', 'sessions'));
    const posix = { platform: 'linux' as const, env: {}, home: root };
    assert.equal(nativeConfigRoot(posix), join(root, '.chrys'));
    assert.equal(nativeSessionsRoot(posix), join(root, '.chrys', 'sessions'));
  } finally { await done(); }
});

const windowsEnv = (root: string, extra: NodeJS.ProcessEnv = {}) => ({ LOCALAPPDATA: join(root, 'local'), APPDATA: join(root, 'roaming'), ...extra });

test('a launcher outside the official location is found through PATH', async () => {
  const { root, done } = await fixture();
  try {
    const tools = join(root, 'shims'), entry = join(tools, 'icode.exe');
    await file(entry);
    const resolved = resolveICodeBinary({ platform: 'win32', env: windowsEnv(root, { PATH: [join(root, 'empty'), tools].join(';') }), home: root, materialRoot: root });
    assert.equal(resolved.path, entry);
    assert.equal(resolved.source, 'path');
    assert.ok(resolved.notes.some(note => note.includes('官方安装位置')));
  } finally { await done(); }
});

test('a uv tool receipt contributes the launcher it actually installed, and stale receipts are reported', async () => {
  const { root, done } = await fixture();
  try {
    const roaming = join(root, 'roaming'), tool = join(roaming, 'uv', 'tools', 'icode-tui');
    const shim = join(root, '.local', 'bin', 'icode.exe');
    await file(shim);
    await mkdir(tool, { recursive: true });
    await writeFile(join(tool, 'uv-receipt.toml'), `[tool]\nrequirements = [{ name = "icode-tui" }]\nentrypoints = [\n    { name = "icode", install-path = "${shim}", from = "icode-tui" },\n]\n`);
    const resolved = resolveICodeBinary({ platform: 'win32', env: windowsEnv(root, { PATH: '' }), home: root, materialRoot: root });
    assert.equal(resolved.path, shim);
    assert.equal(resolved.source, 'uv');

    const stale = join(root, 'missing', 'chrys.exe');
    await writeFile(join(tool, 'uv-receipt.toml'), `entrypoints = [{ name = "chrys", install-path = "${stale}" }]\n`);
    const broken = resolveICodeBinary({ platform: 'win32', env: windowsEnv(root, { PATH: '' }), home: root, materialRoot: root });
    assert.equal(broken.source, 'missing');
    assert.ok(broken.notes.some(note => note.includes('uv 安装回执指向的 iCode 不存在')));
  } finally { await done(); }
});

test('the same launcher reached through a receipt and PATH is one installation', async () => {
  const { root, done } = await fixture();
  try {
    const roaming = join(root, 'roaming'), tool = join(roaming, 'uv', 'tools', 'icode-tui');
    const shim = join(root, '.local', 'bin', 'icode.exe');
    await file(shim);
    await mkdir(tool, { recursive: true });
    await writeFile(join(tool, 'uv-receipt.toml'), `entrypoints = [{ name = "icode", install-path = "${shim}" }]\n`);
    const resolved = resolveICodeBinary({ platform: 'win32', env: windowsEnv(root, { PATH: join(root, '.local', 'bin') }), home: root, materialRoot: root });
    assert.equal(resolved.candidates.length, 1);
    assert.equal(resolved.source, 'uv');
  } finally { await done(); }
});

test('selection skips a launcher that cannot report a version and keeps the next one', async () => {
  const { root, done } = await fixture();
  try {
    const tools = join(root, 'shims'), first = join(tools, 'icode.exe'), second = join(tools, 'chrys.exe');
    await file(first);
    await file(second);
    const tried: string[] = [];
    const selection = await selectICodeBinary({
      platform: 'win32', env: windowsEnv(root, { PATH: tools }), home: root, materialRoot: root,
      probe: async entry => { tried.push(entry); if (entry === first) throw new Error('broken shim'); return 'iCode 0.32.1'; },
    });
    assert.deepEqual(tried, [first, second]);
    assert.equal(selection.status, 'ready');
    assert.equal(selection.path, second);
    assert.equal(selection.version, '0.32.1');
    assert.ok(selection.notes.some(note => note.includes('broken shim')));
  } finally { await done(); }
});

test('a broken explicit override is reported instead of replaced by the PATH install', async () => {
  const { root, done } = await fixture();
  try {
    const tools = join(root, 'shims');
    await file(join(tools, 'icode.exe'));
    const missing = join(root, 'pinned', 'icode.exe');
    const selection = await selectICodeBinary({
      platform: 'win32', env: windowsEnv(root, { DEMO_ICODE_BINARY: missing, PATH: tools }), home: root, materialRoot: root,
      probe: async () => '0.32.1',
    });
    assert.equal(selection.status, 'override-missing');
    assert.equal(selection.path, missing);
    assert.equal(selection.version, undefined);
  } finally { await done(); }
});

test('the native interpreter is derived from the uv tool that owns the launcher', async () => {
  const { root, done } = await fixture();
  try {
    const roaming = join(root, 'roaming'), tool = join(roaming, 'uv', 'tools', 'icode-tui');
    const shim = join(root, '.local', 'bin', 'icode.exe'), python = join(tool, 'Scripts', 'python.exe');
    await file(shim);
    await file(python);
    await writeFile(join(tool, 'uv-receipt.toml'), `entrypoints = [{ name = "icode", install-path = "${shim}" }]\n`);
    assert.deepEqual(nativeInterpreters(shim, { platform: 'win32', env: windowsEnv(root, { PATH: '' }), home: root }), [python]);
  } finally { await done(); }
});
