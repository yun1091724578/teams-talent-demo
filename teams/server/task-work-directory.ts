import {readFile} from 'node:fs/promises';
import {isAbsolute,join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readLegacyTaskBinding,type LegacyTaskWorktree} from '../../scripts/lib/legacy-task-workspace.mjs';
import {configuredProjectWorkspace, readProjectTaskBinding, ensureProjectTaskWorkspace} from './project-workspaces.js';
import type {ProjectTaskWorktree} from '../src/project-workspace.js';
const platformRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),exec=promisify(execFile);
type TaskDirectory={projectId:string;id:string;workDirectory?:string};
export const taskWorktreeBinding=async(runtime:string,task:TaskDirectory,repo=platformRoot):Promise<LegacyTaskWorktree|ProjectTaskWorktree|null>=>await readProjectTaskBinding(runtime,task)??await readLegacyTaskBinding(repo,runtime,task);
export async function ensureTaskWorkspace(runtime:string,scope:{projectId:string;taskId:string},preparationId:string,repo=platformRoot) {
  if(!await configuredProjectWorkspace(runtime,scope.projectId))return null;
  const state=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));
  const task=state.workspace?.deliveryRequirements?.find((item:TaskDirectory)=>item.id===scope.taskId&&item.projectId===scope.projectId);
  if(!task)throw new Error('任务不存在');
  const existing=await taskWorktreeBinding(runtime,task,repo);if(existing)return existing;
  if(task.workDirectory)return null;
  return ensureProjectTaskWorkspace(runtime,task,preparationId);
}
/** Explicit task binding. Current worktree identity is checked without rewriting historical task/session evidence. */
export async function taskWorkDirectory(runtime:string,task:TaskDirectory,repo=platformRoot,_requireWorkspace=true) {
  const worktree=await taskWorktreeBinding(runtime,task,repo);if(worktree)return worktree.directory;
  const configured=await configuredProjectWorkspace(runtime,task.projectId);
  if(configured&&!task.workDirectory){
    let saved:any;try{saved=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const prepared=saved?.workspace?.taskAutomation?.find((item:any)=>item.projectId===task.projectId&&item.taskId===task.id)?.preparation?.session?.directory;
    if(prepared)return prepared as string;
    const recorded=saved?.workspace?.deliveryRequirements?.find((item:any)=>item.projectId===task.projectId&&item.id===task.id);
    if(recorded?.preparedAt||recorded&&Object.values(recorded.nodes??{}).some((node:any)=>node.status!=='pending'))throw new Error('此任务已执行但没有独立仓库绑定，请保留原任务目录，不能按新配置迁移');
    return configured.directory;
  }
  const path=join(runtime,'project-task-directory-bindings.json');let value:any;
  try{value=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){return task.workDirectory;}throw error;}
  if(value?.version!==1||!Array.isArray(value.bindings))throw new Error('本机任务目录绑定记录无效');
  const identities=new Set<string>();
  for(const item of value.bindings){
    if(!item||typeof item.projectId!=='string'||typeof item.taskId!=='string')throw new Error('本机任务目录绑定身份无效');
    const key=JSON.stringify([item.projectId,item.taskId]);if(identities.has(key))throw new Error('本机任务目录绑定重复');identities.add(key);
    if(item.kind==='carddemo-worktree')continue;
    if(item.kind!==undefined||!isAbsolute(item.recordedDirectory??'')||!isAbsolute(item.directory??'')||typeof item.gitConfigSha256!=='string'||!/^[a-f0-9]{64}$/.test(item.gitConfigSha256))throw new Error('本机任务目录绑定字段无效');
  }
  const binding=value.bindings.find((item:any)=>item.projectId===task.projectId&&item.taskId===task.id);
  if(!binding){return task.workDirectory;}
  if(binding.recordedDirectory!==task.workDirectory)throw new Error('本机任务目录绑定与需求登记来源不一致');
  // Git resolves either a normal .git directory or a linked-worktree .git file.
  const {stdout}=await exec('git',['-C',binding.directory,'rev-parse','--git-path','config'],{encoding:'utf8',windowsHide:true});
  const config=await readFile(resolve(binding.directory,stdout.trim()));
  if(createHash('sha256').update(config).digest('hex')!==binding.gitConfigSha256)throw new Error('已迁移的本机Git目录配置发生变化，请重新核验绑定');
  return binding.directory as string;
}
