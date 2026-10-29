import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SharedTeams, TeamsSnapshot } from '../../shared/contracts.ts';
import snapshotJson from './fixtures/teams-snapshot.json' with { type: 'json' };
import { clientState, readSkill, readTeamsData, teamsModel, teamsRevision, teamsView, type TeamsGet } from '../server/teams-data.ts';
import { seedState, DOCSET_ID, REPO_ID, STD_ID } from '../server/seed.ts';
// The snapshot Teams serves, built by Teams itself, so a field Teams stops sending fails here.
import { readFixtures } from '../../teams/server/http-shared.js';
import { teamsSnapshot } from '../../teams/server/shared-data.js';
import { initialState } from '../../teams/src/domain.js';
import { createSourcePluginCatalog } from '../../teams/src/source-plugins.js';
import type { ProjectWorkspaces } from '../../teams/src/project-workspace.js';

const snapshot = snapshotJson as TeamsSnapshot;
const fixtures = await readFixtures();
const unbound: ProjectWorkspaces = { version: 1, defaultProjectId: null, projects: [] };
const bound: ProjectWorkspaces = { version: 1, defaultProjectId: 'carddemo', projects: [
  { projectId: 'carddemo', directory: '/work/carddemo-java-1025', remoteUrl: 'https://github.com/JeffyLiu003/carddemo-java-1025.git', baseBranch: 'develop', commonDirectory: '/work/carddemo-java-1025/.git' }] };
const fromTeams = (workspaces: ProjectWorkspaces) => teamsSnapshot(initialState(), fixtures, createSourcePluginCatalog(fixtures), workspaces);

test('shows the imported iCode Teams project, marked read-only, next to the others', () => {
  const model = teamsModel(snapshot);
  assert.deepEqual(model.projects.map(p => [p.id, p.readonly]), [['carddemo', false], ['teams', true], ['project-1a2b3c', false]]);
  assert.ok(model.sources.some(s => s.projectId === 'teams' && s.type === 'docs'));
});

test('an unbound repository is listed without a path; a bound one has its workspace path', () => {
  const model = teamsModel(snapshot);
  const created = model.sources.filter(s => s.projectId === 'project-1a2b3c');
  assert.deepEqual(created.map(s => [s.type, s.path, s.bound]), [['repo', '', false]]);
  const repo = model.sources.find(s => s.id === REPO_ID)!;
  assert.deepEqual([repo.name, repo.path, repo.bound], ['carddemo-java-1025', '/fixtures/checkouts/carddemo-java-1025', true]);
});

test('maps the project documents into one document set named after the project', () => {
  const model = teamsModel(snapshot);
  const set = model.sources.find(s => s.type === 'docs' && s.projectId === 'carddemo')!;
  assert.equal(set.id, DOCSET_ID);
  assert.equal(set.name, '设计文档');
  assert.equal(set.path, 'teams');
  assert.equal(set.files, 3);
  assert.deepEqual(set.tree, [{ dir: 'teams/docs', files: ['cashback-contract.md'] }, { dir: 'teams/fixtures/project-documents/carddemo/docs/design/adr', files: ['ADR-009-marketing-integration.md', 'ADR-007-authentication-scope.md'] }]);
  assert.equal(set.titles!['teams/docs/cashback-contract.md'], '消费返现规则');
  assert.equal(set.fromTeams, true);
  assert.deepEqual(model.sources.filter(s => s.projectId === 'carddemo').map(s => s.id), [REPO_ID, DOCSET_ID]);
});

test('the Teams owner is the admin entry and member "member" is the developer entry', () => {
  const { team } = teamsModel(snapshot);
  assert.equal(team.name, '信用卡研发团队');
  assert.equal(team.admin, 'owner');
  assert.equal(team.me, 'member');
  assert.equal(team.members.find(m => m.id === team.admin)!.name, '林悦');
  assert.equal(team.members.find(m => m.id === team.me)!.name, '陈晨');
  assert.equal(team.members.length, 6);
});

test('shared sessions come from Teams, keyed by member', () => {
  const { sessions } = teamsModel(snapshot);
  assert.equal(sessions.length, snapshot.sessions.length);
  const s = sessions.find(x => x.id === '3f2a9c41d7e0')!;
  assert.equal(s.owner, 'member');
  assert.equal(s.ownerName, '陈晨');
  assert.equal(s.updated, '2026-10-26 18:42');
  assert.equal(s.projectId, 'carddemo');
  assert.ok(s.messages > s.turns && s.tokens > 0);
});

