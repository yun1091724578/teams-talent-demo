import { ProjectWorkspaceSummary } from './project-workspace-summary.js';
import { displayText } from '../display-text.js';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { OwnerProjectOverview } from './project-owner-overview.js';
import type { ReactNode } from 'react';
import { Collapse, Descriptions, type DescriptionsProps } from 'antd';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import { ProjectSkills, type ProjectSkillEntry } from './project-skills.js';

/** One content structure for all projects, following Teams repository/resource sections. */
export function ProjectContentTemplate({ projectId, name, description, origin, information, members, assets, knowledge, requirements, skills, skillFooter }: {
  projectId: string; name: string; description: string; origin?: ReactNode; information: DescriptionsProps['items']; members: ReactNode;
  assets: ReactNode; knowledge: ReactNode; requirements: ReactNode;
  skills: ProjectSkillEntry[]; skillFooter?: ReactNode;
}) {
  const { role } = useDemo();
  const t = useT();
  const basic = <FrameworkCard title={t('pct.basicInfo')} action={origin}><p className="muted">{displayText(description) || t('pct.noDescription')}</p><Descriptions size="small" column={{ xs: 1, sm: 2 }} items={information?.filter(item=>item?.key!=='directory')} /><Collapse size="small" ghost items={[{ key: 'members', label: t('pct.members'), children: members }]} /></FrameworkCard>;
  const skillContent = <ProjectSkills projectName={name} skills={skills} projectFooter={skillFooter} />;
  if (role === 'owner') return <OwnerProjectOverview key={projectId} projectId={projectId} origin={origin} skillCount={skills.length} skillContent={skillContent} resources={<>{basic}{assets}<FrameworkCard title={t('pct.materials')}>{requirements}</FrameworkCard></>} />;
  return <div className="page-stack project-content-template" data-project-content={name}>
    {basic}
    <ProjectWorkspaceSummary key={projectId} projectId={projectId}/>
    {assets}
    <div className="project-two-columns">
      {knowledge}
      <FrameworkCard title={t('pct.materials')}>{requirements}</FrameworkCard>
    </div>
    {skillContent}
  </div>;
}
