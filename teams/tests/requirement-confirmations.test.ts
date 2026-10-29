import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../src/domain.js';
import { createDeliveryRequirement, updateRequirementConfirmations, validateDeliveryRequirements } from '../src/delivery-requirements.js';
import { taskNodeDefinitions, taskNodeView } from '../src/task-node-contract.js';

const at = '2026-10-27T00:00:00Z', later = '2026-10-28T00:00:00Z';
function setup() {
  const state = initialState();
  const task = createDeliveryRequirement(state, 'owner', { projectId: 'carddemo', id: 'MKT-CONFIRM-001', title: '确认依据', description: '待确认事项不得当作已确认', assigneeId: 'member' }, at);
  return { state, task };
}

test('owner registers confirmation basis; unchanged entries keep their original id and time', () => {
  const { state, task } = setup();
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: '活动期间', basis: '业务确认：2026-11-01 至 2027-01-31', confirmedBy: '林悦' }], at);
  const first = structuredClone(task.confirmations!);
  assert.equal(first.length, 1); assert.equal(first[0].confirmedAt, at); assert.ok(first[0].id);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ id: first[0].id, item: first[0].item, basis: first[0].basis, confirmedBy: first[0].confirmedBy }], later);
  assert.deepEqual(task.confirmations, first);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ id: first[0].id, item: first[0].item, basis: '补充：退款按原交易冲正', confirmedBy: first[0].confirmedBy }], later);
  assert.equal(task.confirmations![0].id, first[0].id); assert.equal(task.confirmations![0].confirmedAt, later); assert.equal(task.updatedAt, later);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [], later);
  assert.deepEqual(task.confirmations, []);
});

test('confirmations are a prepare input only, with the Owner as source', () => {
  const { state, task } = setup();
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: '活动期间', basis: '业务确认邮件', confirmedBy: '林悦' }], at);
  const prepare = taskNodeView(state, task, 'prepare').inputs.find(item => item.id === 'confirmations')!;
  assert.equal(prepare.status, 'ready'); assert.equal(prepare.references.length, 1); assert.equal(prepare.references[0].source, 'owner');
  assert.match(prepare.references[0].description, /确认依据：业务确认邮件/); assert.match(prepare.references[0].description, /确认人：林悦/);
  assert.equal(taskNodeView(state, task, 'develop').inputs.some(item => item.id === 'confirmations'), false);
});

test('only the Owner may record; invalid, duplicate or locked entries are rejected', () => {
  const { state, task } = setup();
  assert.throws(() => updateRequirementConfirmations(state, 'member', 'carddemo', task.id, [{ item: 'a', basis: 'b', confirmedBy: 'c' }], at), /仅项目 Owner/);
  for (const value of [undefined, {}, [{ item: '', basis: 'b', confirmedBy: 'c' }], [{ item: 'a', basis: '', confirmedBy: 'c' }], [{ item: 'a', basis: 'b', confirmedBy: '' }], Array.from({ length: 21 }, (_, index) => ({ item: 'i' + index, basis: 'b', confirmedBy: 'c' }))]) {
    assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, value, at), /确认/);
  }
  const duplicateId = 'confirmation-1';
  assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ id: duplicateId, item: 'a', basis: 'b', confirmedBy: 'c' }, { id: duplicateId, item: 'd', basis: 'e', confirmedBy: 'f' }], at), /标识重复/);
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: 'a', basis: 'b', confirmedBy: 'c' }], at);
  task.stage = 'awaiting-acceptance'; assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [], later), /不能修改/);
  task.stage = 'accepted'; assert.throws(() => updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [], later), /不能修改/);
});

test('persisted confirmation records are shape-checked; the prepare criterion distinguishes confirmed and open items', () => {
  const { state, task } = setup();
  updateRequirementConfirmations(state, 'owner', 'carddemo', task.id, [{ item: '活动期间', basis: '业务确认', confirmedBy: '林悦' }], at);
  validateDeliveryRequirements(state);
  task.confirmations![0].confirmedAt = 'not-a-date';
  assert.throws(() => validateDeliveryRequirements(state), /确认依据无效/);
  const label = taskNodeDefinitions.prepare.completionCriteria.find(item => item.id === 'prepare.confirmed')!.label;
  assert.match(label, /分层标注/); assert.match(label, /未按已确认处理/);
});
