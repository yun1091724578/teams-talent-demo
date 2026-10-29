import { actionLabels, initialState, type Action, type Audit, type DemoState } from '../src/domain.js';
import { mainRequirementId } from '../src/delivery-requirements.js';

// These labels are emitted by the former single-main-task transition, not by
// project knowledge, resource publication or capability evolution operations.
const mainActions: readonly Action[] = ['assign', 'prepare', 'replay', 'check-fail', 'fix', 'submit', 'enroll', 'purchase', 'deduplicate', 'uat', 'accept', 'return'];
const mainAuditLabels = new Set<string>([...mainActions.map(action => actionLabels[action]), 'iCode 进度同步']);
function isMainLegacyAudit(entry: Audit): boolean {
  if (entry.system !== 'Teams' || !mainAuditLabels.has(entry.action)) return false;
  // Explicit scoped records belong to their own task even when a label matches.
  const scope = /^([^/\s]+)\/([^/\s·]+)(?:\/| · |$)/.exec(entry.detail);
  return !scope || scope[1] === 'carddemo' && scope[2] === mainRequirementId;
}

/** Called only for resetting carddemo/DEMO-MKT-001, after its unified record is reset. */
export function resetLegacyMainTaskFields(state: DemoState): void {
  const tasks = (state.workspace.deliveryRequirements ?? []).filter(task => task.projectId === 'carddemo' && task.id === mainRequirementId);
  if (tasks.length !== 1) throw new Error('重置旧主任务字段需要唯一保留的 DEMO-MKT-001 交付记录');
  const assigneeId = tasks[0].assigneeId;
  state.context = null;
  state.assigned = !!assigneeId;
  state.assigneeId = assigneeId || null;
  state.stage = assigneeId ? 'assigned' : 'draft';
  state.checks = 'none';
  state.security = 'unverified';
  state.enrolled = false;
  state.transactions = [];
  state.balance = initialState().balance;
  state.duplicateChecked = false;
  state.uat = false;
  state.returnReason = '';
  state.workspace.progress = [];
  state.workspace.sessionReported = false;
  state.workspace.reportAt = null;
  state.audit = state.audit.filter(entry => !isMainLegacyAudit(entry));
  // analysis has only single/project scope, with no task identity. Preserve it,
  // as well as project knowledge, selected resources and published evolution.
}
