import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFixtures } from '../server/http-shared.js';
import { actionLabels, initialState, type Action, type Audit, type DemoState } from '../src/domain.js';
import { createSourcePluginCatalog } from '../src/source-plugins.js';
import { migrateMainDelivery } from '../server/delivery-migration.js';
import { teamsSnapshot } from '../server/shared-data.js';
import { resetLegacyMainTaskFields } from '../server/task-reset-legacy.js';

const at = '2026-10-27T10:00:00.000Z';
const audit = (id: number, action: string, detail = '旧单需求操作', system: Audit['system'] = 'Teams'): Audit => ({ id, at, role: 'owner', system, action, detail, origin: 'simulated' });
function fixture(assigneeId = 'owner'): DemoState {
  const state = initialState();
  state.assigned = !!assigneeId; state.assigneeId = assigneeId || null; state.stage = assigneeId ? 'assigned' : 'draft';
  migrateMainDelivery(state);
  const main = state.workspace.deliveryRequirements![0]; main.due = '2026-10-30';
  state.workspace.deliveryRequirements!.push({ ...structuredClone(main), id: 'MKT-OTHER-001', title: '其他需求', stage: 'developing' });
  state.context = { id: 'CTX-OLD', skillVersion: '1.0.0', agentVersion: 'r1', knowledgeVersion: 'v1', createdAt: at, selectedSkills: [...state.workspace.selectedSkills], materials: [], assets: [] };
  state.stage = 'accepted'; state.checks = 'passed'; state.enrolled = true;
  state.transactions = [{ id: 'old-payment', amount: 120, reward: 0.6 }]; state.balance = 2670.15;
  state.duplicateChecked = true; state.uat = true; state.returnReason = '旧退回原因';
  state.workspace.progress = [{ id: 'old-progress', text: '原主需求成果', at, node: 'develop' }];
  state.workspace.sessionReported = true; state.workspace.reportAt = at;
  state.published = true; state.knowledge = true; state.knowledgeVersion = 'project-v3';
  state.evolution = 'adopted'; state.adoptedSkill = '1.1.0'; state.adoptedAgent = 'r2';
  state.workspace.analysis = { scope: 'single', status: 'analyzed' };
  state.workspace.acquiredResources = ['audit-evidence'];
  state.workspace.resourcePublications = [{ id: 'audit-evidence', version: '2.0.0', publishedAt: at, scope: 'team', publisher: 'library', sha256: 'a'.repeat(64) }];
  state.workspace.resourceSubscriptions = [{ id: 'audit-evidence', version: '2.0.0', sha256: 'a'.repeat(64), actor: 'member', subscribedAt: at, source: 'subscription' }];
  state.workspace.materials.push({ id: 'retained', title: '公共业务资料', body: '保留原文' });
  state.audit = [audit(1, actionLabels.prepare), audit(2, actionLabels.purchase), audit(3, 'iCode 进度同步'), audit(4, actionLabels.knowledge), audit(5, actionLabels.release, '项目发布版本', 'Talent'), audit(6, 'Owner验收通过', 'carddemo/MKT-OTHER-001'), audit(7, actionLabels.accept, 'teams/OTHER-TASK/accept · explicit-other-scope'), audit(8, '说明中提及 DEMO-MKT-001', '只提及任务名称，归属不明'), audit(9, '单需求轨迹分析', '没有稳定任务标识', 'Talent')];
  return state;
}

test('legacy main reset clears only former delivery results and keeps public data and other task records byte-equivalent', () => {
  const state = fixture(), before = structuredClone(state);
  resetLegacyMainTaskFields(state);
  assert.equal(state.context, null); assert.equal(state.stage, 'assigned'); assert.equal(state.assigned, true); assert.equal(state.assigneeId, 'owner');
  assert.equal(state.checks, 'none'); assert.equal(state.security, 'unverified'); assert.equal(state.enrolled, false);
  assert.deepEqual(state.transactions, []); assert.equal(state.balance, initialState().balance);
  assert.equal(state.duplicateChecked, false); assert.equal(state.uat, false); assert.equal(state.returnReason, '');
  assert.deepEqual(state.workspace.progress, []); assert.equal(state.workspace.sessionReported, false); assert.equal(state.workspace.reportAt, null);
  assert.deepEqual(state.audit.map(item => item.id), [4, 5, 6, 7, 8, 9]);
  const restored = structuredClone(state);
  for (const key of ['context', 'stage', 'assigned', 'assigneeId', 'checks', 'security', 'enrolled', 'transactions', 'balance', 'duplicateChecked', 'uat', 'returnReason', 'audit'] as const) Object.assign(restored, { [key]: before[key] });
  for (const key of ['progress', 'sessionReported', 'reportAt'] as const) Object.assign(restored.workspace, { [key]: before.workspace[key] });
  assert.equal(JSON.stringify(restored), JSON.stringify(before), 'every field outside the explicit legacy reset set remains unchanged');
  const once = JSON.stringify(state); resetLegacyMainTaskFields(state); assert.equal(JSON.stringify(state), once);
});

test('legacy assignment follows the retained main record and missing or duplicate main records fail before mutation', () => {
  const state = fixture(''); state.assigned = true; state.assigneeId = 'member';
  resetLegacyMainTaskFields(state); assert.equal(state.stage, 'draft'); assert.equal(state.assigned, false); assert.equal(state.assigneeId, null);
  for (const duplicate of [false, true]) {
    const invalid = fixture();
    invalid.workspace.deliveryRequirements = duplicate ? [invalid.workspace.deliveryRequirements![0], structuredClone(invalid.workspace.deliveryRequirements![0])] : [];
    const before = JSON.stringify(invalid); assert.throws(() => resetLegacyMainTaskFields(invalid), /唯一保留/); assert.equal(JSON.stringify(invalid), before);
  }
});

test('all exact legacy delivery labels are cleared while knowledge and evolution labels remain', () => {
  const state = fixture();
  const actions = Object.keys(actionLabels) as Action[];
  state.audit = actions.map((action, index) => audit(index, actionLabels[action]));
  resetLegacyMainTaskFields(state);
  assert.deepEqual(state.audit.map(item => item.action), ['knowledge', 'candidate', 'evaluate', 'release', 'adopt'].map(action => actionLabels[action as Action]));
});

test('export after legacy reset cannot resurrect the old reported delivery session; static sources remain intact', async () => {
  const data = await readFixtures();
  const catalog = createSourcePluginCatalog(data), state = fixture();
  const before = teamsSnapshot(state, data, catalog);
  assert.ok(before.sessions.some(session => session.id === 'WORK-PLATINUM-001'));
  resetLegacyMainTaskFields(state);
  assert.equal(migrateMainDelivery(state), false, 'the retained unified record is not recreated from old fields');
  for (let attempt = 0; attempt < 2; attempt++) {
    const after = teamsSnapshot(state, data, catalog);
    assert.ok(!after.sessions.some(session => session.id === 'WORK-PLATINUM-001'));
    assert.deepEqual(after.sessions, before.sessions.filter(session => session.id !== 'WORK-PLATINUM-001'));
    assert.deepEqual(after.projects, before.projects); assert.deepEqual(after.team, before.team);
  }
  assert.deepEqual(state.workspace.analysis, { scope: 'single', status: 'analyzed' }, 'legacy analysis has no task id and is preserved');
});
