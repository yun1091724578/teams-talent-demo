import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryRoot } from '../server/config.ts';
import { seedState } from '../server/seed.ts';
import { readContent } from '../server/content.ts';
import { buildExport } from '../server/export.ts';
import { defaultTarget, knowledgeFiles, submitPullRequest, type Github } from '../server/pull-requests.ts';
import type { SharedRepository, TeamsSnapshot } from '../../shared/contracts.ts';

const target = { repository: 'example/project', base: 'main', note: 'test' };
function fakeGithub(contents: Record<string, string> = {}, existing = false) {
  const calls: { method: string; path: string; body: any }[] = [];
  const gh: Github = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: 'base' } };
    if (path.endsWith('/git/commits/base')) return { sha: 'base', tree: { sha: 'base-tree' } };
    if (path.includes('/contents/')) {
      const file = decodeURIComponent(path.split('/contents/')[1].split('?')[0]);
      if (!(file in contents)) throw new Error('gh: Not Found (HTTP 404)');
      return { content: Buffer.from(contents[file]).toString('base64'), encoding: 'base64' };
    }
    if (method === 'POST' && path.endsWith('/git/refs') && existing) throw new Error('gh: Reference already exists (HTTP 422)');
    if (method === 'GET' && path.includes('/pulls?')) return existing ? [{ html_url: 'https://github.com/example/project/pull/7' }] : [];
    if (method === 'POST' && path.endsWith('/pulls')) return { html_url: 'https://github.com/example/project/pull/7' };
    return { sha: 'generated' };
  };
  return { gh, calls };
}

test('knowledge PR contains revised text, stable branch and a snapshot; never updates published Teams inputs', async () => {
  const state = seedState(), a = state.artifacts.find(a => a.id === 'a-biz')!;
  a.draft!.revisions.push({ file: a.files![0], text: '# reviewed\n' });
  assert.equal(knowledgeFiles(a)[0].text, '# reviewed\n');
  const before = structuredClone(a), fake = fakeGithub();
  const submission = await submitPullRequest(a, target, undefined, fake.gh);
  assert.equal(submission.files[0].path, 'docs/knowledge/a-biz/' + a.files![0]);
  assert.equal(submission.files[0].text, '# reviewed\n');
  assert.deepEqual(a, before);
  assert.equal(fake.calls.filter(c => c.path.endsWith('/pulls') && c.method === 'POST').length, 1);
  assert.ok(fake.calls.some(c => c.path.endsWith('/git/trees') && c.body.base_tree === 'base-tree'));
  assert.ok(!fake.calls.some(c => /\/commits\/main|\/git\/trees\/|\/git\/blobs\/|matching-refs/.test(c.path)), 'only small responses are read');
  a.submission = submission;
  assert.ok(!buildExport(state).knowledge.artifacts.some(a => a.id === 'a-biz'));
  const retry = fakeGithub({}, true);
  const recovered = await submitPullRequest(before, target, undefined, retry.gh);
  assert.equal(recovered.branch, submission.branch);
  assert.equal(recovered.url, submission.url);
  assert.ok(!retry.calls.some(c => c.method === 'POST' && c.path.endsWith('/pulls')), 'an existing branch reuses its PR');
});

