// Stands in for engines/codegraph/run.py --check and the CodeGraph installer in tests (run with node). The self-check
// passes once the install has written FAKE_MARKER; FAKE_INSTALL=fail makes the install fail.
import { existsSync, writeFileSync } from 'node:fs';

const marker = process.env.FAKE_MARKER;
if (process.argv[2] === '--check') {
  if (existsSync(marker)) { console.log('[icode-knowledge-codegraph] 自检通过：codegraph 1.6.0（codegraph）'); process.exit(0); }
  console.error('[icode-knowledge-codegraph] 自检失败：在 iCode Knowledge 后端的 PATH 中找不到 codegraph。请按 README 安装后重试。');
  process.exit(1);
}
console.log('Downloading codegraph v1.6.0…');
if (process.env.FAKE_INSTALL === 'fail') { console.error('curl: (6) Could not resolve host'); process.exit(6); }
writeFileSync(marker, '');
console.log('\x1b[32m✓\x1b[0m Installed to ~/.local/bin/codegraph');
