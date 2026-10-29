import { displayText } from '../display-text.js';
import { useState, type ReactNode } from 'react';
import { Alert, Button, Empty, Pagination, Space, Tabs, Tag } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { currentT } from '../../../shared/i18n/index.js';
import { userSkillExamples } from '../project-skill-examples.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { resourceSubscriptions } from '../resource-sharing.js';
import { SkillApplication } from './skill-application.js';
import type { DemoState, Role } from '../domain.js';
import { getResourceContent, type Presentation } from '../api.js';

export interface ProjectSkillEntry {
  name: string;
  description: string;
  version: string;
  source: string;
  path: string;
  displayPath?: string;
  content?: string;
}

export function userSkillsFor(state: DemoState, data: Presentation, role: Role): ProjectSkillEntry[] {
  const subscriptions = new Map(resourceSubscriptions(state, role).map(item => [item.id, item]));
  const entries = new Map<string, ProjectSkillEntry>(userSkillExamples.map(skill => [skill.id, { ...skill, version: skill.id === 'teams-collaboration' ? 'cli-v1' : 'v1', source: skill.id === 'teams-collaboration' ? currentT('ps.localSource') : currentT('ps.userSource'), path: skill.id === 'teams-collaboration' ? data.localPaths.collaborationSkill : '', content: skill.id === 'teams-collaboration' ? skill.content.replace('teams/skills/teams-demo-collaboration/SKILL.md', data.localPaths.collaborationSkill).replace('teams/scripts/teams-demo.mjs', data.localPaths.cli) : skill.content }]));
  for (const skill of data.skills) {
    const subscription = subscriptions.get(skill.name);
    if (subscription?.sha256) entries.set(skill.name, { ...skill, version: subscription.version, source: currentT('ps.subscribedSource'), content: data.skillContents[skill.name] });
  }
  return [...entries.values()];
}

/** Reuses the Teams project-content name/description/path rows and its user/project scope vocabulary. */
export function ProjectSkills({ projectName, skills, projectFooter }: { projectName: string; skills: ProjectSkillEntry[]; projectFooter?: ReactNode }) {
  const { role, showText, data, state, navigate } = useDemo();
  const t = useT();
  const [scope, setScope] = useState('project'), [page, setPage] = useState(1);
  const [reading, setReading] = useState(''), [readError, setReadError] = useState('');
  const userName = state.workspace.team.members.find(member => member.id === role)?.name ?? role;
  const subscriptions = new Map(resourceSubscriptions(state, role).map(item => [item.id, item]));
  const userSkills = userSkillsFor(state, data, role);
  const entries = scope === 'project' ? skills : userSkills;
  const range = scope === 'project' ? t('ps.projectScope', { project: projectName }) : t('ps.userScope', { name: userName });
  const open = async (skill: ProjectSkillEntry) => {
    setReadError(''); setReading(skill.name);
    try {
      const subscription = scope === 'user' ? subscriptions.get(skill.name) : undefined;
      const content = subscription?.sha256 ? (await getResourceContent(role, { resourceId: skill.name, version: subscription.version, sha256: subscription.sha256 })).content : skill.content;
      if (!content) throw new Error(t('ps.noContent'));
      showText(skill.name + ' · ' + t('ps.skillDocTitle'), [
    t('ps.docName', { name: skill.name }), t('ps.docUsage', { description: skill.description }), t('ps.docVersion', { version: displayText(skill.version) }), t('ps.docSource', { source: displayText(skill.source) }), t('ps.docScope', { range }),
    ...(skill.path ? [t('ps.docPath', { path: skill.path })] : []),
    '', subscriptions.get(skill.name)?.sha256 ? t('ps.subscribedNote') : scope === 'user' ? skill.source.startsWith(currentT('ps.localSource')) ? t('ps.localNote') : t('ps.noLocalDirNote') : t('ps.projectNote'),
    '', content,
  ].join('\n'));
    } catch (cause) { setReadError((cause as Error).message); }
    finally { setReading(''); }
  };
  return <div className="project-skills" role="region" aria-label={t('ps.regionAria')}>
    <FrameworkCard title={t('ps.regionAria')}>
      <Tabs size="small" activeKey={scope} onChange={value => { setScope(value); setPage(1); }} items={[{ key: 'project', label: t('ps.projectTab', { count: skills.length }) }, { key: 'user', label: t('ps.userTab', { count: userSkills.length }) }]} />
      <div className="project-skill-scope"><span>{range}</span>{scope === 'user' && <Tag>{t('ps.userResource')}</Tag>}</div>
      {readError && <Alert type="error" title={t('ps.readFailed')} description={readError} />}
      <div className="project-skill-list">{entries.slice((page - 1) * 5, page * 5).map(skill => <div className="project-skill-row" key={skill.name}>
        <div><strong>{skill.name}</strong><p>{skill.description}</p><div className="project-skill-meta"><span>{displayText(skill.version)} · {displayText(skill.source)}</span>{skill.path && <code title={skill.path}>{skill.displayPath ?? skill.path}</code>}</div></div>
        <Space wrap><Button size="small" loading={reading === skill.name} aria-label={t('ps.viewSkillAria', { name: skill.name })} onClick={() => void open(skill)}>{t('ps.viewNote')}</Button>{!!subscriptions.get(skill.name)?.sha256 && <SkillApplication resourceId={skill.name} version={subscriptions.get(skill.name)!.version} sha256={subscriptions.get(skill.name)!.sha256} />}</Space>
      </div>)}</div>
      {!entries.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ps.empty')} />}
      <Pagination size="small" responsive hideOnSinglePage current={page} pageSize={5} total={entries.length} showSizeChanger={false} onChange={setPage} />
      {scope === 'project' && projectFooter}
      <p className="muted project-skill-note">{t('ps.note', { count: data.skills.length })}</p><Button size="small" onClick={() => navigate('subscriptions')}>{t('ps.viewSubscriptions')}</Button>
    </FrameworkCard>
  </div>;
}