test('rule PR preserves existing AGENTS.md and does not write Skill versions or local rules', async () => {
  const state = seedState(), a = state.artifacts.find(a => a.kind === 'diagnosis')!;
  const fake = fakeGithub({ 'AGENTS.md': '# Existing rules\n' });
  const result = await submitPullRequest(a, target, 'change-03', fake.gh);
  assert.match(result.files[0].text, /^# Existing rules\n/);
  assert.match(result.files[0].text, /最后一次完整验证/);
  assert.equal(result.files[0].path, 'AGENTS.md');
  assert.deepEqual(state.skillVersions, []);
  assert.ok(!state.artifacts.some(a => a.id === 'a-rules-carddemo'));
});

test('Skill PR checks the diagnosis basis and preserves nested file paths', async () => {
  const a = seedState().artifacts.find(a => a.kind === 'diagnosis')!;
  const report = JSON.parse(readContent('trajectory/' + a.topic + '/report.json')!);
  const suggestion = report.suggestions.find((s: any) => s.kind === 'skill');
  const contents = Object.fromEntries(suggestion.files.map((f: any) => ['.agents/skills/' + suggestion.skill + '/' + f.path, f.before]));
  const fake = fakeGithub(contents);
  const result = await submitPullRequest(a, target, suggestion.id, fake.gh);
  assert.equal(result.files.length, suggestion.files.length);
  assert.deepEqual(result.files.map(f => f.text), suggestion.files.map((f: any) => f.after));
  const stale = fakeGithub();
  await assert.rejects(submitPullRequest(a, target, suggestion.id, stale.gh), /建议依据不同/);
  assert.ok(!stale.calls.some(c => c.method === 'POST'));
});

test('gh failures propagate and indexes cannot be submitted', async () => {
  const a = seedState().artifacts.find(a => a.id === 'a-biz')!;
  await assert.rejects(submitPullRequest(a, target, undefined, async () => { throw new Error('mock: gh not authenticated'); }), /not authenticated/);
  await assert.rejects(submitPullRequest(seedState().artifacts.find(a => a.kind === 'index')!, target, undefined, fakeGithub().gh), /远端索引/);
});

test('files go to the repository root, and a CRLF skill file keeps its line endings', async () => {
  const a = seedState().artifacts.find(a => a.kind === 'diagnosis')!;
  const report = JSON.parse(readContent('trajectory/' + a.topic + '/report.json')!);
  const suggestion = report.suggestions.find((s: any) => s.kind === 'skill');
  const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
  const dir = '.agents/skills/' + suggestion.skill + '/';
  const skill = await submitPullRequest(a, target, suggestion.id,
    fakeGithub(Object.fromEntries(suggestion.files.map((f: any) => [dir + f.path, crlf(f.before)]))).gh);
  assert.deepEqual(skill.files.map(f => f.path), suggestion.files.map((f: any) => dir + f.path));
  assert.deepEqual(skill.files.map(f => f.text), suggestion.files.map((f: any) => crlf(f.after)));
  const rule = await submitPullRequest(a, target, 'change-03', fakeGithub().gh);
  assert.equal(rule.files[0].path, 'AGENTS.md');
  const knowledge = await submitPullRequest(seedState().artifacts.find(a => a.id === 'a-biz')!, target, undefined, fakeGithub().gh);
  assert.ok(knowledge.files.every(f => f.path.startsWith('docs/knowledge/a-biz/')));
});

test('PRs go to the origin and base branch of the workspace bound to the project in Teams', () => {
  const project = (repositories: SharedRepository[]): TeamsSnapshot => ({ schemaVersion: 1, exportedAt: '', team: { name: '', members: [] }, sessions: [],
    projects: [{ id: 'carddemo', name: 'Credit Card', description: '', readonly: false, documents: [], skills: [], repositories }] });
  const repo = { id: 'repository:carddemo:carddemo-java-1025', name: 'carddemo-java-1025' };
  for (const remote of ['https://github.com/JeffyLiu003/carddemo-java-1025.git', 'git@github.com:JeffyLiu003/carddemo-java-1025.git', 'ssh://git@github.com/JeffyLiu003/carddemo-java-1025'])
    assert.deepEqual(defaultTarget(project([{ ...repo, path: '/work/carddemo-java-1025', remote, branch: 'develop' }]), 'carddemo'), { repository: 'JeffyLiu003/carddemo-java-1025', base: 'develop' });
  assert.throws(() => defaultTarget(project([repo]), 'carddemo'), /还没有在 iCode Teams 中绑定代码仓/);
  assert.throws(() => defaultTarget(project([{ ...repo, path: '/work/carddemo', remote: 'https://code.bank.local/carddemo.git', branch: 'main' }]), 'carddemo'), /不在 GitHub 上/);
  assert.throws(() => defaultTarget(project([repo]), 'unknown'), /还没有在 iCode Teams 中绑定代码仓/);
});

test('the Skill suggestion is based on the Skill in workspace/.agents/skills of this repository', async () => {
  const a = seedState().artifacts.find(a => a.kind === 'diagnosis')!;
  const report = JSON.parse(readContent('trajectory/' + a.topic + '/report.json')!);
  const suggestion = report.suggestions.find((s: any) => s.kind === 'skill');
  const dir = '.agents/skills/' + suggestion.skill + '/';
  const contents = Object.fromEntries(suggestion.files.map((f: any) => [dir + f.path, readFileSync(join(repositoryRoot, 'workspace', dir + f.path), 'utf8')]));
  const result = await submitPullRequest(a, target, suggestion.id, fakeGithub(contents).gh);
  assert.equal(result.files.length, suggestion.files.length);
});

test('a missing base branch is reported, and a new branch skips the PR lookup', async () => {
  const a = seedState().artifacts.find(a => a.id === 'a-biz')!;
  await assert.rejects(submitPullRequest(a, { ...target, base: 'release' }, undefined, async () => { throw new Error('gh: Not Found (HTTP 404)'); }), /目标分支不存在：release/);
  const fake = fakeGithub();
  await submitPullRequest(a, target, undefined, fake.gh);
  assert.ok(!fake.calls.some(c => c.path.includes('/pulls?')));
  assert.equal(fake.calls.length, 6);
});

test('steps are reported in order as they start, and stop at the one that fails', async () => {
  const biz = seedState().artifacts.find(a => a.id === 'a-biz')!, steps: number[] = [];
  await submitPullRequest(biz, target, undefined, fakeGithub().gh, step => steps.push(step));
  assert.deepEqual(steps, [0, 1, 2, 3, 4]);
  const a = seedState().artifacts.find(a => a.kind === 'diagnosis')!, failed: number[] = [];
  await assert.rejects(submitPullRequest(a, target, 'change-02', fakeGithub().gh, step => failed.push(step)), /建议依据不同/);
  assert.deepEqual(failed, [0, 1]);
});
