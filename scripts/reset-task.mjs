// Cross-platform entry point; all planning, backup and mutation rules live in Teams.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const teams = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teams');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, ['--import', 'tsx', join(teams, 'scripts', 'reset-task.ts'), ...(args.length ? args : ['--help'])], {
  cwd: teams,
  stdio: 'inherit',
});
if (result.error) console.error('无法运行任务重置：' + result.error.message);
else if (result.signal) console.error('任务重置已中断：' + result.signal);
process.exitCode = result.status ?? 1;
