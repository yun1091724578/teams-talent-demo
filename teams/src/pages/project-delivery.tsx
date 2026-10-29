import { Alert } from 'antd';
import { useDemo } from '../context.js';
import { useT } from '../i18n.js';
import { deliveryRequirement, type RequirementNode } from '../delivery-requirements.js';
import { LiveTaskDelivery } from '../components/live-task-delivery.js';
export { deliveryNodeLabels as nodeLabels } from '../components/live-task-delivery.js';
export type DeliveryNode = RequirementNode;

/** The original requirement uses the same persisted delivery instance as every new task. */
export function ProjectDelivery({ node }: { node: DeliveryNode }) {
  const { state, role } = useDemo();
  const t = useT();
  const task = deliveryRequirement(state, 'carddemo', 'DEMO-MKT-001');
  return task
    ? <LiveTaskDelivery key={task.projectId + ':' + task.id + ':' + role} task={task} node={node} />
    : <Alert type="info" title={t('pd.notReady')} description={t('pd.reloadHint')} />;
}
