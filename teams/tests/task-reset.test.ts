import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {initialState} from '../src/domain.js';
import {createDeliveryRequirement} from '../src/delivery-requirements.js';
import {planTaskReset,applyTaskReset,restoreTaskReset,verifyTaskResetPlan,type ResetOptions} from '../server/task-reset.js';
import {acquireTaskMaintenance} from '../server/task-maintenance.js';
const exec=promisify(execFile),at='2026-10-27T00:00:00.000Z';
async function put(path:string,value:unknown){await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n');}
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){const f=await setup();try{await run(f);}finally{await rm(f.root,{recursive:true,force:true,maxRetries:3,retryDelay:50});}}
async function setup(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'teams-reset-'))),runtime=join(root,'runtime'),shared=join(root,'shared'),codeRoot=join(root,'project');await mkdir(runtime);await mkdir(codeRoot);await exec('git',['init','-q',codeRoot]);
 const state=initialState(),scope={projectId:'carddemo',taskId:'REQ-'+randomUUID()},otherScope={projectId:'carddemo',taskId:'REQ-'+randomUUID()};
 const task=createDeliveryRequirement(state,'owner',{projectId:scope.projectId,id:scope.taskId,title:'独占资料测试',description:'保留原始需求',assigneeId:'member',due:'2026-11-01',workDirectory:codeRoot},at);
 const other=createDeliveryRequirement(state,'owner',{projectId:otherScope.projectId,id:otherScope.taskId,title:'其它需求',description:'不得变化',assigneeId:'owner',workDirectory:codeRoot},at);
 const runId=randomUUID(),sessionId=randomUUID();task.nodes.prepare={status:'complete',summary:'旧进度',updatedAt:at};task.stage='developing';task.preparedAt=at;task.inputDigest='a'.repeat(64);
 const event:any={id:randomUUID(),operationId:randomUUID(),projectId:scope.projectId,taskId:scope.taskId,nodeId:'prepare',role:'member',runId,sessionId,adoptionId:'adopt',phase:'result',summary:'已登记产物',blocker:null,evidence:[],at,revision:1};
 state.workspace.collaboration={events:[event],adoptions:[{id:'adopt',...scope,nodeId:'prepare',role:'member',runId,sessionId,basisDigest:'a'.repeat(64),readReferences:[],at,revision:1}],operations:[{operationId:event.operationId,requestDigest:'a'.repeat(64),revision:1,kind:'result.submit',...scope,nodeId:'prepare',adoptionId:'adopt',at,status:'saved'}]};
 const document=join(codeRoot,'docs','output.md'),tracked=join(codeRoot,'docs','tracked.md'),source=join(codeRoot,'src','code.java'),sharedDoc=join(codeRoot,'docs','shared.md');
 await put(document,'任务生成说明');await put(tracked,'手工已跟踪');await put(source,'业务源码');await put(sharedDoc,'跨任务公共内容');await exec('git',['-C',codeRoot,'add','docs/tracked.md']);
 event.evidence=[{value:document,artifact:'prd'},{value:tracked,artifact:'software-design'},{value:source,artifact:'code-change'},{value:sharedDoc,artifact:'prd'}].map(ref=>({...ref,kind:'local-file',description:'测试输出',version:'v1',source:'actual'}));
 state.workspace.collaboration.events.push({...event,id:randomUUID(),operationId:randomUUID(),taskId:otherScope.taskId,runId:randomUUID(),sessionId:randomUUID(),evidence:[event.evidence[3]]});
 await put(join(runtime,'state.json'),state);await put(join(shared,'teams/snapshot.json'),{schemaVersion:1,exportedAt:at,team:{name:'保留'},projects:[],sessions:[{id:sessionId,projectId:scope.projectId,requirementId:scope.taskId},{id:'other',projectId:otherScope.projectId,requirementId:otherScope.taskId}]});
 const options:ResetOptions={root,runtime,shared,scope};return{root,runtime,shared,codeRoot,state,scope,otherScope,task,other,event,runId,sessionId,document,tracked,source,sharedDoc,options};
}
const absent=async(path:string)=>assert.rejects(access(path),{code:'ENOENT'});
test('preview is read-only; exact reset keeps identity/other tasks, archives exclusive untracked documents and restores bytes',async()=>fixture(async f=>{
 const before=await readFile(join(f.runtime,'state.json')),snapshot=await readFile(join(f.shared,'teams/snapshot.json'));const plan=await planTaskReset(f.options);assert.equal(plan.blockers.length,0);assert.deepEqual(await readFile(join(f.runtime,'state.json')),before);await absent(join(f.runtime,'task-reset-backups'));assert.deepEqual(plan.files.filter(item=>item.kind==='document').map(item=>item.path),[f.document]);assert.equal(plan.preserved.filter(item=>[f.source,f.tracked,f.sharedDoc].includes(item.path)).length,3);
 const {backup}=await applyTaskReset(plan);const after=JSON.parse(await readFile(join(f.runtime,'state.json'),'utf8')),task=after.workspace.deliveryRequirements.find((item:any)=>item.id===f.scope.taskId);assert.equal(task.description,f.task.description);assert.equal(task.assigneeId,f.task.assigneeId);assert.equal(task.due,f.task.due);assert.equal(task.creationRequest,f.task.creationRequest);assert.ok(Object.values(task.nodes).every((n:any)=>n.status==='pending'));assert.equal(task.preparedAt,undefined);assert.deepEqual(after.workspace.deliveryRequirements.find((item:any)=>item.id===f.other.id),f.other);assert.equal(after.workspace.collaboration.events.length,1);await absent(f.document);assert.equal(await readFile(f.source,'utf8'),'业务源码');assert.equal(JSON.parse(await readFile(join(f.shared,'teams/snapshot.json'),'utf8')).sessions.length,1);
 await restoreTaskReset(backup,true);assert.deepEqual(await readFile(join(f.runtime,'state.json')),before);assert.deepEqual(await readFile(join(f.shared,'teams/snapshot.json')),snapshot);assert.equal(await readFile(f.document,'utf8'),'任务生成说明');
}));
test('native scoped copies include binary attachments; restoration is byte-for-byte and shared native use blocks cleanup',async()=>fixture(async f=>{
 const child=spawn(process.execPath,['-e','']);await new Promise<void>(resolve=>child.on('exit',()=>resolve()));const run=join(f.runtime,'work-contexts',f.runId+'.native');
 await put(join(run,'manifest.json'),{runId:f.runId,scope:f.scope});await put(join(run,'native-session.json'),{...f.scope,runId:f.runId,sessionId:f.sessionId,pid:child.pid,startedAt:at});await put(join(run,'result.json'),{status:'completed'});const binary=Buffer.from([255,0,128,254]);await put(join(run,'attachment.bin'),binary);
 const plan=await planTaskReset(f.options);assert.deepEqual(plan.blockers,[]);const {backup}=await applyTaskReset(plan);await absent(join(run,'attachment.bin'));await restoreTaskReset(backup,true);assert.deepEqual(await readFile(join(run,'attachment.bin')),binary);
 f.state.workspace.collaboration!.events[1].sessionId=f.sessionId;await put(join(f.runtime,'state.json'),f.state);assert.match((await planTaskReset(f.options)).blockers.join(';'),/另一需求/);
}));
test('active or accepted-but-unidentified native launch is a blocker, never inferred dead from missing PID',async()=>fixture(async f=>{
 const run=join(f.runtime,'work-contexts',f.runId+'.native');await put(join(run,'manifest.json'),{runId:f.runId,scope:f.scope});await put(join(run,'terminal-receipt.json'),{status:'terminal-requested'});assert.match((await planTaskReset(f.options)).blockers.join(';'),/会话身份/);
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);try{await put(join(run,'native-session.json'),{...f.scope,runId:f.runId,sessionId:f.sessionId,pid:child.pid,startedAt:new Date().toISOString()});await put(join(run,'process.json'),{pid:child.pid,startedAt:new Date().toISOString()});const plan=await planTaskReset(f.options);assert.match(plan.blockers.join(';'),/仍活动/);await assert.rejects(applyTaskReset(plan),/仍活动/);}finally{child.kill();await new Promise<void>(resolve=>child.on('exit',()=>resolve()));}
}));
test('write failure rolls back; concurrent source/state changes and corrupted backup refuse destructive operations',async()=>fixture(async f=>{
 const before=await readFile(join(f.runtime,'state.json'));await assert.rejects(applyTaskReset(await planTaskReset(f.options),{beforeWrite:async i=>{if(i===1)throw Error('injected disk failure');}}),/已回退/);assert.deepEqual(await readFile(join(f.runtime,'state.json')),before);assert.equal(await readFile(f.document,'utf8'),'任务生成说明');
 const plan=await planTaskReset(f.options);await writeFile(f.document,'user edit');await assert.rejects(verifyTaskResetPlan(plan),/变化/);await put(f.document,'任务生成说明');const result=await applyTaskReset(await planTaskReset(f.options));await writeFile(join(f.runtime,'state.json'),'{}');await assert.rejects(restoreTaskReset(result.backup,true),/又被修改/);
}));
test('regenerated snapshot timestamp alone permits restore, but other shared changes are protected',async()=>fixture(async f=>{
 const {backup}=await applyTaskReset(await planTaskReset(f.options)),path=join(f.shared,'teams/snapshot.json');const snapshot=JSON.parse(await readFile(path,'utf8'));snapshot.exportedAt=new Date().toISOString();await put(path,snapshot);await restoreTaskReset(backup,true);
 const second=await applyTaskReset(await planTaskReset(f.options));const changed=JSON.parse(await readFile(path,'utf8'));changed.projects.push({id:'new-project'});await put(path,changed);await assert.rejects(restoreTaskReset(second.backup,true),/又被修改/);
}));
test('symlinks are refused and --remove only removes the exact newly-created requirement',async t=>fixture(async f=>{
 // Windows only creates symlinks with Developer Mode or the create-symlink privilege; where that is refused the
 // refusal behaviour is exercised on the platforms that allow it instead of failing the fixture.
 const canSymlink=async()=>{const probe=join(f.root,'symlink-probe.md');try{await symlink(f.tracked,probe,process.platform==='win32'?'file':undefined);await rm(probe,{force:true});return true;}catch{return false;}};
 if(await canSymlink()){await rm(f.document);await symlink(f.tracked,f.document,process.platform==='win32'?'file':undefined);await assert.rejects(planTaskReset(f.options),/软链接/);await rm(f.document);}
 else t.diagnostic('symlink creation is refused on this machine, so the symlink-refusal assertion is skipped here');
 await put(f.document,'任务生成说明');const {backup}=await applyTaskReset(await planTaskReset({...f.options,remove:true}));const state=JSON.parse(await readFile(join(f.runtime,'state.json'),'utf8'));assert.deepEqual(state.workspace.deliveryRequirements.map((item:any)=>item.id),[f.other.id]);await restoreTaskReset(backup,true);
}));
test('writer lease excludes service and maintenance races; help does not read local configuration or state',async()=>fixture(async f=>{
 const release=await acquireTaskMaintenance(f.runtime,'service');await assert.rejects(acquireTaskMaintenance(f.runtime,'reset'),/正在由/);await release();const reset=await acquireTaskMaintenance(f.runtime,'reset');await assert.rejects(acquireTaskMaintenance(f.runtime,'service'),/正在由/);await reset();
 const {stdout}=await exec(process.execPath,['--import','tsx','scripts/reset-task.ts','--help'],{cwd:resolve('.'),env:{...process.env,DEMO_LOCAL_CONFIG:join(f.root,'does-not-exist.json')}});assert.match(stdout,/默认只预览/);
}));