test('client state merges Talents metadata into Teams sources and adds the team-level local document source', () => {
  const state = clientState(seedState(), snapshot);
  const repo = state.sources.find(s => s.id === REPO_ID)!;
  assert.equal(repo.commit!.sha, '4e1b7c2');
  assert.equal(repo.prs, 66);
  const set = state.sources.find(s => s.id === DOCSET_ID)!;
  assert.deepEqual(set.versions!.map(v => v.at), ['2026-10-27 09:05', '2026-10-26 10:00']);
  assert.equal(state.sources.find(s => s.id === STD_ID)!.projectId, null);
  assert.ok(state.sources.some(s => s.id === 's-sessions'));
  assert.ok(!('localSources' in state) && !('sourceMeta' in state));
  // The Teams part the page refreshes is the same as in the full state.
  const view = teamsView(snapshot, seedState().sourceMeta);
  assert.deepEqual(state.sources.filter(s => s.fromTeams || s.type === 'sessions'), view.sources);
  assert.deepEqual([state.team, state.projects, state.sessions], [view.team, view.projects, view.sessions]);
});

test('reads Teams over HTTP; while Teams cannot be read the team is empty and the reason is given', async () => {
  const served: SharedTeams = { revision: 'a1.3', snapshot };
  const online = await readTeamsData(async path => { assert.equal(path, '/api/shared/teams'); return served; });
  assert.deepEqual([online.online, online.revision, online.snapshot.team.name], [true, 'a1.3', '信用卡研发团队']);
  const offline = await readTeamsData(async () => { throw new TypeError('fetch failed'); });
  assert.equal(offline.online, false);
  assert.deepEqual([offline.snapshot.projects, offline.snapshot.team.members], [[], []]);
  assert.match(!offline.online ? offline.error : '', /无法读取 iCode Teams 数据：fetch failed/);
  const invalid = await readTeamsData(async () => ({ revision: 'a1.3', snapshot: { schemaVersion: 2 } }));
  assert.match(!invalid.online ? invalid.error : '', /格式无效/);
});

test('waits on Teams for a newer revision, and gives null when Teams cannot be reached', async () => {
  let asked = '';
  const get: TeamsGet = async path => { asked = path; return { revision: 'a1.4' }; };
  assert.equal(await teamsRevision('a1.3', new AbortController().signal, get), 'a1.4');
  assert.equal(asked, '/api/shared/teams/changes?after=a1.3');
  assert.equal(await teamsRevision('a1.3', new AbortController().signal, async () => { throw new Error('ECONNREFUSED'); }), null);
});

test('what Teams serves maps one to one: projects, documents with AGENTS.md, skills and the bound workspace', async () => {
  const served = fromTeams(bound), model = teamsModel(served);
  assert.deepEqual(model.projects.map(p => [p.id, p.name, p.readonly, p.skills.length]), [['carddemo', 'Credit Card', false, 13], ['teams', 'iCode Teams', true, 3]]);
  assert.deepEqual(model.projects.map(p => p.id), served.projects.map(p => p.id));
  for (const p of served.projects) {
    const docs = model.sources.find(s => s.type === 'docs' && s.projectId === p.id)!;
    assert.deepEqual(Object.keys(docs.titles!), p.documents.map(d => d.path));
  }
  assert.equal(model.sources.find(s => s.type === 'docs' && s.projectId === 'teams')!.titles!['AGENTS.md'], '项目规范 AGENTS.md');
  // Named as Teams lists them under 项目资料与资产.
  assert.deepEqual(Object.values(model.sources.find(s => s.id === DOCSET_ID)!.titles!), ['营销能力设计', '营销集成与入账边界', '鉴权范围设计决策']);
  // The bound workspace gives the repository its path, origin and branch; the id does not change.
  const repo = model.sources.find(s => s.id === REPO_ID)!;
  assert.deepEqual([repo.path, repo.bound, repo.origin, repo.branch], ['/work/carddemo-java-1025', true, 'https://github.com/JeffyLiu003/carddemo-java-1025.git', 'develop']);
  const before = teamsModel(fromTeams(unbound)).sources.find(s => s.id === REPO_ID)!;
  assert.deepEqual([before.path, before.bound], ['', false]);
  // SKILL.md: read from this repository for the card project, sent as content for the imported project.
  const adr = await readSkill(served, 'carddemo', 'arch-adr-writing');
  assert.equal(adr.path, 'workspace/.agents/skills/arch-adr-writing/SKILL.md');
  assert.match(adr.content, /\| version \| 1\.0\.0 \|/);
  const control = await readSkill(served, 'teams', 'icode-teams-control');
  assert.equal(control.content, fixtures.teamsProject.documents.find((d: { path: string }) => d.path === '.agents/skills/icode-teams-control/SKILL.md')!.content);
  assert.ok(!('content' in model.projects.find(p => p.id === 'teams')!.skills[0]), 'the page reads SKILL.md on demand');
  await assert.rejects(readSkill(served, 'carddemo', 'unknown'), (e: any) => e.status === 404);
});
