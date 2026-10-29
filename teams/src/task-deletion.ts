import type {DemoState} from './domain.js';
export interface TaskDeletionScope {projectId:string;taskId:string}
export interface TaskDeletionReceipt extends TaskDeletionScope {
 id:string;operationId:string;requestDigest:string;planToken:string;revision:number;deletedAt:string;backupId:string;counts:Record<string,number>;
}
export interface TaskDeletionPlan {
 scope:TaskDeletionScope;taskTitle:string;revision:number;canDelete:boolean;reason?:string;planToken:string|null;
 counts:Record<string,number>;preserved:Array<{path:string;reason:string}>;
}
export interface TaskDeletionResult {state:DemoState;receipt:TaskDeletionReceipt}

/** Deletion receipts preserve exact retries after reload; corrupt receipts must not authorize replay. */
export function validateTaskDeletions(state:DemoState){
 const values=state.workspace.taskDeletions;if(values===undefined)return;
 if(!Array.isArray(values)||values.some(item=>!item||typeof item.id!=='string'||!item.id||typeof item.projectId!=='string'||!item.projectId||typeof item.taskId!=='string'||!item.taskId||typeof item.operationId!=='string'||!item.operationId||typeof item.planToken!=='string'||!item.planToken||typeof item.backupId!=='string'||!item.backupId||!Number.isSafeInteger(item.revision)||item.revision<1||typeof item.requestDigest!=='string'||!/^[a-f0-9]{64}$/.test(item.requestDigest)||!Number.isFinite(Date.parse(item.deletedAt))||!item.counts||typeof item.counts!=='object'||Array.isArray(item.counts)||Object.values(item.counts).some(value=>!Number.isSafeInteger(value)||value<0))||new Set(values.map(item=>item.operationId)).size!==values.length||new Set(values.map(item=>item.id)).size!==values.length)throw new Error('需求删除回执损坏；未自动覆盖');
}
