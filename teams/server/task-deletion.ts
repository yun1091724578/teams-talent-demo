import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {deliveryRequirement,mainRequirementId} from '../src/delivery-requirements.js';
import {DomainError,type DemoState,type Role} from '../src/domain.js';
import {creationText,requireProjectCreator} from '../src/task-creation.js';
import {taskAutomation} from '../src/task-automation.js';
import type {TaskDeletionPlan,TaskDeletionReceipt,TaskDeletionResult,TaskDeletionScope} from '../src/task-deletion.js';
import {planTaskReset,onlineDeletionPlan,applyTaskReset,type ResetOptions,type ResetPlan} from './task-reset.js';
import type {Store} from './store.js';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Roots=Pick<ResetOptions,'root'|'runtime'|'shared'>;
interface DeleteInput extends TaskDeletionScope {planToken:string;operationId:string;revision:number}
const scopeOf=(value:TaskDeletionScope):TaskDeletionScope=>({projectId:creationText(value?.projectId,'项目',100),taskId:creationText(value?.taskId,'需求',100)});
/** A process-local confirmation pins the exact persisted scope and files; the receipt is durable. */
export class TaskDeletionService {
 private plans=new Map<string,{scope:TaskDeletionScope;revision:number;digest:string;expires:number}>();
 constructor(private store:Store,private roots:Roots,private now=Date.now){}
 private authorize(state:DemoState,role:Role,scope:TaskDeletionScope){
  requireProjectCreator(state,role,scope.projectId);
  const task=deliveryRequirement(state,scope.projectId,scope.taskId);
  if(!task)throw new DomainError('本地需求不存在；来源记录保持只读',404);
  if(scope.projectId==='carddemo'&&scope.taskId===mainRequirementId)throw new DomainError('内建主需求保留为项目基线，不能删除；可清回待开始',409);
  return task;
 }
 private busy(state:DemoState,scope:TaskDeletionScope){
  const record=taskAutomation(state,scope);
  const waitingAssignment=record?.preparation?.status==='queued'&&!record.preparation.assigneeId&&!record.preparation.startedAt;
  if(!waitingAssignment&&record?.preparation&&['queued','importing','preparing-session'].includes(record.preparation.status))return '当前需求正在准备知识或会话，请完成后再删除。';
  if([record?.knowledge,...Object.values(record?.nodeKnowledge??{})].some(job=>job&&(job.status==='running'||job.status==='queued'&&!(waitingAssignment&&job===record?.knowledge))))return '当前需求正在获取知识，请完成后再删除。';
  if(record?.collection&&(['queued','running'].includes(record.collection.status)||['pending','uploading'].includes(record.collection.reporting?.status??'')))return '当前需求正在归集或上报会话，请完成后再删除。';
  return null;
 }
 private scan(scope:TaskDeletionScope){return planTaskReset({...this.roots,scope,remove:true,onlineDelete:true,preserveDocuments:true});}
 private fingerprint(plan:ResetPlan){return hash(plan.files.filter(file=>file.kind!=='document'&&file.path!==join(this.roots.shared,'teams/snapshot.json')).map(({path,sha256,kind})=>({path,sha256,kind})));}
 async preview(role:Role,input:TaskDeletionScope):Promise<TaskDeletionPlan>{
  const scope=scopeOf(input);
  return this.store.exclusive(async state=>{
   const task=this.authorize(state,role,scope),busy=this.busy(state,scope);
   if(busy)return {scope,taskTitle:task.title,revision:state.revision,canDelete:false,reason:busy,planToken:null,counts:{},preserved:[]};
   const plan=await this.scan(scope),reason=plan.blockers.join('；');
   for(const [key,value]of this.plans)if(value.expires<=this.now())this.plans.delete(key);
   if(this.plans.size>=100)throw new DomainError('删除确认请求过多，请稍后重试',409);
   const token=reason?null:randomUUID();
   if(token)this.plans.set(token,{scope,revision:state.revision,digest:this.fingerprint(plan),expires:this.now()+10*60*1000});
   return {scope,taskTitle:task.title,revision:state.revision,canDelete:!reason,...(reason?{reason}:{}),planToken:token,counts:plan.counts,preserved:plan.preserved};
  });
 }
 async remove(role:Role,input:DeleteInput):Promise<TaskDeletionResult>{
  const scope=scopeOf(input),planToken=creationText(input.planToken,'删除确认',100),operationId=creationText(input.operationId,'操作标识',100);
  if(!Number.isSafeInteger(input.revision))throw new DomainError('删除需要明确版本',400);
  const requestDigest=hash({role,...scope,planToken,operationId,revision:input.revision});
  return this.store.exclusive(async(state,commit)=>{
   requireProjectCreator(state,role,scope.projectId);
   const prior=state.workspace.taskDeletions?.find(item=>item.operationId===operationId);
   if(prior){if(prior.requestDigest!==requestDigest)throw new DomainError('同一删除操作标识不能用于不同内容',409);return {state,receipt:prior};}
   this.authorize(state,role,scope);
   const confirmation=this.plans.get(planToken);
   if(!confirmation||confirmation.expires<=this.now())throw new DomainError('删除确认已失效，请重新核对删除范围',409);
   if(confirmation.scope.projectId!==scope.projectId||confirmation.scope.taskId!==scope.taskId||confirmation.revision!==input.revision||state.revision!==input.revision)throw new DomainError('需求或工作区已变化，请重新核对删除范围',409);
   const busy=this.busy(state,scope);if(busy)throw new DomainError(busy,409);
   const plan=await this.scan(scope);
   if(plan.blockers.length)throw new DomainError(plan.blockers.join('；'),409);
   if(this.fingerprint(plan)!==confirmation.digest)throw new DomainError('需求运行文件已变化，请重新核对删除范围',409);
   const receipt:TaskDeletionReceipt={...scope,id:randomUUID(),operationId,requestDigest,planToken,revision:state.revision+1,deletedAt:plan.createdAt,backupId:plan.id,counts:{...plan.counts,documents:0,files:plan.files.filter(file=>file.kind!=='document'&&file.path!==join(this.roots.shared,'teams/snapshot.json')).length}};
   const deletion=onlineDeletionPlan(plan,next=>{
    next.workspace.taskDeletions=[...(next.workspace.taskDeletions??[]),receipt];
    next.audit[next.audit.length-1]={id:next.revision,at:receipt.deletedAt,role,system:'Teams',action:'删除需求',detail:scope.projectId+'/'+scope.taskId+' · '+receipt.backupId,origin:'simulated'};
   });
   await applyTaskReset(deletion,{writeState:commit});this.plans.delete(planToken);
   return {state:this.store.state,receipt};
  });
 }
}
