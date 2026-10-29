#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { withoutNativeTrace, loopbackProxyEnvironment } from './native-environment.mjs';
import { interactiveEnvironment } from './interactive-environment.mjs';

const [executable, ...args] = process.argv.slice(2);
if (!executable) throw new Error('缺少 iCode 可执行文件');
const child = spawn(executable, args, {
  cwd: process.cwd(),
  env: loopbackProxyEnvironment(interactiveEnvironment(withoutNativeTrace(process.env))),
  stdio: 'inherit',
});
const stop = () => child.kill('SIGTERM');
const hangup = () => child.kill('SIGHUP');
process.on('SIGTERM', stop);
process.on('SIGHUP', hangup);
child.once('error', error => { console.error('iCode 启动失败：' + error.message); process.exitCode = 1; });
child.once('close', code => {
  process.off('SIGTERM', stop);
  process.off('SIGHUP', hangup);
  process.exitCode = code ?? 1;
});
