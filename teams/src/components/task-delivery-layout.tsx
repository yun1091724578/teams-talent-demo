import type { ReactNode } from 'react';
import { Tag } from 'antd';
import type { RequirementNode } from '../delivery-requirements.js';
import { displayRequirementId } from '../display-text.js';
import { currentT, type MessageKey } from '../../../shared/i18n/index.js';
import { FrameworkCard } from '../vendor/teams/components/page-layout.js';
import './live-task-delivery.css';

/** Node names are chrome; the contract text in task-node-contract.ts stays domain content. */
export const deliveryNodeKeys: Record<RequirementNode, MessageKey> = { prepare: 'node.prepare', develop: 'node.develop', verify: 'node.verify', accept: 'node.accept' };
// Getters keep `deliveryNodeLabels[id]`, `Object.keys` and `Object.hasOwn` working while reading the ambient locale.
export const deliveryNodeLabels = Object.defineProperties({} as Record<RequirementNode, string>, Object.fromEntries(
  (Object.keys(deliveryNodeKeys) as RequirementNode[]).map(id => [id, { get: () => currentT(deliveryNodeKeys[id]), enumerable: true }]),
));
type Section = { content: ReactNode; action?: ReactNode };
/** One presentation shell for live delivery and explicitly read-only source records. */
export function TaskDeliveryLayout({ projectId, taskId, title, owner, node, nodeOwner, contentKey, sidebar, flow, sections, materials, children }: {
  projectId: string; taskId: string; title: string; owner: string; node: RequirementNode; nodeOwner: string; contentKey: string;
  sidebar: ReactNode; flow: ReactNode; sections: Record<'input' | 'execution' | 'result', Section>; materials: ReactNode; children?: ReactNode;
}) {
  return <div className="project-delivery-layout unified-task-delivery" data-delivery-scope={projectId + '/' + taskId}>
    {sidebar}
    <main className="project-node-main">
      <div className="project-flow-heading"><strong>{title}</strong><Tag title={displayRequirementId(taskId)}>{displayRequirementId(taskId)}</Tag></div>
      {flow}
      <div className="project-node-heading"><h2>{deliveryNodeLabels[node]}</h2><Tag>{nodeOwner}</Tag></div>
      <div className="page-stack project-node-content task-node-sections" key={contentKey}>
        {(['input', 'result', 'execution'] as const).map((id, index) => <div key={id} data-node-section={id}><FrameworkCard title={[currentT('tdl.input'), currentT('tdl.result'), currentT('tdl.execution')][index]} action={sections[id].action}>{sections[id].content}</FrameworkCard></div>)}
      </div>
    </main>
    <aside className="task-permanent-materials" aria-label={currentT('tdl.materials')} data-material-task={taskId} data-material-project={projectId}>
      <h3>{currentT('tdl.materials')}</h3><strong className="task-material-title">{title}</strong><p className="muted">{displayRequirementId(taskId)} · {currentT('tdl.assignee', { name: owner })}</p>{materials}
    </aside>
    {children}
  </div>;
}
