import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loopbackProxyEnvironment, withoutNativeTrace } from '../scripts/native/native-environment.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

test('native children bypass loopback without modifying inherited proxy settings', () => {
  const base = Object.freeze({ HTTP_PROXY: 'http://proxy.example:7897', HTTPS_PROXY: 'http://proxy.example:7897', ALL_PROXY: 'socks5://proxy.example:7898', http_proxy: 'http://lower.example:7897', NO_PROXY: ' .internal.example,127.0.0.1 ', no_proxy: 'localhost,service.internal,::1', PATH: '/tools', NO_COLOR: '1' });
  const result = loopbackProxyEnvironment(base);
  assert.equal(result.NO_PROXY, '.internal.example,127.0.0.1,localhost,service.internal,::1,[::1]');
  assert.equal(result.no_proxy, result.NO_PROXY);
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'PATH', 'NO_COLOR'] as const) assert.equal(result[key], base[key]);
  assert.equal(base.NO_PROXY, ' .internal.example,127.0.0.1 ');
  assert.deepEqual(loopbackProxyEnvironment(result), result);
});

test('missing or empty bypass values receive loopback defaults; existing wildcard remains explicit', () => {
  for (const base of [{}, { NO_PROXY: '', no_proxy: ' , ' }]) {
    assert.deepEqual(loopbackProxyEnvironment(base), { ...base, NO_PROXY: '127.0.0.1,localhost,::1,[::1]', no_proxy: '127.0.0.1,localhost,::1,[::1]' });
  }
  assert.equal(loopbackProxyEnvironment({ NO_PROXY: '*' }).no_proxy, '*,127.0.0.1,localhost,::1,[::1]');
});

test('Teams disables inherited telemetry without changing session and task context settings', () => {
  const base = Object.freeze({ CHRYS_OTEL: 'true', CHRYS_OTEL_SENSITIVE_DATA: 'true', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:1/v1/traces', OTEL_EXPORTER_OTLP_HEADERS: 'private', OTEL_RESOURCE_ATTRIBUTES: 'teams.task.id=old', CHRYS_SESSION_ROOT_DIR: '/task/session', TEAMS_TUI_MANIFEST: '/task/manifest.json', PATH: '/tools' });
  const env = withoutNativeTrace(base);
  assert.equal(env.CHRYS_OTEL, 'false');
  assert.equal(env.CHRYS_OTEL_SENSITIVE_DATA, 'false');
  assert.equal(env.OTEL_SDK_DISABLED, 'true');
  for (const key of ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS', 'OTEL_RESOURCE_ATTRIBUTES']) assert.equal(env[key], undefined);
  for (const key of ['CHRYS_SESSION_ROOT_DIR', 'TEAMS_TUI_MANIFEST', 'PATH'] as const) assert.equal(env[key], base[key]);
  assert.equal(base.CHRYS_OTEL, 'true');
  assert.deepEqual(withoutNativeTrace(env), env);
});

test('untasked native launch disables trace in the child and preserves arguments and exit code', async () => {
  const args = ['空格 & "quote"', 'plain'];
  const script = "process.stdout.write(JSON.stringify({args:process.argv.slice(1),trace:process.env.CHRYS_OTEL,sdk:process.env.OTEL_SDK_DISABLED,endpoint:process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT}));process.exitCode=7";
  await assert.rejects(promisify(execFile)(process.execPath, [resolve('scripts/native/run-icode.mjs'), process.execPath, '-e', script, ...args], { env: { ...process.env, CHRYS_OTEL: 'true', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:1/v1/traces' } }), (error: any) => {
    assert.equal(error.code, 7);
    assert.deepEqual(JSON.parse(error.stdout), { args, trace: 'false', sdk: 'true' });
    return true;
  });
});
