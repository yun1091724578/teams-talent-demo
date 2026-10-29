#!/usr/bin/env node
// Test-only gh executable. All responses stay local; no network requests are made.
import { appendFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
const args = process.argv.slice(2), method = args[2], path = args[3];
const text = readFileSync(0, 'utf8'), body = text ? JSON.parse(text) : undefined;
appendFileSync(process.env.TEST_GH_LOG, JSON.stringify({ method, path, body }) + '\n');
const report = JSON.parse(readFileSync('content/trajectory/carddemo-19/report.json', 'utf8'));
const skill = report.suggestions.find(s => s.kind === 'skill');
const files = Object.fromEntries(skill.files.map(f => ['.agents/skills/' + skill.skill + '/' + f.path, f.before.replace(/\n/g, '\r\n')]));
files['AGENTS.md'] = '# Existing project rules\n';
let result = { sha: 'test-generated' };
const fail = message => { process.stderr.write('gh: ' + message); process.exit(1); };
if (path.endsWith('/git/ref/heads/develop')) result = { object: { sha: 'test-base' } };
else if (path.endsWith('/git/commits/test-base')) result = { sha: 'test-base', tree: { sha: 'test-tree' } };
else if (path.includes('/contents/')) {
  const file = decodeURIComponent(path.split('/contents/')[1].split('?')[0]);
  if (!(file in files)) fail('Not Found (HTTP 404)');
  result = { content: Buffer.from(files[file]).toString('base64'), encoding: 'base64' };
}
else if (method === 'GET' && path.includes('/pulls?')) result = [];
else if (method === 'POST' && path.endsWith('/pulls')) {
  if (existsSync(process.env.TEST_GH_FAIL)) { unlinkSync(process.env.TEST_GH_FAIL); fail('模拟提交失败，请重试'); }
  result = { html_url: 'https://github.com/example/project/pull/42' };
}
process.stdout.write(JSON.stringify(result));
