// Stands in for engines/codegraph/run.py in tests (run with node instead of python3). FAKE_RUN: fail (the build fails)
// or wait (the build takes a moment).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, file] = process.argv.slice(2);
if (mode === '--check') {
  console.log('[icode-knowledge-codegraph] 自检通过：codegraph 1.6.0（codegraph）');
  process.exit(process.env.FAKE_RUN === 'check' ? 1 : 0);
}
const { input, output } = JSON.parse(readFileSync(file, 'utf8'));
const repo = input.repositories[0];
console.log('[icode-knowledge-codegraph] 代码版本：分支 ' + (repo.git?.branch ?? '-') + '，上次：' + (repo.git?.previous?.commit ?? '无记录') + '，索引 ' + output.index.path);
process.stdout.write('Scanning…\rScanning 10 files\r\n');
process.stderr.write('\x1b[33mwarning\x1b[0m: slow disk\n');
if (process.env.FAKE_RUN === 'wait') await new Promise(done => setTimeout(done, 400));
if (process.env.FAKE_RUN === 'fail') { console.error('[icode-knowledge-codegraph] 失败：codegraph init 失败，退出码 1'); process.exit(1); }
// The index codegraph leaves behind (its content is not read: tests generate graphs with their own exporter).
mkdirSync(output.index.path, { recursive: true });
if (!existsSync(join(output.index.path, 'codegraph.db'))) writeFileSync(join(output.index.path, 'codegraph.db'), '');
console.log('[icode-knowledge-codegraph] 完成：' + repo.path + ' 的索引已校验通过（init）。');
