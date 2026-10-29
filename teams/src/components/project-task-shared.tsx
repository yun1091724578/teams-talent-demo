import { Tag } from 'antd';
import type { CollaborationEvent } from '../collaboration.js';
import type { OverviewFilter, OverviewRequirement } from '../project-overview.js';
import { currentT } from '../../../shared/i18n/index.js';
import type { MessageKey } from '../../../shared/i18n/index.js';

type MetricGroup = {
  tab: 'requirements' | 'issues';
  title: string;
  note: string;
  metrics: { key: OverviewFilter; label: string }[];
};

const metricGroupKeys: { tab: 'requirements' | 'issues'; titleKey: MessageKey; noteKey: MessageKey; metrics: { key: OverviewFilter; labelKey: MessageKey }[] }[] = [
  { tab: 'requirements', titleKey: 'ov.group.requirements', noteKey: 'ov.group.requirementsNote', metrics: [
    { key: 'all', labelKey: 'ov.metric.all' }, { key: 'pending', labelKey: 'ov.metric.pending' }, { key: 'active', labelKey: 'ov.metric.active' },
    { key: 'acceptance', labelKey: 'ov.metric.acceptance' }, { key: 'delivered', labelKey: 'ov.metric.delivered' },
  ] },
  { tab: 'issues', titleKey: 'ov.group.issues', noteKey: 'ov.group.issuesNote', metrics: [
    { key: 'issues', labelKey: 'ov.metric.issues' }, { key: 'open', labelKey: 'ov.metric.open' }, { key: 'closed', labelKey: 'ov.metric.closed' },
    { key: 'unconfirmed', labelKey: 'ov.metric.unconfirmed' }, { key: 'blocking', labelKey: 'ov.metric.blocking' },
  ] },
];

/** Resolved per render: the groups are display labels, not module constants. */
export const metricGroups = (): MetricGroup[] => metricGroupKeys.map(group => ({
  tab: group.tab,
  title: currentT(group.titleKey),
  note: currentT(group.noteKey),
  metrics: group.metrics.map(metric => ({ key: metric.key, label: currentT(metric.labelKey) })),
}));

const reportKeys = { started: 'ov.report.started', progress: 'ov.report.progress', blocked: 'ov.report.blocked', result: 'ov.report.result' } as const;
export function Report({ event }: { event: CollaborationEvent }) { return <div className="overview-report"><Tag color={event.phase === 'blocked' ? 'gold' : undefined}>{currentT(reportKeys[event.phase])}</Tag><span>{event.summary}</span>{event.nodeId && <small>{currentT('ov.node', { node: event.nodeId })}</small>}</div>; }
export function Quality({ item }: { item: OverviewRequirement }) { return <div className="overview-quality">{item.quality.map(result => <span key={result.label}><span className="muted">{result.label}</span><Tag color={result.passed ? 'green' : undefined}>{result.result}</Tag></span>)}</div>; }


export type TaskCategory = 'requirements' | 'issues' | 'general';
export function taskManagementRoute(projectId: string, category: TaskCategory = 'requirements', extra: Record<string, string> = {}) {
  return 'projects?' + new URLSearchParams({ project: projectId, tab: 'management', category, ...extra });
}
