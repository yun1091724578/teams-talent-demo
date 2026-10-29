import { readFile } from 'node:fs/promises';
import { join, normalize, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { sharedDir, sharedSeedDir } from './config.js';
import { DomainError, type DemoState } from '../src/domain.js';
import type { Presentation } from '../src/api.js';
import type { SourcePluginCatalog } from '../src/source-plugins.js';
import type { ProjectWorkspaces } from '../src/project-workspace.js';
import { legacyAssetSourceIds } from '../src/project-asset-links.js';
import { displayText } from '../src/display-text.js';
import { sharedPaths, type PublishedArtifact, type PublishedSkillVersion, type SharedProject, type SharedRepository, type SharedSession, type SharedSkill, type TalentsKnowledge, type TeamsSnapshot } from '../../shared/contracts.js';
import teamSessions from '../fixtures/team-sessions.json' with { type: 'json' };

/** Reads a shared file written by the other project, falling back to the committed seed copy. */
async function readSharedLocated(path: string): Promise<{content:Buffer;absolutePath:string} | null> {
  for (const dir of [sharedDir, sharedSeedDir]) {
    try { const absolutePath=join(dir,path);return {content:await readFile(absolutePath),absolutePath}; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return null;
}

async function readShared(path:string):Promise<Buffer|null>{return (await readSharedLocated(path))?.content??null;}

const repositoryPath = (path: string) => 'workspace/' + path;
/** Same "YYYY-MM-DD HH:mm" Beijing-time form as the session fixture. */
const localMinute = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** A project's code repository. Its local path, origin and base branch are those of the workspace bound in the project
 *  overview; an unbound repository has no path. The id never depends on the binding. */
function repository(workspaces: ProjectWorkspaces, projectId: string, value: SharedRepository): SharedRepository {
  const bound = workspaces.projects.find(item => item.projectId === projectId);
  return bound ? { ...value, path: bound.directory, remote: bound.remoteUrl, branch: bound.baseBranch } : value;
}
/** The card project's skills: those of the demo blueprint, as its "项目可用 Skill" panel lists them. */
function cardSkills(fixtures: Presentation): SharedSkill[] {
  const ids = new Set(fixtures.blueprint.skill_groups.flatMap(group => group.skills));
  return fixtures.skillCatalog.filter(skill => ids.has(skill.id)).map(skill => ({ id: skill.id, name: skill.name, version: skill.version,
    description: skill.description, path: repositoryPath('.agents/skills/' + skill.id + '/SKILL.md'), sha256: skill.contentSha256 }));
}
function cardProject(state: DemoState, fixtures: Presentation, catalog: SourcePluginCatalog, workspaces: ProjectWorkspaces): SharedProject {
  const project = state.workspace.project;
  // The documents among the rows of the project's "项目资料与资产" (src/components/project-assets.tsx), named as listed there.
  const documents = project.assets.flatMap(asset => {
    const ids = legacyAssetSourceIds(asset);
    if (!ids.length) return asset.kind === 'document' ? [{ id: asset.id, title: asset.title, path: asset.location, summary: '' }] : [];
    return ids.flatMap(id => {
      const source = catalog.get(id);
      if (!source) return asset.kind === 'document' ? [{ id, title: asset.title, path: asset.location, summary: '' }] : [];
      return source.kind === 'document' ? [{ id, title: displayText(source.title), path: source.references[0]?.path ?? asset.location, summary: source.summary }] : [];
    });
  });
  return { id: 'carddemo', name: project.name, description: project.description, readonly: false,
    repositories: [repository(workspaces, 'carddemo', { id: 'repository:carddemo:' + project.repository, name: project.repository, branch: 'main', description: 'Java 21 微服务：7 个服务和 Web UI' })],
    documents, skills: cardSkills(fixtures) };
}
/** The imported iCode Teams project, as its project page shows it: the AGENTS.md rules first among the documents, and the
 *  skills of its source snapshot, whose SKILL.md exists only in the snapshot and so travels as content. */
function importedProject(fixtures: Presentation, workspaces: ProjectWorkspaces): SharedProject {
  const imported = fixtures.teamsProject, project = imported.project;
  const text = (path: string) => imported.documents.find(document => document.path === path)?.content;
  return { id: 'teams', name: project.name, description: project.description, readonly: true,
    repositories: project.repos.map(repo => repository(workspaces, 'teams', { id: 'repository:teams:' + repo.name, name: repo.name, remote: repo.name, branch: repo.branch, description: repo.note })),
    documents: [{ name: '项目规范 AGENTS.md', path: 'AGENTS.md', description: project.agentsNote }, ...project.docs]
      .map(doc => ({ id: 'design-library:teams:' + doc.path, title: doc.name, path: doc.path, summary: doc.description })),
    skills: project.skills.flatMap(skill => {
      const path = '.agents/skills/' + skill.name + '/SKILL.md', content = text(path);
      return content === undefined ? [] : [{ id: skill.name, name: skill.name, version: '源码快照 ' + imported.sourceCommit.slice(0, 7), description: skill.description, path, sha256: sha256(content), content }];
    }) };
}
function sessions(state: DemoState): SharedSession[] {
  const members = new Map(state.workspace.team.members.map(member => [member.id, member.name]));
  const card = (value: Omit<SharedSession, 'projectId' | 'memberName' | 'cwd'>): SharedSession =>
    ({ ...value, projectId: 'carddemo', memberName: members.get(value.memberId) ?? value.memberId, cwd: repositoryPath(state.workspace.project.repository) });
  const shared = teamSessions.sessions.map(card);
  for (const record of state.workspace.taskAutomation ?? []) {
    if (record.collection?.reporting?.status !== 'reported') continue;
    const task = state.workspace.deliveryRequirements?.find(task => task.projectId === record.projectId && task.id === record.taskId);
    for (const session of record.collection.sessions) {
      shared.unshift({ id: session.tool + ':' + session.sessionId + ':' + record.taskId,
        projectId: record.projectId, requirementId: record.taskId, title: task?.title ?? '白金卡消费返现需求',
        memberId: task?.assigneeId ?? state.assigneeId ?? 'member', memberName: members.get(task?.assigneeId ?? state.assigneeId ?? 'member') ?? '项目成员',
        updatedAt: localMinute(session.lastAt), turns: 0, agent: session.tool, model: '未提供',
        cwd: task?.workDirectory ?? repositoryPath(state.workspace.project.repository), summary: session.nodeIds.join('、'),
        transcript: !!record.collection.reporting.receipt?.documentHashes?.some(document => document.sessionId === session.sessionId) });
    }
  }
  const delivery = teamSessions.delivery;
  if (state.workspace.sessionReported) shared.unshift(card({ ...delivery, updatedAt: localMinute(state.workspace.reportAt ?? new Date().toISOString()) }));
  return shared;
}
/** The team, projects and shared sessions Talents reads (GET /api/shared/teams), computed from the current state. */
export function teamsSnapshot(state: DemoState, fixtures: Presentation, catalog: SourcePluginCatalog, workspaces: ProjectWorkspaces): TeamsSnapshot {
  return {
    schemaVersion: 1, exportedAt: new Date().toISOString(),
    team: { name: state.workspace.team.name, members: state.workspace.team.members },
    projects: [
      cardProject(state, fixtures, catalog, workspaces),
      importedProject(fixtures, workspaces),
      ...(state.workspace.projects ?? []).map(project => ({ id: project.id, name: project.name, description: project.description, readonly: false,
        repositories: [repository(workspaces, project.id, { id: 'repository:' + project.id, name: project.repositoryIdentity, remote: project.remoteUrl })], documents: [], skills: [] })),
    ],
    sessions: sessions(state),
  };
}

export async function readTalentsKnowledge(): Promise<TalentsKnowledge> {
  const content = await readShared(sharedPaths.talentsKnowledge);
  if (!content) return { schemaVersion: 1, exportedAt: '', artifacts: [] };
  const value = JSON.parse(content.toString('utf8')) as TalentsKnowledge;
  if (value.schemaVersion !== 1 || !Array.isArray(value.artifacts)) throw new DomainError('Talents 知识数据格式无效', 502);
  return value;
}
/** Knowledge published to the project, and team-level knowledge, which every project uses. */
export async function projectKnowledge(projectId: string): Promise<PublishedArtifact[]> {
  return (await readTalentsKnowledge()).artifacts.filter(artifact => artifact.projectId === projectId || artifact.projectId === null);
}
/** The version Teams records as "project knowledge built": the project's business knowledge if published, else any artifact. */
export function knowledgeVersion(artifacts: PublishedArtifact[]) {
  const sorted = [...artifacts].sort((a, b) => Number(a.projectId === null) - Number(b.projectId === null) || a.id.localeCompare(b.id));
  const main = sorted.find(artifact => artifact.capability === 'doc-extract') ?? sorted[0];
  return main ? `${main.name} v${main.version}` : undefined;
}
/** The latest version Talents wrote of each of the project's skills (applying a trajectory diagnosis suggestion), with its files. */
export async function projectSkillVersions(projectId: string) {
  const latest = new Map<string, PublishedSkillVersion>();
  for (const version of (await readTalentsKnowledge()).skills ?? []) if (version.projectId === projectId) latest.set(version.skillId, version);
  return Promise.all([...latest.values()].map(async version => ({ ...version, files: await Promise.all(version.files.map(async file =>
    ({ ...file, content: (await readShared(sharedPaths.talentsSkillFile(version.skillId, version.version, file.path)))?.toString('utf8') ?? null }))) })));
}
export async function readTalentsFile(artifactId: string, version: number, path: string) {
  const artifact = (await readTalentsKnowledge()).artifacts.find(item => item.id === artifactId && item.version === version);
  const file = artifact?.files.find(item => item.path === path);
  if (!artifact || !file || isAbsolute(path) || normalize(path).startsWith('..')) throw new DomainError('Talents 产物文件不存在', 404);
  const source = await readSharedLocated(sharedPaths.talentsFile(artifactId, version, path));
  if (!source) throw new DomainError('Talents 产物文件尚未同步', 404);
  return { ...file, content: source.content.toString('utf8'), absolutePath: source.absolutePath };
}