test('public project documents and other task frozen/cached inputs protect untracked output references',async()=>fixture(async f=>{
 f.state.workspace.project.assets.push({id:'public',kind:'design',title:'公共资料',location:f.document,origin:'manual'} as any);
 let plan=await planTaskReset(f.options);assert.equal(plan.counts.documents,1,'in-memory edits do not replace authoritative file');
 await put(join(f.runtime,'state.json'),f.state);plan=await planTaskReset(f.options);assert.equal(plan.counts.documents,0);assert.ok(plan.preserved.some(item=>item.path===f.document&&item.reason.includes('公共')));
 f.state.workspace.project.assets.pop();f.state.workspace.taskAutomation=[{...f.otherScope,sessions:[],nodeKnowledge:{develop:{id:randomUUID(),nodeId:'develop',status:'queued',delayMs:20000,attempts:0,startedAt:at,finishedAt:null,upstream:[{id:'shared-reference',title:'共享输入',kind:'local-file',value:f.document,sourceLabel:'已登记',description:'reference'} as any]}}}];await put(join(f.runtime,'state.json'),f.state);assert.equal((await planTaskReset(f.options)).counts.documents,0);
}));

test('main reset also clears legacy delivery fields while retaining project knowledge and immutable source sessions',async()=>fixture(async f=>{
 f.task.id='DEMO-MKT-001';f.event.taskId=f.task.id;f.state.workspace.collaboration!.adoptions[0].taskId=f.task.id;f.state.workspace.collaboration!.operations[0].taskId=f.task.id;f.state.workspace.sessionReported=true;f.state.workspace.reportAt=at;f.state.stage='accepted';f.state.assigned=true;f.state.assigneeId='member';f.state.checks='passed';f.state.uat=true;f.state.knowledge=true;f.state.knowledgeVersion='keep-version';f.state.published=true;f.state.workspace.progress=[{id:'legacy',text:'legacy progress',at,node:'develop'}];await put(join(f.runtime,'state.json'),f.state);
 const snapshot={schemaVersion:1,exportedAt:at,sessions:[{id:'WORK-PLATINUM-001',projectId:'carddemo',requirementId:f.task.id},{id:'b9e3047af2c6',projectId:'carddemo',requirementId:f.task.id}]};await put(join(f.shared,'teams/snapshot.json'),snapshot);
 const before=await readFile(join(f.runtime,'state.json')),plan=await planTaskReset({...f.options,scope:{projectId:'carddemo',taskId:f.task.id}}),{backup}=await applyTaskReset(plan);const state=JSON.parse(await readFile(join(f.runtime,'state.json'),'utf8'));assert.equal(state.stage,'assigned');assert.equal(state.checks,'none');assert.equal(state.uat,false);assert.equal(state.workspace.sessionReported,false);assert.deepEqual(state.workspace.progress,[]);assert.equal(state.knowledgeVersion,'keep-version');assert.equal(state.published,true);assert.deepEqual(JSON.parse(await readFile(join(f.shared,'teams/snapshot.json'),'utf8')).sessions,[snapshot.sessions[1]]);await restoreTaskReset(backup,true);assert.deepEqual(await readFile(join(f.runtime,'state.json')),before);
}));

test('restore rechecks each file and rolls back its own partial writes on failure',async()=>fixture(async f=>{
 const {backup}=await applyTaskReset(await planTaskReset(f.options)),after=await readFile(join(f.runtime,'state.json'));await assert.rejects(restoreTaskReset(backup,true,{beforeWrite:async index=>{if(index===1)throw Error('restore disk failure');}}),/已撤回/);await absent(f.document);assert.deepEqual(await readFile(join(f.runtime,'state.json')),after);await restoreTaskReset(backup,true);assert.equal(await readFile(f.document,'utf8'),'任务生成说明');
}));

test('registered code-change manifest documents are archived, while source files stay intact',async()=>fixture(async f=>{
 f.event.evidence[0].artifact='code-change';await put(join(f.runtime,'state.json'),f.state);const plan=await planTaskReset(f.options);assert.ok(plan.files.some(file=>file.kind==='document'&&file.path===f.document));assert.ok(!plan.files.some(file=>file.path===f.source));
}));
