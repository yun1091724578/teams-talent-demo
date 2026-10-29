import {readFile,open,mkdir} from 'node:fs/promises';
import {join,isAbsolute,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import type {ResetPlan} from '../server/task-reset.js';
// The reset modules pull in the state store and therefore read the local configuration at module load.
// They are imported inside main() so that --help never depends on a valid configuration.
let atomicText: typeof import('../server/task-reset.js')['atomicResetText'];
const help=`精确清回一个试跑需求；默认只预览，不改业务源码。\n\n  npm run reset:task -- --project carddemo --task REQ-... [--apply] [--remove]\n  npm run reset:task -- --restore /absolute/backup [--apply]\n\n--remove 仅删除新增 REQ 记录；默认保留原文、交付人和排期，清回待开始。\n--receipt-root /absolute/path 可重复，用于已知旧 CLI 回执目录。\n--apply 先核验活动会话和服务归属，备份后仅清目标；必要时停启本仓 Teams，不构建。\n请先结束目标需求的 iCode 会话。全局原生会话、源码、已跟踪/共享资料、Talents 与 trace 原始存档保留。\n--restore 仅当清理后的文件未再变化时恢复本次备份。`;
const args=process.argv.slice(2);
if(!args.length||args.length===1&&args[0]==='--help'){console.log(help);}else await main().catch(error=>{console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}));process.exitCode=1;});
async function main(){
 const {planTaskReset,applyTaskReset,restoreTaskReset,verifyTaskResetPlan,atomicResetText}=await import('../server/task-reset.js');
 const {acquireTaskMaintenance}=await import('../server/task-maintenance.js');
 atomicText=atomicResetText;
 const values:Record<string,string>={},receiptRoots:string[]=[];let apply=false,remove=false;
 for(let i=0;i<args.length;i++){const name=args[i];if(name==='--apply'){if(apply)throw Error('重复 apply');apply=true;}else if(name==='--remove'){if(remove)throw Error('重复 remove');remove=true;}else if(['--project','--task','--restore','--receipt-root'].includes(name)){const value=args[++i];if(!value||value.startsWith('--'))throw Error(name+' 缺少值');if(name==='--receipt-root')receiptRoots.push(value);else{if(values[name])throw Error('重复参数 '+name);values[name]=value;}}else throw Error('未知参数 '+name);}
 if(values['--restore']?(values['--project']||values['--task']||remove||receiptRoots.length):(!values['--project']||!values['--task']))throw Error('project/task 必须同时指定；restore 独立使用');
 const config=await import('../server/service-config.js');const options={root:config.root,runtime:config.runtimeDir,shared:config.sharedDir,scope:{projectId:values['--project'],taskId:values['--task']},remove,receiptRoots};
 const restoring=values['--restore'];let plan:ResetPlan|undefined;
 if(restoring){if(!isAbsolute(restoring))throw Error('restore 必须使用绝对路径');const manifest=JSON.parse(await readFile(join(restoring,'manifest.json'),'utf8'));plan=manifest.plan;if(plan?.roots.root!==config.root||plan?.roots.runtime!==config.runtimeDir||plan?.roots.shared!==config.sharedDir)throw Error('备份不属于当前配置的仓库/状态/共享目录');const result=await restoreTaskReset(restoring);if(!apply){console.log(JSON.stringify({ok:true,preview:true,...result},null,2));return;}}
 else{plan=await planTaskReset(options);if(!apply){console.log(JSON.stringify(publicPlan(plan),null,2));if(plan.blockers.length)process.exitCode=1;return;}await verifyTaskResetPlan(plan);}
 let output:unknown;let stopped=false,release:(()=>Promise<void>)|undefined,consistent=true;const health=await ownedHealth(config);if(!health){try{const pid=Number((await readFile(join(config.runtimeDir,'server.pid'),'utf8')).trim());if(!Number.isSafeInteger(pid)||pid<2)throw Error('server.pid 格式损坏');try{process.kill(pid,0);throw Error('状态目录记录的服务进程仍存在，但当前端口不能核验归属；未写入');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}if(health){
  const pidFile=join(config.runtimeDir,'server.pid');try{const pid=Number((await readFile(pidFile,'utf8')).trim());if(pid!==health.pid)throw Error('server.pid 与健康检查不一致，未停止');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  process.kill(health.pid,'SIGTERM');stopped=true;await waitStopped(config,health.pid);
 }
 try{
  release=await acquireTaskMaintenance(config.runtimeDir,'reset');if(await ownedHealth(config))throw Error('服务被并发启动，未写入');
  if(!restoring){const current=await planTaskReset(options);await verifyTaskResetPlan(current);if(JSON.stringify(current.files.map(({path,sha256})=>({path,sha256})))!==JSON.stringify(plan!.files.map(({path,sha256})=>({path,sha256}))))throw Error('停止服务期间数据变化，请重新预览');await verifyTaskResetPlan(plan!);}
  const result=restoring?await restoreTaskReset(restoring,true):await applyTaskReset(plan!);output={ok:true,applied:true,...(restoring?result:{backup:result.backup,scope:plan!.scope,counts:plan!.counts})};
 }catch(error){if(String(error).includes('回退未完成'))consistent=false;throw error;}
 finally{await release?.();if(stopped&&consistent)await startOwned(config);else if(stopped)console.error('服务保持停止；请先处理备份回退错误。');}
 console.log(JSON.stringify(output,null,2));
}
function publicPlan(plan:ResetPlan){return{ok:plan.blockers.length===0,preview:true,scope:plan.scope,mode:plan.mode,counts:plan.counts,files:plan.files.map(({path,kind,sha256,bytes,after})=>({path,kind,sha256,bytes,action:after===undefined?'archive':'replace'})),preserved:plan.preserved,blockers:plan.blockers,backupRoot:join(plan.roots.runtime,'task-reset-backups'),digest:plan.digest};}
type Config=typeof import('../server/service-config.js');
async function ownedHealth(config:Config):Promise<{pid:number}|null>{
 try{const response=await fetch(config.origin+'/api/health',{signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error('服务健康检查失败 '+response.status);const h=await response.json();if(h.app!=='teams-talent-carddemo'||h.service!=='teams'||h.workspaceRoot!==config.root||h.stateRoot!==config.runtimeDir||h.origin!==config.origin||!Number.isSafeInteger(h.pid)||h.pid<2)throw Error('端口上服务不属于当前仓库/状态目录，未停止');return h;}
 catch(error){if((error as {cause?:{code?:string}}).cause?.code==='ECONNREFUSED')return null;throw error;}
}
function pause(){return new Promise(resolve=>setTimeout(resolve,100));}
async function waitStopped(config:Config,pid:number){for(let i=0;i<300;i++){let alive=true;try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false;else throw error;}if(!alive&&!(await ownedHealth(config)))return;await pause();}throw Error('所属服务未在30秒内退出；未写入，不强制结束进程');}
async function startOwned(config:Config){
 await mkdir(config.runtimeDir,{recursive:true});const log=await open(join(config.runtimeDir,'server.log'),'a',0o600);const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:config.root,env:process.env,detached:true,stdio:['ignore',log.fd,log.fd],windowsHide:true});await log.close();let failure:Error|undefined;child.on('error',error=>{failure=error;});child.unref();
 if(child.pid)await atomicText(join(config.runtimeDir,'server.pid'),String(child.pid)+'\n');for(let i=0;i<150;i++){if(failure)throw failure;if(child.exitCode!==null)throw Error('Teams 恢复启动失败，请查看 server.log');const h=await ownedHealth(config);if(h){if(h.pid!==child.pid)throw Error('恢复启动被其它服务抢占，未接管');console.error('Teams 已恢复，PID '+h.pid);return;}await pause();}throw Error('Teams 恢复启动超时，请查看 server.log；未强制结束进程');
}
